"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface LoopNodeData extends Record<string, unknown> {
  name: string;
  source_path: string;
  _status?: string;
  _iterations?: number;
}

function LoopNode({ id, data, selected }: NodeProps) {
  const d = data as LoopNodeData;
  const status = d._status ?? "pending";

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[200px] max-w-[260px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-cyan-500" />

      <div className="flex items-center gap-2 px-3 py-2 border-b bg-cyan-500/10 rounded-t-lg">
        <Repeat className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold truncate">{d.name || "Loop"}</span>
        {d._iterations !== undefined && (
          <span className="ml-auto text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 rounded">
            {d._iterations} items
          </span>
        )}
      </div>

      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground font-mono truncate">
          {d.source_path || "No source configured"}
        </p>
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="loop_body" className="!bg-cyan-500" />
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

export default memo(LoopNode);
