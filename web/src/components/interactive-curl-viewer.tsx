"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Variable, X, Check, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/** A single value that was converted into a variable */
interface VariableBinding {
  /** unique id */
  id: string;
  /** original literal value in the cURL */
  originalValue: string;
  /** user-chosen variable name */
  variableName: string;
  /** where the value lives: url, header-value, header-key, body, query-value, cookie-value, auth */
  section: string;
  /** for headers/query/cookies – which key does this value belong to */
  key?: string;
}

interface InteractiveCurlViewerProps {
  parsed: ParsedRequest;
  /** Called when variables are created/changed — passes back the updated cURL string */
  onCurlUpdate: (newCurl: string) => void;
  /** Called when variable list changes — passes variable names */
  onVariablesChange?: (variables: string[]) => void;
  curlInput: string;
}

/* ------------------------------------------------------------------ */
/*  Colours                                                            */
/* ------------------------------------------------------------------ */

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  HEAD: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const SECTION_LABELS: Record<string, string> = {
  url: "URL",
  "url-path": "Path Segments",
  "url-host": "Host",
  headers: "Headers",
  body: "Request Body",
  query: "Query Parameters",
  cookies: "Cookies",
  auth: "Authentication",
  flags: "Flags",
};

/* ------------------------------------------------------------------ */
/*  Helper: break a URL into clickable parts                           */
/* ------------------------------------------------------------------ */

interface UrlPart {
  label: string;
  value: string;
  kind: "protocol" | "host" | "path" | "query-key" | "query-value";
}

function decomposeUrl(url: string): UrlPart[] {
  const parts: UrlPart[] = [];
  try {
    const u = new URL(url);
    parts.push({ label: "Protocol", value: u.protocol.replace(":", ""), kind: "protocol" });
    parts.push({ label: "Host", value: u.host, kind: "host" });
    if (u.pathname && u.pathname !== "/") {
      const segments = u.pathname.split("/").filter(Boolean);
      segments.forEach((seg) => {
        parts.push({ label: "Path", value: seg, kind: "path" });
      });
    }
    u.searchParams.forEach((v, k) => {
      parts.push({ label: `Param ${k}`, value: k, kind: "query-key" });
      parts.push({ label: `Value`, value: v, kind: "query-value" });
    });
  } catch (_e) {
    // Not a valid URL – just show as-is
    parts.push({ label: "URL", value: url, kind: "host" });
  }
  return parts;
}

/* ------------------------------------------------------------------ */
/*  Helper: flatten JSON body into key→value list                      */
/* ------------------------------------------------------------------ */

interface BodyField {
  path: string;
  value: string;
}

function flattenBody(data: string): BodyField[] {
  try {
    const obj = JSON.parse(data);
    const fields: BodyField[] = [];
    function walk(o: unknown, prefix: string) {
      if (o === null || o === undefined) return;
      if (typeof o === "object" && !Array.isArray(o)) {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
          walk(v, prefix ? `${prefix}.${k}` : k);
        }
      } else if (Array.isArray(o)) {
        o.forEach((item, idx) => walk(item, `${prefix}[${idx}]`));
      } else {
        fields.push({ path: prefix, value: String(o) });
      }
    }
    walk(obj, "");
    return fields;
  } catch (_e) {
    // Not JSON – treat whole body as one value
    return [{ path: "body", value: data }];
  }
}

/* ------------------------------------------------------------------ */
/*  ClickableValue – the core interactive chip                         */
/* ------------------------------------------------------------------ */

