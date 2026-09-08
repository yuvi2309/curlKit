"use client";

import { useState, useCallback, useRef, useMemo, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type ReactFlowInstance,
  BackgroundVariant,
} from "@xyflow/react";

import { BookOpen, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

import CurlNode from "./nodes/curl-node";
import CsvSourceNode from "./nodes/csv-source-node";
import ExtractNode from "./nodes/extract-node";
import BranchNode from "./nodes/branch-node";
import AssertNode from "./nodes/assert-node";
import LoopNode from "./nodes/loop-node";
import DelayNode from "./nodes/delay-node";
import MergeNode from "./nodes/merge-node";
import NodePalette from "./node-palette";
import NodeConfigPanel from "./node-config-panel";
import ExecutionPanel from "./execution-panel";
import WorkflowManager from "./workflow-manager";
import WorkflowDocs from "./workflow-docs";

import type { WorkflowDefinition, WorkflowEdge as WfEdge, WorkflowNode as WfNode } from "@/lib/api";

const nodeTypes = {
  curl: CurlNode,
  csv_source: CsvSourceNode,
  extract: ExtractNode,
  branch: BranchNode,
  assert: AssertNode,
  loop: LoopNode,
  delay: DelayNode,
  merge: MergeNode,
};

let idCounter = 0;
const nextId = () => `node_${++idCounter}_${Date.now()}`;

export default function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [workflowMeta, setWorkflowMeta] = useState<{ id: string; name: string; description: string }>({
    id: "",
    name: "Untitled Workflow",
    description: "",
  });

  // ── Connect edges ──────────────────────────────────────────────
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: `e_${params.source}_${params.sourceHandle ?? "out"}_${params.target}_${params.targetHandle ?? "in"}`,
            animated: true,
            style: { stroke: "var(--primary)", strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // ── Drop from palette ──────────────────────────────────────────
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type");
      const dataStr = event.dataTransfer.getData("application/reactflow-data");
      if (!type || !rfInstance || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      let nodeData = {};
      try {
        nodeData = JSON.parse(dataStr);
      } catch (_e) {}

      const newNode: Node = {
        id: nextId(),
        type,
        position,
        data: nodeData,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance, setNodes]
  );

  // ── Node selection → config panel ──────────────────────────────
  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeConfigUpdate = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...data } } : n))
      );
    },
    [setNodes]
  );

  // ── Delete selected nodes ──────────────────────────────────────
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = new Set(deleted.map((n) => n.id));
      if (selectedNode && ids.has(selectedNode.id)) {
        setSelectedNode(null);
      }
    },
    [selectedNode]
  );

  // ── Build WorkflowDefinition ────────────────────────────────────
  const buildWorkflow = useCallback((): WorkflowDefinition => {
    return {
      id: workflowMeta.id || crypto.randomUUID(),
      name: workflowMeta.name,
      description: workflowMeta.description,
      version: "1.0",
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type || "curl",
        position: { x: n.position.x, y: n.position.y },
        data: n.data as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }, [nodes, edges, workflowMeta]);

  // ── Load workflow onto canvas ───────────────────────────────────
  const loadWorkflow = useCallback(
    (wf: WorkflowDefinition) => {
      setWorkflowMeta({ id: wf.id, name: wf.name, description: wf.description });
      setNodes(
        wf.nodes.map((n: WfNode) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        }))
      );
      setEdges(
        wf.edges.map((e: WfEdge) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          animated: true,
          style: { stroke: "var(--primary)", strokeWidth: 2 },
        }))
      );
      setTimeout(() => rfInstance?.fitView({ padding: 0.2 }), 100);
    },
    [setNodes, setEdges, rfInstance]
  );

  // ── Quick-start template ───────────────────────────────────────
  const loadTemplate = (template: string) => {
    setShowTemplate(false);
    const baseId = `t_${Date.now()}`;
    if (template === "auth-flow") {
      setWorkflowMeta({ id: "", name: "Auth → API Call", description: "Login, verify, then call an API" });
      setNodes([
        { id: `${baseId}_login`, type: "curl", position: { x: 100, y: 50 }, data: { name: "Login", curl_command: "curl -X POST https://httpbin.org/post -H 'Content-Type: application/json' -d '{\"username\":\"admin\"}'", run_mode: "once", extractions: [{ name: "username", jsonpath: "$.json.username" }] } },
        { id: `${baseId}_assert`, type: "assert", position: { x: 100, y: 220 }, data: { name: "Check Login", condition: { left: "{{nodes." + `${baseId}_login` + ".status_code}}", operator: "==", right: "200" }, action: "stop_workflow" } },
        { id: `${baseId}_api`, type: "curl", position: { x: 100, y: 390 }, data: { name: "API Call", curl_command: "curl https://httpbin.org/get -H 'Authorization: Bearer {{nodes." + `${baseId}_login` + ".extractions.username}}'", run_mode: "per_iteration", extractions: [{ name: "origin", jsonpath: "$.origin" }] } },
      ]);
      setEdges([
        { id: `e1_${baseId}`, source: `${baseId}_login`, target: `${baseId}_assert`, animated: true, style: { stroke: "var(--primary)", strokeWidth: 2 } },
        { id: `e2_${baseId}`, source: `${baseId}_assert`, target: `${baseId}_api`, animated: true, style: { stroke: "var(--primary)", strokeWidth: 2 } },
      ]);
    } else if (template === "csv-batch") {
      setWorkflowMeta({ id: "", name: "CSV Batch Processing", description: "Load CSV, loop over rows, call API per row" });
      setNodes([
        { id: `${baseId}_csv`, type: "csv_source", position: { x: 100, y: 50 }, data: { name: "CSV Data", csv_content: "user_id,name\n1,Alice\n2,Bob\n3,Carol" } },
        { id: `${baseId}_loop`, type: "loop", position: { x: 100, y: 200 }, data: { name: "Loop Rows", source_path: "csv_rows" } },
        { id: `${baseId}_curl`, type: "curl", position: { x: 100, y: 360 }, data: { name: "Process Row", curl_command: "curl https://httpbin.org/get?user={{csv.user_id}}", run_mode: "per_iteration", variables: { user_id: "{{csv.user_id}}" } } },
        { id: `${baseId}_delay`, type: "delay", position: { x: 100, y: 520 }, data: { name: "Rate Limit", delay_seconds: 0.5 } },
      ]);
      setEdges([
        { id: `e1_${baseId}`, source: `${baseId}_csv`, target: `${baseId}_loop`, animated: true, style: { stroke: "var(--primary)", strokeWidth: 2 } },
        { id: `e2_${baseId}`, source: `${baseId}_loop`, target: `${baseId}_curl`, animated: true, style: { stroke: "var(--primary)", strokeWidth: 2 } },
        { id: `e3_${baseId}`, source: `${baseId}_curl`, target: `${baseId}_delay`, animated: true, style: { stroke: "var(--primary)", strokeWidth: 2 } },
      ]);
    }
    setTimeout(() => rfInstance?.fitView({ padding: 0.3 }), 100);
  };

  // ── Update node statuses from execution ─────────────────────────
  const updateNodeStatus = useCallback(
    (nodeId: string, status: string, extraData?: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, _status: status, ...extraData } }
            : n
        )
      );
    },
    [setNodes]
  );

  const resetNodeStatuses = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const cleaned = { ...n.data };
        delete cleaned._status;
        delete cleaned._branch_taken;
        delete cleaned._assertion_passed;
        delete cleaned._iterations;
        return { ...n, data: cleaned };
      })
    );
  }, [setNodes]);

  // Re-find the selected node after data updates
  const currentSelectedNode = useMemo(() => {
    if (!selectedNode) return null;
    return nodes.find((n) => n.id === selectedNode.id) ?? null;
  }, [nodes, selectedNode]);

  return (
    <div className="flex h-full">
      {/* Left panel: palette + management */}
      <div className="w-56 border-r flex flex-col bg-background/50 overflow-y-auto">
        <div className="p-3 border-b">
          <WorkflowManager
            workflowMeta={workflowMeta}
            onMetaChange={setWorkflowMeta}
            buildWorkflow={buildWorkflow}
            loadWorkflow={loadWorkflow}
          />
        </div>

        <div className="p-3 border-b">
          <NodePalette />
        </div>

        <div className="p-3 flex-1">
          <ExecutionPanel
            buildWorkflow={buildWorkflow}
            updateNodeStatus={updateNodeStatus}
            resetNodeStatuses={resetNodeStatuses}
          />
        </div>

        <div className="p-3 border-t space-y-2">
          <Popover open={showTemplate} onOpenChange={setShowTemplate}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs"><Wand2 className="w-3.5 h-3.5 text-amber-400" /> Quick Start</Button>
            </PopoverTrigger>
            <PopoverContent side="right" sideOffset={8} className="w-56 p-2">
              <p className="text-xs font-medium mb-2">Choose a template:</p>
              <div className="space-y-1">
                <button onClick={() => loadTemplate("auth-flow")} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs">
                  <span className="font-medium">Auth → API Call</span>
                  <p className="text-[10px] text-muted-foreground">Login, verify, then fetch data</p>
                </button>
                <button onClick={() => loadTemplate("csv-batch")} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs">
                  <span className="font-medium">CSV Batch Processing</span>
                  <p className="text-[10px] text-muted-foreground">Load CSV, loop rows, call API</p>
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => setShowDocs(true)}>
            <BookOpen className="w-3.5 h-3.5" /> Documentation
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setRfInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodesDelete={onNodesDelete}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-background"
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: "var(--primary)", strokeWidth: 2 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(0.5 0 0 / 0.15)" />
          <Controls className="!bg-background !border-border !shadow-md [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground" />
          <MiniMap
            className="!bg-background !border-border"
            nodeColor={(n) => {
              const s = (n.data as Record<string, unknown>)?._status;
              if (s === "running") return "#3b82f6";
              if (s === "success") return "#10b981";
              if (s === "failed") return "#ef4444";
              if (s === "skipped") return "#eab308";
              return "#6b7280";
            }}
          />
        </ReactFlow>
      </div>

      {/* Config panel */}
      <NodeConfigPanel
        node={currentSelectedNode ? { id: currentSelectedNode.id, type: currentSelectedNode.type || "curl", data: currentSelectedNode.data as Record<string, unknown> } : null}
        onUpdate={onNodeConfigUpdate}
        onClose={() => setSelectedNode(null)}
        allNodes={nodes.map((n) => {
          const d = n.data as Record<string, unknown>;
          return {
            id: n.id,
            type: n.type || "curl",
            name: (d?.name as string) || n.type || "node",
            ...(n.type === "csv_source" && d?.columns ? { columns: d.columns as string[] } : {}),
          };
        })}
        edges={edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined }))}
        onAddEdge={(source, target, sourceHandle, targetHandle) =>
          setEdges((eds) => addEdge({ source, target, sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null }, eds))
        }
        onRemoveEdge={(edgeId) => setEdges((eds) => eds.filter((e) => e.id !== edgeId))}
      />

      {/* Documentation modal */}
      {showDocs && <WorkflowDocs onClose={() => setShowDocs(false)} />}
    </div>
  );
}
