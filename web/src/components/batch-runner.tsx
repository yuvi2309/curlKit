"use client";

import { useState, useCallback } from "react";
import {
  Settings2,
  Pencil,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Variable,
  Play,
  Loader2,
  Upload,
  Clipboard,
  Download,
  Zap,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { generateMapping, runBatch, extractVariables } from "@/lib/api";
import InteractiveCurlViewer from "@/components/interactive-curl-viewer";
import ResultsViewer from "@/components/results-viewer";
import { parseCommand } from "@/lib/api";

const STEPS = [
  { n: 1, label: "cURL" },
  { n: 2, label: "Variables" },
  { n: 3, label: "CSV" },
  { n: 4, label: "Review" },
  { n: 5, label: "Results" },
] as const;

export default function BatchRunner({
  onResults,
}: {
  onResults: (data: unknown) => void;
}) {
  const [step, setStep] = useState(1);
  const [curlInput, setCurlInput] = useState("");
  const [originalCurl, setOriginalCurl] = useState("");
  const [parsed, setParsed] = useState<any>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [csvContent, setCsvContent] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [results, setResults] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [delayMs, setDelayMs] = useState(0);
  const [force, setForce] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [curlExpanded, setCurlExpanded] = useState(false);

  function rebuildCsv(cols: string[], rows: Record<string, string>[]) {
    const header = cols.join(",");
    const lines = rows.map((r) => cols.map((c) => r[c] || "").join(","));
    return [header, ...lines].join("\n");
  }

  function parseTableText(text: string) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      toast.error("Pasted data must have a header row and at least one data row");
      return null;
    }
    const headers = lines[0].split("\t").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split("\t").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = vals[i] || ""));
      return row;
    });
    return { headers, rows };
  }

  function applyTableData(headers: string[], rows: Record<string, string>[]) {
    setCsvColumns(headers);
    setCsvRows(rows);
    setCsvContent(rebuildCsv(headers, rows));
  }

  async function handleAnalyzeCurl() {
    if (!curlInput.trim()) {
      toast.error("Paste a cURL command first");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await parseCommand(curlInput);
      setParsed(res.data);
      setOriginalCurl(curlInput);

      const varRes = await extractVariables(curlInput);
      const vars: string[] = varRes.variables || [];
      setVariables(vars);
      setStep(2);
      toast.success(`Parsed command — ${vars.length} variable(s) found`);
    } catch (_e) {
      toast.error("Failed to parse cURL command");
    } finally {
      setAnalyzing(false);
    }
  }

  function handlePasteData() {
    if (!pasteText.trim()) {
      toast.error("Paste some table data first");
      return;
    }
    const result = parseTableText(pasteText);
    if (!result) return;
    applyTableData(result.headers, result.rows);
    setCsvFileName("pasted data");
    setStep(4);
    toast.success(`Loaded ${result.rows.length} row(s) from pasted data`);
  }

  // Inline edit a cell
  function updateCell(rowIdx: number, col: string, value: string) {
    setCsvRows((prev) => {
      const updated = [...prev];
      updated[rowIdx] = { ...updated[rowIdx], [col]: value };
      setCsvContent(rebuildCsv(csvColumns, updated));
      return updated;
    });
  }

  function addRow() {
    const emptyRow: Record<string, string> = {};
    csvColumns.forEach((c) => (emptyRow[c] = ""));
    setCsvRows((prev) => {
      const updated = [...prev, emptyRow];
      setCsvContent(rebuildCsv(csvColumns, updated));
      return updated;
    });
  }

  function deleteRow(idx: number) {
    setCsvRows((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      setCsvContent(rebuildCsv(csvColumns, updated));
      return updated;
    });
  }

  // Step 3: Parse CSV
  const handleCsvUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setCsvFileName(file.name);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target?.result as string;
        setCsvContent(text);

        const lines = text.trim().split("\n");
        if (lines.length < 2) {
          toast.error("CSV must have a header row and at least one data row");
          return;
        }
        const headers = lines[0].split(",").map((h) => h.trim());
        setCsvColumns(headers);
        const rows = lines.slice(1).map((line) => {
          const vals = line.split(",").map((v) => v.trim());
          const row: Record<string, string> = {};
          headers.forEach((h, i) => (row[h] = vals[i] || ""));
          return row;
        });
        setCsvRows(rows);

        // Auto-generate mapping
        if (variables.length > 0) {
          try {
            const mapRes = await generateMapping(variables, headers);
            setMapping(mapRes.mapping);
          } catch (_e) {
            const m: Record<string, string> = {};
            variables.forEach((v) => (m[v] = v));
            setMapping(m);
          }
        }

        setStep(4);
        toast.success(`Loaded ${rows.length} row(s) from ${file.name}`);
      };
      reader.readAsText(file);
    },
    [variables],
  );

  // Step 4 → 5: Execute
  async function handleRun() {
    setLoading(true);
    setResults(null);
    setStep(5);
    try {
      const res = await runBatch(curlInput, csvContent, mapping, delayMs, force);
      setResults(res);
      onResults(res);
      if (res.success) {
        toast.success(
          `Batch complete: ${res.summary.success}/${res.summary.total} succeeded`,
        );
      } else {
        toast.error(res.error || "Batch failed");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setStep(1);
    setCurlInput("");
    setOriginalCurl("");
    setParsed(null);
    setVariables([]);
    setCsvContent("");
    setCsvFileName("");
    setCsvColumns([]);
    setCsvRows([]);
    setMapping({});
    setResults(null);
    setDelayMs(0);
    setForce(false);
    setPasteText("");
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {STEPS.map(({ n, label }, idx) => (
          <div key={n} className="flex items-center gap-2">
            <button
              onClick={() => n <= step && setStep(n)}
              disabled={n > step}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                n === step
                  ? "bg-primary text-primary-foreground"
                  : n < step
                    ? "bg-primary/20 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/20 text-[10px] font-bold">
                {n < step ? "\u2713" : n}
              </span>
              {label}
            </button>
            {idx < STEPS.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-xs"
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>

      {/* Step 1: cURL Input */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Paste your cURL command
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={`curl -X POST "https://api.example.com/users" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "John", "email": "john@test.com"}'`}
              value={curlInput}
              onChange={(e) => setCurlInput(e.target.value)}
              className="min-h-[160px] font-mono text-sm resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Paste a raw cURL command with actual values. In the next step
              you&apos;ll pick which values to turn into variables.
            </p>
            <Button onClick={handleAnalyzeCurl} disabled={analyzing}>
              {analyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Parse &amp; Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Define Variables (Interactive Viewer) */}
      {step === 2 && parsed && (
        <div className="space-y-4">
          <Card className="border-violet-500/20 bg-violet-500/5">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <Variable className="h-5 w-5 text-violet-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Define your variables</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click on any value in the parsed cURL below to convert it
                    into a{" "}
                    <code className="bg-violet-500/20 px-1 rounded">
                      {"{{variable}}"}
                    </code>
                    . Your CSV file should have columns matching these variable
                    names.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <InteractiveCurlViewer
            parsed={parsed}
            curlInput={originalCurl}
            onCurlUpdate={(newCurl) => setCurlInput(newCurl)}
            onVariablesChange={(vars) => setVariables(vars)}
          />

          {/* Updated cURL preview */}
          {variables.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium">
                  UPDATED cURL (with variables)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="rounded-md border bg-muted/40 p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {curlInput}
                </pre>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button onClick={() => setStep(1)} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => {
                if (variables.length === 0) {
                  toast.error(
                    "Define at least one variable by clicking a value above",
                  );
                  return;
                }
                setStep(3);
              }}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Continue to CSV ({variables.length} variable
              {variables.length !== 1 ? "s" : ""})
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: CSV Upload / Paste */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Variables reminder */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                VARIABLES DEFINED
              </p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <Badge
                    key={v}
                    variant="secondary"
                    className="font-mono text-xs bg-violet-500/15 text-violet-300 border-violet-500/30"
                  >
                    {"{{" + v + "}}"}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Provide data via CSV upload or paste from Excel/Sheets below.
                Column headers should match your variable names.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option A: File upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload CSV File
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Select a .csv file from your computer.
                </p>
              </CardContent>
            </Card>

            {/* Option B: Paste from clipboard */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clipboard className="h-4 w-4" />
                  Paste Table Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Copy from Excel / Sheets and paste here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="min-h-[100px] font-mono text-xs resize-y"
                />
                <Button onClick={handlePasteData} variant="secondary" size="sm">
                  <Clipboard className="mr-2 h-3 w-3" />
                  Load Pasted Data
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setStep(2)} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Configure */}
      {step === 4 && (
        <Card className="flex flex-col max-h-[calc(100vh-12rem)]">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Review &amp; Configure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Editable Data Table */}
            {csvRows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    <Pencil className="h-3 w-3 inline mr-1" />
                    EDITABLE DATA ({csvRows.length} rows from {csvFileName})
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addRow}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Row
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-xs">#</TableHead>
                        {csvColumns.map((col) => (
                          <TableHead key={col} className="text-xs">
                            {col}
                          </TableHead>
                        ))}
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] text-muted-foreground py-1">
                            {i + 1}
                          </TableCell>
                          {csvColumns.map((col) => (
                            <TableCell key={col} className="py-1 px-1">
                              <input
                                type="text"
                                value={row[col] || ""}
                                onChange={(e) =>
                                  updateCell(i, col, e.target.value)
                                }
                                className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none text-xs font-mono py-0.5 px-1 transition-colors"
                              />
                            </TableCell>
                          ))}
                          <TableCell className="py-1 px-1">
                            <button
                              onClick={() => deleteRow(i)}
                              className="text-muted-foreground hover:text-red-400 transition-colors p-0.5"
                              title="Delete row"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Separator />

            {/* Mapping Editor */}
            {variables.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  VARIABLE → COLUMN MAPPING
                </p>
                <div className="space-y-2">
                  {variables.map((v) => (
                    <div key={v} className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="font-mono text-xs shrink-0 min-w-[120px] justify-center bg-violet-500/15 text-violet-300 border-violet-500/30"
                      >
                        {"{{" + v + "}}"}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <select
                        value={mapping[v] || ""}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [v]: e.target.value }))
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs font-mono"
                      >
                        <option value="">— unmapped —</option>
                        {csvColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                      {mapping[v] ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Updated cURL preview — collapsible */}
            <div className="rounded-md border">
              <button
                onClick={() => setCurlExpanded(!curlExpanded)}
                className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  cURL TEMPLATE
                  {!curlExpanded && (
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">
                      (click to expand)
                    </span>
                  )}
                </span>
                {curlExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
              {curlExpanded && (
                <div className="border-t">
                  <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {curlInput}
                  </pre>
                </div>
              )}
            </div>

            <Separator />

            {/* Config */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="delay" className="text-xs">
                  Delay between requests (ms)
                </Label>
                <Input
                  id="delay"
                  type="number"
                  min={0}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    className="rounded border-input"
                  />
                  Force (skip missing variables)
                </label>
              </div>
            </div>
          </CardContent>
          <div className="flex gap-2 px-6 pb-6 pt-2 shrink-0 border-t border-border">
            <Button onClick={() => setStep(3)} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleRun} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run Batch ({csvRows.length} requests)
            </Button>
          </div>
        </Card>
      )}

      {/* Step 5: Results */}
      {step === 5 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results ? (
              <>
                <ResultsViewer data={results} />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!results || typeof results !== "object") return;
                      const r = results as Record<string, unknown>;
                      if (!r.results) return;
                      const blob = new Blob(
                        [JSON.stringify(r.results, null, 2)],
                        { type: "application/json" },
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
                    <Download className="mr-2 h-4 w-4" />
                    Export JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!results || typeof results !== "object") return;
                      const r = results as Record<string, unknown>;
                      if (!Array.isArray(r.results)) return;
                      const rows = r.results as Record<string, unknown>[];
                      const headers = [
                        "row_index",
                        "status_code",
                        "url",
                        "duration_ms",
                        "success",
                        "error",
                      ];
                      const csvLines = [
                        headers.join(","),
                        ...rows.map((row) =>
                          headers
                            .map((h) => `"${String(row[h] ?? "")}"`)
                            .join(","),
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
                    Export CSV
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={handleReset}
                  >
                    New Batch
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {loading ? "Running..." : "No results available"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}