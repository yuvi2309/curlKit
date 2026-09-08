"use client";

import { useState, useEffect } from "react";
import { Save, FolderOpen, Trash2, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  saveWorkflow,
  listWorkflows,
  getWorkflow,
  deleteWorkflow,
  exportWorkflow,
  importWorkflowFile,
  type WorkflowDefinition,
} from "@/lib/api";

interface WorkflowManagerProps {
  workflowMeta: { id: string; name: string; description: string };
  onMetaChange: (meta: { id: string; name: string; description: string }) => void;
  buildWorkflow: () => WorkflowDefinition;
  loadWorkflow: (wf: WorkflowDefinition) => void;
}

export default function WorkflowManager({
  workflowMeta,
  onMetaChange,
  buildWorkflow,
  loadWorkflow,
}: WorkflowManagerProps) {
  const [savedList, setSavedList] = useState<{ id: string; name: string; node_count: number; updated_at: string }[]>([]);
  const [showList, setShowList] = useState(false);

  const refreshList = async () => {
    try {
      const res = await listWorkflows();
      setSavedList(res.workflows || []);
    } catch (_e) {
      // silently fail
    }
  };

  useEffect(() => {
    refreshList();
  }, []);

  const handleSave = async () => {
    const wf = buildWorkflow();
    if (!wf.nodes.length) {
      toast.error("Nothing to save — add some nodes first");
      return;
    }
    try {
      const res = await saveWorkflow(wf);
      onMetaChange({ ...workflowMeta, id: res.id });
      toast.success(`Saved "${wf.name}"`);
      refreshList();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const res = await getWorkflow(id);
      loadWorkflow(res.workflow);
      setShowList(false);
      toast.success(`Loaded "${res.workflow.name}"`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflow(id);
      toast.success("Workflow deleted");
      refreshList();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleExport = () => {
    const wf = buildWorkflow();
    const blob = new Blob([JSON.stringify(wf, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${wf.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        loadWorkflow(data as WorkflowDefinition);
        toast.success(`Imported "${data.name || "workflow"}"`);
      } catch (err) {
        toast.error("Invalid workflow file");
      }
    };
    input.click();
  };

  return (
    <div className="space-y-2">
      <Input
        value={workflowMeta.name}
        onChange={(e) => onMetaChange({ ...workflowMeta, name: e.target.value })}
        className="h-7 text-xs font-semibold"
        placeholder="Workflow name"
      />

      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={handleSave} className="h-6 px-2 text-[10px] gap-1">
          <Save className="w-3 h-3" /> Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setShowList(!showList); if (!showList) refreshList(); }}
          className="h-6 px-2 text-[10px] gap-1"
        >
          <FolderOpen className="w-3 h-3" /> Open
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} className="h-6 px-2 text-[10px] gap-1">
          <Download className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="outline" onClick={handleImport} className="h-6 px-2 text-[10px] gap-1">
          <Upload className="w-3 h-3" />
        </Button>
      </div>

      {showList && (
        <ScrollArea className="h-40 border rounded-md">
          <div className="p-1.5 space-y-1">
            {savedList.length === 0 ? (
              <p className="text-[10px] text-muted-foreground p-2">No saved workflows</p>
            ) : (
              savedList.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50 cursor-pointer group"
                  onClick={() => handleLoad(wf.id)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{wf.name}</p>
                    <p className="text-[10px] text-muted-foreground">{wf.node_count} nodes</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
                    onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
