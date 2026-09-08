"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload, Loader2, FileJson, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { importCollection } from "@/lib/api";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  HEAD: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

interface ParsedRequest {
  name?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  query_params?: Record<string, string>;
  auth?: unknown;
  cookies?: Record<string, string>;
}

export default function CollectionImporter() {
  const [requests, setRequests] = useState<ParsedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleImport = useCallback(async (file: File) => {
    setLoading(true);
    setRequests([]);
    setFileName(file.name);
    try {
      const res = await importCollection(file);
      setRequests(res.data);
      toast.success(`Imported ${res.count} request(s)`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImport(file);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Upload area */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import Collection</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`relative rounded-lg border-2 border-dashed transition-colors p-10 text-center ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/40"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center gap-3">
              {loading ? (
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              ) : (
                <div className="rounded-full bg-muted p-3">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium">
                  {loading
                    ? "Importing..."
                    : "Drop a collection file or click to upload"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports Postman v2.1, JSON cURL arrays, single request objects
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {requests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileJson className="h-4 w-4" />
                {fileName}
              </CardTitle>
              <Badge variant="secondary">{requests.length} requests</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-2">
                {requests.map((req, idx) => {
                  const isExpanded = expandedIdx === idx;
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border bg-card transition-colors"
                    >
                      {/* Row header */}
                      <button
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                        onClick={() =>
                          setExpandedIdx(isExpanded ? null : idx)
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-xs ${METHOD_COLORS[req.method] || ""}`}
                        >
                          {req.method}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {req.name || `Request ${idx + 1}`}
                        </span>
                        <span className="ml-auto text-xs font-mono text-muted-foreground truncate max-w-[300px]">
                          {req.url}
                        </span>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t px-4 py-3 space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              URL
                            </p>
                            <code className="text-sm font-mono break-all">
                              {req.url}
                            </code>
                          </div>

                          {req.headers &&
                            Object.keys(req.headers).length > 0 && (
                              <>
                                <Separator />
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    HEADERS
                                  </p>
                                  <div className="rounded-md border bg-muted/40 p-2 space-y-0.5">
                                    {Object.entries(req.headers).map(
                                      ([k, v]) => (
                                        <div
                                          key={k}
                                          className="flex gap-2 text-xs font-mono"
                                        >
                                          <span className="text-muted-foreground">
                                            {k}:
                                          </span>
                                          <span>{v}</span>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              </>
                            )}

                          {req.data && (
                            <>
                              <Separator />
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  BODY
                                </p>
                                <pre className="rounded-md border bg-muted/40 p-2 text-xs font-mono whitespace-pre-wrap">
                                  {(() => {
                                    try {
                                      return JSON.stringify(
                                        JSON.parse(req.data),
                                        null,
                                        2
                                      );
                                    } catch (_e) {
                                      return req.data;
                                    }
                                  })()}
                                </pre>
                              </div>
                            </>
                          )}

                          {req.query_params &&
                            Object.keys(req.query_params).length > 0 && (
                              <>
                                <Separator />
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    QUERY PARAMS
                                  </p>
                                  <div className="rounded-md border bg-muted/40 p-2 space-y-0.5">
                                    {Object.entries(req.query_params).map(
                                      ([k, v]) => (
                                        <div
                                          key={k}
                                          className="flex gap-2 text-xs font-mono"
                                        >
                                          <span className="text-muted-foreground">
                                            {k}=
                                          </span>
                                          <span>{v}</span>
                                        </div>
                                      )
                                    )}
                                  </div>
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
      )}
    </div>
  );
}
