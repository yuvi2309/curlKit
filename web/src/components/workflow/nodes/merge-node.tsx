"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Merge } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface MergeNodeData extends Record<string, unknown> {
  name: string;
  strategy: "merge_objects" | "collect_array";
  _status?: string;
}

function MergeNode({ id, data, selected }: NodeProps) {
  const d = data as MergeNodeData;
  const status = d._status ?? "pending";
  const strategyLabel = d.strategy === "collect_array" ? "Collect Array" : "Merge Objects";

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[180px] max-w-[240px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <Handle type="target" position={Position.Top} id="input_a" className="!bg-pink-500 !left-[30%]" />
      <Handle type="target" position={Position.Top} id="input_b" className="!bg-pink-500 !left-[70%]" />

      <div className="flex items-center gap-2 px-3 py-2 border-b bg-pink-500/10 rounded-t-lg">
        <Merge className="w-4 h-4 text-pink-400" />
        <span className="text-sm font-semibold truncate">{d.name || "Merge"}</span>
      </div>

      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground">{strategyLabel}</p>
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="output" className="!bg-pink-500" />
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

export default memo(MergeNode);
