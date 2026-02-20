# Flow Builder Operational Features Design

**Date:** 2026-02-20
**Status:** Approved

## Problem

The flow builder can execute campaigns end-to-end (source → process → dispatch), but lacks operational controls: no way to test without sending real messages, no sender number selection, no actual rate limiting, and no visibility into run results.

## Features

### 1. Dry-Run / Test Mode

**Goal:** Preview what a flow would do without dispatching real messages.

**Backend:**
- Add `mode: "dry_run" | "live"` parameter to `POST /definitions/{flow_id}/run`
- In `flow_orchestrator.run_flow()`, when `mode == "dry_run"`:
  - Execute all nodes normally (sources, processing, conditions)
  - For action nodes (agent_sms, agent_voice, agent_whatsapp), skip Twilio dispatch
  - Instead, render the message template and record as `{ status: "simulated", rendered_message }` in step metadata
  - Record all step results exactly as live mode (row counts, branching, timing)
- Mark run status as `"completed"` with a `mode: "dry_run"` field on FlowRun

**Frontend:**
- Add "Test Run" button next to "Run Flow" in FlowToolbar
- After run completes, show RunResultsPanel (slide-in from right)
- Summary at top: "480 SMS would send, 20 filtered by validation"
- Expandable accordion per step: row counts, sample rows, rendered messages for action nodes

### 2. Sender Number Selection

**Goal:** Let users pick which Twilio number to use per flow.

**Backend:**
- Add `list_phone_numbers()` to `TwilioProvider`:
  ```python
  def list_phone_numbers(self) -> list[dict]:
      numbers = self._client.incoming_phone_numbers.list()
      return [{"sid": n.sid, "number": n.phone_number, "friendly_name": n.friendly_name,
               "capabilities": {"sms": n.capabilities.get("sms"), "voice": n.capabilities.get("voice")}}
              for n in numbers]
  ```
- Add `GET /flows/phone-numbers` endpoint (cache 5 min via simple TTL dict)
- Wire `sender_number` node into orchestrator: when encountered, inject `_from_number` into row context
- In `dispatch_sms/dispatch_voice/dispatch_whatsapp`: read `row.get("_from_number", provider.default_from_number)`

**Frontend:**
- `sender_number` node inspector: dropdown of available numbers from `GET /flows/phone-numbers`
- SMS/Voice/WhatsApp agent inspectors: optional "From Number" override dropdown
- Show number capabilities (SMS-capable, Voice-capable) as badges

### 3. Rate Limiting (Queue & Drip-Feed)

**Goal:** Throttle message dispatch to respect configured per-minute limits.

**Backend:**
- In `flow_orchestrator._execute_step()`, when processing an action node:
  - Look for `rate_limit` config on the action node itself or on upstream `rate_limit` node
  - If `per_minute` is set, dispatch rows in batches with `asyncio.sleep(60 / per_minute)` between each
  - Update `FlowStepResult` progressively (input_row_count stays fixed, output_row_count increments)
  - Update `FlowRun.current_node_id` and metadata with progress: `{ dispatched: N, total: M }`
- The Celery task stays alive during throttled dispatch (already configured with `task_acks_late=True`)

**Frontend:**
- Rate limit inspector already works (per_minute config)
- Add live progress: when a run is active, poll run status and show badge on each canvas node
- StatusBar shows "Sending... 120/480" during active run

### 4. Run Status & Results UI

**Goal:** See what happened after a run — per-step results, errors, row counts.

**Backend — New Endpoints:**
- `GET /flows/runs` — list runs for current user, newest first, paginated
  - Response: `[{ id, flow_id, flow_name, status, contact_count, started_at, completed_at, mode }]`
- `GET /flows/runs/{run_id}` — full run with step results
  - Response: `{ ...run, steps: [{ node_id, node_kind, status, input_row_count, output_row_count, rows_true, rows_false, error, metadata, started_at, completed_at }] }`

**Frontend — Canvas RunResultsPanel:**
- Slide-in panel (replaces inspector) after run completes or during active run
- Poll `GET /flows/runs/{run_id}` every 2s while status is "running"
- Per-step accordion: node label, status badge, row counts, timing, errors
- For action steps: show dispatch success/failure counts, sample rendered messages
- For condition/validation steps: show true/false split counts

**Frontend — Runs History Page (`/dashboard/flows/runs`):**
- Table: flow name, status pill, contact count, duration, timestamp
- Click row → drill into step breakdown
- Filter by status (completed/failed/cancelled)

## Data Model Changes

**FlowRun — add field:**
- `mode` (String(20), default="live") — "live" or "dry_run"

**FlowStepResult — no changes** (existing schema sufficient)

## Architecture

```
FlowToolbar [Run Flow] [Test Run]
       ↓                ↓
POST /run (mode=live)  POST /run (mode=dry_run)
       ↓                ↓
   Celery task ──→ flow_orchestrator.run_flow(mode)
       ↓
   Per-step execution
       ↓
   Action nodes: mode=="live" → Twilio | mode=="dry_run" → simulate
       ↓
   FlowStepResult records saved
       ↓
Frontend polls GET /runs/{id} → RunResultsPanel
```

## Non-Goals (for now)

- Flow sharing/collaboration (separate feature)
- Wait node with actual delays (needs Celery scheduled tasks)
- Business hours checking (needs timezone-aware scheduling)
- Error handler retries (needs dead-letter queue pattern)
- End node differentiation (success vs failure callbacks)
