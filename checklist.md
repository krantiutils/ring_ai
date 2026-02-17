# AgentShakti Flow Builder Checklist

Last updated: 2026-02-17
Owner: Codex + team
Scope: Build complete n8n-style node builder for voice/SMS/WhatsApp agents in dashboard, with end-to-end validation, execution, templates, scheduling, and observability.

## 1. Product Scope Lock
- [ ] Finalize user roles and permissions (admin/editor/operator/viewer)
- [ ] Finalize channels in v1 (SMS, Voice, WhatsApp)
- [ ] Finalize supported provider integrations (Twilio, Aakash SMS, etc.)
- [ ] Finalize max contacts per run and throughput limits
- [ ] Finalize policy constraints (quiet hours, opt-out, DND, consent rules)

## 2. UX and IA
- [ ] Add new dashboard area: `Flows`
- [ ] Define layout:
  - [ ] Left palette (nodes + templates)
  - [ ] Center canvas (React Flow)
  - [ ] Right inspector panel (node config + validation)
  - [ ] Bottom run panel (test run, logs, errors)
- [ ] Add top toolbar:
  - [ ] Validate
  - [ ] Save Draft
  - [ ] Publish
  - [ ] Simulate (dry run)
  - [ ] Run
  - [ ] Pause/Resume/Cancel
- [ ] Add flow list page with filters (draft/published/archived)
- [ ] Add flow version history and rollback UI

## 3. Node Catalog (Complete Set)
### Triggers
- [ ] Manual Trigger
- [ ] Schedule Trigger (one-time + recurring cron)
- [ ] Webhook Trigger
- [ ] File Upload Trigger

### Input and Data
- [ ] CSV Source node
- [ ] XLSX Source node
- [ ] Number List node (manual paste/import)
- [ ] Uploaded File node
- [ ] Existing Contact List node

### Data Quality
- [ ] Validation node (schema + row-level checks)
- [ ] Normalize node (phone formatting, trim, casing)
- [ ] Deduplicate node
- [ ] Suppression node (opt-out/DND/exclusions)

### Logic
- [ ] Condition node (field rules, boolean groups)
- [ ] Split node (route by predicate)
- [ ] Merge node (all branches / first-success)
- [ ] Enrich node (set/add derived fields)

### Time/Control
- [ ] Wait node (duration)
- [ ] Schedule-at node (timestamp)
- [ ] Business Hours node (timezone-aware)
- [ ] Rate Limit node (global/per-channel/per-provider)
- [ ] Retry node (attempts/backoff/jitter)

### Channels/Actions
- [ ] Sender Number node (purchased number pool)
- [ ] SMS Agent node
- [ ] Voice Agent node
- [ ] WhatsApp Agent node
- [ ] Human Handoff node
- [ ] Webhook Action node

### Safety and Completion
- [ ] Consent Guard node
- [ ] Error Handler node
- [ ] End Success node
- [ ] End Failure node

## 4. Validation Engine (Critical)
- [ ] Port type system (prevent incompatible connections)
- [ ] Graph structural validation (cycles where not allowed, unreachable nodes)
- [ ] Node config validation (required fields, ranges, enums)
- [ ] Schema propagation from source to downstream nodes
- [ ] Condition expression validator + test evaluator
- [ ] File validation rules:
  - [ ] Required columns
  - [ ] Duplicate detection
  - [ ] Phone format and country normalization
  - [ ] Empty/malformed row detection
  - [ ] Per-row error preview
- [ ] Preflight gate before publish/run
- [ ] Severity model (error/warning/info)

## 5. Execution Engine
- [ ] Compile flow graph to executable DAG
- [ ] Contact-level state machine (`pending/running/success/failed/skipped`)
- [ ] Deterministic idempotency keys per node action
- [ ] Retry and dead-letter handling
- [ ] Pause/resume from checkpoint
- [ ] Cancellation semantics per in-flight node
- [ ] Branch merge semantics
- [ ] Time node scheduler integration
- [ ] Channel dispatch adapters (SMS/Voice/WhatsApp)

## 6. Observability
- [ ] Run timeline UI
- [ ] Node-level run status badges
- [ ] Per-contact trace viewer
- [ ] Error logs with node + row references
- [ ] Metrics:
  - [ ] delivery
  - [ ] connect/pickup
  - [ ] response
  - [ ] retries
  - [ ] failures by reason
  - [ ] credits consumed
- [ ] Export run report (CSV/JSON)

## 7. Templates (Initial Library)
- [ ] Payment Reminder (SMS + voice fallback)
- [ ] Appointment Reminder (SMS -> call)
- [ ] Lead Qualification (conditional routing)
- [ ] Re-engagement (WhatsApp + SMS)
- [ ] OTP Demo Call flow
- [ ] Welcome/Onboarding drip flow

## 8. Data Model and APIs
- [ ] Create DB models:
  - [ ] `flow_definitions`
  - [ ] `flow_versions`
  - [ ] `flow_runs`
  - [ ] `flow_run_nodes`
  - [ ] `flow_run_events`
  - [ ] `flow_templates`
- [ ] CRUD APIs for flows and versions
- [ ] Publish/unpublish APIs
- [ ] Validate API (server-side canonical validator)
- [ ] Simulate API
- [ ] Run control APIs (start/pause/resume/cancel)
- [ ] Run logs/events streaming endpoint

## 9. Security and Governance
- [ ] RBAC enforcement on all flow endpoints
- [ ] Audit log for publish/run/cancel actions
- [ ] PII-safe logging policy
- [ ] Secrets isolation for provider creds
- [ ] Input sanitization for uploaded files and expressions

## 10. Performance and Reliability
- [ ] Large file handling strategy (chunking/streaming)
- [ ] Queue-based async execution workers
- [ ] Backpressure + provider rate protection
- [ ] Retry policy and circuit breakers per provider
- [ ] Load test with realistic campaign sizes

## 11. Frontend Engineering Tasks
- [ ] Implement `FlowBuilderPage` in dashboard
- [ ] Build reusable node renderer system
- [ ] Build edge renderer with validation hints
- [ ] Build inspector forms with schema-driven config
- [ ] Build validation drawer + run console
- [ ] Apply `UI.md` style system consistently (light/dark)
- [ ] Add i18n support for EN/NE on flow builder UI

## 12. Testing
- [ ] Unit tests for validator (all node types)
- [ ] Unit tests for graph compiler
- [ ] API tests for flows CRUD + run control
- [ ] Integration tests for CSV/XLSX parse + execution
- [ ] E2E tests:
  - [ ] create flow
  - [ ] validate errors
  - [ ] publish
  - [ ] run/simulate
  - [ ] inspect results

## 13. Deployment and Ops
- [ ] Feature flag flow builder rollout
- [ ] Add migration and rollback playbook
- [ ] Add runbook for failed runs
- [ ] Add dashboards/alerts for queue lag and provider failures
- [ ] Staging soak test before full production launch

## 14. Immediate Next Implementation Order
- [ ] Add `/dashboard/flows` route and navigation entry
- [ ] Integrate React Flow with typed node registry
- [ ] Implement first 8 nodes (Trigger, CSV/XLSX, Validation, Condition, Wait, Number, SMS, Voice)
- [ ] Implement validation panel with row-level CSV/XLSX errors
- [ ] Implement publish + run scaffolding APIs
- [ ] Ship 3 templates, then expand to full library
