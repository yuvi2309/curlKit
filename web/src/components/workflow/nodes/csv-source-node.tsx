"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Table } from "lucide-react";
import NodeIdBadge from "./node-id-badge";

export interface CsvSourceNodeData extends Record<string, unknown> {
  name: string;
  csv_content: string;
  columns?: string[];
  _status?: string;
}

function CsvSourceNode({ id, data, selected }: NodeProps) {
  const d = data as CsvSourceNodeData;
  const status = d._status ?? "pending";
  const lines = (d.csv_content || "").split("\n").filter(Boolean);
  const rowCount = Math.max(lines.length - 1, 0);
  const columns = d.columns || [];

  return (
    <div
      className={`rounded-lg border-2 bg-background shadow-md min-w-[200px] max-w-[260px] ${
        selected ? "ring-2 ring-primary" : ""
      } ${statusBorder(status)}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-emerald-500/10 rounded-t-lg">
        <Table className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold truncate">{d.name || "CSV Source"}</span>
      </div>

      <div className="px-3 py-2">
        {columns.length > 0 ? (
          <>
            <p className="text-[10px] text-muted-foreground mb-1">{rowCount} rows · {columns.length} columns</p>
            <div className="flex flex-wrap gap-0.5">
              {columns.slice(0, 6).map((col) => (
                <span key={col} className="text-[9px] font-mono px-1 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">
                  {col}
                </span>
              ))}
              {columns.length > 6 && (
                <span className="text-[9px] text-muted-foreground px-1 py-0.5">+{columns.length - 6} more</span>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No data loaded</p>
        )}
      </div>

      <NodeIdBadge id={id} />

      <Handle type="source" position={Position.Bottom} id="rows" className="!bg-emerald-500" />
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

export default memo(CsvSourceNode);
