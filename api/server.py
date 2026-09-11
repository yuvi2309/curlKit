import sys
import os
import json
import tempfile
import time
import asyncio
import threading
from typing import Optional, Dict

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure the project root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.parser.curl_parser import parse_curl, CurlRequest
from src.parser.collection_parser import parse_collection
from src.variable.variable_utils import (
    extract_variables,
    substitute_variables,
    generate_variable_mapping,
)
from src.csv.csv_utils import (
    read_csv,
    get_csv_columns,
    validate_csv_against_variables,
    build_variable_row,
)
from src.executor.batch_executor import execute_request, batch_execute
from src.workflow.models import WorkflowDefinition
from src.workflow.dag import WorkflowDAG, DAGValidationError
from src.workflow.executor import WorkflowExecutor
from src.workflow.storage import (
    save_workflow,
    load_workflow,
    list_workflows,
    delete_workflow,
    import_workflow,
    export_workflow,
)

app = FastAPI(title="cURL Kit API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ──────────────────────────────────────

class ParseRequest(BaseModel):
    curl_command: str
    name: str = ""


class VariableExtractRequest(BaseModel):
    curl_command: str


class MappingRequest(BaseModel):
    variables: list[str]
    csv_columns: list[str]


class ValidateRequest(BaseModel):
    curl_command: str
    csv_content: str
    mapping: Optional[dict[str, str]] = None


class RunRequest(BaseModel):
    curl_command: str
    csv_content: str
    mapping: Optional[dict[str, str]] = None
    delay_ms: int = 0
    force: bool = False


class SingleRunRequest(BaseModel):
    curl_command: str


# ── Endpoints ──────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/parse")
def parse_curl_command(req: ParseRequest):
    """Parse a cURL command and return structured JSON."""
    try:
        result: CurlRequest = parse_curl(req.curl_command, req.name)
        return {"success": True, "data": result.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/import-collection")
async def import_collection(file: UploadFile = File(...)):
    """Import a Postman collection or JSON cURL list."""
    try:
        content = await file.read()
        # Write to temp file since collection_parser reads from filepath
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as tmp:
            tmp.write(content.decode("utf-8"))
            tmp_path = tmp.name

        try:
            requests_list = parse_collection(tmp_path)
            return {
                "success": True,
                "data": [r.to_dict() for r in requests_list],
                "count": len(requests_list),
            }
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/extract-variables")
def extract_vars(req: VariableExtractRequest):
    """Extract {{variables}} from a cURL command."""
    try:
        parsed = parse_curl(req.curl_command)
        variables = extract_variables(parsed)
        return {"success": True, "variables": variables}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/parse-csv")
async def parse_csv_endpoint(file: UploadFile = File(...)):
    """Parse a CSV file and return columns + row data."""
    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False
        ) as tmp:
            tmp.write(content.decode("utf-8"))
            tmp_path = tmp.name
        try:
            columns = get_csv_columns(tmp_path)
            rows = read_csv(tmp_path)
            return {
                "success": True,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
            }
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/generate-mapping")
def gen_mapping(req: MappingRequest):
    """Auto-generate variable → CSV column mapping."""
    try:
        mapping = generate_variable_mapping(req.variables, req.csv_columns)
        return {"success": True, "mapping": mapping}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/validate")
def validate_data(req: ValidateRequest):
    """Validate that CSV columns cover all cURL variables."""
    try:
        parsed = parse_curl(req.curl_command)
        variables = extract_variables(parsed)

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False
        ) as tmp:
            tmp.write(req.csv_content)
            tmp_path = tmp.name

        try:
            result = validate_csv_against_variables(
                tmp_path, variables, req.mapping
            )
            return {
                "success": True,
                "variables": variables,
                "validation": result,
            }
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/run")
def run_batch(req: RunRequest):
    """Execute the cURL command for each CSV row."""
    try:
        parsed = parse_curl(req.curl_command)
        variables = extract_variables(parsed)

        # Write CSV to temp file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False
        ) as tmp:
            tmp.write(req.csv_content)
            tmp_path = tmp.name

        try:
            # Validate first
            validation = validate_csv_against_variables(
                tmp_path, variables, req.mapping
            )
            if validation.get("missing") and not req.force:
                return {
                    "success": False,
                    "error": "Missing CSV columns for variables",
                    "missing": validation["missing"],
                    "extra": validation.get("extra", []),
                }

            results = batch_execute(
                parsed,
                tmp_path,
                variables,
                req.mapping,
                req.delay_ms,
            )

            # Build summary
            total = len(results)
            success_count = sum(1 for r in results if r.success)
            fail_count = total - success_count
            durations = [
                r.duration_ms for r in results if r.duration_ms is not None
            ]
            avg_duration = (
                sum(durations) / len(durations) if durations else 0
            )

            results_data = []
            for r in results:
                d = r.to_dict()
                # Try to parse JSON response body
                if d.get("response_body"):
                    try:
                        d["response_body_parsed"] = json.loads(
                            d["response_body"]
                        )
                    except (json.JSONDecodeError, TypeError):
                        pass
                results_data.append(d)

            return {
                "success": True,
                "results": results_data,
                "summary": {
                    "total": total,
                    "success": success_count,
                    "failed": fail_count,
                    "avg_duration_ms": round(avg_duration, 2),
                    "min_duration_ms": (
                        round(min(durations), 2) if durations else 0
                    ),
                    "max_duration_ms": (
                        round(max(durations), 2) if durations else 0
                    ),
                },
            }
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/run-single")
def run_single(req: SingleRunRequest):
    """Execute a single cURL command (no CSV / variables)."""
    try:
        parsed = parse_curl(req.curl_command)
        result = execute_request(parsed)
        d = result.to_dict()
        if d.get("response_body"):
            try:
                d["response_body_parsed"] = json.loads(d["response_body"])
            except (json.JSONDecodeError, TypeError):
                pass
        return {"success": True, "result": d}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ══════════════════════════════════════════════════════════════════════
