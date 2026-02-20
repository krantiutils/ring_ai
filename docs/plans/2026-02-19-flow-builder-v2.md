# Flow Builder v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the flow builder column-aware with proper data source setup, multi-handle branching on condition/validation nodes, and column-reference dropdowns in the inspector.

**Architecture:** Source nodes provide a `columns: string[]` that propagates downstream. Condition and validation nodes get left/right output handles instead of a single bottom handle. The inspector renders column-aware dropdowns instead of free-text inputs. A new backend endpoint parses uploaded CSV/XLSX files.

**Tech Stack:** React 19, @xyflow/react v12, Next.js 15, FastAPI, pandas/openpyxl, TypeScript

---

### Task 1: Backend File Upload Endpoint

**Files:**
- Modify: `backend/app/schemas/flows.py` (add new schema)
- Modify: `backend/app/api/v1/endpoints/flows.py` (add endpoint)

**Step 1: Add Pydantic schema for file upload response**

In `backend/app/schemas/flows.py`, add at the bottom:

```python
class FileUploadResponse(BaseModel):
    file_id: str
    headers: list[str]
    preview_rows: list[list[str]]
    total_rows: int
```

**Step 2: Add the file-upload endpoint**

In `backend/app/api/v1/endpoints/flows.py`, add these imports at the top:

```python
import tempfile
from pathlib import Path
from fastapi import File, UploadFile
from app.schemas.flows import FileUploadResponse
```

Then add this endpoint after the existing `preview_url_source` endpoint (after line 192):

```python
@router.post("/sources/file-upload", response_model=FileUploadResponse)
async def upload_source_file(
    file: UploadFile = File(...),
    _current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=422, detail="Filename is required.")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".xlsx"):
        raise HTTPException(status_code=422, detail="Only .csv and .xlsx files are supported.")

    content = await file.read()
    if len(content) > MAX_SOURCE_DOWNLOAD_BYTES:
        raise HTTPException(status_code=422, detail="File exceeds 2MB limit.")

    headers: list[str] = []
    all_rows: list[list[str]] = []

    if ext == ".csv":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=422, detail="CSV file must be valid UTF-8.")
        reader = csv.reader(io.StringIO(text))
        parsed_rows = list(reader)
        if not parsed_rows:
            raise HTTPException(status_code=422, detail="CSV file is empty.")
        headers = _sanitize_headers([cell.strip() for cell in parsed_rows[0]])
        all_rows = _sanitize_rows(parsed_rows[1:], headers, max_rows=10000)
    else:
        try:
            import openpyxl
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl is not installed on this server.")
        with tempfile.NamedTemporaryFile(suffix=".xlsx") as tmp:
            tmp.write(content)
            tmp.flush()
            wb = openpyxl.load_workbook(tmp.name, read_only=True)
            ws = wb.active
            if ws is None:
                raise HTTPException(status_code=422, detail="XLSX file has no active sheet.")
            row_iter = ws.iter_rows(values_only=True)
            first_row = next(row_iter, None)
            if first_row is None:
                raise HTTPException(status_code=422, detail="XLSX file is empty.")
            headers = _sanitize_headers([str(cell or "").strip() for cell in first_row])
            raw_rows = [[str(cell or "").strip() for cell in row] for row in row_iter]
            all_rows = _sanitize_rows(raw_rows, headers, max_rows=10000)
            wb.close()

    if not headers:
        raise HTTPException(status_code=422, detail="File header row is missing or empty.")

    file_id = str(uuid.uuid4())

    return FileUploadResponse(
        file_id=file_id,
        headers=headers,
        preview_rows=all_rows[:10],
        total_rows=len(all_rows),
    )
```

**Step 3: Test the endpoint manually**

```bash
# Create a test CSV
echo 'name,phone,age,gender
Ram,+9779800000000,34,male
Sita,+9779811111111,28,female' > /tmp/test_contacts.csv

# Test the upload (replace TOKEN with a valid JWT)
curl -X POST http://127.0.0.1:8000/api/v1/flows/sources/file-upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@/tmp/test_contacts.csv"
```

