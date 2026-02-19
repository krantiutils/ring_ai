# Flow Execution Engine Design

**Date:** 2026-02-19
**Status:** Approved

## Problem

The flow builder creates visual flowcharts, but there's no backend engine to execute them. We need to convert the visual DAG into a runnable algorithm that cron jobs and manual triggers can invoke, with per-row routing through condition/validation branches.

## Decisions

- **Data models:** New tables (FlowDefinition, FlowRun, FlowStepResult) — clean separation from campaigns
- **Execution:** Celery + Redis — proper retries, distributed workers, task visibility
- **Branching:** Per-row — each contact row independently evaluated at condition/validation nodes
- **Architecture:** Hybrid orchestrator + dispatch workers — orchestrator walks graph, fans out to workers for SMS/Voice/WhatsApp
- **Testing:** Equal weight on graph logic unit tests and full-pipeline integration tests with mocked services

## Data Models

### FlowDefinition

Persisted flow graph (what the user builds in the UI).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| user_id | UUID FK | Owner |
| name | str | Flow name |
| nodes | JSONB | ReactFlow nodes array |
| edges | JSONB | ReactFlow edges array |
| trigger_config | JSONB | `{ type: "schedule", cron: "0 10 * * *" }` or `{ type: "manual" }` |
| status | enum | draft, active, paused, archived |
| created_at | datetime | |
| updated_at | datetime | |

### FlowRun

One execution of a flow.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| flow_id | UUID FK | Which FlowDefinition |
| status | enum | pending, running, waiting, completed, failed, cancelled |
| started_at | datetime | |
| completed_at | datetime | nullable |
| current_node_id | str | Which node the orchestrator is at |
| contact_rows | JSONB | Full rowset loaded from source |
| error | text | nullable |
| celery_task_id | str | For tracking/cancelling |

### FlowStepResult

Execution result per node per run.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| flow_run_id | UUID FK | |
| node_id | str | Matches ReactFlow node id |
| node_kind | str | |
| status | enum | pending, running, completed, failed, skipped |
| input_row_count | int | |
| output_row_count | int | |
| rows_true | JSONB | nullable — rows routed to true/valid branch |
| rows_false | JSONB | nullable — rows routed to false/invalid branch |
| error | text | nullable |
| started_at | datetime | |
| completed_at | datetime | |
| metadata_ | JSONB | Node-specific results (sms_sid list, dispatch errors) |

## Graph Compiler

Pure function that converts ReactFlow JSON into an execution plan.

**Input:** `nodes[]` + `edges[]` from FlowDefinition

**Output:**

```python
@dataclass
class ExecutionStep:
    node_id: str
    node_kind: str
    config: dict
    inputs: dict[str, str]    # { "default": parent_node_id }
    outputs: dict[str, str]   # { "true": next_id, "false": other_id } or { "default": next_id }

@dataclass
class ExecutionPlan:
    steps: list[ExecutionStep]          # topologically sorted
    trigger_node_id: str
    source_node_id: str
    branch_points: dict[str, list[str]] # node_id -> [true_target, false_target]
```

**Algorithm:**
1. Find trigger node (exactly one)
2. BFS from trigger following edges
3. Topological sort — every node comes after its inputs
4. For each node, resolve inputs and outputs respecting `sourceHandle` on edges
5. Validate: no orphans, all branches terminate at end nodes, no unintended cycles

## Execution Engine

### Two Celery task types:

**`orchestrate_flow(flow_run_id)`** — walks the graph

```
Load FlowRun + FlowDefinition
Compile execution plan
For each step in plan:
  1. Check FlowRun not cancelled
  2. Load input rows (from source, or from parent step's output)
  3. Execute node:
     - Source → load data, produce rowset
     - Validation → split rows into valid/invalid
     - Condition → evaluate row[field] op value per row, split true/false
     - Deduplicate → remove dupes by column
     - Normalize Phone → transform phone column
     - Wait → save state, schedule self with countdown, return (frees worker)
     - Action (SMS/Voice/WA) → fan out to dispatch_action workers (Celery group), wait for results
     - End → mark FlowRun completed/failed
  4. Record FlowStepResult
  5. Advance to next node
```

**`dispatch_action(flow_run_id, node_id, contact_row)`** — one per contact per action node

```
Load node config
Render message template with row variables ({{name}}, {{phone}})
Execute:
  - agent_sms → Twilio send_sms()
  - agent_voice → TTS + Twilio create_call()
  - agent_whatsapp → WhatsApp API
  - action_webhook → httpx POST
Deduct credits
Return result
```

