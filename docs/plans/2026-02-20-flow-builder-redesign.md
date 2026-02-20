# Flow Builder Redesign

## Problem

The current FlowBuilder is a single scrolling column with all panels stacked vertically.
The ReactFlow canvas is barely visible. Users can't figure out how to connect nodes.
There's no data context propagation — action nodes don't know what variables exist.
31 nodes in a flat list is overwhelming.

## Design Decisions

- **Wizard-first** entry for new flows (source setup before canvas)
- **Both modes** for nodes: compact pills when unconfigured, rich cards when configured
- **Slide-in right panel** inspector when clicking a node
- **Visual rule builder + expression toggle** for conditions
- **Variable context propagation** from source through the graph

---

## Phase 1: Source Wizard

When creating a new flow, a 3-step wizard runs before the canvas opens.

### Step 1: Choose Data Source

Full-page step with 7 source cards in a 2-column grid:

```
Manual Table    |  Import CSV
Import XLSX     |  JSON URL Hook
CSV URL Hook    |  Google Contacts
Paste Numbers   |
```

Each card shows icon + title + 1-line description.
Click a card → proceeds to Step 2 with that source type.

### Step 2: Preview & Validate

- **Manual Table**: Inline editable spreadsheet (headers + rows)
- **CSV/XLSX**: File upload → parsed table preview
- **URL sources**: URL input → fetch → table preview
- **Paste Numbers**: Textarea → parsed into phone column

All show:
- Editable column headers (rename, add, delete columns)
- Row count + column count summary
- Validation indicators (phone format check, required fields)
- "Add Column" button for computed/extra columns

### Step 3: Canvas Opens

Trigger + Source nodes are pre-placed and connected on the canvas.
The source node shows the column names and row count.
The user proceeds to build the rest of the flow.

Re-opening an existing flow skips the wizard and goes straight to canvas.

---

## Phase 2: Canvas Layout

### Screen Layout

```
+------+----------------------------------+-----------+
| Rail |           Canvas                  | Inspector |
| 48px |         (ReactFlow)               |   320px   |
|      |                                   | (slide-in)|
|      |                                   |           |
+------+----------------------------------+-----------+
|             Status Bar (32px)                        |
+------------------------------------------------------+
```

### Top Bar (48px)

```
[< Back]  "Flow Name" (editable)     [Validate] [Save] [Run >>]
```

- Back: returns to flow list
- Flow name: click to rename inline
- Validate: runs structural checks, shows error drawer
- Save: persists to backend
- Run: saves + triggers backend execution, shows status

### Left Rail (48px wide, icon-only by default)

A slim vertical strip with grouped node categories.
Hover expands to show labels. Click a category → shows nodes.

```
[+] ← opens full add-node popover
---
Triggers (icon)
Processing (icon)
Actions (icon)
Control (icon)
End (icon)
```

Clicking the [+] or a category opens a popover/dropdown with nodes:

```
+ Add Node
-----------
PROCESSING
  Validation         Schema + row checks
  Deduplicate        Remove duplicates
  Normalize Phone    Standardize format
  Condition          If/else routing

ACTIONS
  SMS Agent          Send SMS message
  Voice Agent        Place voice call
  WhatsApp Agent     Send WhatsApp

CONTROL
  Wait               Delay execution
  Rate Limit         Throttle throughput
  Merge              Combine branches

END
  Success            Flow completed
  Failure            Flow failed
```

Source nodes are NOT in the palette (handled by wizard).
Trigger nodes are NOT in the palette (auto-placed by wizard).
Total: ~12 nodes in palette, down from 31.

### Canvas (center, all remaining space)

- ReactFlow with dotted grid background
- Zoom controls in bottom-right: [+] [-] [fit] [reset]
- Empty state: dashed box "Add your first step" with [+] button
- Nodes are draggable
- Connections by dragging from output handle to input handle
- Connection handles: small circles on left (input) and right (output)
- Handles enlarge + glow on hover to indicate draggability
- Right-click node → context menu: Delete, Duplicate, Disconnect

### Right Inspector Panel (320px, slides in on node click)

Opens when a node is selected. Closes when clicking canvas background or [x].

Content varies by node type (see Node Inspector section below).

All inspectors show:
- Node type icon + name at top
- Available upstream variables as clickable chips
- Configuration fields specific to the node type
- "Delete Node" button at bottom

### Bottom Status Bar (32px)

```
[green dot] 5 nodes · 15 contacts · 2 errors · Valid
```

Click opens validation drawer overlay with error/warning list.

---

## Phase 3: Node Design

### Compact Mode (unconfigured)

Rounded rectangle, 140x40px:
- Left handle (input circle)
- Icon + Label centered
- Right handle (output circle)

```
     +--------------+
  o--| [icon] Label |--o
     +--------------+
```

### Expanded Mode (configured, auto-expands)

Rounded rectangle, 200x80px:
- Header: icon + label
- Body: 1-line config preview (truncated)
- Footer: variable/contact count badge

