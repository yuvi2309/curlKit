"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface BranchNodeData extends Record<string, unknown> {
  name: string;
  condition: { left: string; operator: string; right: string } | null;
  _status?: string;
  _branch_taken?: string;
}

function BranchNode({ id, data, selected }: NodeProps) {
  const d = data as BranchNodeData;
  const status = d._status ?? "pending";

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[200px] max-w-[260px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-orange-500" />

      <div className="flex items-center gap-2 px-3 py-2 border-b bg-orange-500/10 rounded-t-lg">
        <GitBranch className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-semibold truncate">{d.name || "Branch"}</span>
        {d._branch_taken && (
          <span className={`ml-auto text-[10px] px-1.5 rounded ${
            d._branch_taken === "true" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
          }`}>
            {d._branch_taken}
          </span>
        )}
      </div>

      <div className="px-3 py-2">
        {d.condition ? (
          <p className="text-xs text-muted-foreground font-mono truncate">
            {d.condition.left} {d.condition.operator} {d.condition.right}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No condition set</p>
        )}
      </div>

      <div className="flex justify-between px-3 pb-1">
        <span className="text-[10px] text-emerald-400">True</span>
        <span className="text-[10px] text-red-400">False</span>
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="true" className="!bg-emerald-500 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500 !left-[70%]" />
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

export default memo(BranchNode);
