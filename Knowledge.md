# cURL Kit -- Project Knowledge

**Location:** `/Users/DiceAdmin/Desktop/All Projects/cURL_kit/`
**Language:** Python 3.13 (backend) + TypeScript/Next.js 16 (frontend)
**Depends On:** requests, jsonpath-ng, websockets, fastapi, uvicorn (Python) | React 19, @xyflow/react, shadcn/ui, Tailwind 4, lucide-react, sonner (web)

---

## WHAT IT IS

A developer tool that takes raw cURL commands, extracts `{{variables}}` from them, maps those variables to CSV columns, and batch-executes the cURL for each CSV row. Think of it as a "cURL x CSV" automation engine with a visual workflow builder (Phase 2) on top.

---

## ARCHITECTURE (3 Layers)

### Layer 1: CLI (src/)
- `src/main.py` -- CLI entry with 5 subcommands: `parse`, `import`, `vars`, `validate`, `run`
- `src/parser/curl_parser.py` -- Parses cURL strings into structured `CurlRequest` dataclass. Handles 15+ cURL flags (method, headers, data, auth, cookies, redirects, timeouts, query params, form data). Uses `shlex` for shell-aware tokenization.
- `src/parser/collection_parser.py` -- Imports Postman v2.1 JSON collections, recursively handles folders, also supports JSON arrays of cURL strings. Maps them to `CurlRequest` objects.
- `src/variable/variable_utils.py` -- Finds `{{var}}` placeholders, substitutes them, auto-maps to CSV columns (case-insensitive), saves/loads mapping configs.
- `src/csv/csv_utils.py` -- Reads CSV, gets columns, validates against variables, builds per-row variable maps.
- `src/executor/batch_executor.py` -- Takes a CurlRequest + CSV, substitutes variables per row, executes via `requests` library, returns `ExecutionResult` per row.
- `src/results/exporter.py` -- Exports to JSON/CSV, prints formatted summary tables.

