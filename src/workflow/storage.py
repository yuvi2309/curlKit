"""
Workflow persistence — save/load/list/delete workflow JSON files.
Workflows are stored in a 'workflows/' directory at the project root.
"""

import os
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime

from src.workflow.models import WorkflowDefinition

logger = logging.getLogger("curlkit.workflow.storage")

# Default storage directory (relative to project root)
_DEFAULT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "workflows")


def _ensure_dir(directory: str):
    os.makedirs(directory, exist_ok=True)


def save_workflow(workflow: WorkflowDefinition, directory: str = _DEFAULT_DIR) -> str:
    """
    Save a workflow definition as a JSON file.
    Returns the file path.
    """
    _ensure_dir(directory)
    workflow.updated_at = datetime.utcnow().isoformat()
    filepath = os.path.join(directory, f"{workflow.id}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(workflow.to_dict(), f, indent=2)
    logger.info(f"Saved workflow '{workflow.name}' to {filepath}")
    return filepath


def load_workflow(workflow_id: str, directory: str = _DEFAULT_DIR) -> Optional[WorkflowDefinition]:
    """Load a workflow by ID. Returns None if not found."""
    filepath = os.path.join(directory, f"{workflow_id}.json")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return WorkflowDefinition.from_dict(data)


def list_workflows(directory: str = _DEFAULT_DIR) -> List[Dict]:
    """
    List all saved workflows. Returns list of summary dicts:
    [{id, name, description, created_at, updated_at}, ...]
    """
    _ensure_dir(directory)
    workflows = []
    for filename in os.listdir(directory):
        if not filename.endswith(".json"):
            continue
        filepath = os.path.join(directory, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            workflows.append({
                "id": data.get("id", filename.replace(".json", "")),
                "name": data.get("name", "Untitled"),
                "description": data.get("description", ""),
                "node_count": len(data.get("nodes", [])),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
            })
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to read workflow file {filename}: {e}")
    return sorted(workflows, key=lambda w: w.get("updated_at", ""), reverse=True)


def delete_workflow(workflow_id: str, directory: str = _DEFAULT_DIR) -> bool:
    """Delete a workflow by ID. Returns True if deleted."""
    filepath = os.path.join(directory, f"{workflow_id}.json")
    if os.path.exists(filepath):
        os.remove(filepath)
        logger.info(f"Deleted workflow {workflow_id}")
        return True
    return False


def import_workflow(data: dict, directory: str = _DEFAULT_DIR) -> WorkflowDefinition:
    """Import a workflow from a dict (e.g. uploaded JSON file)."""
    workflow = WorkflowDefinition.from_dict(data)
    save_workflow(workflow, directory)
    return workflow


def export_workflow(workflow_id: str, directory: str = _DEFAULT_DIR) -> Optional[dict]:
    """Export a workflow as a dict for download."""
    workflow = load_workflow(workflow_id, directory)
    if workflow:
        return workflow.to_dict()
    return None
