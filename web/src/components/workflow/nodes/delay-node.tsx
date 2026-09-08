"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface DelayNodeData extends Record<string, unknown> {
  name: string;
  delay_seconds: number;
  _status?: string;
}

function DelayNode({ id, data, selected }: NodeProps) {
  const d = data as DelayNodeData;
  const status = d._status ?? "pending";

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[160px] max-w-[220px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-amber-500" />

      <div className="flex items-center gap-2 px-3 py-2 border-b bg-amber-500/10 rounded-t-lg">
        <Clock className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold truncate">{d.name || "Delay"}</span>
      </div>

      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground">{d.delay_seconds ?? 1}s wait</p>
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="output" className="!bg-amber-500" />
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

export default memo(DelayNode);
