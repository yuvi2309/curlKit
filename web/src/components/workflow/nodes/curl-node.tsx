"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface CurlNodeData extends Record<string, unknown> {
  name: string;
  curl_command: string;
  run_mode: "once" | "per_iteration" | "on_ttl_expire";
  ttl_seconds: number | null;
  extractions: { name: string; jsonpath: string }[];
  _status?: string;
}

function CurlNode({ id, data, selected }: NodeProps) {
  const d = data as CurlNodeData;
  const status = d._status ?? "pending";

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[220px] max-w-[280px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-blue-500" />

      <div className="flex items-center gap-2 px-3 py-2 border-b bg-blue-500/10 rounded-t-lg">
        <Terminal className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold truncate">{d.name || "cURL Request"}</span>
        {d.run_mode === "once" && (
          <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 px-1.5 rounded">once</span>
        )}
        {d.run_mode === "on_ttl_expire" && (
          <span className="ml-auto text-[10px] bg-purple-500/20 text-purple-400 px-1.5 rounded">
            TTL {d.ttl_seconds}s
          </span>
        )}
      </div>

      <div className="px-3 py-2 space-y-1">
        <p className="text-xs text-muted-foreground font-mono truncate">
          {d.curl_command ? d.curl_command.slice(0, 60) + (d.curl_command.length > 60 ? "…" : "") : "No command set"}
        </p>
        {d.extractions?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {d.extractions.map((e, i) => (
              <span key={i} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                {e.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="response" className="!bg-blue-500" />
    </div>
  );
}

function statusBorder(status: string) {
  switch (status) {
    case "running": return "border-blue-500";
    case "success": return "border-emerald-500";
    case "failed":  return "border-red-500";
    case "skipped": return "border-yellow-500";
    default:        return "border-border";
  }
}

export default memo(CurlNode);
