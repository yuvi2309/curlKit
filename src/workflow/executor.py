"""
Workflow execution engine.

Orchestrates DAG-based execution of workflow nodes with:
- Run-once caching (execute once, reuse result)
- TTL-based auto-refresh for tokens
- Loop expansion over arrays/CSV rows
- Branch/Assert conditional routing
- Pause / Resume / Stop controls
- Progress callbacks for real-time streaming
"""

import io
import csv
import time
import json
import copy
import logging
import threading
from typing import Any, Callable, Dict, List, Optional, Set
from datetime import datetime

from src.parser.curl_parser import parse_curl, CurlRequest
from src.executor.batch_executor import execute_request
from src.workflow.models import (
    WorkflowDefinition,
    WorkflowNode,
    NodeType,
    RunMode,
    ExecutionStatus,
    NodeStatus,
    NodeResult,
    WorkflowExecutionState,
    MergeStrategy,
    AssertAction,
)
from src.workflow.dag import WorkflowDAG, DAGValidationError
from src.workflow.jsonpath_utils import (
    evaluate_jsonpath,
    extract_by_jsonpath,
    resolve_all_variables,
    resolve_variables_in_dict,
    evaluate_condition,
)

logger = logging.getLogger("curlkit.workflow.executor")

# Type for progress callback: (run_id, node_id, status, optional_data)
ProgressCallback = Callable[[str, str, str, Optional[Dict]], None]


