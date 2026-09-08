"use client";

import { Terminal, Table, FileSearch, GitBranch, ShieldCheck, Repeat, Clock, Merge } from "lucide-react";
import type { DragEvent } from "react";

const NODE_TYPES = [
  {
    type: "curl",
    label: "cURL Request",
    icon: Terminal,
    color: "text-blue-400 bg-blue-500/10",
    description: "Execute an HTTP request",
    defaults: {
      name: "Request",
      curl_command: "",
      run_mode: "per_iteration",
      ttl_seconds: null,
      extractions: [],
    },
  },
  {
    type: "csv_source",
    label: "CSV Source",
    icon: Table,
    color: "text-emerald-400 bg-emerald-500/10",
    description: "Load tabular data",
    defaults: {
      name: "CSV Source",
      csv_content: "",
    },
  },
  {
    type: "extract",
    label: "Extract",
    icon: FileSearch,
    color: "text-violet-400 bg-violet-500/10",
    description: "Pull data via JSONPath",
    defaults: {
      name: "Extract",
      extractions: [],
    },
  },
  {
    type: "branch",
    label: "Branch (If/Else)",
    icon: GitBranch,
    color: "text-orange-400 bg-orange-500/10",
    description: "Conditional routing",
    defaults: {
      name: "Branch",
      condition: null,
    },
  },
  {
    type: "assert",
    label: "Assert / Gate",
    icon: ShieldCheck,
    color: "text-rose-400 bg-rose-500/10",
    description: "Stop or skip on failure",
    defaults: {
      name: "Assert",
      condition: null,
      action: "stop_workflow",
    },
  },
  {
    type: "loop",
    label: "Loop",
    icon: Repeat,
    color: "text-cyan-400 bg-cyan-500/10",
    description: "Iterate over data",
    defaults: {
      name: "Loop",
      source_path: "",
    },
  },
  {
    type: "delay",
    label: "Delay",
    icon: Clock,
    color: "text-amber-400 bg-amber-500/10",
    description: "Wait between steps",
    defaults: {
      name: "Delay",
      delay_seconds: 1,
    },
  },
  {
    type: "merge",
    label: "Merge",
    icon: Merge,
    color: "text-pink-400 bg-pink-500/10",
    description: "Combine multi-source data",
    defaults: {
      name: "Merge",
      strategy: "merge_objects",
    },
  },
] as const;

export { NODE_TYPES };

export default function NodePalette() {
  const onDragStart = (event: DragEvent, nodeType: string, defaults: Record<string, unknown>) => {
    event.dataTransfer.setData("application/reactflow-type", nodeType);
    event.dataTransfer.setData("application/reactflow-data", JSON.stringify(defaults));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
        Nodes
      </h3>
      {NODE_TYPES.map((nt) => {
        const Icon = nt.icon;
        return (
          <div
            key={nt.type}
            draggable
            onDragStart={(e) => onDragStart(e, nt.type, { ...nt.defaults })}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors"
          >
            <div className={`p-1 rounded ${nt.color}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium leading-tight">{nt.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight truncate">{nt.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