# ── Phase 2: Workflow Endpoints ──────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════

# In-memory registry of active workflow executions
_active_runs: Dict[str, WorkflowExecutor] = {}
_run_lock = threading.Lock()


class WorkflowSaveRequest(BaseModel):
    workflow: dict


class WorkflowValidateRequest(BaseModel):
    workflow: dict


# ── CRUD ─────────────────────────────────────────────────────────────

@app.post("/api/workflow")
def save_workflow_endpoint(req: WorkflowSaveRequest):
    """Create or update a workflow."""
    try:
        wf = WorkflowDefinition.from_dict(req.workflow)
        save_workflow(wf)
        return {"success": True, "id": wf.id, "name": wf.name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/workflows")
def list_workflows_endpoint():
    """List all saved workflows."""
    return {"success": True, "workflows": list_workflows()}


@app.get("/api/workflow/{workflow_id}")
def get_workflow_endpoint(workflow_id: str):
    """Load a workflow by ID."""
    wf = load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"success": True, "workflow": wf.to_dict()}


@app.delete("/api/workflow/{workflow_id}")
def delete_workflow_endpoint(workflow_id: str):
    """Delete a workflow."""
    deleted = delete_workflow(workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"success": True}


@app.get("/api/workflow/{workflow_id}/export")
def export_workflow_endpoint(workflow_id: str):
    """Export a workflow as JSON."""
    data = export_workflow(workflow_id)
    if not data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"success": True, "workflow": data}


