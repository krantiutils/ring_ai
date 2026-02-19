# Flow Builder v2: Column-Aware Programmable Flowchart

**Date:** 2026-02-19
**Status:** Approved

## Problem

The flow builder is cluttered. Data sources don't require proper setup before use. Downstream nodes use free-text inputs instead of referencing actual column names. Condition and validation nodes have a single output path instead of distinct true/false branching.

## Design

### 1. Schema Propagation

A `columns: string[]` array is derived from the source node and made available to all downstream nodes.

**Schema sources by node kind:**
- `source_manual_table`: parsed from `sample_csv` headers
- `source_csv` / `source_xlsx`: returned by backend file-upload endpoint (`headers` field)
- `source_url_json` / `source_url_csv`: returned by existing URL preview endpoint
- `source_numbers`: fixed `["phone"]`
- `source_google_contacts`: fixed `["name", "phone", "email"]`

The schema is computed as a `useMemo` in `FlowBuilder` by finding the source node and extracting its columns. It's passed to the Inspector for rendering column-aware dropdowns.

### 2. Multi-Handle Branching Nodes

Condition and Validation nodes get **left and right output handles** instead of a single bottom handle.

**Condition node (diamond):**
- Input: top handle (unchanged)
- Left output: `sourceHandle="true"` — green colored, labeled "true"
- Right output: `sourceHandle="false"` — red colored, labeled "false"

**Validation node (rectangle):**
- Input: top handle (unchanged)
- Left output: `sourceHandle="valid"` — green colored, labeled "valid"
- Right output: `sourceHandle="invalid"` — red colored, labeled "invalid"

**Implementation in FlowNodeCard:**
- Detect branching nodes: `kind === "condition" || kind === "validation"`
- Replace single bottom `Handle` with two `Handle` components at `Position.Left` and `Position.Right`
- Each handle has a unique `id` prop (e.g. `"true"`, `"false"`)
- Style handles with color: green for pass/true, red for fail/false
- Add small labels next to handles

**Edge changes:**
- `onConnect` auto-assigns `sourceHandle` based on existing connections
- Templates updated to use `sourceHandle` on branching edges
- Edge rendering uses `sourceHandle` to determine label + color

### 3. Data Source Setup

When user picks a data source, the Inspector shows the appropriate setup UI:

**Manual Table** (already exists, keep as-is):
- Inline table editor with Add Column / Add Row
- Save/Load to backend
- Columns extracted from table headers

**CSV / XLSX (new):**
- Inspector shows a file drop zone with drag-and-drop
- On file drop: `POST /api/v1/flows/sources/file-upload` with multipart form
- Backend parses file, returns `{ headers: string[], preview_rows: string[][], total_rows: number, file_id: string }`
- Inspector renders table preview (first 10 rows) in a compact table
- Node config stores: `file_id`, `headers` (comma-separated), `total_rows`

**URL JSON / URL CSV** (already exists, keep as-is):
- Fetch & Preview button
- Table preview in Inspector

**Numbers:**
- Text input for comma-separated numbers (already exists)
- Schema is fixed `["phone"]`

**Google Contacts:**
- Placeholder UI (import not yet implemented)
- Schema is fixed `["name", "phone", "email"]`

### 4. Column-Aware Inspector

When a downstream node is selected, its Inspector renders dropdowns populated with the source schema columns.

**Condition node:**
```
Field:    [age          v]   <- dropdown of columns
Operator: [>            v]   <- dropdown: >, <, ==, !=, >=, <=, contains, startsWith
Value:    [30             ]  <- text input
```

**Validation node:**
```
Required columns: [x] name  [x] phone  [ ] age  [ ] gender
                   <- checkboxes from schema columns
```

**Deduplicate node:**
```
Dedup column: [phone  v]  <- dropdown of columns
Keep:         [first  v]  <- dropdown: first, last
```

**Normalize Phone node:**
```
Phone column:  [phone  v]  <- dropdown of columns
Country code:  [+977     ]
Format:        [e164   v]  <- dropdown: e164, national, international
```

**Agent SMS / WhatsApp:**
```
Message: [Namaste {{  ]] <- typing {{ triggers column autocomplete popup
```
The `{{` autocomplete popup shows available columns from schema.

### 5. Visual Changes

**Condition diamond:** Left/right handles with colored dots (green=true, red=false) and small text labels.

**Validation rectangle:** Same left/right handle pattern (green=valid, red=invalid).

**Source parallelogram:** Add a small badge showing column count, e.g. "4 cols".

### 6. Backend: File Upload Endpoint

```
POST /api/v1/flows/sources/file-upload
Content-Type: multipart/form-data
Body: file (CSV or XLSX)

Response 200:
{
  "file_id": "uuid",
  "headers": ["name", "phone", "age", "gender"],
  "preview_rows": [["Ram", "+977...", "34", "male"], ...],
  "total_rows": 150
}
```

The backend:
1. Accepts CSV or XLSX file
2. Parses headers and first 10 rows
3. Stores file temporarily (or returns just the parsed data)
4. Returns structured response

Use pandas or openpyxl for XLSX parsing (already have pypdf in deps, similar pattern).

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/features/flows/builderTypes.ts` | Add `columns?: string[]` to `FlowNodeData`, add `sourceHandle?: string` to edge type |
| `frontend/src/components/flows/FlowBuilder.tsx` | Multi-handle node rendering, schema computation, column-aware Inspector UI, file upload drop zone, `{{` autocomplete |
| `frontend/src/features/flows/validation.ts` | Validate condition/validation nodes reference valid columns |
| `frontend/src/features/flows/templates.ts` | Update edges with `sourceHandle` for branching nodes |
| `backend/app/api/v1/endpoints/flows.py` | New file-upload endpoint |
| `backend/app/api/v1/router.py` | Register flows router |

## What Stays the Same

- 3-column layout: palette | canvas | inspector
- Node palette and template system
- Save/Load draft to localStorage
- All 31+ node types and their shapes
- Dark mode, minimap, controls
- Existing validation rules
