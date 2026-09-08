const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001";

export async function parseCommand(curlCommand: string, name?: string) {
  const res = await fetch(`${API_BASE}/api/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curl_command: curlCommand, name: name || "" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Parse failed");
  }
  return res.json();
}

export async function extractVariables(curlCommand: string) {
  const res = await fetch(`${API_BASE}/api/extract-variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curl_command: curlCommand }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Extract variables failed");
  }
  return res.json();
}

export async function importCollection(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/import-collection`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Import failed");
  }
  return res.json();
}

export async function parseCsv(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/parse-csv`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "CSV parse failed");
  }
  return res.json();
}

export async function generateMapping(
  variables: string[],
  csvColumns: string[]
) {
  const res = await fetch(`${API_BASE}/api/generate-mapping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variables, csv_columns: csvColumns }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Mapping generation failed");
  }
  return res.json();
}

export async function validateData(
  curlCommand: string,
  csvContent: string,
  mapping?: Record<string, string>
) {
  const res = await fetch(`${API_BASE}/api/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      curl_command: curlCommand,
      csv_content: csvContent,
      mapping: mapping || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Validation failed");
  }
  return res.json();
}

export async function runBatch(
  curlCommand: string,
  csvContent: string,
  mapping?: Record<string, string>,
  delayMs?: number,
  force?: boolean
) {
  const res = await fetch(`${API_BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      curl_command: curlCommand,
      csv_content: csvContent,
      mapping: mapping || null,
      delay_ms: delayMs || 0,
      force: force || false,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Batch execution failed");
  }
  return res.json();
}

export async function runSingle(curlCommand: string) {
  const res = await fetch(`${API_BASE}/api/run-single`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curl_command: curlCommand }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Execution failed");
  }
  return res.json();
}


// ── Workflow API (Phase 2) ──────────────────────────────────────────

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowRunStatus {
  run_id: string;
  workflow_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  node_results: Record<string, unknown>;
  error: string | null;
}

export interface WorkflowProgressEvent {
  run_id: string;
  node_id: string | null;
  status: string;
  data: Record<string, unknown> | null;
  final?: boolean;
}

// CRUD

export async function saveWorkflow(workflow: WorkflowDefinition) {
  const res = await fetch(`${API_BASE}/api/workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Save failed");
  }
  return res.json();
}

export async function listWorkflows() {
  const res = await fetch(`${API_BASE}/api/workflows`);
  if (!res.ok) throw new Error("Failed to list workflows");
  return res.json();
}

export async function getWorkflow(id: string) {
  const res = await fetch(`${API_BASE}/api/workflow/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Not found");
  }
  return res.json();
}

export async function deleteWorkflow(id: string) {
  const res = await fetch(`${API_BASE}/api/workflow/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Delete failed");
  }
  return res.json();
}

export async function exportWorkflow(id: string) {
  const res = await fetch(`${API_BASE}/api/workflow/${encodeURIComponent(id)}/export`);
  if (!res.ok) throw new Error("Export failed");
  return res.json();
}

export async function importWorkflowFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/workflow/import`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Import failed");
  }
  return res.json();
}

// Validation

export async function validateWorkflow(workflow: WorkflowDefinition) {
  const res = await fetch(`${API_BASE}/api/workflow/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Validation failed");
  }
  return res.json();
}

// Execution

export async function runWorkflow(workflowId: string) {
  const res = await fetch(
    `${API_BASE}/api/workflow/${encodeURIComponent(workflowId)}/run`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Run failed");
  }
  return res.json();
}

export async function runWorkflowInline(workflow: WorkflowDefinition) {
  const res = await fetch(`${API_BASE}/api/workflow/run-inline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Run failed");
  }
  return res.json();
}

export async function pauseWorkflow(runId: string) {
  const res = await fetch(
    `${API_BASE}/api/workflow/run/${encodeURIComponent(runId)}/pause`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Pause failed");
  return res.json();
}

export async function resumeWorkflow(runId: string) {
  const res = await fetch(
    `${API_BASE}/api/workflow/run/${encodeURIComponent(runId)}/resume`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Resume failed");
  return res.json();
}

export async function stopWorkflow(runId: string) {
  const res = await fetch(
    `${API_BASE}/api/workflow/run/${encodeURIComponent(runId)}/stop`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Stop failed");
  return res.json();
}

export async function getWorkflowRunStatus(runId: string): Promise<WorkflowRunStatus> {
  const res = await fetch(
    `${API_BASE}/api/workflow/run/${encodeURIComponent(runId)}/status`
  );
  if (!res.ok) throw new Error("Status fetch failed");
  const data = await res.json();
  return data as WorkflowRunStatus;
}

// WebSocket

export function connectWorkflowWs(
  runId: string,
  onMessage: (event: WorkflowProgressEvent) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/workflow/${encodeURIComponent(runId)}`);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as WorkflowProgressEvent;
      onMessage(data);
    } catch (_e) {}
  };
  ws.onclose = () => onClose?.();
  ws.onerror = () => onClose?.();
  return ws;
}
