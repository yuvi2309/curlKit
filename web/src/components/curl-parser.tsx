"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Play, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { parseCommand, extractVariables, runSingle } from "@/lib/api";
import InteractiveCurlViewer from "@/components/interactive-curl-viewer";

const SAMPLE_CURL = `curl -X POST "https://api.example.com/v1/users/42/orders" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer eyJhbGciOi_sample_token_here" \\
  -d '{"product_id": "SKU-98765", "quantity": 2, "shipping_address": "123 Main St"}'`;

interface ParsedRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  query_params?: Record<string, string>;
  auth?: [string, string];
  cookies?: Record<string, string>;
  follow_redirects?: boolean;
  insecure?: boolean;
  compressed?: boolean;
  timeout?: number;
  connect_timeout?: number;
}

interface ExecuteResult {
  status_code?: number;
  duration_ms?: number;
  error?: string;
  response_headers?: Record<string, string>;
  response_body?: string;
  response_body_parsed?: unknown;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  HEAD: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export default function CurlParser() {
  const [curlInput, setCurlInput] = useState("");
  const [originalCurl, setOriginalCurl] = useState("");
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  async function handleParse() {
    if (!curlInput.trim()) {
      toast.error("Please enter a cURL command");
      return;
    }
    setLoading(true);
    setParsed(null);
    setVariables([]);
    setExecuteResult(null);
    try {
      const [parseRes, varsRes] = await Promise.all([
        parseCommand(curlInput),
        extractVariables(curlInput),
      ]);
      setParsed(parseRes.data);
      setOriginalCurl(curlInput);
      setVariables(varsRes.variables || []);
      toast.success("Parsed successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!curlInput.trim()) return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      const res = await runSingle(curlInput);
      setExecuteResult(res.result);
      toast.success(`Executed — Status ${res.result.status_code || "N/A"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  }

  const method = (parsed?.method as string) || "";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">cURL Command</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder={SAMPLE_CURL}
            value={curlInput}
            onChange={(e) => setCurlInput(e.target.value)}
            className="min-h-[140px] font-mono text-sm resize-y"
          />
          <div className="flex gap-2">
            <Button onClick={handleParse} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Parse
            </Button>
            <Button
              variant="secondary"
              onClick={handleExecute}
              disabled={executing || !curlInput.trim()}
            >
              {executing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Execute
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCurlInput("");
                setOriginalCurl("");
                setParsed(null);
                setVariables([]);
                setExecuteResult(null);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setCurlInput(SAMPLE_CURL)}
            >
              Load Sample
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {(parsed || executeResult) && (
        <Tabs defaultValue="interactive" className="w-full">
          <TabsList>
            <TabsTrigger value="interactive" disabled={!parsed}>
              Interactive
            </TabsTrigger>
            <TabsTrigger value="parsed" disabled={!parsed}>
              Parsed Request
            </TabsTrigger>
            <TabsTrigger value="response" disabled={!executeResult}>
              Response
            </TabsTrigger>
          </TabsList>

          {/* ── Interactive view ── */}
          <TabsContent value="interactive">
            {parsed && (
              <InteractiveCurlViewer
                parsed={parsed}
                curlInput={originalCurl}
                onCurlUpdate={(newCurl) => setCurlInput(newCurl)}
                onVariablesChange={(vars) => setVariables(vars)}
              />
            )}
          </TabsContent>

          {/* ── Parsed view ── */}
          <TabsContent value="parsed">
            {parsed && (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {/* Method + URL */}
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={METHOD_COLORS[method] || ""}
                    >
                      {method}
                    </Badge>
                    <code className="text-sm font-mono break-all">
                      {parsed.url}
                    </code>
                  </div>

                  {parsed.headers &&
                    Object.keys(parsed.headers).length > 0 ? (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            HEADERS
                          </p>
                          <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                            {Object.entries(
                              parsed.headers
                            ).map(([k, v]) => (
                              <div key={k} className="flex gap-2 text-sm font-mono">
                                <span className="text-muted-foreground">{k}:</span>
                                <span>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                  {parsed.data ? (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          BODY
                        </p>
                        <pre className="rounded-md border bg-muted/40 p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                          {(() => {
                            try {
                              return JSON.stringify(
                                JSON.parse(parsed.data),
                                null,
                                2
                              );
                            } catch (_e) {
                              return parsed.data;
                            }
                          })()}
                        </pre>
                      </div>
                    </>
                  ) : null}

                  {parsed.query_params &&
                    Object.keys(parsed.query_params).length > 0 ? (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            QUERY PARAMETERS
                          </p>
                          <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                            {Object.entries(
                              parsed.query_params
                            ).map(([k, v]) => (
                              <div key={k} className="flex gap-2 text-sm font-mono">
                                <span className="text-muted-foreground">{k}=</span>
                                <span>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                  {parsed.auth ? (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          AUTHENTICATION
                        </p>
                        <code className="text-sm font-mono">
                          {JSON.stringify(parsed.auth)}
                        </code>
                      </div>
                    </>
                  ) : null}

                  {parsed.cookies &&
                    Object.keys(parsed.cookies).length > 0 ? (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            COOKIES
                          </p>
                          <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                            {Object.entries(
                              parsed.cookies
                            ).map(([k, v]) => (
                              <div key={k} className="flex gap-2 text-sm font-mono">
                                <span className="text-muted-foreground">{k}=</span>
                                <span>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                  {/* Flags */}
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {parsed.follow_redirects ? (
                      <Badge variant="outline" className="text-xs">Follow Redirects</Badge>
                    ) : null}
                    {parsed.insecure ? (
                      <Badge variant="outline" className="text-xs text-amber-400">Insecure</Badge>
                    ) : null}
                    {parsed.compressed ? (
                      <Badge variant="outline" className="text-xs">Compressed</Badge>
                    ) : null}
                    {parsed.timeout ? (
                      <Badge variant="outline" className="text-xs">
                        Timeout: {parsed.timeout}s
                      </Badge>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Response view ── */}
          <TabsContent value="response">
            {executeResult && (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        executeResult.status_code && executeResult.status_code >= 200 &&
                        executeResult.status_code < 300
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }
                    >
                      {executeResult.status_code}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {executeResult.duration_ms}ms
                    </span>
                    {executeResult.error ? (
                      <Badge variant="destructive">{executeResult.error}</Badge>
                    ) : null}
                  </div>

                  {executeResult.response_headers ? (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          RESPONSE HEADERS
                        </p>
                        <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3 space-y-1 text-xs font-mono">
                          {Object.entries(
                            executeResult.response_headers
                          ).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-muted-foreground shrink-0">{k}:</span>
                              <span className="break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {/* Response Body */}
                  {(executeResult.response_body_parsed || executeResult.response_body) ? (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          RESPONSE BODY
                        </p>
                        <div className="max-h-[500px] overflow-y-auto rounded-md border bg-muted/40">
                          <pre className="p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                            {executeResult.response_body_parsed
                              ? JSON.stringify(
                                  executeResult.response_body_parsed,
                                  null,
                                  2
                                )
                              : executeResult.response_body}
                          </pre>
                        </div>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
