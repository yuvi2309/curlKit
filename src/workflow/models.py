"""
Workflow data models for cURL Kit Phase 2.

Defines the structure for workflow definitions (DAG of nodes + edges),
execution state tracking, and node result types.
"""

import uuid
from enum import Enum
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict
from datetime import datetime


# ── Enums ────────────────────────────────────────────────────────────

class NodeType(str, Enum):
    CURL = "curl"
    CSV_SOURCE = "csv_source"
    EXTRACT = "extract"
    BRANCH = "branch"
    ASSERT = "assert"
    LOOP = "loop"
    DELAY = "delay"
    MERGE = "merge"


class RunMode(str, Enum):
    ONCE = "once"                     # Execute once, cache result for entire run
    PER_ITERATION = "per_iteration"   # Re-execute each time reached (e.g. in loop)
    ON_TTL_EXPIRE = "on_ttl_expire"   # Re-execute when TTL has elapsed


class AssertAction(str, Enum):
    STOP_WORKFLOW = "stop_workflow"
    SKIP_NODE = "skip_node"
    LOG_ERROR = "log_error"


class MergeStrategy(str, Enum):
    MERGE_OBJECTS = "merge_objects"   # Shallow-merge dicts into one
    COLLECT_ARRAY = "collect_array"   # Collect all inputs into an array


class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class NodeStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


# ── Sub-models ───────────────────────────────────────────────────────

@dataclass
class Extraction:
    """A single JSONPath extraction rule: pull a value from response."""
    name: str                # Variable name to store result as
    jsonpath: str            # JSONPath expression, e.g. "$.data.token"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Condition:
    """A condition expression for Branch/Assert nodes."""
    left: str                # Left operand — reference or literal, e.g. "{{nodes.login.$.status_code}}"
    operator: str            # ==, !=, >, <, >=, <=, contains, exists
    right: str = ""          # Right operand — reference or literal (unused for 'exists')

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Position:
    x: float = 0.0
    y: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


# ── Node Data (type-specific config) ────────────────────────────────

@dataclass
class CurlNodeData:
    name: str = ""
    curl_command: str = ""
    run_mode: str = RunMode.PER_ITERATION.value
    ttl_seconds: Optional[int] = None
    extractions: List[Extraction] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["extractions"] = [e.to_dict() for e in self.extractions]
        return d


@dataclass
class CsvSourceNodeData:
    name: str = "CSV Source"
    csv_content: str = ""     # Raw CSV text

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ExtractNodeData:
    name: str = "Extract"
    extractions: List[Extraction] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["extractions"] = [e.to_dict() for e in self.extractions]
        return d


@dataclass
class BranchNodeData:
    name: str = "Branch"
    condition: Optional[Condition] = None

    def to_dict(self) -> dict:
        d = {"name": self.name}
        if self.condition:
            d["condition"] = self.condition.to_dict()
        return d


@dataclass
class AssertNodeData:
    name: str = "Assert"
    condition: Optional[Condition] = None
    action: str = AssertAction.STOP_WORKFLOW.value

    def to_dict(self) -> dict:
        d = {"name": self.name, "action": self.action}
        if self.condition:
            d["condition"] = self.condition.to_dict()
        return d


@dataclass
class LoopNodeData:
    name: str = "Loop"
    source_path: str = ""    # JSONPath to iterable (e.g. "$.data.items" or "csv_rows")

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DelayNodeData:
    name: str = "Delay"
    delay_seconds: float = 1.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class MergeNodeData:
    name: str = "Merge"
    strategy: str = MergeStrategy.MERGE_OBJECTS.value

    def to_dict(self) -> dict:
        return asdict(self)


# ── Core Model: Nodes & Edges ────────────────────────────────────────

NODE_DATA_CLASSES = {
    NodeType.CURL: CurlNodeData,
    NodeType.CSV_SOURCE: CsvSourceNodeData,
    NodeType.EXTRACT: ExtractNodeData,
    NodeType.BRANCH: BranchNodeData,
    NodeType.ASSERT: AssertNodeData,
    NodeType.LOOP: LoopNodeData,
    NodeType.DELAY: DelayNodeData,
    NodeType.MERGE: MergeNodeData,
}


