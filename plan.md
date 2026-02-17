# AgentShakti Conversational Flow OS Plan

Last updated: 2026-02-17
Scope: n8n-style builder for voice/SMS/WhatsApp with survey + conversational AI execution.

## 0. Voice Product Ideas + Credit Model (New)

### 0.1 Product additions
- ElevenLabs integration for premium neural voice generation.
- CAMB.AI integration for voice localization and multilingual dubbing workflows.
- Pre-recorded audio upload flow (user uploads mp3/wav and reuses in campaigns).
- Voice asset library (versioned clips, tags, language, usage stats).
- Runtime A/B test by voice source (`edge_tts` vs ElevenLabs vs uploaded clip).

### 0.2 Credit policy (required)
- ElevenLabs: **metered**, consumes AgentShakti credits.
- CAMB.AI: **metered**, consumes AgentShakti credits.
- Pre-recorded upload: **unmetered by provider**, no ElevenLabs/CAMB.AI credits charged.
- Edge/Azure passthrough:
  - Edge demo mode: platform-managed, optional zero-cost or base campaign-only credit.
  - Azure BYO key mode: no provider credits from AgentShakti wallet (customer pays Azure directly).

### 0.3 Wallet and UX behavior
1. User chooses voice source in campaign/demo builder.
2. System shows live quote: chars, estimated credits, balance check.
3. If source is metered and balance is insufficient:
   - block launch/synthesis,
   - show top-up CTA.
4. If source is pre-recorded upload:
   - skip provider credit checks,
   - only standard campaign execution credits apply.
5. On successful metered generation:
   - consume credits and write transaction metadata (`provider`, `chars`, `reference`).

### 0.4 What is being implemented now
- [x] Plan and architecture update for provider credit policy.
- [x] Backend API for voice provider credit quote (ElevenLabs/CAMB.AI metered, upload free).
- [x] Dashboard integration UI for quote + policy visibility.
- [ ] Runtime charge-on-success enforcement during provider synthesis execution.
- [ ] ElevenLabs provider adapter.
- [ ] CAMB.AI provider adapter.
- [ ] Pre-recorded asset upload/management UI + API.

## 1. Product Goals
- Build a visual workflow system where non-technical users launch campaigns from configurable nodes.
- Use one **source of truth** data source, then allow **column enrichment** from survey/call/message events.
- Support both:
  - Conversational AI flows (Gemini 2.5 Flash Native Audio style interactions).
  - Deterministic keypad/menu flows (`Press 1`, `Press 2`) and message reply branching.

## 2. Core User Flow
1. User opens `/dashboard/flows`.
2. User must pick data source first:
   - Manual table builder
   - CSV file import
   - XLSX file import
   - Google Contacts import
   - URL JSON hook
   - URL CSV hook
3. After source pick, builder unlocks full palette and asks user to pick a template.
4. User customizes nodes, conditions, schedules, and channel actions.
5. User validates flow, runs simulation, then publishes and executes campaign.
6. Runtime writes outcomes back into enriched columns and sends optional action hooks/webhooks.

## 3. Node Taxonomy

### Trigger Nodes
- Manual Trigger
- Schedule Trigger (cron/timezone)
- Event Trigger (future)

### Source Nodes (Source of Truth)
- Manual Table
- CSV File
- XLSX File
- Google Contacts
- URL JSON Hook
- URL CSV Hook
- Manual Number List

### Data Processing Nodes
- Validation (schema + row-level issues)
- Enrich Columns (append computed/survey columns)
- Deduplicate
- Normalize Phone/Language

### Logic Nodes
- Decision (if/else, diamond)
- Loop (for-each contact / retry loopback)
- Merge (join branches)

### Time and Control Nodes
- Wait
- Business Hours
- Rate Limit
- Retry / Error Handler

### Channel and Conversation Nodes
- SMS Agent
- Voice Agent
- WhatsApp Agent
- Survey AI (Gemini-like voice/text conversation)
- DTMF Menu (press 1/2...)
- Response Capture (intent, sentiment, reply text, keypad choice)

### Integration Nodes
- Sender Number
- Action Hook (webhook on message/call/survey outcome)
- End Success / End Failure

## 4. Data Model Plan

### Flow Definitions
- `flow_definitions`: metadata, owner, org, status
- `flow_versions`: immutable graph snapshots
- `flow_templates`: curated starter templates

### Execution
- `flow_runs`: per-run metadata and status
- `flow_run_contacts`: per-contact status and traversal
- `flow_run_node_events`: node execution logs
- `flow_run_hooks`: outgoing webhook delivery records

### Data and Enrichment
- `contact_datasets`: source-of-truth metadata
- `contact_rows`: normalized base rows
- `contact_row_enrichments`: appended columns (survey responses, intent, DTMF, call outcome)

## 5. Validation Strategy
- Structural:
  - has trigger
  - has source
  - has end node
  - no invalid source<-agent edges
- Schema:
  - required columns present
  - phone format validity
  - URL node has valid URL + expected mapping