Expected: JSON with `file_id`, `headers: ["name","phone","age","gender"]`, `preview_rows` with 2 rows, `total_rows: 2`.

**Step 4: Commit**

```bash
git add backend/app/schemas/flows.py backend/app/api/v1/endpoints/flows.py
git commit -m "feat(flows): add file-upload endpoint for CSV/XLSX source parsing"
```

---

### Task 2: Frontend API Client for File Upload

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `uploadSourceFile` method)

**Step 1: Add the upload method**

Find the `previewFlowUrlSource` method in `api.ts` and add a new method after it:

```typescript
async uploadSourceFile(file: File): Promise<{
  file_id: string;
  headers: string[];
  preview_rows: string[][];
  total_rows: number;
}> {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/flows/sources/file-upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new ApiError(res.status, body.detail || "Upload failed");
  }
  return res.json();
},
```

Note: Do NOT set `Content-Type` header — the browser sets it automatically with the correct multipart boundary.

**Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): add uploadSourceFile method for CSV/XLSX file upload"
```

---

### Task 3: Frontend Types — Add Columns and sourceHandle

**Files:**
- Modify: `frontend/src/features/flows/builderTypes.ts`

**Step 1: Update FlowNodeData to include columns**

In `builderTypes.ts`, change `FlowNodeData`:

```typescript
export type FlowNodeData = {
  label: string;
  kind: FlowNodeKind;
  description?: string;
  config: Record<string, string | number | boolean>;
  columns?: string[];
};
```

**Step 2: Update FlowEdge to support sourceHandle**

Change `FlowEdge`:

```typescript
export type FlowEdge = Edge & {
  sourceHandle?: string;
};
```

**Step 3: Commit**

```bash
git add frontend/src/features/flows/builderTypes.ts
git commit -m "feat(types): add columns to FlowNodeData and sourceHandle to FlowEdge"
```

---

### Task 4: Multi-Handle Branching Nodes

This is the core visual change. Condition and validation nodes get left/right output handles instead of a single bottom handle.

**Files:**
- Modify: `frontend/src/components/flows/FlowBuilder.tsx` (FlowNodeCard component, lines 215–249)

**Step 1: Update FlowNodeCard to render left/right handles for branching nodes**

Replace the entire `FlowNodeCard` function (lines 215–249) with:

```tsx
function FlowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const shape = getNodeShape(data.kind);
  const baseClass = shapeClass(shape, selected);
  const isBranching = data.kind === "condition" || data.kind === "validation";

  const content = (
    <div className="flex items-center gap-2 text-[var(--foreground)]">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]">
        {nodeIcon[data.kind]}
      </span>
      <div>
        <p className="text-sm font-semibold">{data.label}</p>
        <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          {data.kind.replaceAll("_", " ")}
        </p>
      </div>
    </div>
  );

  const trueLabel = data.kind === "validation" ? "valid" : "true";
  const falseLabel = data.kind === "validation" ? "invalid" : "false";

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border !border-[var(--border)] !bg-[var(--card)]" />
      {shape === "diamond" ? (
        <div className={baseClass}>
          <div className="-translate-y-[1px] -rotate-45">{content}</div>
        </div>
      ) : shape === "parallelogram" ? (
        <div className={baseClass} style={{ clipPath: "polygon(12% 0, 100% 0, 88% 100%, 0 100%)" }}>
          {content}
        </div>
      ) : (
        <div className={baseClass}>{content}</div>
      )}
      {isBranching ? (
        <>
          <Handle
            type="source"
            position={Position.Left}
            id={trueLabel}
            className="!h-3 !w-3 !border-2 !border-[#16A34A] !bg-[#22C55E]"
          />
          <span className="absolute left-0 top-[calc(50%+12px)] -translate-x-full pr-1 text-[9px] font-bold text-[#16A34A]">
            {trueLabel}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={falseLabel}
            className="!h-3 !w-3 !border-2 !border-[#DC2626] !bg-[#EF4444]"
          />
          <span className="absolute right-0 top-[calc(50%+12px)] translate-x-full pl-1 text-[9px] font-bold text-[#DC2626]">
            {falseLabel}
          </span>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border !border-[var(--border)] !bg-[var(--card)]" />
      )}
    </div>
  );
}
```

**Step 2: Update `onConnect` to assign sourceHandle for branching nodes**

Replace the `onConnect` function (lines 341–376) with:

```tsx
function onConnect(params: Connection) {
  if (!params.source || !params.target) return;
  const source = nodes.find((n) => n.id === params.source);
  const target = nodes.find((n) => n.id === params.target);
  if (!source || !target) return;
  if (source.data.kind.startsWith("agent_") && target.data.kind.startsWith("source_")) return;
  const isLoopback = wouldCreateCycle(params.source, params.target, edges);

  const isBranching = source.data.kind === "condition" || source.data.kind === "validation";
  let sourceHandle = params.sourceHandle || undefined;

  if (isBranching && !sourceHandle) {
    const trueLabel = source.data.kind === "validation" ? "valid" : "true";
    const falseLabel = source.data.kind === "validation" ? "invalid" : "false";
    const existingHandles = new Set(
      edges.filter((e) => e.source === params.source).map((e) => e.sourceHandle).filter(Boolean),
    );
    sourceHandle = !existingHandles.has(trueLabel) ? trueLabel : !existingHandles.has(falseLabel) ? falseLabel : undefined;
  }

  let branchLabel: string | undefined;
  if (!isBranching) {
    const existingLabels = new Set(
      edges.filter((e) => e.source === params.source).map((e) => e.label).filter(Boolean),
    );
    if (source.data.kind === "dtmf_menu") {
      for (let i = 1; i <= existingLabels.size + 1; i++) {
        if (!existingLabels.has(`press_${i}`)) { branchLabel = `press_${i}`; break; }
      }
    } else if (existingLabels.size >= 1) {
      for (let i = 1; i <= existingLabels.size + 1; i++) {
        const label = `path_${String.fromCharCode(96 + i)}`;
        if (!existingLabels.has(label)) { branchLabel = label; break; }
      }
    }
  }

  setEdges((eds) =>
    addEdge(
      {
        ...params,
        sourceHandle,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: isLoopback ? { strokeDasharray: "6 4", strokeWidth: 2 } : undefined,
        label: isBranching ? sourceHandle : (isLoopback ? "loopback" : branchLabel),
        labelStyle: isBranching
          ? { fill: sourceHandle === "true" || sourceHandle === "valid" ? "#16A34A" : "#DC2626", fontWeight: 700, fontSize: 11 }
          : undefined,
      },
      eds,
    ),
  );
}
```

**Step 3: Verify visually**

Open `http://100.117.21.47:9999/flows`, load a template with condition/validation nodes. Condition node should show green left handle (true) and red right handle (false). Validation node should show green left (valid) and red right (invalid). Dragging from either handle should create a labeled, colored edge.

