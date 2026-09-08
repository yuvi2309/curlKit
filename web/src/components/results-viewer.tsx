"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Download,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ResultRow {
  row_index: number;
  request_name?: string;
  method?: string;
  url: string;
  status_code?: number;
  duration_ms?: number;
  success: boolean;
  error?: string;
  variables_used?: Record<string, string>;
  response_body?: string;
  response_body_parsed?: unknown;
  response_headers?: Record<string, string>;
}

interface BatchData {
  success: boolean;
  results?: ResultRow[];
  summary?: {
    total: number;
    success: number;
    failed: number;
    avg_duration_ms: number;
    min_duration_ms: number;
    max_duration_ms: number;
  };
}

export default function ResultsViewer({ data }: { data: unknown }) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");

  const batch = data as BatchData | null;

  if (!batch?.success || !batch?.results?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Inbox className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm font-medium">No results yet</p>
        <p className="text-xs mt-1">
          Run a batch execution from the Runner tab to see results here
        </p>
      </div>
    );
  }

  const filtered = batch.results.filter((r) => {
    if (filter === "success") return r.success;
    if (filter === "failed") return !r.success;
    return true;
  });

  const summary = batch.summary!;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-3xl font-bold tracking-tight">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1 border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-emerald-400">Success</p>
            <p className="text-3xl font-bold tracking-tight text-emerald-400">
              {summary.success}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-1 border-red-500/20 bg-red-500/5">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-red-400">Failed</p>
            <p className="text-3xl font-bold tracking-tight text-red-400">
              {summary.failed}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Avg</p>
            <p className="text-2xl font-bold tracking-tight">
              {summary.avg_duration_ms}
              <span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span>
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Min</p>
            <p className="text-2xl font-bold tracking-tight">
              {summary.min_duration_ms}
              <span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span>
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Max</p>
            <p className="text-2xl font-bold tracking-tight">
              {summary.max_duration_ms}
              <span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Export */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          {(["all", "success", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all"
                ? `All (${batch.results!.length})`
                : f === "success"
                ? `Success (${summary.success})`
                : `Failed (${summary.failed})`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const blob = new Blob(
                [JSON.stringify(batch.results, null, 2)],
                { type: "application/json" }
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "curl_kit_results.json";
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Exported JSON");
            }}
          >
            <Download className="mr-1.5 h-3 w-3" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = batch.results!;
              const headers = [
                "row_index",
                "status_code",
                "method",
                "url",
                "duration_ms",
                "success",
                "error",
              ];
              const csvLines = [
                headers.join(","),
                ...rows.map((r) =>
                  headers
                    .map((h) => `"${String((r as unknown as Record<string, unknown>)[h] ?? "")}"`)
                    .join(",")
                ),
              ];
              const blob = new Blob([csvLines.join("\n")], {
                type: "text/csv",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "curl_kit_results.csv";
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Exported CSV");
            }}
          >
            <Download className="mr-1.5 h-3 w-3" />
            CSV
          </Button>
        </div>
      </div>

      {/* Results Detail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Request Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-2">
              {filtered.map((r, idx) => {
                const isExpanded = expandedRow === idx;
                return (
                  <div key={idx} className="rounded-lg border bg-card">
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedRow(isExpanded ? null : idx)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-xs font-mono text-muted-foreground w-6">
                        #{r.row_index + 1}
                      </span>
                      {r.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      )}
                      <Badge
                        variant="outline"
                        className={
                          r.status_code && r.status_code >= 200 && r.status_code < 300
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs"
                            : "bg-red-500/15 text-red-400 border-red-500/30 text-xs"
                        }
                      >
                        {r.status_code || "ERR"}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[300px]">
                        {r.url}
                      </span>
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {r.duration_ms}ms
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3">
                        {/* Variables Used */}
                        {r.variables_used &&
                          Object.keys(r.variables_used).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                VARIABLES USED
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(r.variables_used).map(([k, v]) => (
                                  <Badge
                                    key={k}
                                    variant="secondary"
                                    className="font-mono text-xs"
                                  >
                                    {k}={v}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* Error */}
                        {r.error && (
                          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2">
                            <p className="text-xs text-destructive font-mono">
                              {r.error}
                            </p>
                          </div>
                        )}

                        {/* Response Headers */}
                        {r.response_headers && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                RESPONSE HEADERS
                              </p>
                              <ScrollArea className="max-h-32">
                                <div className="rounded-md border bg-muted/40 p-2 space-y-0.5">
                                  {Object.entries(r.response_headers).map(
                                    ([k, v]) => (
                                      <div
                                        key={k}
                                        className="flex gap-2 text-xs font-mono"
                                      >
                                        <span className="text-muted-foreground shrink-0">
                                          {k}:
                                        </span>
                                        <span className="break-all">{v}</span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </ScrollArea>
                            </div>
                          </>
                        )}

                        {/* Response Body */}
                        {(r.response_body_parsed || r.response_body) && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                RESPONSE BODY
                              </p>
                              <ScrollArea className="max-h-64">
                                <pre className="rounded-md border bg-muted/40 p-2 text-xs font-mono whitespace-pre-wrap">
                                  {r.response_body_parsed
                                    ? JSON.stringify(r.response_body_parsed, null, 2)
                                    : r.response_body}
                                </pre>
                              </ScrollArea>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