### Key behaviors

- **Branching:** Orchestrator carries `row_sets: dict[str, list[dict]]` mapping node_id to rows. Condition splits write `rows_true`/`rows_false` into FlowStepResult. Downstream nodes pick the correct set based on the edge's `sourceHandle`.
- **Wait:** Orchestrator persists state, schedules itself with `countdown=minutes*60`. On resume, reads `current_node_id` and picks up.
- **Cancellation:** Set FlowRun status to `cancelled`. Orchestrator checks at each step, exits early.
- **Rate limit node:** Sets concurrency limit on the Celery dispatch group.
- **Error handler:** Catches dispatch failures, retries up to configured count.

## Testing Strategy

### Layer 1: Graph compiler unit tests (pure logic)

- Linear flow: trigger->source->sms->end produces correct topological order
- Condition branch: sourceHandle routing resolves to distinct downstream nodes
- Validation branch: valid/invalid paths traced correctly
- Diamond merge: condition->[A,B]->merge->end handles convergence
- Orphan node detection: compiler rejects unreachable nodes
- Missing end node: compiler rejects dangling branches
- Cycle detection: compiler rejects loops without explicit loop node

### Layer 2: Node executor unit tests (one node kind at a time)

- Condition `age > 30` with mixed rows: correct split counts
- Condition `name == "Ram"` string equality
- Condition `phone contains "+977"` string operator
- Validation with required columns: missing-column rows go to invalid
- Validation with all columns present: all rows go to valid
- Deduplicate by phone, keep first vs keep last
- Normalize phone: `9800000000` with `+977` prefix -> `+9779800000000`
- Source manual_table: parses sample_csv into row dicts
- Source CSV file: loads from file_id
- Wait node: returns resume_after delay without blocking

### Layer 3: Orchestrator integration tests (node-against-node)

- trigger->source->validation(valid->sms, invalid->end): valid rows reach SMS, invalid skip
- source->condition->[sms, voice]->end: rows split by condition to different channels
- source->validation->condition->sms->end: chained filtering
- source->deduplicate->sms->end: no double-messaging
- source->normalize->validation->sms: normalized phone passes validation
- source->condition(true->wait->voice, false->sms)->end: wait branch resumes after delay
- source->validation(all invalid)->end_failure: zero valid rows, no dispatch
- source->sms(all fail)->error_handler->end: dispatch failures trigger error handler
- 100 rows through 50/50 condition: no rows lost or duplicated
- Cancel mid-execution: orchestrator stops, no further dispatches

### Layer 4: End-to-end with mocked Twilio

- Full SMS flow from JSON: load -> execute -> verify N SMS dispatched to correct phones
- Full voice flow with TTS: verify TTS + Twilio call initiated
- Scheduled flow triggers at cron time via Celery beat
- Credit deduction: only dispatched rows charged, not filtered/invalid
- FlowStepResult audit trail: every node has result row with correct counts

### Test infrastructure

- In-memory SQLite for DB (existing conftest.py pattern)
- `celery.conf.update(task_always_eager=True)` for synchronous test execution
- httpx mock for Twilio/webhook calls
- Fixture factory: `make_flow(nodes, edges)` creates FlowDefinition + compiles plan

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `backend/app/models/flow_definition.py` | FlowDefinition SQLAlchemy model |
| `backend/app/models/flow_run.py` | FlowRun + FlowStepResult models |
| `backend/app/models/__init__.py` | Register new models |
| `backend/app/services/flow_compiler.py` | Graph compiler: nodes+edges -> ExecutionPlan |
| `backend/app/services/flow_executor.py` | Node executors: one function per node kind |
| `backend/app/services/flow_orchestrator.py` | Celery tasks: orchestrate_flow + dispatch_action |
| `backend/app/api/v1/endpoints/flows.py` | New endpoints: save/load/run/cancel flow |
| `backend/app/schemas/flows.py` | Pydantic schemas for flow CRUD + run |
| `backend/app/core/celery_app.py` | Celery configuration + Redis broker |
| `backend/tests/test_flow_compiler.py` | Layer 1 tests |
| `backend/tests/test_flow_executors.py` | Layer 2 tests |
| `backend/tests/test_flow_orchestrator.py` | Layer 3+4 tests |

## What Stays the Same

- Twilio integration (voice, SMS) — reused as-is
- TTS synthesis pipeline (Edge-TTS, Azure)
- Credit deduction logic
- Template rendering with `{{variable}}` syntax
- Existing campaign system (untouched, flows are separate)