**Step 4: Commit**

```bash
git add frontend/src/components/flows/FlowBuilder.tsx
git commit -m "feat(flows): multi-handle branching for condition and validation nodes"
```

---

### Task 5: Schema Propagation

Compute `columns` from the source node and make them available to downstream node rendering.

**Files:**
- Modify: `frontend/src/components/flows/FlowBuilder.tsx` (inside FlowBuilder component)

**Step 1: Add schema computation**

Inside the `FlowBuilder` component, after the `reachableCount` useMemo (line 305), add:

```tsx
const sourceColumns = useMemo<string[]>(() => {
  const sourceNode = nodes.find((n) => SOURCE_KINDS.includes(n.data.kind));
  if (!sourceNode) return [];
  const kind = sourceNode.data.kind;

  // If node has columns set from file upload, use those
  if (sourceNode.data.columns && sourceNode.data.columns.length > 0) {
    return sourceNode.data.columns;
  }

  if (kind === "source_numbers") return ["phone"];
  if (kind === "source_google_contacts") return ["name", "phone", "email"];

  // Parse from sample_csv or table_columns
  const sampleCsv = String(sourceNode.data.config.sample_csv || "");
  if (sampleCsv) {
    const parsed = parseCsv(sampleCsv);
    if (parsed.headers.length > 0) return parsed.headers;
  }
  const tableColumns = String(sourceNode.data.config.table_columns || "");
  if (tableColumns) {
    return tableColumns.split(",").map((c) => c.trim()).filter(Boolean);
  }
  // CSV/XLSX headers from file upload stored in config
  const fileHeaders = String(sourceNode.data.config.file_headers || "");
  if (fileHeaders) {
    return fileHeaders.split(",").map((c) => c.trim()).filter(Boolean);
  }
  return [];
}, [nodes]);
```