- Runtime preflight:
  - provider credentials configured
  - sender number available
  - schedule/timezone valid
  - hook URL reachable (optional soft-check)

## 6. Conversational AI and Survey Support

### Survey AI Node Behavior
- Input: script/objective + language + model.
- Runtime:
  - initiate AI turn-based voice/text dialog
  - capture transcript + structured answers
  - emit normalized survey output columns

### DTMF / Menu Node Behavior
- Define options: `1 -> Support`, `2 -> Sales`, fallback rules.
- Works in both outbound calls and inbound response handling.

### Response Capture Node
- Captures:
  - `response_text`
  - `intent`
  - `sentiment`
  - `dtmf_choice`
  - `survey_score` / custom columns

## 7. Hook Strategy

### Source Hook Nodes
- URL JSON Hook: fetch JSON payload, map keys to columns.
- URL CSV Hook: fetch CSV payload, parse to rows.

### Action Hook Node
- On selected events (message_sent, call_completed, survey_completed, error):
  - POST payload to external URL
  - retries + dead-letter queue

## 8. Template Library
- Simple Campaign (starter)
- Payment Reminder
- Appointment Follow-up
- OTP Demo Call
- Conversational Survey (Voice AI + DTMF fallback)
- Reply-Driven Support Routing (message reply -> branch)

## 9. Implementation Roadmap

### Track A: Frontend Builder (in progress)
- [x] Source-first onboarding
- [x] Template prompt after source selection
- [x] Flowchart shape mapping
- [x] Loopback edge visualization
- [x] URL source + action hook node scaffolding
- [x] Enrich columns + survey/dtmf/reply node scaffolding
- [ ] Node-specific form editors
- [ ] Interactive manual table editor UI
- [ ] Drag-and-drop CSV/XLSX upload widget

### Track B: Backend Graph and Runtime
- [ ] Flow CRUD/version APIs
- [ ] Validation API parity with frontend checks
- [ ] Runtime DAG compiler + execution worker
- [ ] Contact row enrichment persistence
- [ ] Hook delivery service with retries
- [ ] Provider adapters for voice/SMS/WhatsApp nodes

### Track C: Conversational Runtime
- [ ] Survey AI execution adapter (Gemini-like)
- [ ] DTMF capture and branching integration
- [ ] Reply intent classification and routing
- [ ] Transcript and answer storage model

### Track D: Operations and Reliability
- [ ] Execution observability UI
- [ ] Run timeline + per-contact traces
- [ ] Pause/resume/cancel controls
- [ ] RBAC + audit logs
- [ ] Rate limit and cost guardrails

## 10. Immediate Next Tasks
1. Build manual table data editor (UI + local schema).
2. Add URL source fetch/mapping tester in builder inspector.
3. Add template-specific config wizard (simple campaign first).
4. Implement backend `POST /flows/validate` endpoint.
5. Implement draft/save/publish APIs for flows.

## 11. Real-time Voice Bridge Architecture (Documented)

### 11.1 End-to-End PSTN <-> AI Audio Streaming
1. Caller is connected via telephony provider (Twilio recommended first).
2. Provider opens bidirectional media WebSocket to our Voice Gateway.
3. Voice Gateway streams caller audio frames to Google real-time model session.
4. Google model returns streaming audio responses (+ optional transcript tokens).
5. Voice Gateway forwards AI audio frames back to provider stream for live playback.
6. Runtime emits call events into flow engine (`call_started`, `turn_completed`, `dtmf_received`, `call_ended`).

### 11.2 Incoming Message Handling
1. Inbound SMS/WhatsApp webhook arrives from provider.
2. Contact is mapped to active flow run by `contact_id` / phone / channel session.
3. Message is written to conversation state and transcript store.
4. Flow execution resumes from waiting node:
   - `response_capture` -> `condition` / `survey_ai` / `action_webhook`.

### 11.3 DTMF (Press 1/2) Handling
1. Use provider gather mode for keypad input (DTMF), optional speech simultaneously.
2. On DTMF event, emit node event with `dtmf_choice`.
3. `dtmf_menu` node routes branches:
   - `press_1`, `press_2`, timeout/fallback.
4. If both speech and DTMF are enabled, DTMF should have deterministic precedence.

### 11.4 Source-of-Truth + Enrichment Columns
- Base row schema comes from selected source node (CSV/XLSX/manual/table/url/google contacts).
- Additional columns are appended by flow nodes (not mutating raw source):
  - survey answer fields,
  - intent,
  - sentiment,
  - dtmf choice,
  - call outcomes and timestamps.

## 12. Open Decisions (Need Product Confirmation)
1. Primary telephony provider for v1 runtime: Twilio-only or multi-provider?
2. Voice mode scope: outbound only, or inbound + outbound in v1?
3. DTMF precedence rule if both speech and keypad happen in same turn.
4. Conversation memory scope: per-run only vs long-lived cross-channel memory.
5. Compliance prompts: mandatory recording disclosure and consent wording.
