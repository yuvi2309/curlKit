"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileSearch } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface ExtractNodeData extends Record<string, unknown> {
  name: string;
  extractions: { name: string; jsonpath: string }[];
  _status?: string;
}

function ExtractNode({ id, data, selected }: NodeProps) {
  const d = data as ExtractNodeData;
  const status = d._status ?? "pending";

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[200px] max-w-[260px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-violet-500" />

      <div className="flex items-center gap-2 px-3 py-2 border-b bg-violet-500/10 rounded-t-lg">
        <FileSearch className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold truncate">{d.name || "Extract"}</span>
      </div>

      <div className="px-3 py-2">
        {d.extractions?.length > 0 ? (
          <div className="space-y-1">
            {d.extractions.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="text-violet-400 font-medium">{e.name}</span>
                <span className="text-muted-foreground font-mono truncate">{e.jsonpath}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No extractions configured</p>
        )}
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="output" className="!bg-violet-500" />
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

export default memo(ExtractNode);