**Step 2: Commit**

```bash
git add frontend/src/components/flows/FlowBuilder.tsx
git commit -m "feat(flows): compute source columns schema for downstream nodes"
```

---

### Task 6: Column-Aware Inspector

Replace the generic text inputs in the inspector with column-aware dropdowns for specific node types.

**Files:**
- Modify: `frontend/src/components/flows/FlowBuilder.tsx` (Inspector section, lines 730–915)

**Step 1: Create a ColumnDropdown helper component**

Add this above the `FlowBuilder` component (after `NODE_TYPES` definition, around line 251):

```tsx
function ColumnDropdown({
  columns,
  value,
  onChange,
  label,
  placeholder,
}: {
  columns: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-modern h-10 w-full px-3 text-sm"
      >
        <option value="">{placeholder || "Select column..."}</option>
        {columns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </label>
  );
}
```

**Step 2: Replace the generic inspector with node-specific UIs**

In the Inspector section, find the generic config rendering block (lines 740–757):

```tsx
<div className="mt-3 space-y-2">
  {Object.entries(selectedNode.data.config).length === 0 ? (
    <p className="text-sm text-[var(--muted-foreground)]">No configurable settings for this node.</p>
  ) : (
    Object.entries(selectedNode.data.config).map(([key, value]) => (
      <label key={key} className="block space-y-1">
        ...
      </label>
    ))
  )}
</div>
```

Replace it with:

```tsx
<div className="mt-3 space-y-2">
  {selectedNode.data.kind === "condition" ? (
    <>
      <ColumnDropdown
        columns={sourceColumns}
        value={String(selectedNode.data.config.field || "")}
        onChange={(v) => updateNodeConfig("field", v)}
        label="Field"
      />
      <label className="block space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Operator</span>
        <select
          value={String(selectedNode.data.config.operator || "")}
          onChange={(e) => updateNodeConfig("operator", e.target.value)}
          className="input-modern h-10 w-full px-3 text-sm"
        >
          <option value="">Select...</option>
          {[">", "<", "==", "!=", ">=", "<=", "contains", "startsWith"].map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Value</span>
        <input
          value={String(selectedNode.data.config.value || "")}
          onChange={(e) => updateNodeConfig("value", e.target.value)}
          className="input-modern h-10 w-full px-3 text-sm"
          placeholder="e.g. 30"
        />
      </label>
    </>
  ) : selectedNode.data.kind === "validation" ? (
    <>
      <div className="space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Required Columns</span>
        {sourceColumns.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-1">
            {sourceColumns.map((col) => {
              const required = String(selectedNode.data.config.required_columns || "").split(",").map((c) => c.trim()).filter(Boolean);
              const isChecked = required.includes(col);
              return (
                <label key={col} className="inline-flex items-center gap-1 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      const next = isChecked ? required.filter((c) => c !== col) : [...required, col];
                      updateNodeConfig("required_columns", next.join(","));
                    }}
                    className="h-4 w-4 rounded border-[var(--border)]"
                  />
                  {col}
                </label>
              );
            })}
          </div>
        ) : (
          <input
            value={String(selectedNode.data.config.required_columns || "")}
            onChange={(e) => updateNodeConfig("required_columns", e.target.value)}
            className="input-modern h-10 w-full px-3 text-sm"
            placeholder="name,phone"
          />
        )}
      </div>
    </>
  ) : selectedNode.data.kind === "deduplicate" ? (
    <>
      <ColumnDropdown
        columns={sourceColumns}
        value={String(selectedNode.data.config.dedup_column || "")}
        onChange={(v) => updateNodeConfig("dedup_column", v)}
        label="Dedup Column"
      />
      <label className="block space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Keep</span>
        <select
          value={String(selectedNode.data.config.keep || "first")}
          onChange={(e) => updateNodeConfig("keep", e.target.value)}
          className="input-modern h-10 w-full px-3 text-sm"
        >
          <option value="first">first</option>
          <option value="last">last</option>
        </select>
      </label>
    </>
  ) : selectedNode.data.kind === "normalize_phone" ? (
    <>
      <ColumnDropdown
        columns={sourceColumns}
        value={String(selectedNode.data.config.phone_column || "phone")}
        onChange={(v) => updateNodeConfig("phone_column", v)}
        label="Phone Column"
      />
      <label className="block space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Country Code</span>
        <input
          value={String(selectedNode.data.config.country_code || "+977")}
          onChange={(e) => updateNodeConfig("country_code", e.target.value)}
          className="input-modern h-10 w-full px-3 text-sm"
          placeholder="+977"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Format</span>
        <select
          value={String(selectedNode.data.config.format || "e164")}
          onChange={(e) => updateNodeConfig("format", e.target.value)}
          className="input-modern h-10 w-full px-3 text-sm"
        >
          <option value="e164">E.164</option>
          <option value="national">National</option>
          <option value="international">International</option>
        </select>
      </label>
    </>
  ) : Object.entries(selectedNode.data.config).length === 0 ? (
    <p className="text-sm text-[var(--muted-foreground)]">No configurable settings for this node.</p>
  ) : (
    Object.entries(selectedNode.data.config).map(([key, value]) => (
      <label key={key} className="block space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          {key.replaceAll("_", " ")}
        </span>
        <input
          value={String(value)}
          onChange={(e) => updateNodeConfig(key, e.target.value)}
          className="input-modern h-10 w-full px-3 text-sm"
        />
      </label>
    ))
  )}
</div>
```