class WorkflowExecutor:
    """
    Executes a workflow definition as a DAG with state management.
    """

    def __init__(
        self,
        workflow: WorkflowDefinition,
        on_progress: Optional[ProgressCallback] = None,
    ):
        self.workflow = workflow
        self.dag = WorkflowDAG(workflow)
        self.on_progress = on_progress

        # Execution state
        self.state = WorkflowExecutionState(workflow_id=workflow.id)
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._pause_event = threading.Event()
        self._pause_event.set()  # Not paused initially

    @property
    def run_id(self) -> str:
        return self.state.run_id

    # ── Control Methods ──────────────────────────────────────────────

    def pause(self):
        """Pause execution after the current node completes."""
        with self._lock:
            if self.state.status == ExecutionStatus.RUNNING.value:
                self.state.status = ExecutionStatus.PAUSED.value
                self._pause_event.clear()
                logger.info(f"Workflow {self.run_id} paused")
                self._emit_progress(None, "paused")

    def resume(self):
        """Resume a paused execution."""
        with self._lock:
            if self.state.status == ExecutionStatus.PAUSED.value:
                self.state.status = ExecutionStatus.RUNNING.value
                self._pause_event.set()
                logger.info(f"Workflow {self.run_id} resumed")
                self._emit_progress(None, "resumed")

    def stop(self):
        """Stop execution after the current node completes."""
        with self._lock:
            self.state.status = ExecutionStatus.STOPPED.value
            self._stop_event.set()
            self._pause_event.set()  # Unblock if paused
            logger.info(f"Workflow {self.run_id} stopped")
            self._emit_progress(None, "stopped")

    # ── Main Execution ───────────────────────────────────────────────

    def execute(self) -> WorkflowExecutionState:
        """
        Run the entire workflow. Blocks until complete, paused, or stopped.
        Returns the final execution state.
        """
        # Validate DAG
        try:
            warnings = self.dag.validate()
            for w in warnings:
                logger.warning(w)
        except DAGValidationError as e:
            self.state.status = ExecutionStatus.FAILED.value
            self.state.error = str(e)
            return self.state

        # Get execution order
        try:
            execution_order = self.dag.topological_sort()
        except DAGValidationError as e:
            self.state.status = ExecutionStatus.FAILED.value
            self.state.error = str(e)
            return self.state

        # Initialize all node results as PENDING
        for node_id in execution_order:
            self.state.node_results[node_id] = NodeResult(
                node_id=node_id,
                node_type=self.dag.node_map[node_id].type,
            )

        # Start
        self.state.status = ExecutionStatus.RUNNING.value
        self.state.started_at = datetime.utcnow().isoformat()
        self._emit_progress(None, "started")

        # Track skipped nodes (downstream of false branches / failed asserts)
        skipped_nodes: Set[str] = set()

        try:
            for node_id in execution_order:
                # Check stop
                if self._stop_event.is_set():
                    break

                # Wait if paused
                self._pause_event.wait()
                if self._stop_event.is_set():
                    break

                # Skip if marked
                if node_id in skipped_nodes:
                    self._set_node_status(node_id, NodeStatus.SKIPPED.value)
                    continue

                node = self.dag.node_map[node_id]
                result = self._execute_node(node, skipped_nodes)

                if result.status == NodeStatus.FAILED.value:
                    # For non-assert failures, check if we should stop
                    if node.type != NodeType.ASSERT.value:
                        logger.error(f"Node {node_id} failed: {result.error}")

        except Exception as e:
            self.state.status = ExecutionStatus.FAILED.value
            self.state.error = f"Unexpected error: {e}"
            logger.exception(f"Workflow execution failed: {e}")
            self._emit_progress(None, "failed", {"error": str(e)})
            return self.state

        # Final status
        if self._stop_event.is_set():
            self.state.status = ExecutionStatus.STOPPED.value
        else:
            has_failures = any(
                r.status == NodeStatus.FAILED.value
                for r in self.state.node_results.values()
            )
            self.state.status = ExecutionStatus.FAILED.value if has_failures else ExecutionStatus.COMPLETED.value

        self.state.completed_at = datetime.utcnow().isoformat()
        self._emit_progress(None, self.state.status)
        return self.state

    # ── Node Dispatch ────────────────────────────────────────────────

    def _execute_node(self, node: WorkflowNode, skipped_nodes: Set[str], loop_context: Optional[Dict[str, Any]] = None) -> NodeResult:
        """Execute a single node based on its type."""
        node_id = node.id
        self._set_node_status(node_id, NodeStatus.RUNNING.value)

        start_time = time.time()
        result = self.state.node_results.get(node_id) or NodeResult(
            node_id=node_id, node_type=node.type
        )
        result.started_at = datetime.utcnow().isoformat()

        try:
            if node.type == NodeType.CURL.value:
                result = self._execute_curl_node(node, result, loop_context)
            elif node.type == NodeType.CSV_SOURCE.value:
                result = self._execute_csv_node(node, result)
            elif node.type == NodeType.EXTRACT.value:
                result = self._execute_extract_node(node, result, loop_context)
            elif node.type == NodeType.BRANCH.value:
                result = self._execute_branch_node(node, result, skipped_nodes, loop_context)
            elif node.type == NodeType.ASSERT.value:
                result = self._execute_assert_node(node, result, skipped_nodes, loop_context)
            elif node.type == NodeType.LOOP.value:
                result = self._execute_loop_node(node, result, skipped_nodes)
            elif node.type == NodeType.DELAY.value:
                result = self._execute_delay_node(node, result)
            elif node.type == NodeType.MERGE.value:
                result = self._execute_merge_node(node, result, loop_context)
            else:
                result.error = f"Unknown node type: {node.type}"
                result.status = NodeStatus.FAILED.value
        except Exception as e:
            result.error = str(e)
            result.status = NodeStatus.FAILED.value
            logger.exception(f"Node {node_id} execution error: {e}")

        result.duration_ms = round((time.time() - start_time) * 1000, 2)
        result.completed_at = datetime.utcnow().isoformat()

        if result.status == NodeStatus.RUNNING.value:
            result.status = NodeStatus.SUCCESS.value

        self.state.node_results[node_id] = result
        self._emit_progress(node_id, result.status, result.to_dict())
        return result

    # ── cURL Node ────────────────────────────────────────────────────

    def _execute_curl_node(self, node: WorkflowNode, result: NodeResult, loop_context: Optional[Dict[str, Any]] = None) -> NodeResult:
        """Execute a cURL command node."""
        data = node.data
        run_mode = data.get("run_mode", RunMode.PER_ITERATION.value)
        ttl_seconds = data.get("ttl_seconds")

        # Run-once cache check
        if run_mode == RunMode.ONCE.value and node.id in self.state.once_cache:
            cached = self.state.once_cache[node.id]
            logger.info(f"Node {node.id}: using cached result (run_mode=once)")
            return cached

        # TTL cache check
        if run_mode == RunMode.ON_TTL_EXPIRE.value and node.id in self.state.ttl_cache:
            cached_result, cached_time = self.state.ttl_cache[node.id]
            if ttl_seconds and (time.time() - cached_time) < ttl_seconds:
                logger.info(f"Node {node.id}: using TTL-cached result ({ttl_seconds}s)")
                return cached_result

        # Resolve variables in curl command
        curl_command = data.get("curl_command", "")
        # Also resolve variables defined in the node's variables map
        user_variables = data.get("variables", {})
        node_results_dict = self._build_results_context()

        # First resolve any variable mappings (e.g. {{name}} -> {{csv.col}} -> actual value)
        resolved_vars = {}
        for var_name, var_value in user_variables.items():
            resolved_vars[var_name] = resolve_all_variables(
                str(var_value), node_results_dict, loop_context
            )

        # Replace user-defined variables in the curl command
        resolved_command = curl_command
        for var_name, var_value in resolved_vars.items():
            resolved_command = resolved_command.replace(f"{{{{{var_name}}}}}", str(var_value))

        # Then resolve system variables (nodes., loop., csv.)
        resolved_command = resolve_all_variables(resolved_command, node_results_dict, loop_context)

        # Store the resolved command for execution logs
        result.resolved_curl_command = resolved_command

        # Parse and execute
        request = parse_curl(resolved_command)
        exec_result = execute_request(request)

        # Map execution result to NodeResult
        result.status_code = exec_result.status_code
        result.response_body = exec_result.response_body
        result.response_headers = exec_result.response_headers

        if exec_result.error:
            result.error = exec_result.error
            result.status = NodeStatus.FAILED.value
            return result

        # Run extractions
        extractions = data.get("extractions", [])
        for ext in extractions:
            name = ext.get("name", "")
            jsonpath_expr = ext.get("jsonpath", "")
            if name and jsonpath_expr:
                value = extract_by_jsonpath(jsonpath_expr, result.response_body)
                result.extracted[name] = value

        result.status = NodeStatus.SUCCESS.value

        # Cache
        if run_mode == RunMode.ONCE.value:
            self.state.once_cache[node.id] = result
        elif run_mode == RunMode.ON_TTL_EXPIRE.value:
            self.state.ttl_cache[node.id] = (result, time.time())

        return result

    # ── CSV Source Node ──────────────────────────────────────────────

    def _execute_csv_node(self, node: WorkflowNode, result: NodeResult) -> NodeResult:
        """Parse CSV content and output rows + columns."""
        csv_content = node.data.get("csv_content", "")
        if not csv_content:
            result.error = "CSV node has no content"
            result.status = NodeStatus.FAILED.value
            return result

        reader = csv.DictReader(io.StringIO(csv_content))
        rows = [row for row in reader]
        columns = reader.fieldnames or []

        result.rows = rows
        result.columns = list(columns)
        result.status = NodeStatus.SUCCESS.value
        return result

    # ── Extract Node ─────────────────────────────────────────────────

    def _execute_extract_node(self, node: WorkflowNode, result: NodeResult, loop_context: Optional[Dict[str, Any]] = None) -> NodeResult:
        """Extract data from upstream node results using JSONPath."""
        extractions = node.data.get("extractions", [])
        node_results_dict = self._build_results_context()

        for ext in extractions:
            name = ext.get("name", "")
            jsonpath_expr = ext.get("jsonpath", "")
            if not name or not jsonpath_expr:
                continue

            # The jsonpath might reference a node: "nodes.login.$.data.token"
            # or be a simple JSONPath on the first upstream node's body
            if jsonpath_expr.startswith("nodes."):
                from src.workflow.jsonpath_utils import resolve_node_reference
                value = resolve_node_reference(jsonpath_expr, node_results_dict, loop_context)
            else:
                # Apply to the first upstream node's response_body
                predecessors = self.dag.get_predecessors(node.id)
                if predecessors:
                    upstream_result = self.state.node_results.get(predecessors[0])
                    if upstream_result and upstream_result.response_body:
                        value = extract_by_jsonpath(jsonpath_expr, upstream_result.response_body)
                    else:
                        value = None
                else:
                    value = None

            result.extracted[name] = value

        result.status = NodeStatus.SUCCESS.value
        return result

    # ── Branch Node ──────────────────────────────────────────────────

    def _execute_branch_node(self, node: WorkflowNode, result: NodeResult, skipped_nodes: Set[str], loop_context: Optional[Dict[str, Any]] = None) -> NodeResult:
        """Evaluate condition and route to true/false branch."""
        condition = node.data.get("condition")
        if not condition:
            result.error = "Branch node has no condition"
            result.status = NodeStatus.FAILED.value
            return result

        node_results_dict = self._build_results_context()
        condition_met = evaluate_condition(condition, node_results_dict, loop_context)
        result.branch_taken = "true" if condition_met else "false"

        # Mark the opposite branch's downstream nodes as skipped
        branch_paths = self.dag.get_branch_paths(node.id)
        skip_handle = "false" if condition_met else "true"
        keep_handle = "true" if condition_met else "false"

        # Only skip nodes exclusively reachable from the skipped branch
        nodes_to_skip = branch_paths.get(skip_handle, set())
        nodes_to_keep = branch_paths.get(keep_handle, set())
        exclusive_skip = nodes_to_skip - nodes_to_keep
        skipped_nodes.update(exclusive_skip)

        result.status = NodeStatus.SUCCESS.value
        return result

    # ── Assert Node ──────────────────────────────────────────────────

    def _execute_assert_node(self, node: WorkflowNode, result: NodeResult, skipped_nodes: Set[str], loop_context: Optional[Dict[str, Any]] = None) -> NodeResult:
        """Evaluate assertion. On failure, take configured action."""
        condition = node.data.get("condition")
        action = node.data.get("action", AssertAction.STOP_WORKFLOW.value)

        if not condition:
            result.error = "Assert node has no condition"
            result.status = NodeStatus.FAILED.value
            return result

        node_results_dict = self._build_results_context()
        passed = evaluate_condition(condition, node_results_dict, loop_context)
        result.assertion_passed = passed

        if passed:
            result.status = NodeStatus.SUCCESS.value
            return result

        # Assertion failed
        if action == AssertAction.STOP_WORKFLOW.value:
            result.status = NodeStatus.FAILED.value
            result.error = "Assertion failed — stopping workflow"
            self.stop()
        elif action == AssertAction.SKIP_NODE.value:
            # Skip all downstream nodes
            descendants = set()
            self.dag._dfs_collect(node.id, descendants)
            descendants.discard(node.id)
            skipped_nodes.update(descendants)
            result.status = NodeStatus.SUCCESS.value  # Assert itself succeeds, downstream skipped
        elif action == AssertAction.LOG_ERROR.value:
            result.status = NodeStatus.SUCCESS.value
            result.error = "Assertion failed (logged, continuing)"
            logger.warning(f"Assert {node.id} failed — continuing (log_error mode)")

        return result

    # ── Loop Node ────────────────────────────────────────────────────

    def _execute_loop_node(self, node: WorkflowNode, result: NodeResult, skipped_nodes: Set[str]) -> NodeResult:
        """Iterate over a data source and execute the loop body for each item."""
        source_path = node.data.get("source_path", "")
        node_results_dict = self._build_results_context()

        # Resolve the iterable
        iterable = None
        if source_path.startswith("nodes."):
            from src.workflow.jsonpath_utils import resolve_node_reference
            iterable = resolve_node_reference(source_path, node_results_dict)
        elif source_path == "csv_rows":
            # Look for upstream CSV node
            predecessors = self.dag.get_predecessors(node.id)
            for pred_id in predecessors:
                pred_result = self.state.node_results.get(pred_id)
                if pred_result and pred_result.rows is not None:
                    iterable = pred_result.rows
                    break

        if iterable is None or not isinstance(iterable, list):
            # Try to parse from first upstream response
            predecessors = self.dag.get_predecessors(node.id)
            for pred_id in predecessors:
                pred_result = self.state.node_results.get(pred_id)
                if pred_result and pred_result.response_body:
                    if source_path:
                        iterable = extract_by_jsonpath(source_path, pred_result.response_body)
                        if isinstance(iterable, list):
                            break
                        # If single value, check if it is a list itself
                        iterable = None

        if not isinstance(iterable, list):
            result.error = f"Loop source did not resolve to a list: {source_path}"
            result.status = NodeStatus.FAILED.value
            return result

        # Get loop body nodes (direct successors of loop node)
        body_nodes = self.dag.get_loop_subgraph(node.id)
        body_order = [nid for nid in self.dag.topological_sort() if nid in body_nodes]

        # Mark body nodes as handled by loop (they shouldn't run in the main loop)
        skipped_nodes.update(body_nodes)

        result.iterations = len(iterable)
        result.iteration_results = []

        for idx, item in enumerate(iterable):
            if self._stop_event.is_set():
                break
            self._pause_event.wait()
            if self._stop_event.is_set():
                break

            loop_context = {"index": idx, "current_item": item}
            iteration_data = {}

            for body_node_id in body_order:
                if self._stop_event.is_set():
                    break

                body_node = self.dag.node_map[body_node_id]
                body_result = self._execute_node(body_node, skipped_nodes, loop_context)
                iteration_data[body_node_id] = body_result.to_dict()

            result.iteration_results.append(iteration_data)

        result.status = NodeStatus.SUCCESS.value
        return result

    # ── Delay Node ───────────────────────────────────────────────────

    def _execute_delay_node(self, node: WorkflowNode, result: NodeResult) -> NodeResult:
        """Wait for the configured duration."""
        delay = node.data.get("delay_seconds", 1.0)
        logger.info(f"Delay node {node.id}: waiting {delay}s")

        # Use stop_event.wait so we can interrupt the delay
        interrupted = self._stop_event.wait(timeout=delay)
        if interrupted:
            result.status = NodeStatus.SKIPPED.value
            return result

        result.status = NodeStatus.SUCCESS.value
        return result

    # ── Merge Node ───────────────────────────────────────────────────

    def _execute_merge_node(self, node: WorkflowNode, result: NodeResult, loop_context: Optional[Dict[str, Any]] = None) -> NodeResult:
        """Combine data from multiple upstream nodes."""
        strategy = node.data.get("strategy", MergeStrategy.MERGE_OBJECTS.value)
        predecessors = self.dag.get_predecessors(node.id)

        if strategy == MergeStrategy.MERGE_OBJECTS.value:
            merged = {}
            for pred_id in predecessors:
                pred_result = self.state.node_results.get(pred_id)
                if pred_result:
                    # Merge extracted data
                    merged.update(pred_result.extracted)
                    # Also try to merge response body if it's a dict
                    if pred_result.response_body:
                        try:
                            body = json.loads(pred_result.response_body)
                            if isinstance(body, dict):
                                merged.update(body)
                        except (json.JSONDecodeError, TypeError):
                            pass
            result.merged_data = merged

        elif strategy == MergeStrategy.COLLECT_ARRAY.value:
            collected = []
            for pred_id in predecessors:
                pred_result = self.state.node_results.get(pred_id)
                if pred_result:
                    entry = {**pred_result.extracted}
                    if pred_result.response_body:
                        try:
                            entry["response"] = json.loads(pred_result.response_body)
                        except (json.JSONDecodeError, TypeError):
                            entry["response"] = pred_result.response_body
                    collected.append(entry)
            result.merged_data = collected

        # Make merged data accessible via extracted for downstream references
        if isinstance(result.merged_data, dict):
            result.extracted = result.merged_data
        else:
            result.extracted = {"data": result.merged_data}

        result.status = NodeStatus.SUCCESS.value
        return result

    # ── Helpers ───────────────────────────────────────────────────────

    def _build_results_context(self) -> Dict[str, Any]:
        """
        Build a dict of node_id → result_dict for variable resolution.
        """
        ctx = {}
        for node_id, node_result in self.state.node_results.items():
            ctx[node_id] = node_result.to_dict()
        return ctx

    def _set_node_status(self, node_id: str, status: str):
        """Update a node's status and emit progress."""
        if node_id in self.state.node_results:
            self.state.node_results[node_id].status = status
        self._emit_progress(node_id, status)

    def _emit_progress(self, node_id: Optional[str], status: str, data: Optional[Dict] = None):
        """Send a progress event via the callback."""
        if self.on_progress:
            try:
                self.on_progress(self.run_id, node_id, status, data)
            except Exception as e:
                logger.warning(f"Progress callback error: {e}")