### Layer 2: Workflow Engine / Phase 2 (src/workflow/)
- `src/workflow/models.py` -- Core data model: `WorkflowDefinition` (DAG of nodes+edges), 8 node types (`CURL`, `CSV_SOURCE`, `EXTRACT`, `BRANCH`, `ASSERT`, `LOOP`, `DELAY`, `MERGE`), execution state tracking, run modes (once, per_iteration, on_ttl_expire).
- `src/workflow/dag.py` -- `WorkflowDAG` class: validates the graph (cycle detection via DFS coloring, edge reference checks), Kahn's topological sort, finds roots/successors/predecessors, detects loop body subgraphs, identifies branch paths. Raises `DAGValidationError` for cycles/broken refs.
- `src/workflow/executor.py` -- `WorkflowExecutor`: orchestrates DAG execution with pause/resume/stop controls, progress callbacks. Runs each node type with dedicated handlers. Supports run-once caching, TTL-based auto-refresh, loop expansion, branch routing, assertions with configurable failure actions (stop/skip/log).
- `src/workflow/jsonpath_utils.py` -- JSONPath evaluation via `jsonpath-ng`, variable reference resolution with `{{nodes.<id>.<field>}}` and `{{loop.<field>}}` syntax, condition evaluation (`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `exists`).
- `src/workflow/storage.py` -- Persists workflows as JSON files in the `workflows/` directory. CRUD + import/export.

### Layer 3: API + Web (api/ + web/)
- `api/server.py` -- FastAPI server exposing:
  - Phase 1 endpoints: `/api/parse`, `/api/import-collection`, `/api/extract-variables`, `/api/parse-csv`, `/api/generate-mapping`, `/api/validate`, `/api/run`, `/api/run-single`
  - Phase 2 workflow CRUD, validation, inline execution, run control (pause/resume/stop/status) + WebSocket for real-time progress streaming.
- `web/` -- Next.js 16 + React 19 + Tailwind 4 frontend. Uses shadcn/ui components, `@xyflow/react` for the visual workflow canvas, `sonner` for toasts. The `src/lib/api.ts` wraps every API endpoint. React components include: `curl-parser`, `collection-importer`, `batch-runner`, `interactive-curl-viewer`, `results-viewer`, `workflow-canvas` (visual DAG editor), node-specific components for all 8 node types, `node-config-panel`, `execution-panel`, `workflow-manager`.

---

## DATA FLOW

### Batch Runner
```
cURL file -> parse_curl() -> CurlRequest
                              -> extract_variables() -> [var1, var2, ...]
CSV file  -> read_csv()     -> [{col: val}, ...]
                              -> build_variable_row() -> {var: val}
                              -> substitute_variables() -> resolved CurlRequest
                              -> execute_request() (requests library) -> ExecutionResult
                              -> export_results_json/csv() / print_summary()
```

### Workflow Engine
```
Workflow JSON -> WorkflowDefinition -> WorkflowDAG (validate + sort)
                                    -> WorkflowExecutor (execute node-by-node)
                                       nodes pass data via {{nodes.<id>.$.path}} refs
                                       loops iterate over upstream CSV/JSON arrays
                                       branches conditionally skip downstream paths
```

---

## SAMPLE FILES

| File | Description |
|------|-------------|
| `samples/sample_get.txt` | Real cURL (sandbox API) with 14 headers, Bearer auth |
| `samples/sample_post.txt` | POST with JSON body containing `{{title}}`, `{{body}}`, `{{user_id}}` |
| `samples/sample_get_data.csv` | 4 rows: post_id + custom_value columns |
| `samples/sample_post_data.csv` | 3 rows: title, body, user_id |
| `samples/sample_collection.json` | Postman v2.1 with 3 requests (Get Post, Create Post, Get Users) |
| `samples/sample_workflow.json` | 4-node workflow: login -> assert -> fetch_users -> extract |

---

## TEST SUITE

- `tests/test_phase1.py` -- 18 tests: cURL parsing (simple, POST, multiline, auto-POST, auth, cookies, flags, query params, file parse, collection import), variable extraction, substitution, CSV read/columns, validation, mapping, variable rows.
- `tests/test_phase2.py` -- 19 tests: DAG (chain, cycle, roots, disconnected, bad ref), JSONPath (simple, nested, string input, no match), variable resolution (status_code, JSONPath, loop context, full resolve), conditions (==, !=, contains, variable ref), model round-trip serialization, storage CRUD.

---

## ROADMAP STATUS

- [x] Phase 1 COMPLETE: cURL parser, Postman importer, variables, CSV, batch execution, results export, CLI
- [ ] Phase 2 IN PROGRESS: Workflow engine is BUILT (models, DAG, executor, storage, API, web UI) but `workflows/` directory is empty and the README still marks it as unchecked.

---

## NODE TYPES (Workflow)

| Node Type | Description |
|-----------|-------------|
| `curl` | Execute a cURL command with variable substitution |
| `csv_source` | Parse CSV content inline, output rows + columns |
| `extract` | Extract data from upstream nodes using JSONPath |
| `branch` | Evaluate condition, route to true/false path |
| `assert` | Check condition, take action on failure (stop/skip/log) |
| `loop` | Iterate over an array from upstream, execute body for each item |
| `delay` | Wait for N seconds |
| `merge` | Combine data from multiple upstream nodes (merge objects or collect array) |

---

## VARIABLE REFERENCE SYNTAX

```
{{nodes.<node_id>.<jsonpath>}}     -- JSONPath into a node's response body
{{nodes.<node_id>.status_code}}    -- Direct node result field
{{nodes.<node_id>.headers.<key>}}  -- Response header value
{{loop.current_item}}              -- Current loop iteration item
{{loop.current_item.<path>}}       -- Nested path into current item
{{loop.index}}                     -- Current loop index (0-based)
```

---

## HOW TO RUN

```bash
# CLI mode
cd "/Users/DiceAdmin/Desktop/All Projects/cURL_kit"
source .venv/bin/activate
python -m src.main parse samples/sample_get.txt

# Full stack
./start.sh    # starts FastAPI on :8000 and Next.js on :3000

# Or manually:
# Backend
cd "/Users/DiceAdmin/Desktop/All Projects/cURL_kit"
source .venv/bin/activate
uvicorn api.server:app --port 8001 --host 0.0.0.0

# Frontend (in a separate terminal)
cd "/Users/DiceAdmin/Desktop/All Projects/cURL_kit/web"
npm run dev
```

---

## KNOWN ISSUES / FIXES APPLIED

1. **bare `catch {}` blocks** -- Node.js v26 / Turbopack parser doesn't support parameterless catch. All 11 occurrences fixed to `catch (_e)`.
2. **batch-runner.tsx corruption** -- The file was missing its entire component header (imports, state, helper functions, handleAnalyzeCurl). Fully reconstructed.
3. **sample_get.txt** contains real bearer tokens -- should be cleaned before sharing.
4. **`workflows/` directory is empty** -- no saved workflows yet; Phase 2 needs testing through the UI.

---

## API ENDPOINTS

### Phase 1
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/parse` | Parse a cURL command |
| POST | `/api/import-collection` | Import Postman collection (file upload) |
| POST | `/api/extract-variables` | Extract `{{variables}}` from cURL |
| POST | `/api/parse-csv` | Parse CSV file |
| POST | `/api/generate-mapping` | Auto-map variables to CSV columns |
| POST | `/api/validate` | Validate CSV covers all variables |
| POST | `/api/run` | Batch execute cURL per CSV row |
| POST | `/api/run-single` | Execute a single cURL |

### Phase 2
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows` | List all workflows |
| POST | `/api/workflow` | Create/update workflow |
| GET | `/api/workflow/{id}` | Get workflow by ID |
| DELETE | `/api/workflow/{id}` | Delete workflow |
| GET | `/api/workflow/{id}/export` | Export workflow JSON |
| POST | `/api/workflow/import` | Import workflow from file |
| POST | `/api/workflow/validate` | Validate workflow DAG |
| POST | `/api/workflow/{id}/run` | Start workflow execution |
| POST | `/api/workflow/run-inline` | Execute workflow from definition |
| POST | `/api/workflow/run/{run_id}/pause` | Pause execution |
| POST | `/api/workflow/run/{run_id}/resume` | Resume execution |
| POST | `/api/workflow/run/{run_id}/stop` | Stop execution |
| GET | `/api/workflow/run/{run_id}/status` | Get run status |
| WS | `/ws/workflow/{run_id}` | WebSocket progress stream |