**Step 3: Verify visually**

1. Open flows page, start with Manual Table source
2. Click condition node → should see Field dropdown, Operator dropdown, Value text input
3. Click validation node → should see checkboxes for each column
4. Click deduplicate node → should see Dedup Column dropdown, Keep dropdown
5. Click normalize_phone node → should see Phone Column dropdown, Country Code input, Format dropdown

**Step 4: Commit**

```bash
git add frontend/src/components/flows/FlowBuilder.tsx
git commit -m "feat(flows): column-aware inspector for condition, validation, deduplicate, normalize_phone"
```

---

### Task 7: File Upload Drop Zone for CSV/XLSX

**Files:**
- Modify: `frontend/src/components/flows/FlowBuilder.tsx` (Inspector section, after manual table editor)

**Step 1: Add file upload state variables**

Inside the `FlowBuilder` component, after the existing state declarations (around line 289), add:

```tsx
const [fileUploadLoading, setFileUploadLoading] = useState(false);
const [fileUploadError, setFileUploadError] = useState<string | null>(null);
const [filePreviewHeaders, setFilePreviewHeaders] = useState<string[]>([]);
const [filePreviewRows, setFilePreviewRows] = useState<string[][]>([]);
```

**Step 2: Add file upload handler function**

After the `testUrlSource` function (around line 532), add:

```tsx
async function handleFileUpload(file: File) {
  setFileUploadLoading(true);
  setFileUploadError(null);
  try {
    const result = await api.uploadSourceFile(file);
    setFilePreviewHeaders(result.headers);
    setFilePreviewRows(result.preview_rows);
    updateNodeConfig("file_id", result.file_id);
    updateNodeConfig("file_headers", result.headers.join(","));
    updateNodeConfig("total_rows", String(result.total_rows));
    updateNodeConfig("sample_csv", [result.headers.join(","), ...result.preview_rows.map((r) => r.join(","))].join("\n"));
  } catch (err) {
    setFileUploadError(err instanceof Error ? err.message : "Upload failed.");
    setFilePreviewHeaders([]);
    setFilePreviewRows([]);
  } finally {
    setFileUploadLoading(false);
  }
}
```

**Step 3: Add drop zone UI in the Inspector**

After the URL source tester block (after line 897, before the Delete Node button), add:

