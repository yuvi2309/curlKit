"use client";

import { useState } from "react";
import { BookOpen, X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SECTIONS = [
  {
    title: "Getting Started",
    content: `
**Workflow Builder** lets you create visual pipelines of HTTP requests where the output of one step feeds into the next.

### Quick Start
1. **Drag nodes** from the left palette onto the canvas.
2. **Connect them** by dragging from a bottom handle (output) to a top handle (input).
3. **Configure** each node by clicking it — a settings panel opens on the right.
4. **Run** using the Execute panel in the bottom-left sidebar.

### Key Concepts
- **Nodes** are the building blocks — each does one job (request, extract, branch, etc.)
- **Edges** (the lines between nodes) define data flow direction.
- **Variables** use the \`{{nodes.<id>.<field>}}\` syntax to reference upstream data.
- **Execution** runs top-to-bottom following the edges (topologically sorted DAG).
`,
  },
  {
    title: "cURL Request Node",
    color: "bg-blue-500/20 text-blue-400",
    content: `
The primary node — executes an HTTP request.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label on the canvas |
| **cURL Command** | Full cURL command (same syntax as terminal) |
| **Run Mode** | Controls re-execution behavior |
| **TTL (seconds)** | Only for "TTL-based Refresh" mode |
| **Variables** | Detected \`{{placeholders}}\` from the cURL — set default values or reference upstream nodes |
| **Extractions** | Pull values from the response using JSONPath |

### Run Modes
- **Per Iteration** — Re-executes every time the node is reached (default).
- **Run Once** — Executes once, caches the result for the entire workflow run. Perfect for auth/login tokens.
- **TTL-based Refresh** — Caches the result, re-executes only when the TTL expires. Great for tokens that expire.

### Variable Syntax in cURL
Use \`{{variable_name}}\` in the cURL to create placeholders:
\`\`\`
curl -X POST https://api.example.com/data \\
  -H "Authorization: Bearer {{auth_token}}" \\
  -d '{"user_id": "{{user_id}}"}'
\`\`\`

### Referencing Upstream Data
Use \`{{nodes.<node_id>.<path>}}\` to feed data from another node's response:
- \`{{nodes.login.$.data.token}}\` — JSONPath into login node's response body
- \`{{nodes.login.status_code}}\` — HTTP status code of the login node
- \`{{nodes.login.headers.Content-Type}}\` — Response header value
- \`{{nodes.login.extractions.token}}\` — Value from a named extraction

### Extractions
Add extraction rules to pull data for downstream nodes:
- **Name**: Variable name (e.g., \`auth_token\`)
- **JSONPath**: Path into the response body (e.g., \`$.data.access_token\`)

Other nodes can then use \`{{nodes.<this_node_id>.extractions.<name>}}\` to access extracted values.
`,
  },
  {
    title: "CSV Source Node",
    color: "bg-emerald-500/20 text-emerald-400",
    content: `
Loads tabular data into the workflow for iteration.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label |
| **CSV Content** | Paste CSV data directly (with headers) |

### Example
\`\`\`
user_id,email,role
1,alice@example.com,admin
2,bob@example.com,user
3,carol@example.com,editor
\`\`\`

### Usage
Connect a CSV Source to a **Loop** node. The Loop will iterate over each row, making the values available as \`{{csv.user_id}}\`, \`{{csv.email}}\`, etc.

### Output
- Outputs an array of row objects, each keyed by column name.
`,
  },
  {
    title: "Extract Node",
    color: "bg-violet-500/20 text-violet-400",
    content: `
Pulls specific values from an upstream node's response using JSONPath.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label |
| **Extractions** | List of name → JSONPath pairs |

### Example Extractions
| Name | JSONPath | What it gets |
|---|---|---|
| user_ids | \`$.data.users[*].id\` | All user IDs as an array |
| first_name | \`$.data.users[0].name\` | First user's name |
| total | \`$.meta.total_count\` | Total count from meta |

### Usage
Connect it after a cURL node. Downstream nodes can reference the extracted values via \`{{nodes.<extract_id>.extractions.<name>}}\`.
`,
  },
  {
    title: "Branch (If/Else) Node",
    color: "bg-orange-500/20 text-orange-400",
    content: `
Routes execution down one of two paths based on a condition.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label |
| **Condition** | Left operand, operator, right operand |

### Condition Operators
\`==\`, \`!=\`, \`>\`, \`<\`, \`>=\`, \`<=\`, \`contains\`, \`exists\`

### Handles
- **True** (bottom-left, green) — Edge followed when condition is true
- **False** (bottom-right, red) — Edge followed when condition is false

### Example
| Left | Operator | Right | Meaning |
|---|---|---|---|
| \`{{nodes.login.status_code}}\` | \`==\` | \`200\` | Login succeeded? |
| \`{{nodes.fetch.$.data.role}}\` | \`==\` | \`admin\` | Is user admin? |
| \`{{nodes.api.$.error}}\` | \`exists\` | — | Response has error field? |

### Connecting
Connect the **True** output to nodes that should run on success, and the **False** output to fallback/error nodes. Only one path executes per run.
`,
  },
  {
    title: "Assert / Gate Node",
    color: "bg-rose-500/20 text-rose-400",
    content: `
Validates a condition and controls workflow continuation.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label |
| **Condition** | Same as Branch — left, operator, right |
| **On Failure** | What to do if assertion fails |

### Failure Actions
- **Stop Workflow** — Halts the entire workflow immediately
- **Skip Downstream** — Skips all nodes downstream of this assert
- **Log & Continue** — Logs the failure but continues execution

### Use Cases
- Gate the workflow after a login: assert \`status_code == 200\` with "Stop Workflow"
- Soft-validate data quality: assert a field exists with "Log & Continue"
`,
  },
  {
    title: "Loop Node",
    color: "bg-cyan-500/20 text-cyan-400",
    content: `
Iterates over an array, executing downstream nodes for each item.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label |
| **Source Path** | Where to get the array to iterate over |

### Source Path Options
- \`csv_rows\` — Iterate over rows from an upstream CSV Source node
- \`$.data.items\` — JSONPath into the upstream node's response body
- \`nodes.<id>.extractions.<name>\` — Reference a specific extracted array

### Accessing Loop Data
Inside the loop body, use:
- \`{{loop.current_item}}\` — The current iteration item
- \`{{loop.current_item.id}}\` — Nested field in the current item
- \`{{loop.index}}\` — Current iteration index (0-based)
- \`{{csv.column_name}}\` — CSV column value (when iterating CSV rows)
`,
  },
  {
    title: "Delay Node",
    color: "bg-amber-500/20 text-amber-400",
    content: `
Pauses execution for a specified duration. Useful for rate-limiting API calls.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label |
| **Delay (seconds)** | How long to wait (supports decimals, e.g. 0.5) |
`,
  },
  {
    title: "Merge Node",
    color: "bg-pink-500/20 text-pink-400",
    content: `
Combines data from two upstream sources into a single output.

### Configuration
| Field | Description |
|---|---|
| **Name** | Display label |
| **Strategy** | How to combine the data |

### Strategies
- **Merge Objects** — Shallow-merges two JSON objects into one (keys from B override A).
- **Collect Array** — Wraps both inputs into an array \`[inputA, inputB]\`.

### Handles
The Merge node has **two input handles** (top-left and top-right). Connect one source to each.
`,
  },
  {
    title: "Workflow Execution",
    content: `
### Running a Workflow
1. Click **▶ Run** in the execution panel (bottom-left sidebar).
2. Nodes highlight in real-time: blue (running), green (success), red (failed), yellow (skipped).
3. The execution log shows step-by-step progress.

### Execution Controls
- **▶ Run** — Start execution from the beginning
- **⏸ Pause** — Pause at the next node boundary
- **▶ Resume** — Continue a paused workflow
- **■ Stop** — Cancel execution immediately

### Execution Order
Nodes execute in **topological order** (respecting the edges). A node only executes after all its upstream dependencies have completed.

### Saving & Loading
- **Save** — Persists the workflow to the server
- **Open** — Browse and load saved workflows
- **Export** (↓) — Download as a JSON file
- **Import** (↑) — Load from a JSON file
`,
  },
  {
    title: "Common Patterns",
    content: `
### Auth → API Call
\`\`\`
[cURL: Login (run_mode=once)] → [Assert: status==200] → [cURL: API Call]
\`\`\`
The login runs once and caches the token. The API call references it via \`{{nodes.login.extractions.token}}\`.

### CSV Batch Processing
\`\`\`
[CSV Source] → [Loop] → [cURL: Process Row] → [Delay: 0.5s]
\`\`\`
Load CSV data, loop over each row, make an API call per row with a rate-limit delay.

### Conditional Branching
\`\`\`
[cURL: Check User] → [Branch: role==admin] 
                        ├── True → [cURL: Admin Endpoint]
                        └── False → [cURL: User Endpoint]
\`\`\`

### Multi-Source Merge
\`\`\`
[cURL: Service A] ──┐
                     ├── [Merge] → [cURL: Combined Call]
[cURL: Service B] ──┘
\`\`\`
`,
  },
];

function Section({
  title,
  color,
  content,
  defaultOpen,
}: {
  title: string;
  color?: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        {color && <Badge variant="secondary" className={`text-[10px] ${color}`}>Node</Badge>}
        <span className="text-sm font-semibold">{title}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground prose prose-invert prose-sm max-w-none
          [&_h3]:text-foreground [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
          [&_table]:text-xs [&_table]:my-2 [&_th]:text-foreground [&_th]:px-2 [&_th]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted/30
          [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-border
          [&_code]:text-primary [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
          [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:my-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1 [&_li]:my-0.5
          [&_strong]:text-foreground
          [&_p]:my-1.5
        ">
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
        </div>
      )}
    </div>
  );
}

/** Lightweight markdown → HTML (covers our subset: headers, bold, code, tables, lists, links) */
function markdownToHtml(md: string): string {
  return md
    .trim()
    .split("\n\n")
    .map((block) => {
      block = block.trim();
      if (!block) return "";

      // code block
      if (block.startsWith("```")) {
        const lines = block.split("\n");
        const code = lines.slice(1, -1).join("\n");
        return `<pre><code>${esc(code)}</code></pre>`;
      }

      // table
      if (block.includes("|") && block.includes("---")) {
        const rows = block.split("\n").filter((r) => !r.match(/^\|[\s-|]+\|$/));
        const headerRow = rows[0];
        const dataRows = rows.slice(1);
        const parseRow = (r: string) =>
          r.split("|").filter(Boolean).map((c) => c.trim());

        let html = "<table><thead><tr>";
        for (const cell of parseRow(headerRow)) {
          html += `<th>${inlineFormat(cell)}</th>`;
        }
        html += "</tr></thead><tbody>";
        for (const row of dataRows) {
          html += "<tr>";
          for (const cell of parseRow(row)) {
            html += `<td>${inlineFormat(cell)}</td>`;
          }
          html += "</tr>";
        }
        html += "</tbody></table>";
        return html;
      }

      // heading
      if (block.startsWith("### ")) return `<h3>${inlineFormat(block.slice(4))}</h3>`;
      if (block.startsWith("## ")) return `<h3>${inlineFormat(block.slice(3))}</h3>`;

      // unordered list
      if (block.match(/^[-*] /m)) {
        const items = block.split("\n").filter(Boolean);
        return "<ul>" + items.map((li) => `<li>${inlineFormat(li.replace(/^[-*]\s+/, ""))}</li>`).join("") + "</ul>";
      }

      // paragraph
      return `<p>${inlineFormat(block.replace(/\n/g, " "))}</p>`;
    })
    .join("\n");
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\\`/g, "`");
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function WorkflowDocs({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Workflow Documentation</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-2">
            {SECTIONS.map((s, i) => (
              <Section
                key={s.title}
                title={s.title}
                color={s.color}
                content={s.content}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