function ClickableValue({
  value,
  binding,
  onCreateVariable,
  onRemoveVariable,
}: {
  value: string;
  binding?: VariableBinding;
  onCreateVariable: (varName: string) => void;
  onRemoveVariable: () => void;
}) {
  const [varName, setVarName] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  function handleConfirm() {
    const name = varName.trim();
    if (!name) return;
    onCreateVariable(name);
    setVarName("");
    setOpen(false);
  }

  // Already a variable
  if (binding) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/40 px-2 py-0.5 font-mono text-sm text-violet-300 group">
        <Variable className="h-3 w-3 text-violet-400 shrink-0" />
        <span className="font-semibold">{`{{${binding.variableName}}}`}</span>
        <span className="text-[10px] text-violet-400/60 ml-1 hidden group-hover:inline">
          ← {binding.originalValue}
        </span>
        <button
          onClick={onRemoveVariable}
          className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-violet-400 hover:text-violet-200"
          title="Revert to original value"
        >
          <Undo2 className="h-3 w-3" />
        </button>
      </span>
    );
  }

  // Regular clickable value
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex items-center rounded-md bg-muted/60 border border-transparent hover:border-violet-500/50 hover:bg-violet-500/10 px-2 py-0.5 font-mono text-sm cursor-pointer transition-all duration-150 hover:shadow-[0_0_6px_rgba(139,92,246,0.15)]"
        title="Click to convert to variable"
      >
        {value}
      </PopoverTrigger>
      <PopoverContent side="top" sideOffset={6} className="w-64 p-3">
        <p className="text-xs text-muted-foreground mb-2">
          Convert to variable
        </p>
        <p className="text-xs font-mono text-muted-foreground/70 mb-2 truncate">
          Value: {value}
        </p>
        <div className="flex gap-1.5">
          <Input
            ref={inputRef}
            placeholder="variable_name"
            value={varName}
            onChange={(e) => setVarName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
              if (e.key === "Escape") setOpen(false);
            }}
            className="h-8 font-mono text-xs"
          />
          <Button
            size="sm"
            className="h-8 px-2"
            onClick={handleConfirm}
            disabled={!varName.trim()}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => setOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function InteractiveCurlViewer({
  parsed,
  onCurlUpdate,
  onVariablesChange,
  curlInput,
}: InteractiveCurlViewerProps) {
  const [bindings, setBindings] = useState<VariableBinding[]>([]);

  // Build the updated cURL string whenever bindings change
  const computeUpdatedCurl = useCallback(
    (currentBindings: VariableBinding[]) => {
      let updated = curlInput;
      for (const b of currentBindings) {
        // Replace all occurrences of the original value with the variable placeholder
        // Use a global literal string replace
        updated = updated.split(b.originalValue).join(`{{${b.variableName}}}`);
      }
      return updated;
    },
    [curlInput]
  );

  function addBinding(
    originalValue: string,
    variableName: string,
    section: string,
    key?: string
  ) {
    const id = `${section}-${key || ""}-${originalValue}`;
    const newBindings = [
      ...bindings,
      { id, originalValue, variableName, section, key },
    ];
    setBindings(newBindings);
    onCurlUpdate(computeUpdatedCurl(newBindings));
    onVariablesChange?.(newBindings.map((b) => b.variableName));
  }

  function removeBinding(id: string) {
    const newBindings = bindings.filter((b) => b.id !== id);
    setBindings(newBindings);
    onCurlUpdate(computeUpdatedCurl(newBindings));
    onVariablesChange?.(newBindings.map((b) => b.variableName));
  }

  function getBinding(section: string, key: string | undefined, value: string) {
    return bindings.find(
      (b) => b.section === section && b.key === key && b.originalValue === value
    );
  }

  // Check if value is already a {{variable}} template
  function isTemplateVar(value: string) {
    return /^\{\{.+\}\}$/.test(value.trim());
  }

  const method = parsed.method || "GET";
  const urlParts = decomposeUrl(parsed.url);
  const bodyFields = parsed.data ? flattenBody(parsed.data) : [];

  return (
    <Card className="border-violet-500/20">
      <CardContent className="pt-6 space-y-5">
        {/* Instruction hint */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-violet-500/5 border border-violet-500/20 text-xs text-violet-300">
          <Variable className="h-4 w-4 shrink-0" />
          <span>
            Click on any <strong>value</strong> below to convert it into a{" "}
            <code className="bg-violet-500/20 px-1 rounded">{"{{variable}}"}</code>.
            The cURL command will update automatically.
          </span>
        </div>

        {/* ── Method ── */}
        <Section label="Method">
          <Badge
            variant="outline"
            className={`${METHOD_COLORS[method] || ""} text-sm px-3 py-1`}
          >
            {method}
          </Badge>
        </Section>

        <Separator />

        {/* ── URL Breakdown ── */}
        <Section label="URL Components">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {urlParts.map((part, i) => {
                const isClickable =
                  part.kind !== "protocol" && !isTemplateVar(part.value);
                const sectionKey =
                  part.kind === "query-value"
                    ? "query"
                    : part.kind === "query-key"
                    ? "query"
                    : "url";
                const bindingKey = `${part.kind}-${i}`;
                const binding = getBinding(sectionKey, bindingKey, part.value);

                // Separators between URL parts
                const prefix =
                  i === 0
                    ? ""
                    : part.kind === "host"
                    ? "://"
                    : part.kind === "path"
                    ? "/"
                    : part.kind === "query-key"
                    ? i ===
                      urlParts.findIndex((p) => p.kind === "query-key")
                      ? "?"
                      : "&"
                    : part.kind === "query-value"
                    ? "="
                    : "";

                return (
                  <span key={i} className="inline-flex items-center">
                    {prefix && (
                      <span className="text-muted-foreground font-mono text-sm mr-0.5">
                        {prefix}
                      </span>
                    )}
                    <span className="relative">
                      <span className="absolute -top-3.5 left-0.5 text-[9px] text-muted-foreground/50">
                        {part.label}
                      </span>
                      {isClickable ? (
                        <ClickableValue
                          value={part.value}
                          binding={binding}
                          onCreateVariable={(name) =>
                            addBinding(part.value, name, sectionKey, bindingKey)
                          }
                          onRemoveVariable={() =>
                            binding && removeBinding(binding.id)
                          }
                        />
                      ) : (
                        <span className="font-mono text-sm text-muted-foreground px-1">
                          {part.value}
                        </span>
                      )}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </Section>

        {/* ── Headers ── */}
        {parsed.headers && Object.keys(parsed.headers).length > 0 && (
          <>
            <Separator />
            <Section label="Headers">
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                {Object.entries(parsed.headers).map(([hKey, hVal]) => {
                  const binding = getBinding("headers", hKey, hVal);
                  return (
                    <div
                      key={hKey}
                      className="flex items-center gap-2 font-mono text-sm"
                    >
                      <span className="text-muted-foreground shrink-0 min-w-[140px]">
                        {hKey}:
                      </span>
                      {isTemplateVar(hVal) ? (
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs bg-violet-500/15 text-violet-300 border-violet-500/30"
                        >
                          {hVal}
                        </Badge>
                      ) : (
                        <ClickableValue
                          value={hVal}
                          binding={binding}
                          onCreateVariable={(name) =>
                            addBinding(hVal, name, "headers", hKey)
                          }
                          onRemoveVariable={() =>
                            binding && removeBinding(binding.id)
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {/* ── Query Parameters ── */}
        {parsed.query_params && Object.keys(parsed.query_params).length > 0 && (
          <>
            <Separator />
            <Section label="Query Parameters">
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                {Object.entries(parsed.query_params).map(([qKey, qVal]) => {
                  const binding = getBinding("query", qKey, qVal);
                  return (
                    <div
                      key={qKey}
                      className="flex items-center gap-2 font-mono text-sm"
                    >
                      <span className="text-muted-foreground shrink-0 min-w-[140px]">
                        {qKey} =
                      </span>
                      {isTemplateVar(qVal) ? (
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs bg-violet-500/15 text-violet-300 border-violet-500/30"
                        >
                          {qVal}
                        </Badge>
                      ) : (
                        <ClickableValue
                          value={qVal}
                          binding={binding}
                          onCreateVariable={(name) =>
                            addBinding(qVal, name, "query", qKey)
                          }
                          onRemoveVariable={() =>
                            binding && removeBinding(binding.id)
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {/* ── Request Body ── */}
        {parsed.data && (
          <>
            <Separator />
            <Section label="Request Body">
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                {bodyFields.length === 1 && bodyFields[0].path === "body" ? (
                  // Non-JSON body — single clickable block
                  <ClickableValue
                    value={bodyFields[0].value}
                    binding={getBinding("body", "raw", bodyFields[0].value)}
                    onCreateVariable={(name) =>
                      addBinding(bodyFields[0].value, name, "body", "raw")
                    }
                    onRemoveVariable={() => {
                      const b = getBinding("body", "raw", bodyFields[0].value);
                      if (b) removeBinding(b.id);
                    }}
                  />
                ) : (
                  // JSON body — field-by-field
                  bodyFields.map((field) => {
                    const binding = getBinding("body", field.path, field.value);
                    return (
                      <div
                        key={field.path}
                        className="flex items-center gap-2 font-mono text-sm"
                      >
                        <span className="text-muted-foreground shrink-0 min-w-[140px]">
                          {field.path}:
                        </span>
                        {isTemplateVar(field.value) ? (
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs bg-violet-500/15 text-violet-300 border-violet-500/30"
                          >
                            {field.value}
                          </Badge>
                        ) : (
                          <ClickableValue
                            value={field.value}
                            binding={binding}
                            onCreateVariable={(name) =>
                              addBinding(field.value, name, "body", field.path)
                            }
                            onRemoveVariable={() =>
                              binding && removeBinding(binding.id)
                            }
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Section>
          </>
        )}

        {/* ── Cookies ── */}
        {parsed.cookies && Object.keys(parsed.cookies).length > 0 && (
          <>
            <Separator />
            <Section label="Cookies">
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                {Object.entries(parsed.cookies).map(([cKey, cVal]) => {
                  const binding = getBinding("cookies", cKey, cVal);
                  return (
                    <div
                      key={cKey}
                      className="flex items-center gap-2 font-mono text-sm"
                    >
                      <span className="text-muted-foreground shrink-0 min-w-[140px]">
                        {cKey} =
                      </span>
                      <ClickableValue
                        value={cVal}
                        binding={binding}
                        onCreateVariable={(name) =>
                          addBinding(cVal, name, "cookies", cKey)
                        }
                        onRemoveVariable={() =>
                          binding && removeBinding(binding.id)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {/* ── Auth ── */}
        {parsed.auth && (
          <>
            <Separator />
            <Section label="Authentication">
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                {parsed.auth.map((part, i) => {
                  const label = i === 0 ? "Username" : "Password";
                  const binding = getBinding("auth", label, part);
                  return (
                    <div
                      key={label}
                      className="flex items-center gap-2 font-mono text-sm"
                    >
                      <span className="text-muted-foreground shrink-0 min-w-[140px]">
                        {label}:
                      </span>
                      <ClickableValue
                        value={part}
                        binding={binding}
                        onCreateVariable={(name) =>
                          addBinding(part, name, "auth", label)
                        }
                        onRemoveVariable={() =>
                          binding && removeBinding(binding.id)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {/* ── Flags ── */}
        <Separator />
        <Section label="Flags">
          <div className="flex flex-wrap gap-2">
            {parsed.follow_redirects && (
              <Badge variant="outline" className="text-xs">
                Follow Redirects
              </Badge>
            )}
            {parsed.insecure && (
              <Badge variant="outline" className="text-xs text-amber-400">
                Insecure
              </Badge>
            )}
            {parsed.compressed && (
              <Badge variant="outline" className="text-xs">
                Compressed
              </Badge>
            )}
            {parsed.timeout && (
              <Badge variant="outline" className="text-xs">
                Timeout: {parsed.timeout}s
              </Badge>
            )}
            {parsed.connect_timeout && (
              <Badge variant="outline" className="text-xs">
                Connect Timeout: {parsed.connect_timeout}s
              </Badge>
            )}
            {!parsed.follow_redirects &&
              !parsed.insecure &&
              !parsed.compressed &&
              !parsed.timeout &&
              !parsed.connect_timeout && (
                <span className="text-xs text-muted-foreground">None</span>
              )}
          </div>
        </Section>

        {/* ── Variable Summary ── */}
        {bindings.length > 0 && (
          <>
            <Separator />
            <Section label={`Variables Created (${bindings.length})`}>
              <div className="rounded-md border bg-violet-500/5 border-violet-500/20 p-3 space-y-1.5">
                {bindings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 text-sm font-mono"
                  >
                    <Badge
                      variant="secondary"
                      className="bg-violet-500/15 text-violet-300 border-violet-500/30"
                    >
                      {`{{${b.variableName}}}`}
                    </Badge>
                    <span className="text-muted-foreground">←</span>
                    <span className="text-muted-foreground truncate max-w-[200px]">
                      {b.originalValue}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">
                      {b.section}
                      {b.key ? ` → ${b.key}` : ""}
                    </span>
                    <button
                      onClick={() => removeBinding(b.id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      title="Remove variable"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