```tsx
{selectedNode.data.kind === "source_csv" || selectedNode.data.kind === "source_xlsx" ? (
  <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
    <p className="text-sm font-semibold text-[var(--foreground)]">
      {selectedNode.data.kind === "source_csv" ? "CSV" : "XLSX"} File Upload
    </p>
    <div
      className="mt-2 flex min-h-[80px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-foreground)] transition hover:border-[var(--accent)]/50"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileUpload(file);
      }}
      onClick={() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = selectedNode.data.kind === "source_csv" ? ".csv" : ".xlsx";
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) handleFileUpload(file);
        };
        input.click();
      }}
    >
      {fileUploadLoading ? (
        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</span>
      ) : (
        <span>Drop {selectedNode.data.kind === "source_csv" ? ".csv" : ".xlsx"} file here or click to browse</span>
      )}
    </div>
    {fileUploadError ? <p className="mt-2 text-xs text-[#B91C1C]">{fileUploadError}</p> : null}
    {selectedNode.data.config.total_rows ? (
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        {selectedNode.data.config.total_rows} rows, {filePreviewHeaders.length || String(selectedNode.data.config.file_headers || "").split(",").filter(Boolean).length} columns
      </p>
    ) : null}
    {filePreviewHeaders.length > 0 ? (
      <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              {filePreviewHeaders.map((h) => (
                <th key={h} className="px-2 py-1.5 text-left font-semibold text-[var(--foreground)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filePreviewRows.map((row, idx) => (
              <tr key={idx} className="border-b border-[var(--border)] last:border-b-0">
                {filePreviewHeaders.map((_, cIdx) => (
                  <td key={cIdx} className="px-2 py-1.5 text-[var(--muted-foreground)]">{row[cIdx] || ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </div>
) : null}
```

**Step 4: Verify visually**

1. Start flow with CSV Source or XLSX Source
2. Click the source node in inspector
3. Should see file drop zone
4. Drop a CSV file → should upload, show preview table with headers and first 10 rows
5. `sourceColumns` should now reflect the uploaded file's headers

**Step 5: Commit**

```bash
git add frontend/src/components/flows/FlowBuilder.tsx
git commit -m "feat(flows): file upload drop zone for CSV/XLSX sources with preview table"
```

---

### Task 8: Template Edges with sourceHandle

Update templates to use `sourceHandle` on edges from condition/validation nodes, so templates render properly with multi-handle branching.

**Files:**
- Modify: `frontend/src/features/flows/templates.ts`

**Step 1: Update the edge helper to accept optional sourceHandle**

Replace the `edge` function at the top:

```typescript
const edge = (id: string, source: string, target: string, sourceHandle?: string): FlowEdge => ({
  id,
  source,
  target,
  animated: true,
  ...(sourceHandle ? { sourceHandle } : {}),
});
```

**Step 2: Update template edges that come from condition/validation nodes**

**Simple Campaign** (edges from validation `vs`):
```typescript
edges: [
  edge("es1", "ts", "ss"),
  edge("es2", "ss", "vs"),
  edge("es3", "vs", "smss", "valid"),
  edge("es4", "smss", "oks"),
  edge("es5", "vs", "fails", "invalid"),
],
```

**Payment Reminder** (edges from validation `v1`):
```typescript
edges: [
  edge("e1", "t1", "s1"),
  edge("e2", "s1", "v1"),
  edge("e3", "v1", "b1", "valid"),
  edge("e4", "b1", "sms1"),
  edge("e5", "sms1", "voice1"),
  edge("e6", "voice1", "ok1"),
  edge("e7", "v1", "fail1", "invalid"),
],
```

**Appointment Follow-up** (edges from validation `v2` and condition `c2`):
```typescript
edges: [
  edge("e21", "t2", "x1"),
  edge("e22", "x1", "v2"),
  edge("e23", "v2", "c2", "valid"),
  edge("e24", "c2", "sms2", "true"),
  edge("e25", "c2", "w2", "false"),
  edge("e26", "w2", "voice2"),
  edge("e27", "sms2", "ok2"),
  edge("e28", "voice2", "ok2"),
  edge("e29", "v2", "fail2", "invalid"),
],
```

