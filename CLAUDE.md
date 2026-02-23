# Claude Handover (ring_ai / crew/dave)

Last updated: 2026-02-23

## Landed and pushed
- Commit: `6575bd3`
- Message: `feat(flows): add wait-for-reply branching, intuitive set-fields UX, and multi-source routing`
- Remote: `origin/main` updated (`465730f..6575bd3`)

## What shipped in `6575bd3`
- Flow UX
  - Route-style edges (smooth-step).
  - New node placement is centered in viewport (not random off-screen).
  - New node highlight on insert.
  - Shortcuts restored:
    - `Ctrl/Cmd+Z` undo
    - `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` redo
    - `Ctrl/Cmd+R` run
- Flow behavior
  - Condition supports explicit upstream source selection (`input_from`) for multi-source flows.
  - Added/expanded nodes:
    - `enrich_columns` (Set Fields)
    - `response_capture` (Wait for Reply)
    - `dtmf_menu`
  - Wait-for-reply branching: `received` and `timeout`.
- Variables/context
  - Added intuitive variables: `row_number`, `field_count`, `record_number`.
  - AWK aliases kept: `NR`, `NF`, `FNR`.
  - Variable context propagation covers derived fields from reply/set-fields/voice capture outputs.
- Telephony/reply capture
  - SMS reply correlation via `_dispatch_id` (Twilio SID), fallback to phone lookup.
  - Timeout support via `wait_minutes`.
  - DTMF webhook path wired for flow-dispatched calls.
- Run visibility
  - Run panel shows delivery counts, provider error samples, new/updated fields, sample values.
- Library template
  - Added `SMS Reply Automation` template in Flow Library.

## Key files touched
- Backend
  - `backend/app/services/flow_compiler.py`
  - `backend/app/services/flow_dispatch.py`
  - `backend/app/services/flow_orchestrator.py`
  - `backend/app/api/v1/endpoints/voice.py`
- Frontend
  - `frontend/src/components/flows/FlowBuilder.tsx`
  - `frontend/src/components/flows/NodeInspector.tsx`
  - `frontend/src/components/flows/ConditionRuleBuilder.tsx`
  - `frontend/src/components/flows/RunResultsPanel.tsx`
  - `frontend/src/components/flows/DeletableEdge.tsx`
  - `frontend/src/components/flows/NodeCard.tsx`
  - `frontend/src/components/flows/FlowLibrary.tsx`
  - `frontend/src/features/flows/nodeRegistry.ts`
  - `frontend/src/features/flows/useVariableContext.ts`
  - `frontend/src/features/flows/validation.ts`

## Validation run
- Python compile checks passed on touched backend files.
- Tests passed:
  - `backend/tests/test_flow_orchestrator.py`
  - `backend/tests/test_flow_compiler.py`
- Frontend targeted lint mostly clean; pre-existing `react-hooks/exhaustive-deps` warnings remain in `FlowBuilder.tsx`.

## Known follow-ups
- `response_capture` is still not a full long-lived async waiter system for very late replies after run completion.
- DTMF path is wired for current flow-dispatched calls; richer IVR branching/reporting can be expanded.
- `NodeInspector.tsx` still has pre-existing `no-explicit-any` lint debt in older sections.

## Current repo state warning
- Working tree is intentionally dirty beyond this commit scope (ongoing features/assets/tests).
- Do not broad-clean/reset unless explicitly asked by user.