@dataclass
class WorkflowNode:
    id: str
    type: str                          # NodeType value
    position: Position = field(default_factory=Position)
    data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "position": self.position.to_dict(),
            "data": self.data,
        }

    @staticmethod
    def from_dict(d: dict) -> "WorkflowNode":
        pos = d.get("position", {})
        return WorkflowNode(
            id=d["id"],
            type=d["type"],
            position=Position(x=pos.get("x", 0), y=pos.get("y", 0)),
            data=d.get("data", {}),
        )


@dataclass
class WorkflowEdge:
    id: str
    source: str                        # Source node id
    target: str                        # Target node id
    source_handle: str = "output"      # Named output port
    target_handle: str = "input"       # Named input port

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "sourceHandle": self.source_handle,
            "targetHandle": self.target_handle,
        }

    @staticmethod
    def from_dict(d: dict) -> "WorkflowEdge":
        return WorkflowEdge(
            id=d["id"],
            source=d["source"],
            target=d["target"],
            source_handle=d.get("sourceHandle", "output"),
            target_handle=d.get("targetHandle", "input"),
        )


# ── Workflow Definition ──────────────────────────────────────────────

@dataclass
class WorkflowDefinition:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Untitled Workflow"
    description: str = ""
    version: str = "1.0"
    nodes: List[WorkflowNode] = field(default_factory=list)
    edges: List[WorkflowEdge] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @staticmethod
    def from_dict(d: dict) -> "WorkflowDefinition":
        return WorkflowDefinition(
            id=d.get("id", str(uuid.uuid4())),
            name=d.get("name", "Untitled Workflow"),
            description=d.get("description", ""),
            version=d.get("version", "1.0"),
            nodes=[WorkflowNode.from_dict(n) for n in d.get("nodes", [])],
            edges=[WorkflowEdge.from_dict(e) for e in d.get("edges", [])],
            created_at=d.get("created_at", datetime.utcnow().isoformat()),
            updated_at=d.get("updated_at", datetime.utcnow().isoformat()),
        )


# ── Execution Results ────────────────────────────────────────────────

@dataclass
class NodeResult:
    """Result of executing a single workflow node."""
    node_id: str
    node_type: str
    status: str = NodeStatus.PENDING.value
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[float] = None

    # cURL node results
    status_code: Optional[int] = None
    response_body: Optional[str] = None
    response_headers: Optional[Dict[str, str]] = None
    resolved_curl_command: Optional[str] = None

    # Extracted data (from Extract/cURL extractions)
    extracted: Dict[str, Any] = field(default_factory=dict)

    # CSV source results
    rows: Optional[List[Dict[str, str]]] = None
    columns: Optional[List[str]] = None

    # Loop results
    iterations: Optional[int] = None
    iteration_results: Optional[List[Dict[str, Any]]] = None

    # Branch result
    branch_taken: Optional[str] = None   # "true" or "false"

    # Assert result
    assertion_passed: Optional[bool] = None

    # Merge result
    merged_data: Optional[Any] = None

    # Error
    error: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        return {k: v for k, v in d.items() if v is not None}


@dataclass
class WorkflowExecutionState:
    """Tracks the overall state of a workflow run."""
    run_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str = ""
    status: str = ExecutionStatus.PENDING.value
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    node_results: Dict[str, NodeResult] = field(default_factory=dict)
    error: Optional[str] = None

    # TTL cache: node_id → (result, timestamp_seconds)
    ttl_cache: Dict[str, tuple] = field(default_factory=dict)

    # Run-once cache: node_id → NodeResult
    once_cache: Dict[str, NodeResult] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "workflow_id": self.workflow_id,
            "status": self.status,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "node_results": {k: v.to_dict() for k, v in self.node_results.items()},
            "error": self.error,
        }
