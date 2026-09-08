"""
JSONPath evaluation, variable reference resolution, and condition evaluation
for the workflow engine.

Variable syntax:
  {{nodes.<node_id>.<jsonpath>}}    — JSONPath into a node's response body
  {{nodes.<node_id>.status_code}}   — Direct node result field
  {{nodes.<node_id>.headers.<key>}} — Response header value
  {{loop.current_item}}             — Current loop iteration item
  {{loop.current_item.<path>}}      — Nested path into current item
  {{loop.index}}                    — Current loop index (0-based)
  {{csv.<column_name>}}             — CSV column value (in loop context)
"""

import re
import json
import logging
from typing import Any, Dict, List, Optional

from jsonpath_ng import parse as jsonpath_parse
from jsonpath_ng.exceptions import JsonPathParserError

logger = logging.getLogger("curlkit.workflow.jsonpath")

# Matches  {{nodes.login.$.data.token}}  or  {{loop.index}}  etc.
WORKFLOW_VAR_PATTERN = re.compile(r'\{\{(.*?)\}\}')


def evaluate_jsonpath(expression: str, data: Any) -> List[Any]:
    """
    Evaluate a JSONPath expression against data.
    Returns list of matched values. Empty list if no match.
    """
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (json.JSONDecodeError, TypeError):
            return []

    try:
        jp = jsonpath_parse(expression)
        matches = jp.find(data)
        return [m.value for m in matches]
    except (JsonPathParserError, Exception) as e:
        logger.warning(f"JSONPath parse error for '{expression}': {e}")
        return []


def extract_by_jsonpath(expression: str, data: Any) -> Optional[Any]:
    """
    Extract a single value using JSONPath. Returns first match or None.
    """
    results = evaluate_jsonpath(expression, data)
    return results[0] if results else None


def resolve_node_reference(ref_path: str, node_results: Dict[str, Any], loop_context: Optional[Dict[str, Any]] = None) -> Any:
    """
    Resolve a single variable reference (without {{ }}).

    ref_path examples:
      "nodes.login.$.data.token"      → JSONPath on login's response_body
      "nodes.login.status_code"       → Direct field from NodeResult
      "nodes.login.headers.Authorization"
      "loop.current_item"             → Current loop item
      "loop.current_item.id"          → Nested field in loop item
      "loop.index"                    → Loop index
    """
    parts = ref_path.strip().split(".", 1)

    if parts[0] == "loop" and loop_context is not None:
        return _resolve_loop_ref(parts[1] if len(parts) > 1 else "", loop_context)

    if parts[0] == "nodes" and len(parts) > 1:
        return _resolve_nodes_ref(parts[1], node_results)

    return None


def _resolve_loop_ref(path: str, loop_context: Dict[str, Any]) -> Any:
    """Resolve a loop.* reference."""
    if path == "index":
        return loop_context.get("index", 0)
    if path == "current_item":
        return loop_context.get("current_item")
    if path.startswith("current_item."):
        item = loop_context.get("current_item")
        sub_path = path[len("current_item."):]
        return _drill_into(item, sub_path)
    return None


def _resolve_nodes_ref(path: str, node_results: Dict[str, Any]) -> Any:
    """
    Resolve a nodes.<id>.<field_or_jsonpath> reference.
    path = "login.$.data.token"  →  node_id="login", rest="$.data.token"
    path = "login.status_code"   →  node_id="login", rest="status_code"
    """
    # Find the node_id — it's everything before the second dot (or the jsonpath $.)
    dollar_idx = path.find(".$.")
    if dollar_idx != -1:
        node_id = path[:dollar_idx]
        jp_expr = path[dollar_idx + 1:]   # "$.data.token"
        result = node_results.get(node_id)
        if result is None:
            return None
        # Get the response body to apply JSONPath
        body = _get_result_field(result, "response_body")
        return extract_by_jsonpath(jp_expr, body)

    # Direct field reference: "login.status_code" or "login.headers.Content-Type"
    dot_idx = path.find(".")
    if dot_idx == -1:
        # Just "login" — return entire result dict
        return node_results.get(path)

    node_id = path[:dot_idx]
    field_path = path[dot_idx + 1:]
    result = node_results.get(node_id)
    if result is None:
        return None

    return _get_result_field(result, field_path)


