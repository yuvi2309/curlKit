"use client";

import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Variable, Link, Copy, Check, Upload, Table, Terminal } from "lucide-react";
import { parseCommand } from "@/lib/api";

interface SimpleNode {
  id: string; type: string; name: string; columns?: string[];
}
interface SimpleEdge {
  id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string;
}

interface NodeConfigPanelProps {
  node: { id: string; type: string; data: Record<string, unknown> } | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
  allNodes: SimpleNode[];
  edges: SimpleEdge[];
  onAddEdge: (source: string, target: string, sourceHandle?: string, targetHandle?: string) => void;
  onRemoveEdge: (edgeId: string) => void;
}

export default function NodeConfigPanel({ node, onUpdate, onClose, allNodes, edges, onAddEdge, onRemoveEdge }: NodeConfigPanelProps) {
  const [data, setData] = useState<Record<string, unknown>>({});
  useEffect(() => { if (node) setData({ ...node.data }); }, [node]);
  if (!node) return null;

  const update = (key: string, value: unknown) => {
    const next = { ...data, [key]: value };
    setData(next);
    onUpdate(node.id, next);
  };

  return (
    <Sheet open={!!node} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="capitalize">{node.type.replace("_", " ")} Configuration</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <NodeIdDisplay id={node.id} />
          <div>
            <Label>Name</Label>
            <Input value={(data.name as string) || ""} onChange={(e) => update("name", e.target.value)} placeholder="Node name" />
          </div>
          <ConnectionEditor nodeId={node.id} nodeType={node.type} allNodes={allNodes} edges={edges} onAddEdge={onAddEdge} onRemoveEdge={onRemoveEdge} />

          {node.type === "curl" && (
            <>
              <SimpleCurlEditor data={data} update={update} />
              <VariablesEditor
                curlCommand={(data.curl_command as string) || ""}
                variables={(data.variables as Record<string, string>) || {}}
                onChange={(v) => update("variables", v)}
                upstreamColumns={getUpstreamCsvColumns(node.id, edges, allNodes)}
                upstreamNodes={getUpstreamNodes(node.id, edges, allNodes)}
              />
              <RunModeEditor data={data} update={update} />
              <ExtractionsEditor extractions={(data.extractions as { name: string; jsonpath: string }[]) || []} onChange={(v) => update("extractions", v)} />
            </>
          )}

          {node.type === "csv_source" && <CsvSourceEditor csvContent={(data.csv_content as string) || ""} onUpdate={(content, _columns) => update("csv_content", content)} />}
          {node.type === "extract" && <ExtractionsEditor extractions={(data.extractions as { name: string; jsonpath: string }[]) || []} onChange={(v) => update("extractions", v)} />}
          {node.type === "branch" && <SimpleConditionEditor condition={data.condition as { left: string; operator: string; right: string } | null} onChange={(v) => update("condition", v)} />}
          {node.type === "assert" && (
            <>
              <SimpleConditionEditor condition={data.condition as { left: string; operator: string; right: string } | null} onChange={(v) => update("condition", v)} />
              <div>
                <Label>On Failure</Label>
                <Select value={(data.action as string) || "stop_workflow"} onValueChange={(v) => update("action", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stop_workflow">Stop Workflow</SelectItem>
                    <SelectItem value="skip_node">Skip Downstream</SelectItem>
                    <SelectItem value="log_error">Log & Continue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {node.type === "loop" && (
            <div>
              <Label>Data Source</Label>
              <Input value={(data.source_path as string) || ""} onChange={(e) => update("source_path", e.target.value)} placeholder="csv_rows or $.data.items" className="font-mono text-xs" />
              <p className="text-[10px] text-muted-foreground mt-1">Use csv_rows for CSV data, $.path for JSONPath, or nodes.id.field for upstream data</p>
            </div>
          )}
          {node.type === "delay" && (
            <div>
              <Label>Delay (seconds)</Label>
              <Input type="number" value={(data.delay_seconds as number) ?? 1} onChange={(e) => update("delay_seconds", Number(e.target.value))} min={0} step={0.5} />
            </div>
          )}
          {node.type === "merge" && (
            <div>
              <Label>Combine Method</Label>
              <Select value={(data.strategy as string) || "merge_objects"} onValueChange={(v) => update("strategy", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge_objects">Merge Objects</SelectItem>
                  <SelectItem value="collect_array">Collect into Array</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Simple cURL Editor ──

function SimpleCurlEditor({ data, update }: { data: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
  const [rawCurl, setRawCurl] = useState((data.curl_command as string) || "");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  const handleParse = async () => {
    if (!rawCurl.trim()) return;
    setParsing(true);
    setParseError("");
    try {
      const parsed = await parseCommand(rawCurl.trim());
      if (parsed.success && parsed.data) {
        update("curl_command", rawCurl.trim());
        update("method", parsed.data.method || "GET");
        update("url", parsed.data.url || "");
        update("headers", parsed.data.headers || {});
        update("data", parsed.data.data || "");
      }
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => { setRawCurl((data.curl_command as string) || ""); }, [data.curl_command]);

  const curlPlaceholder = `curl -X POST https://api.example.com/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com"}'`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>cURL Command</Label>
        {data.curl_command && <span className="text-[10px] text-emerald-400">Parsed</span>}
      </div>
      <Textarea
        value={rawCurl}
        onChange={(e) => { setRawCurl(e.target.value); setParseError(""); }}
        placeholder={curlPlaceholder}
        rows={4}
        className="font-mono text-xs"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleParse} disabled={parsing || !rawCurl.trim()} className="h-7 text-xs gap-1">
          <Terminal className="w-3 h-3" />{parsing ? "Parsing..." : "Parse & Load"}
        </Button>
        {parseError && <span className="text-xs text-red-400">{parseError}</span>}
      </div>
      {data.url && (
        <div className="text-xs font-mono px-2 py-1.5 bg-muted/40 rounded">
          <span className="text-blue-400 font-semibold">{(data.method as string) || "GET"}</span>{" "}
          <span className="text-muted-foreground">{(data.url as string) || ""}</span>
        </div>
      )}
    </div>
  );
}

// ── Run Mode Editor ──

function RunModeEditor({ data, update }: { data: Record<string, unknown>; update: (key: string, value: unknown) => void }) {
  return (
    <>
      <div>
        <Label>Run Mode</Label>
        <Select value={(data.run_mode as string) || "per_iteration"} onValueChange={(v) => update("run_mode", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="per_iteration">Every time (default)</SelectItem>
            <SelectItem value="once">Run once & cache</SelectItem>
            <SelectItem value="on_ttl_expire">Refresh on timer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {data.run_mode === "on_ttl_expire" && (
        <div>
          <Label>Refresh every (seconds)</Label>
          <Input type="number" value={(data.ttl_seconds as number) ?? 60} onChange={(e) => update("ttl_seconds", Number(e.target.value))} min={1} />
        </div>
      )}
    </>
  );
}

// ── Simple Condition Editor ──

function SimpleConditionEditor({ condition, onChange }: { condition: { left: string; operator: string; right: string } | null; onChange: (v: { left: string; operator: string; right: string }) => void }) {
  const c = condition || { left: "", operator: "==", right: "" };
  return (
    <div>
      <Label>Condition</Label>
      <div className="flex items-center gap-1.5 mt-1">
        <Input value={c.left} onChange={(e) => onChange({ ...c, left: e.target.value })} placeholder="{{nodes.login.status_code}}" className="text-xs font-mono h-8" />
        <Select value={c.operator} onValueChange={(v) => { if (v) onChange({ ...c, operator: v }); }}>
          <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["==", "!=", ">", "<", ">=", "<=", "contains", "exists"].map((op) => (<SelectItem key={op} value={op}>{op}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input value={c.right} onChange={(e) => onChange({ ...c, right: e.target.value })} placeholder="200" className="text-xs font-mono h-8" disabled={c.operator === "exists"} />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">Reference upstream data with {"{{nodes.id.field}}"}</p>
    </div>
  );
}

// ── Extractions Editor ──

function ExtractionsEditor({ extractions, onChange }: { extractions: { name: string; jsonpath: string }[]; onChange: (v: { name: string; jsonpath: string }[]) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>Data Extraction</Label>
        <Button variant="ghost" size="sm" onClick={() => onChange([...extractions, { name: "", jsonpath: "" }])} className="h-6 px-2"><Plus className="w-3 h-3 mr-1" /> Add</Button>
      </div>
      {extractions.map((ext, i) => (
        <div key={i} className="flex items-center gap-1.5 mb-1.5">
          <Input value={ext.name} onChange={(e) => { const next = [...extractions]; next[i] = { ...next[i], name: e.target.value }; onChange(next); }} placeholder="var name" className="text-xs h-8" />
          <Input value={ext.jsonpath} onChange={(e) => { const next = [...extractions]; next[i] = { ...next[i], jsonpath: e.target.value }; onChange(next); }} placeholder="$.data.token" className="text-xs font-mono h-8" />
          <Button variant="ghost" size="sm" onClick={() => onChange(extractions.filter((_, idx) => idx !== i))} className="h-8 px-1.5 text-muted-foreground hover:text-red-400"><Trash2 className="w-3 h-3" /></Button>
        </div>
      ))}
      {extractions.length === 0 && <p className="text-[10px] text-muted-foreground">Pull values from response data using JSONPath (e.g. $.data.token)</p>}
    </div>
  );
}

// ── Variables Editor ──

function VariablesEditor({ curlCommand, variables, onChange, upstreamColumns = [], upstreamNodes = [] }: { curlCommand: string; variables: Record<string, string>; onChange: (v: Record<string, string>) => void; upstreamColumns?: string[]; upstreamNodes?: { id: string; type: string; name: string }[] }) {
  const [newVarName, setNewVarName] = useState("");
  const detected = useMemo(() => { const matches = curlCommand.match(/\{\{([^}]+)\}\}/g) || []; return [...new Set(matches.map((m) => m.slice(2, -2).trim()))]; }, [curlCommand]);
  const allVarNames = useMemo(() => { const fromCurl = detected.filter((v) => !v.startsWith("nodes.") && !v.startsWith("loop.") && !v.startsWith("csv.")); const manual = Object.keys(variables).filter((k) => !fromCurl.includes(k)); return [...fromCurl, ...manual]; }, [detected, variables]);

  if (allVarNames.length === 0 && upstreamColumns.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Variable className="w-3.5 h-3.5 text-muted-foreground" />
        <Label>Placeholders</Label>
        {allVarNames.length > 0 && <Badge variant="secondary" className="text-[10px]">{allVarNames.length}</Badge>}
      </div>
      {allVarNames.map((name) => (
        <div key={name} className="space-y-1 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded shrink-0 truncate max-w-[120px]">{`{{${name}}}`}</span>
            <Input value={variables[name] ?? ""} onChange={(e) => onChange({ ...variables, [name]: e.target.value })} placeholder="value or {{csv.col}}" className="text-xs font-mono h-7 flex-1" />
          </div>
          {upstreamColumns.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-1">
              <span className="text-[10px] text-muted-foreground">CSV columns:</span>
              {upstreamColumns.slice(0, 8).map((col) => (
                <button key={col} type="button" onClick={() => onChange({ ...variables, [name]: `{{csv.${col}}}` })} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${variables[name] === `{{csv.${col}}}` ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-muted border-border text-muted-foreground hover:border-emerald-500/50"}`}>{col}</button>
              ))}
            </div>
          )}
        </div>
      ))}
      {upstreamColumns.length > 0 && allVarNames.length === 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-muted-foreground">Available CSV columns (use {"{{column_name}}"} in your cURL):</span>
            {upstreamColumns.map((col) => <Badge key={col} variant="outline" className="text-[10px] font-mono">{col}</Badge>)}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2">
        <Input value={newVarName} onChange={(e) => setNewVarName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newVarName.trim()) { onChange({ ...variables, [newVarName.trim()]: "" }); setNewVarName(""); } }} placeholder="new variable" className="text-xs font-mono h-7 flex-1" />
        <Button variant="outline" size="sm" onClick={() => { if (newVarName.trim()) { onChange({ ...variables, [newVarName.trim()]: "" }); setNewVarName(""); } }} className="h-7 px-2 text-xs" disabled={!newVarName.trim()}><Plus className="w-3 h-3 mr-1" /> Add</Button>
      </div>
    </div>
  );
}

// ── CSV Source Editor ──

function CsvSourceEditor({ csvContent, onUpdate }: { csvContent: string; onUpdate: (content: string, columns: string[]) => void }) {
  const columns = useMemo(() => { if (!csvContent.trim()) return []; return csvContent.trim().split("\n")[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, "")).filter(Boolean); }, [csvContent]);
  const rowCount = useMemo(() => { const lines = csvContent.trim().split("\n").filter(Boolean); return Math.max(lines.length - 1, 0); }, [csvContent]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const text = ev.target?.result as string; if (text) onUpdate(text, []); };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div><Label>CSV Data</Label>
        <div className="flex items-center gap-2 mt-1">
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md cursor-pointer hover:bg-emerald-500/20 transition-colors">
            <Upload className="w-3.5 h-3.5" /> Upload CSV
            <input type="file" accept=".csv,.tsv,text/csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <span className="text-[10px] text-muted-foreground">or paste below</span>
        </div>
      </div>
      <Textarea value={csvContent} onChange={(e) => onUpdate(e.target.value, [])} placeholder="user_id,email,role\n1,alice@example.com,admin\n2,bob@example.com,user" rows={6} className="font-mono text-xs" />
      {columns.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5"><Table className="w-3.5 h-3.5 text-emerald-400" /><span className="text-xs font-medium">Columns</span></div>
            <Badge variant="secondary" className="text-[10px]">{columns.length} cols &middot; {rowCount} rows</Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {columns.map((col) => <div key={col} className="text-[10px] font-mono px-1.5 py-0.5 bg-background border rounded"><span className="text-emerald-400">{col}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Connection Editor ──

function ConnectionEditor({ nodeId, nodeType, allNodes, edges, onAddEdge, onRemoveEdge }: { nodeId: string; nodeType: string; allNodes: SimpleNode[]; edges: SimpleEdge[]; onAddEdge: (source: string, target: string, sourceHandle?: string, targetHandle?: string) => void; onRemoveEdge: (edgeId: string) => void }) {
  const [connectTarget, setConnectTarget] = useState("");
  const outgoing = edges.filter((e) => e.source === nodeId);
  const incoming = edges.filter((e) => e.target === nodeId);
  const connectedTargets = new Set(outgoing.map((e) => e.target));
  const availableTargets = allNodes.filter((n) => n.id !== nodeId && !connectedTargets.has(n.id));
  const getNodeLabel = (id: string) => { const n = allNodes.find((x) => x.id === id); return n ? `${n.name || n.type}` : id; };
  const getSourceHandle = () => { if (nodeType === "branch") return "true"; return "output"; };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2"><Link className="w-3.5 h-3.5 text-muted-foreground" /><Label>Connections</Label></div>
      {incoming.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">FROM</p>
          {incoming.map((e) => (
            <div key={e.id} className="flex items-center gap-1.5 text-xs bg-muted/50 rounded px-2 py-1 mb-1">
              <span className="text-emerald-400">&#8592;</span><span className="font-mono truncate flex-1">{getNodeLabel(e.source)}</span>
              <Button variant="ghost" size="sm" className="h-5 px-1 text-muted-foreground hover:text-red-400" onClick={() => onRemoveEdge(e.id)}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">TO</p>
          {outgoing.map((e) => (
            <div key={e.id} className="flex items-center gap-1.5 text-xs bg-muted/50 rounded px-2 py-1 mb-1">
              <span className="text-blue-400">&#8594;</span><span className="font-mono truncate flex-1">{getNodeLabel(e.target)}</span>
              <Button variant="ghost" size="sm" className="h-5 px-1 text-muted-foreground hover:text-red-400" onClick={() => onRemoveEdge(e.id)}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="flex items-center gap-1.5">
          <Select value={connectTarget} onValueChange={(v) => setConnectTarget(v ?? "")}>
            <SelectTrigger className="text-xs h-8 flex-1"><SelectValue placeholder="Connect to..." /></SelectTrigger>
            <SelectContent>
              {availableTargets.length === 0 ? <SelectItem value="_none" disabled>No available nodes</SelectItem> : availableTargets.map((n) => (<SelectItem key={n.id} value={n.id} className="text-xs">{n.name || n.type}<span className="text-muted-foreground ml-1 font-mono text-[10px]">{n.id}</span></SelectItem>))}
            </SelectContent>
          </Select>
          {nodeType === "branch" ? (
            <Select value={connectTarget ? "true" : ""} onValueChange={(v) => { if (connectTarget && v) { onAddEdge(nodeId, connectTarget, v, "input"); setConnectTarget(""); } }}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue placeholder="Path" /></SelectTrigger>
              <SelectContent><SelectItem value="true" className="text-xs text-emerald-400">If True</SelectItem><SelectItem value="false" className="text-xs text-red-400">If False</SelectItem></SelectContent>
            </Select>
          ) : (
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => { if (connectTarget) { onAddEdge(nodeId, connectTarget, getSourceHandle(), "input"); setConnectTarget(""); } }} disabled={!connectTarget}><Plus className="w-3.5 h-3.5" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Node ID display ──

function NodeIdDisplay({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">Node ID</Label>
      <div className="flex items-center gap-2 mt-0.5 px-2 py-1 bg-muted rounded-md cursor-pointer hover:bg-muted/80" onClick={() => { navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
        <code className="text-xs font-mono text-foreground flex-1 truncate">{id}</code>
        {copied ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 text-muted-foreground shrink-0" />}
      </div>
    </div>
  );
}

// ── Utilities ──

function getUpstreamCsvColumns(nodeId: string, edges: SimpleEdge[], allNodes: SimpleNode[]): string[] {
  const visited = new Set<string>(); const queue = [nodeId]; const columns: string[] = [];
  while (queue.length > 0) { const current = queue.shift()!; if (visited.has(current)) continue; visited.add(current); for (const edge of edges) { if (edge.target === current) { const sourceNode = allNodes.find((n) => n.id === edge.source); if (sourceNode?.type === "csv_source" && sourceNode.columns?.length) columns.push(...sourceNode.columns); queue.push(edge.source); } } }
  return [...new Set(columns)];
}

function getUpstreamNodes(nodeId: string, edges: SimpleEdge[], allNodes: SimpleNode[]): { id: string; type: string; name: string }[] {
  const visited = new Set<string>(); const queue = [nodeId]; const result: { id: string; type: string; name: string }[] = [];
  while (queue.length > 0) { const current = queue.shift()!; if (visited.has(current)) continue; visited.add(current); for (const edge of edges) { if (edge.target === current) { const sourceNode = allNodes.find((n) => n.id === edge.source); if (sourceNode && !visited.has(sourceNode.id)) { result.push({ id: sourceNode.id, type: sourceNode.type, name: sourceNode.name }); queue.push(sourceNode.id); } } } }
  return result;
}