@app.post("/api/workflow/import")
async def import_workflow_endpoint(file: UploadFile = File(...)):
    """Import a workflow from a JSON file."""
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
        wf = import_workflow(data)
        return {"success": True, "id": wf.id, "name": wf.name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Validation ───────────────────────────────────────────────────────

@app.post("/api/workflow/validate")
def validate_workflow_endpoint(req: WorkflowValidateRequest):
    """Validate a workflow DAG (cycle detection, missing refs)."""
    try:
        wf = WorkflowDefinition.from_dict(req.workflow)
        dag = WorkflowDAG(wf)
        warnings = dag.validate()
        order = dag.topological_sort()
        return {
            "success": True,
            "valid": True,
            "warnings": warnings,
            "execution_order": order,
        }
    except DAGValidationError as e:
        return {"success": True, "valid": False, "error": str(e)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Execution ────────────────────────────────────────────────────────

@app.post("/api/workflow/{workflow_id}/run")
def run_workflow_endpoint(workflow_id: str):
    """Start executing a saved workflow. Returns run_id for tracking."""
    wf = load_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    msg_queue: list = []

    def threadsafe_progress(run_id, node_id, status, data):
        msg_queue.append({
            "run_id": run_id, "node_id": node_id,
            "status": status, "data": data,
        })

    executor = WorkflowExecutor(wf, on_progress=threadsafe_progress)
    run_id = executor.run_id

    with _run_lock:
        _active_runs[run_id] = executor
    executor._msg_queue = msg_queue

    def run():
        try:
            executor.execute()
        finally:
            def cleanup():
                time.sleep(300)
                with _run_lock:
                    _active_runs.pop(run_id, None)
            threading.Thread(target=cleanup, daemon=True).start()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True, "run_id": run_id, "workflow_id": workflow_id}


@app.post("/api/workflow/run-inline")
def run_workflow_inline(req: WorkflowSaveRequest):
    """Execute a workflow directly from definition (without saving)."""
    try:
        wf = WorkflowDefinition.from_dict(req.workflow)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    msg_queue: list = []

    def threadsafe_progress(run_id, node_id, status, data):
        msg_queue.append({
            "run_id": run_id, "node_id": node_id,
            "status": status, "data": data,
        })

    executor = WorkflowExecutor(wf, on_progress=threadsafe_progress)
    run_id = executor.run_id

    with _run_lock:
        _active_runs[run_id] = executor
    executor._msg_queue = msg_queue

    def run():
        try:
            executor.execute()
        finally:
            def cleanup():
                time.sleep(300)
                with _run_lock:
                    _active_runs.pop(run_id, None)
            threading.Thread(target=cleanup, daemon=True).start()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True, "run_id": run_id}


@app.post("/api/workflow/run/{run_id}/pause")
def pause_workflow(run_id: str):
    with _run_lock:
        executor = _active_runs.get(run_id)
    if not executor:
        raise HTTPException(status_code=404, detail="Run not found")
    executor.pause()
    return {"success": True, "status": executor.state.status}


@app.post("/api/workflow/run/{run_id}/resume")
def resume_workflow(run_id: str):
    with _run_lock:
        executor = _active_runs.get(run_id)
    if not executor:
        raise HTTPException(status_code=404, detail="Run not found")
    executor.resume()
    return {"success": True, "status": executor.state.status}


@app.post("/api/workflow/run/{run_id}/stop")
def stop_workflow(run_id: str):
    with _run_lock:
        executor = _active_runs.get(run_id)
    if not executor:
        raise HTTPException(status_code=404, detail="Run not found")
    executor.stop()
    return {"success": True, "status": executor.state.status}


@app.get("/api/workflow/run/{run_id}/status")
def get_workflow_status(run_id: str):
    with _run_lock:
        executor = _active_runs.get(run_id)
    if not executor:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"success": True, **executor.state.to_dict()}


# ── WebSocket for real-time progress ─────────────────────────────────

@app.websocket("/ws/workflow/{run_id}")
async def workflow_ws(websocket: WebSocket, run_id: str):
    """Stream execution progress events to connected clients."""
    await websocket.accept()

    with _run_lock:
        executor = _active_runs.get(run_id)
    if not executor:
        await websocket.send_json({"error": "Run not found"})
        await websocket.close()
        return

    try:
        msg_queue = getattr(executor, "_msg_queue", [])
        sent_idx = 0
        while True:
            while sent_idx < len(msg_queue):
                await websocket.send_json(msg_queue[sent_idx])
                sent_idx += 1

            if executor.state.status in ("completed", "failed", "stopped"):
                while sent_idx < len(msg_queue):
                    await websocket.send_json(msg_queue[sent_idx])
                    sent_idx += 1
                await websocket.send_json({
                    "run_id": run_id, "node_id": None,
                    "status": executor.state.status,
                    "data": executor.state.to_dict(),
                    "final": True,
                })
                break

            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
