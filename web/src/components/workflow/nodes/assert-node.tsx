"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface AssertNodeData extends Record<string, unknown> {
  name: string;
  condition: { left: string; operator: string; right: string } | null;
  action: "stop_workflow" | "skip_node" | "log_error";
  _status?: string;
  _assertion_passed?: boolean;
}

function AssertNode({ id, data, selected }: NodeProps) {
  const d = data as AssertNodeData;
  const status = d._status ?? "pending";

  const actionLabel = {
    stop_workflow: "Stop",
    skip_node: "Skip downstream",
    log_error: "Log & continue",
  }[d.action || "stop_workflow"];

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[200px] max-w-[260px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-rose-500" />

      <div className="flex items-center gap-2 px-3 py-2 border-b bg-rose-500/10 rounded-t-lg">
        <ShieldCheck className="w-4 h-4 text-rose-400" />
        <span className="text-sm font-semibold truncate">{d.name || "Assert"}</span>
        <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-400 px-1.5 rounded">{actionLabel}</span>
      </div>

      <div className="px-3 py-2">
        {d.condition ? (
          <p className="text-xs text-muted-foreground font-mono truncate">
            {d.condition.left} {d.condition.operator} {d.condition.right}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No condition set</p>
        )}
        {d._assertion_passed !== undefined && (
          <p className={`text-[10px] mt-1 ${d._assertion_passed ? "text-emerald-400" : "text-red-400"}`}>
            {d._assertion_passed ? "✓ Passed" : "✗ Failed"}
          </p>
        )}
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="output" className="!bg-rose-500" />
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

export default memo(AssertNode);