def _get_result_field(result: Any, field_path: str) -> Any:
    """Get a field from a NodeResult (dict or object)."""
    if isinstance(result, dict):
        # Check for extracted data first
        if field_path in result.get("extracted", {}):
            return result["extracted"][field_path]
        return _drill_into(result, field_path)
    # dataclass with to_dict
    if hasattr(result, "to_dict"):
        d = result.to_dict()
        if field_path in d.get("extracted", {}):
            return d["extracted"][field_path]
        return _drill_into(d, field_path)
    return getattr(result, field_path, None)


def _drill_into(obj: Any, dotted_path: str) -> Any:
    """Navigate a dotted path into a nested dict/object."""
    if obj is None or not dotted_path:
        return obj
    parts = dotted_path.split(".")
    current = obj
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, str):
            # Try parsing JSON string
            try:
                current = json.loads(current)
                if isinstance(current, dict):
                    current = current.get(part)
                else:
                    return None
            except (json.JSONDecodeError, TypeError):
                return None
        elif hasattr(current, part):
            current = getattr(current, part)
        else:
            return None
        if current is None:
            return None
    return current


def resolve_all_variables(
    text: str,
    node_results: Dict[str, Any],
    loop_context: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Replace all {{...}} references in a text string with resolved values.
    Unresolved references are left as-is.
    """
    def replacer(match):
        ref = match.group(1).strip()
        value = resolve_node_reference(ref, node_results, loop_context)
        if value is None:
            return match.group(0)  # Leave unresolved
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return str(value)

    return WORKFLOW_VAR_PATTERN.sub(replacer, text)


def resolve_variables_in_dict(
    d: Dict[str, str],
    node_results: Dict[str, Any],
    loop_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, str]:
    """Resolve all variables in both keys and values of a dict."""
    return {
        resolve_all_variables(k, node_results, loop_context):
        resolve_all_variables(v, node_results, loop_context)
        for k, v in d.items()
    }


# ── Condition Evaluation ─────────────────────────────────────────────

def evaluate_condition(
    condition: Dict[str, str],
    node_results: Dict[str, Any],
    loop_context: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Evaluate a Branch/Assert condition.
    condition = {"left": "{{nodes.login.status_code}}", "operator": "==", "right": "200"}
    """
    left_raw = condition.get("left", "")
    operator = condition.get("operator", "==")
    right_raw = condition.get("right", "")

    left = _resolve_operand(left_raw, node_results, loop_context)
    right = _resolve_operand(right_raw, node_results, loop_context)

    return _compare(left, operator, right)


def _resolve_operand(raw: str, node_results: Dict[str, Any], loop_context: Optional[Dict[str, Any]]) -> Any:
    """Resolve a condition operand — could be a variable ref or a literal."""
    resolved = resolve_all_variables(str(raw), node_results, loop_context)
    # Try to parse as number
    try:
        if "." in resolved:
            return float(resolved)
        return int(resolved)
    except (ValueError, TypeError):
        pass
    # Try boolean
    if resolved.lower() == "true":
        return True
    if resolved.lower() == "false":
        return False
    return resolved


def _compare(left: Any, operator: str, right: Any) -> bool:
    """Perform comparison between two resolved values."""
    try:
        if operator == "==":
            return str(left) == str(right)
        if operator == "!=":
            return str(left) != str(right)
        if operator == ">":
            return float(left) > float(right)
        if operator == "<":
            return float(left) < float(right)
        if operator == ">=":
            return float(left) >= float(right)
        if operator == "<=":
            return float(left) <= float(right)
        if operator == "contains":
            return str(right) in str(left)
        if operator == "exists":
            return left is not None and left != ""
    except (TypeError, ValueError):
        logger.warning(f"Condition eval failed: {left} {operator} {right}")
        return False
    return False