```
  +------------------------+
  | [icon] SMS Agent       |
  |------------------------|
  | "Hi {{name}}, your..." |
o-| 3 vars · 15 contacts  |-o
  +------------------------+
```

### Condition Node (diamond-ish)

Still rectangular but with distinct styling (dashed border, diamond icon):
- Shows rule summary: "age > 30"
- Two output handles: right (true) and bottom (false)
- True/false labels on the edges

```
  +------------------+
  | [diamond] age>30 |--o TRUE
o-| 8 match          |
  +--------+---------+
           o FALSE
```

### Color Coding

- Triggers: blue
- Sources: green
- Processing: yellow/amber
- Actions: purple
- Control: gray
- End Success: green
- End Failure: red
- Condition: orange

---

## Phase 4: Node Inspectors

### Variable Context

The source wizard establishes column names (e.g., name, phone, age).
These propagate downstream through the graph.

Every inspector shows an "Available Variables" section:

```
Available Variables
[name] [phone] [age] [gender]
```

Clicking a chip inserts `{{name}}` at cursor position in any text field.
Typing `{{` in any text field triggers autocomplete dropdown.

### SMS Agent Inspector

```
+-----------------------------+
| SMS Agent              [x]  |
|-----------------------------|
| Message:                    |
| +-------------------------+ |
| | Hi {{name}}, your       | |
| | appointment is...       | |
| +-------------------------+ |
|                             |
| Available Variables         |
| [name] [phone] [age]       |
|                             |
| Preview (sample row):       |
| "Hi Ram, your appoint..."  |
|                             |
| [Delete Node]               |
+-----------------------------+
```

### Voice Agent Inspector

```
+-----------------------------+
| Voice Agent            [x]  |
|-----------------------------|
| Script (TTS):               |
| +-------------------------+ |
| | Namaste {{name}}, ...   | |
| +-------------------------+ |
| Language: [Nepali v]        |
|                             |
| Available Variables         |
| [name] [phone] [age]       |
|                             |
| Preview (sample row):       |
| "Namaste Ram, ..."         |
|                             |
| [Delete Node]               |
+-----------------------------+
```

### Condition Inspector

```
+-----------------------------+
| Condition              [x]  |
|-----------------------------|
| Match: [ALL v] of rules    |
|                             |
| [age   v] [>  v] [30    ] x|
|         AND                 |
| [city  v] [== v] [Ktm   ] x|
|                             |
| [+ Add Rule]               |
|                             |
| [Switch to expression >>]  |
|                             |
| Preview:                    |
| TRUE:  8 contacts           |
| FALSE: 7 contacts           |
|                             |
| [Delete Node]               |
+-----------------------------+
```

Expression mode (toggle):

```
| Expression:                 |
| +-------------------------+ |
| | age > 30 && city == ... | |
| +-------------------------+ |
| Autocomplete: {{age}} ...   |
```

### Validation Inspector

```
+-----------------------------+
| Validation             [x]  |
|-----------------------------|
| Required columns:           |
| [x] name                   |
| [x] phone                  |
| [ ] age                    |
| [ ] gender                 |
|                             |
| Preview:                    |
| VALID:   13 contacts        |
| INVALID:  2 contacts        |
|                             |
| [Delete Node]               |
+-----------------------------+
```

---

## Phase 5: Loops & Iteration

### Implicit Iteration (v1)

The orchestrator already processes each contact row through every node.
This is made visible by showing contact counts on each node:

```
[Source: 100] --> [Validate: 85 valid] --> [Condition: 50 match]
                        |                        |
                   [End Fail: 15]           [SMS: 50 sent]
                                                 |
                                            [End OK: 50]
```

Each node badge shows how many contacts passed through it.

### Retry / Error Loops (v2, future)

An error handler node can wire back to an action node.
The edge is styled as a dashed "retry" line with a retry count label.
Not implemented in v1.

---

## Implementation Scope

### What changes

1. **New component: SourceWizard** — 3-step wizard before canvas
2. **Rewrite FlowBuilder layout** — from single column to rail+canvas+inspector
3. **New component: NodeCard** — compact/expanded ReactFlow custom node
4. **New component: NodeInspector** — slide-in right panel with type-specific forms
5. **New component: ConditionRuleBuilder** — visual rule builder with AND/OR
6. **Variable context system** — compute upstream columns for each node
7. **New component: AddNodePopover** — grouped node picker
8. **Rewrite toolbar** — slim top bar with name/save/run

### What stays

- ReactFlow library (already installed)
- Backend APIs (no changes needed)
- Flow compiler, orchestrator, executors (no changes)
- All existing node types and their configs
- Flow save/load/run wiring

### What gets removed

- The scrolling single-column layout
- The flat 31-node palette list
- Templates section (can add back later as a "Start from template" option in wizard)
- Execution Preview section (replaced by status bar + run console)
