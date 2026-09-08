"use client";

import { useState, useRef, useCallback } from "react";
import { Play, Pause, Square, RotateCcw, ChevronDown, ChevronRight, Terminal, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  runWorkflowInline,
  pauseWorkflow,
  resumeWorkflow,
  stopWorkflow,
  connectWorkflowWs,
  type WorkflowDefinition,
  type WorkflowProgressEvent,
} from "@/lib/api";

interface ExecutionPanelProps {
  buildWorkflow: () => WorkflowDefinition;
  updateNodeStatus: (nodeId: string, status: string, extraData?: Record<string, unknown>) => void;
  resetNodeStatuses: () => void;
}

interface LogEntry {
  time: string;
  nodeId: string | null;
  status: string;
  message: string;
  // cURL execution details
  curlDetails?: {
    resolvedCommand: string;
    statusCode?: number;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    durationMs?: number;
    error?: string;
  };
}

export default function ExecutionPanel({
  buildWorkflow,
  updateNodeStatus,
  resetNodeStatuses,
}: ExecutionPanelProps) {
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const handleRun = async () => {
    const wf = buildWorkflow();
    if (wf.nodes.length === 0) return;

    resetNodeStatuses();
    setLogs([]);
    setStatus("starting");

    try {
      const res = await runWorkflowInline(wf);
      const rid = res.run_id;
      setRunId(rid);
      setStatus("running");

      addLog({
        time: new Date().toLocaleTimeString(),
        nodeId: null,
        status: "started",
        message: `Workflow started (run: ${rid.slice(0, 8)}…)`,
      });

      // Connect WebSocket
      const ws = connectWorkflowWs(
        rid,
        (event: WorkflowProgressEvent) => {
          const { node_id, status: evStatus, data } = event;

          if (node_id) {
            updateNodeStatus(node_id, evStatus, data ?? undefined);

            // Build cURL details if this is a curl node completion
            let curlDetails: LogEntry["curlDetails"] = undefined;
            if (data?.node_type === "curl" && (evStatus === "success" || evStatus === "failed")) {
              curlDetails = {
                resolvedCommand: (data.resolved_curl_command as string) || "",
                statusCode: data.status_code as number | undefined,
                responseBody: data.response_body as string | undefined,
                responseHeaders: data.response_headers as Record<string, string> | undefined,
                durationMs: data.duration_ms as number | undefined,
                error: data.error as string | undefined,
              };
            }

            addLog({
              time: new Date().toLocaleTimeString(),
              nodeId: node_id,
              status: evStatus,
              message: `${node_id}: ${evStatus}${data?.error ? ` — ${data.error}` : ""}${data?.duration_ms ? ` (${data.duration_ms}ms)` : ""}`,
              curlDetails,
            });
          }

          if (event.final) {
            setStatus(evStatus);
            addLog({
              time: new Date().toLocaleTimeString(),
              nodeId: null,
              status: evStatus,
              message: `Workflow ${evStatus}`,
            });
          }
        },
        () => {
          // On close, check final status
          if (status === "running") {
            setStatus("disconnected");
          }
        }
      );
      wsRef.current = ws;
    } catch (err) {
      setStatus("failed");
      addLog({
        time: new Date().toLocaleTimeString(),
        nodeId: null,
        status: "failed",
        message: `Failed to start: ${(err as Error).message}`,
      });
    }
  };

  const handlePause = async () => {
    if (!runId) return;
    await pauseWorkflow(runId);
    setStatus("paused");
    addLog({
      time: new Date().toLocaleTimeString(),
      nodeId: null,
      status: "paused",
      message: "Workflow paused",
    });
  };

  const handleResume = async () => {
    if (!runId) return;
    await resumeWorkflow(runId);
    setStatus("running");
    addLog({
      time: new Date().toLocaleTimeString(),
      nodeId: null,
      status: "resumed",
      message: "Workflow resumed",
    });
  };

  const handleStop = async () => {
    if (!runId) return;
    await stopWorkflow(runId);
    setStatus("stopped");
    wsRef.current?.close();
    addLog({
      time: new Date().toLocaleTimeString(),
      nodeId: null,
      status: "stopped",
      message: "Workflow stopped",
    });
  };

  const handleReset = () => {
    wsRef.current?.close();
    setRunId(null);
    setStatus("idle");
    setLogs([]);
    resetNodeStatuses();
  };

  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isFinished = ["completed", "failed", "stopped"].includes(status);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Execution
      </h3>

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        {!isRunning && !isPaused && (
          <Button size="sm" onClick={handleRun} className="h-7 text-xs gap-1" disabled={status === "starting"}>
            <Play className="w-3 h-3" />
            {isFinished ? "Re-run" : "Run"}
          </Button>
        )}
        {isRunning && (
          <Button size="sm" variant="outline" onClick={handlePause} className="h-7 text-xs gap-1">
            <Pause className="w-3 h-3" /> Pause
          </Button>
        )}
        {isPaused && (
          <Button size="sm" onClick={handleResume} className="h-7 text-xs gap-1">
            <Play className="w-3 h-3" /> Resume
          </Button>
        )}
        {(isRunning || isPaused) && (
          <Button size="sm" variant="destructive" onClick={handleStop} className="h-7 text-xs gap-1">
            <Square className="w-3 h-3" /> Stop
          </Button>
        )}
        {isFinished && (
          <Button size="sm" variant="ghost" onClick={handleReset} className="h-7 text-xs gap-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
        )}
      </div>

      {/* Status badge */}
      {status !== "idle" && (
        <Badge
          variant="outline"
          className={`text-[10px] ${
            status === "running"    ? "border-blue-500 text-blue-400" :
            status === "completed"  ? "border-emerald-500 text-emerald-400" :
            status === "failed"     ? "border-red-500 text-red-400" :
            status === "paused"     ? "border-amber-500 text-amber-400" :
            status === "stopped"    ? "border-muted-foreground text-muted-foreground" :
            "border-border text-muted-foreground"
          }`}
        >
          {status}
        </Badge>
      )}

      {/* Execution Log */}
      {logs.length > 0 && (
        <ScrollArea className="h-64 border rounded-md">
          <div className="p-2 space-y-0.5">
            {logs.map((log, i) => (
              <CurlLogEntry key={i} log={log} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Expandable cURL log entry ───────────────────────────────────────

function CurlLogEntry({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1200);
  };

  const hasCurlDetails = !!log.curlDetails?.resolvedCommand;

  const statusColor =
    log.status === "success" ? "text-emerald-400" :
    log.status === "failed" ? "text-red-400" :
    log.status === "running" ? "text-blue-400" :
    log.status === "skipped" ? "text-yellow-400" :
    "text-foreground";

  return (
    <div>
      <div
        className={`text-[10px] font-mono leading-relaxed flex items-start gap-1 ${hasCurlDetails ? "cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1" : ""}`}
        onClick={() => hasCurlDetails && setExpanded(!expanded)}
      >
        {hasCurlDetails && (
          <span className="text-muted-foreground mt-0.5 shrink-0">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        )}
        <span className="text-muted-foreground shrink-0">{log.time}</span>{" "}
        <span className={statusColor}>{log.message}</span>
      </div>

      {/* Expanded cURL execution details */}
      {expanded && log.curlDetails && (
        <div className="ml-4 mt-1 mb-2 space-y-2 border-l-2 border-blue-500/30 pl-3">
          {/* Resolved cURL command */}
          {log.curlDetails.resolvedCommand && (
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Terminal className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] font-semibold text-blue-400">Resolved cURL</span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyText(log.curlDetails!.resolvedCommand, "curl"); }}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                >
                  {copiedField === "curl" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
                {log.curlDetails.resolvedCommand}
              </pre>
            </div>
          )}

          {/* Response status + duration */}
          <div className="flex items-center gap-2 text-[10px]">
            {log.curlDetails.statusCode && (
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  log.curlDetails.statusCode >= 200 && log.curlDetails.statusCode < 300
                    ? "border-emerald-500/50 text-emerald-400"
                    : log.curlDetails.statusCode >= 400
                      ? "border-red-500/50 text-red-400"
                      : "border-amber-500/50 text-amber-400"
                }`}
              >
                {log.curlDetails.statusCode}
              </Badge>
            )}
            {log.curlDetails.durationMs && (
              <span className="text-muted-foreground">{log.curlDetails.durationMs}ms</span>
            )}
            {log.curlDetails.error && (
              <span className="text-red-400">Error: {log.curlDetails.error}</span>
            )}
          </div>

          {/* Response headers */}
          {log.curlDetails.responseHeaders && Object.keys(log.curlDetails.responseHeaders).length > 0 && (
            <ResponseHeadersView headers={log.curlDetails.responseHeaders} />
          )}

          {/* Response body */}
          {log.curlDetails.responseBody && (
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground">Response Body</span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyText(log.curlDetails!.responseBody!, "body"); }}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                >
                  {copiedField === "body" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-foreground max-h-48 overflow-y-auto">
                {formatBody(log.curlDetails.responseBody)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResponseHeadersView({ headers }: { headers: Record<string, string> }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
      >
        {show ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Response Headers ({Object.keys(headers).length})
      </button>
      {show && (
        <div className="text-[10px] font-mono bg-muted/50 rounded p-2 mt-0.5 space-y-0.5">
          {Object.entries(headers).map(([k, v]) => (
            <div key={k}>
              <span className="text-blue-400">{k}</span>: <span className="text-foreground">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch (_e) {
    return body;
  }
}
