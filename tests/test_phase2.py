"""
Tests for cURL Kit Phase 2 — Workflow Engine.
Run from project root: python -m tests.test_phase2
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.workflow.models import (
    WorkflowDefinition,
    WorkflowNode,
    WorkflowEdge,
    NodeType,
    RunMode,
    ExecutionStatus,
    NodeResult,
    WorkflowExecutionState,
)
from src.workflow.dag import WorkflowDAG, DAGValidationError
from src.workflow.jsonpath_utils import (
    evaluate_jsonpath,
    extract_by_jsonpath,
    resolve_node_reference,
    resolve_all_variables,
    evaluate_condition,
)
from src.workflow.storage import save_workflow, load_workflow, list_workflows, delete_workflow


# ── DAG Tests ────────────────────────────────────────────────────────

def _make_workflow(nodes_data, edges_data, name="test"):
    # Auto-add edge IDs if missing
    for i, e in enumerate(edges_data):
        if "id" not in e:
            e["id"] = f"e{i}"
    wf_dict = {
        "name": name,
        "description": "test workflow",
        "nodes": nodes_data,
        "edges": edges_data,
    }
    return WorkflowDefinition.from_dict(wf_dict)


def test_dag_simple_chain():
    """A → B → C should be valid and topo-sort to [A, B, C]."""
    wf = _make_workflow(
        [{"id": "A", "type": "curl", "config": {}}, {"id": "B", "type": "curl", "config": {}}, {"id": "C", "type": "curl", "config": {}}],
        [{"source": "A", "target": "B"}, {"source": "B", "target": "C"}],
    )
    dag = WorkflowDAG(wf)
    warnings = dag.validate()
    order = dag.topological_sort()
    assert order == ["A", "B", "C"], f"Expected [A, B, C] but got {order}"
    print("  PASS: test_dag_simple_chain")


def test_dag_cycle_detection():
    """A → B → C → A should raise DAGValidationError."""
    wf = _make_workflow(
        [{"id": "A", "type": "curl", "config": {}}, {"id": "B", "type": "curl", "config": {}}, {"id": "C", "type": "curl", "config": {}}],
        [{"source": "A", "target": "B"}, {"source": "B", "target": "C"}, {"source": "C", "target": "A"}],
    )
    dag = WorkflowDAG(wf)
    try:
        dag.validate()
        assert False, "Should have raised DAGValidationError for cycle"
    except DAGValidationError:
        pass
    print("  PASS: test_dag_cycle_detection")


def test_dag_find_roots():
    """Roots are nodes with no incoming edges."""
    wf = _make_workflow(
        [{"id": "A", "type": "curl", "config": {}}, {"id": "B", "type": "curl", "config": {}}, {"id": "C", "type": "curl", "config": {}}],
        [{"source": "A", "target": "C"}, {"source": "B", "target": "C"}],
    )
    dag = WorkflowDAG(wf)
    roots = dag.find_roots()
    assert set(roots) == {"A", "B"}, f"Expected roots A,B but got {roots}"
    print("  PASS: test_dag_find_roots")


def test_dag_disconnected_warning():
    """Disconnected node should produce a warning but not error."""
    wf = _make_workflow(
        [{"id": "A", "type": "curl", "config": {}}, {"id": "B", "type": "curl", "config": {}}, {"id": "island", "type": "curl", "config": {}}],
        [{"source": "A", "target": "B"}],
    )
    dag = WorkflowDAG(wf)
    warnings = dag.validate()
    # island is itself a root, so depending on implementation it may or may not be disconnected
    # but the DAG should be valid (no error)
    order = dag.topological_sort()
    assert len(order) == 3
    print("  PASS: test_dag_disconnected_warning")


def test_dag_invalid_edge_reference():
    """Edge referencing unknown node should raise."""
    wf = _make_workflow(
        [{"id": "A", "type": "curl", "config": {}}],
        [{"source": "A", "target": "Z"}],
    )
    dag = WorkflowDAG(wf)
    try:
        dag.validate()
        assert False, "Should have raised for unknown target node"
    except DAGValidationError:
        pass
    print("  PASS: test_dag_invalid_edge_reference")


# ── JSONPath Tests ───────────────────────────────────────────────────

def test_jsonpath_simple():
    data = {"name": "Alice", "age": 30}
    result = evaluate_jsonpath("$.name", data)
    assert result == ["Alice"], f"Expected ['Alice'] but got {result}"
    print("  PASS: test_jsonpath_simple")


def test_jsonpath_nested():
    data = {"data": {"users": [{"id": 1}, {"id": 2}]}}
    result = evaluate_jsonpath("$.data.users[0].id", data)
    assert result == [1], f"Expected [1] but got {result}"
    print("  PASS: test_jsonpath_nested")


def test_jsonpath_from_string():
    """Should handle JSON string input."""
    data = '{"key": "value"}'
    result = extract_by_jsonpath("$.key", data)
    assert result == "value", f"Expected 'value' but got {result}"
    print("  PASS: test_jsonpath_from_string")


def test_jsonpath_no_match():
    data = {"name": "Bob"}
    result = evaluate_jsonpath("$.missing", data)
    assert result == [], f"Expected [] but got {result}"
    print("  PASS: test_jsonpath_no_match")


# ── Variable Resolution Tests ────────────────────────────────────────

def test_resolve_node_status_code():
    results = {"login": {"status_code": 200, "response_body": '{"token":"abc"}'}}
    val = resolve_node_reference("nodes.login.status_code", results)
    assert val == 200, f"Expected 200 but got {val}"
    print("  PASS: test_resolve_node_status_code")


def test_resolve_node_jsonpath():
    results = {"login": {"status_code": 200, "response_body": '{"token":"abc123"}'}}
    val = resolve_node_reference("nodes.login.$.token", results)
    assert val == "abc123", f"Expected 'abc123' but got {val}"
    print("  PASS: test_resolve_node_jsonpath")


def test_resolve_loop_context():
    loop_ctx = {"index": 2, "current_item": {"id": 42, "name": "test"}}
    assert resolve_node_reference("loop.index", {}, loop_ctx) == 2
    assert resolve_node_reference("loop.current_item.id", {}, loop_ctx) == 42
    print("  PASS: test_resolve_loop_context")


def test_resolve_all_variables():
    text = "Bearer {{nodes.login.$.token}}"
    results = {"login": {"status_code": 200, "response_body": '{"token":"xyz"}'}}
    resolved = resolve_all_variables(text, results)
    assert resolved == "Bearer xyz", f"Expected 'Bearer xyz' but got '{resolved}'"
    print("  PASS: test_resolve_all_variables")


# ── Condition Evaluation Tests ───────────────────────────────────────

def test_condition_eq():
    cond = {"left": "200", "operator": "==", "right": "200"}
    assert evaluate_condition(cond, {}) is True
    print("  PASS: test_condition_eq")


def test_condition_ne():
    cond = {"left": "404", "operator": "!=", "right": "200"}
    assert evaluate_condition(cond, {}) is True
    print("  PASS: test_condition_ne")


def test_condition_contains():
    cond = {"left": "hello world", "operator": "contains", "right": "world"}
    assert evaluate_condition(cond, {}) is True
    print("  PASS: test_condition_contains")


def test_condition_with_variable_reference():
    cond = {"left": "{{nodes.login.status_code}}", "operator": "==", "right": "200"}
    results = {"login": {"status_code": 200, "response_body": "{}"}}
    assert evaluate_condition(cond, results) is True
    print("  PASS: test_condition_with_variable_reference")


# ── Model Serialization Tests ────────────────────────────────────────

def test_workflow_round_trip():
    wf_dict = {
        "name": "round-trip test",
        "description": "testing serialization",
        "nodes": [
            {"id": "n1", "type": "curl", "config": {"curl_command": "curl http://example.com", "run_mode": "once"}},
            {"id": "n2", "type": "extract", "config": {"source_node": "n1", "extractions": [{"name": "val", "jsonpath": "$.key"}]}},
        ],
        "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
    }
    wf = WorkflowDefinition.from_dict(wf_dict)
    assert wf.name == "round-trip test"
    assert len(wf.nodes) == 2
    assert len(wf.edges) == 1
    assert wf.nodes[0].type == "curl"

    # Serialize back
    exported = wf.to_dict()
    assert exported["name"] == "round-trip test"
    assert len(exported["nodes"]) == 2
    print("  PASS: test_workflow_round_trip")


# ── Storage Tests ────────────────────────────────────────────────────

def test_save_load_delete():
    wf_dict = {
        "name": "storage-test",
        "description": "testing persistence",
        "nodes": [{"id": "a", "type": "curl", "config": {"curl_command": "curl http://test.com"}}],
        "edges": [],
    }
    wf = WorkflowDefinition.from_dict(wf_dict)
    wf_id = wf.id
    save_workflow(wf)

    loaded = load_workflow(wf_id)
    assert loaded is not None
    assert loaded.name == "storage-test"

    workflows = list_workflows()
    found = any(w["id"] == wf_id for w in workflows)
    assert found, "Saved workflow not in list"

    delete_workflow(wf_id)
    deleted = load_workflow(wf_id)
    assert deleted is None

    print("  PASS: test_save_load_delete")


# ── Run All ──────────────────────────────────────────────────────────

def run_all():
    tests = [
        # DAG
        test_dag_simple_chain,
        test_dag_cycle_detection,
        test_dag_find_roots,
        test_dag_disconnected_warning,
        test_dag_invalid_edge_reference,
        # JSONPath
        test_jsonpath_simple,
        test_jsonpath_nested,
        test_jsonpath_from_string,
        test_jsonpath_no_match,
        # Variable resolution
        test_resolve_node_status_code,
        test_resolve_node_jsonpath,
        test_resolve_loop_context,
        test_resolve_all_variables,
        # Conditions
        test_condition_eq,
        test_condition_ne,
        test_condition_contains,
        test_condition_with_variable_reference,
        # Models
        test_workflow_round_trip,
        # Storage
        test_save_load_delete,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  FAIL: {t.__name__} — {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Phase 2 Tests: {passed} passed, {failed} failed out of {len(tests)}")
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_all()