**OTP Demo Call** — no condition/validation branching, stays the same.

**Step 3: Verify visually**

Load each template. Edges from condition/validation nodes should connect from the correct left/right handles with proper labels.

**Step 4: Commit**

```bash
git add frontend/src/features/flows/templates.ts
git commit -m "feat(flows): add sourceHandle to template edges for branching nodes"
```

---

### Task 9: {{ column }} Autocomplete in Message Templates

When typing `{{` in message fields (agent_sms, agent_whatsapp), show a dropdown of available columns.

**Files:**
- Modify: `frontend/src/components/flows/FlowBuilder.tsx` (Inspector section)

**Step 1: Create a ColumnAutocompleteTextarea component**

Add this component above the `FlowBuilder` component:

```tsx
function ColumnAutocompleteTextarea({
  columns,
  value,
  onChange,
  label,
  placeholder,
}: {
  columns: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    const pos = e.target.selectionStart || 0;
    onChange(v);
    setCursorPos(pos);
    // Show popup when {{ is just typed
    const before = v.slice(0, pos);
    setShowPopup(before.endsWith("{{"));
  }

  function insertColumn(col: string) {
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);
    onChange(`${before}${col}}}${after}`);
    setShowPopup(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <label className="relative block space-y-1">
      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        className="input-modern min-h-[80px] w-full resize-y px-3 py-2 text-sm"
        placeholder={placeholder}
      />
      {showPopup && columns.length > 0 ? (
        <div className="absolute left-0 z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {columns.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => insertColumn(col)}
              className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              {"{{"}
              {col}
              {"}}"}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}
```

Note: You'll need to add `React` to the import at the top: change `import { useEffect, useMemo, useState }` to `import React, { useEffect, useMemo, useState }`.

**Step 2: Use the autocomplete textarea for SMS/WhatsApp message fields**

In the inspector's column-aware section (Task 6), add cases for `agent_sms` and `agent_whatsapp` before the generic fallback:

```tsx
) : selectedNode.data.kind === "agent_sms" || selectedNode.data.kind === "agent_whatsapp" ? (
  <>
    <ColumnAutocompleteTextarea
      columns={sourceColumns}
      value={String(selectedNode.data.config.message || "")}
      onChange={(v) => updateNodeConfig("message", v)}
      label="Message"
      placeholder="Namaste {{name}}, type {{ for column autocomplete"
    />
    {selectedNode.data.kind === "agent_whatsapp" ? (
      <label className="block space-y-1">
        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Template Name</span>
        <input
          value={String(selectedNode.data.config.template_name || "")}
          onChange={(e) => updateNodeConfig("template_name", e.target.value)}
          className="input-modern h-10 w-full px-3 text-sm"
          placeholder="Optional WhatsApp template"
        />
      </label>
    ) : null}
  </>
```

**Step 3: Verify visually**

1. Click SMS Agent node in inspector
2. Type `Namaste {{` in the message field
3. Popup should appear with column names (name, phone, etc.)
4. Click a column → it inserts `{{name}}` and closes popup

**Step 4: Commit**

```bash
git add frontend/src/components/flows/FlowBuilder.tsx
git commit -m "feat(flows): column autocomplete popup for {{ in message templates"
```

---

### Task 10: Source Node Column Badge

Show a small badge on source nodes displaying column count.

**Files:**
- Modify: `frontend/src/components/flows/FlowBuilder.tsx` (FlowNodeCard)

**Step 1: Update FlowNodeCard to show column badge on source nodes**

In the `FlowNodeCard` component, inside the `content` JSX, after the `<div>` that shows label and kind, add a column badge for source nodes. Change the `content` const to:

```tsx
const content = (
  <div className="flex items-center gap-2 text-[var(--foreground)]">
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]">
      {nodeIcon[data.kind]}
    </span>
    <div>
      <p className="text-sm font-semibold">{data.label}</p>
      <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {data.kind.replaceAll("_", " ")}
      </p>
    </div>
    {data.kind.startsWith("source_") && data.columns && data.columns.length > 0 ? (
      <span className="ml-auto rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-bold text-white">
        {data.columns.length} cols
      </span>
    ) : null}
  </div>
);
```

