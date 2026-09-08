"use client";

import { useState } from "react";
import {
  Terminal,
  FolderOpen,
  Zap,
  BarChart3,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Braces,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import CurlParser from "@/components/curl-parser";
import CollectionImporter from "@/components/collection-importer";
import BatchRunner from "@/components/batch-runner";
import ResultsViewer from "@/components/results-viewer";
import WorkflowCanvas from "@/components/workflow/workflow-canvas";

const NAV_ITEMS = [
  { id: "parser", label: "Parser", icon: Terminal, description: "Parse cURL commands" },
  { id: "collections", label: "Collections", icon: FolderOpen, description: "Import & browse" },
  { id: "runner", label: "Runner", icon: Zap, description: "Batch execute" },
  { id: "results", label: "Results", icon: BarChart3, description: "View results" },
  { id: "workflows", label: "Workflows", icon: GitBranch, description: "Visual workflow builder" },
] as const;

type TabId = (typeof NAV_ITEMS)[number]["id"];

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("parser");
  const [collapsed, setCollapsed] = useState(false);
  // Shared state so that results from runner can be viewed in results tab
  const [batchResults, setBatchResults] = useState<unknown>(null);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Braces className="h-6 w-6 shrink-0 text-primary" />
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight">cURL Kit</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ id, label, icon: Icon, description }) => {
            const isActive = activeTab === id;
            const btn = (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </button>
            );

            if (collapsed) {
              return (
                <Tooltip key={id}>
                  <TooltipTrigger>{btn}</TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }
            return btn;
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* ── Main Content ────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-border bg-background/80 backdrop-blur-sm px-6">
          <h1 className="text-sm font-semibold text-foreground">
            {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
          </h1>
          <span className="ml-2 text-xs text-muted-foreground">
            {NAV_ITEMS.find((n) => n.id === activeTab)?.description}
          </span>
        </header>

        {activeTab === "workflows" ? (
          <div className="flex-1 overflow-hidden">
            <WorkflowCanvas />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "parser" && <CurlParser />}
            {activeTab === "collections" && <CollectionImporter />}
            {activeTab === "runner" && <BatchRunner onResults={setBatchResults} />}
            {activeTab === "results" && <ResultsViewer data={batchResults} />}
          </div>
        )}
      </main>
    </div>
  );
}