**Step 2: Propagate columns to source node data**

In the `sourceColumns` useMemo, after computing columns, also set them on the source node. Instead, create a `useEffect` after the `sourceColumns` useMemo that syncs columns onto the source node:

```tsx
useEffect(() => {
  if (sourceColumns.length === 0) return;
  const sourceNode = nodes.find((n) => SOURCE_KINDS.includes(n.data.kind));
  if (!sourceNode) return;
  const existing = sourceNode.data.columns;
  if (existing && existing.length === sourceColumns.length && existing.every((c, i) => c === sourceColumns[i])) return;
  setNodes((prev) =>
    prev.map((n) =>
      n.id === sourceNode.id ? { ...n, data: { ...n.data, columns: sourceColumns } } : n,
    ),
  );
}, [sourceColumns]);
```

**Step 3: Verify visually**

Source node on the canvas should show a badge like "4 cols" when columns are available.

**Step 4: Commit**

```bash
git add frontend/src/components/flows/FlowBuilder.tsx
git commit -m "feat(flows): column count badge on source nodes"
```

---

### Task 11: Update Validation to Check Column References

**Files:**
- Modify: `frontend/src/features/flows/validation.ts`

**Step 1: Add condition node column validation**

In `validateFlow`, after the existing condition validation block (line 91-98), enhance it to check that the `field` references a valid column when columns are available:

Find:
```typescript
if (node.data.kind === "condition" && (!cfg.field || !cfg.operator || !cfg.value)) {
```

After that block, add:

```typescript
if (node.data.kind === "condition" && cfg.field) {
  const sourceNode = nodes.find((n) =>
    n.data.kind === "source_csv" ||
    n.data.kind === "source_xlsx" ||
    n.data.kind === "source_file" ||
    n.data.kind === "source_numbers" ||
    n.data.kind === "source_manual_table" ||
    n.data.kind === "source_google_contacts" ||
    n.data.kind === "source_url_json" ||
    n.data.kind === "source_url_csv",
  );
  if (sourceNode?.data.columns && sourceNode.data.columns.length > 0) {
    if (!sourceNode.data.columns.includes(String(cfg.field))) {
      issues.push({
        id: `condition-bad-field-${node.id}`,
        severity: "warning",
        nodeId: node.id,
        message: `Condition field "${cfg.field}" is not in source columns: ${sourceNode.data.columns.join(", ")}`,
      });
    }
  }
}
```

**Step 2: Commit**

```bash
git add frontend/src/features/flows/validation.ts
git commit -m "feat(flows): validate condition field references against source columns"
```

---

### Task 12: Final Visual Verification and Cleanup

**Step 1: Test all features end-to-end**

Open `http://100.117.21.47:9999/flows` and test:

1. **Source selection** → pick Manual Table → should see table editor with column controls
2. **Schema propagation** → columns from manual table appear in condition/validation dropdowns
3. **CSV upload** → pick CSV Source → drop a .csv file → see preview table with headers and 10 rows
4. **XLSX upload** → pick XLSX Source → drop a .xlsx file → see preview table
5. **Condition node** → 3-part inspector: Field dropdown, Operator dropdown, Value input
6. **Validation node** → checkboxes for required columns
7. **Deduplicate node** → Dedup Column dropdown, Keep dropdown
8. **Normalize Phone** → Phone Column dropdown, Country Code, Format
9. **Branching handles** → condition has green left (true) + red right (false); validation has green left (valid) + red right (invalid)
10. **Edge labels** → edges from branching nodes show "true"/"false" or "valid"/"invalid" labels with color
11. **Templates** → all 4 templates load with correct handle connections
12. **{{ autocomplete** → SMS/WhatsApp message field shows column popup on `{{`
13. **Column badge** → source node shows "N cols" badge
14. **Validation warnings** → if condition references non-existent column, warning appears

**Step 2: Commit any cleanup**

```bash
git add -A
git commit -m "chore(flows): flow builder v2 polish and cleanup"
```
