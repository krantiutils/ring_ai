# Phase 3 Design: TTS Providers, Knowledge Base Integration, Two-Way Calls, Credits

**Date:** 2026-02-21
**Status:** Approved

## Overview

Four workstreams built in dependency order:

1. TTS Provider Expansion — ElevenLabs, Parler-TTS (AI4Bharat), Piper
2. Voice/SMS Agent Inspector Upgrade — provider/voice selection, preview, credit estimation
3. Knowledge Base Flow Node — `lookup_kb` processing node + expanded document ingestion
4. Two-Way Interactive Calls — Twilio Media Streams ↔ Gemini Live bridge

## 1. TTS Provider Expansion

### Current State

Two providers registered in `backend/app/tts/`:
- `edge_tts` — free, unofficial Microsoft Edge API, 2 Nepali voices (HemkalaNeural, SagarNeural)
- `azure` — paid ($16/1M chars), same voices as Edge, requires API key

All providers implement `BaseTTSProvider` (name, info, synthesize, list_voices) and register in `TTSRouter` at module init. The `TTSProvider` enum and `ProviderInfo`/`TTSConfig`/`TTSResult` models live in `tts/models.py`.

### Changes

**Drop Azure as default** — Edge TTS uses the same voices for free. Keep Azure code but don't register it by default. Users can still configure it via the provider config page.

**Add 3 new providers:**

#### ElevenLabs (`providers/elevenlabs.py`)

- Python SDK: `elevenlabs` package (add to pyproject.toml)
- Auth: `ELEVENLABS_API_KEY` in settings
- `list_voices()`: `GET https://api.elevenlabs.io/v1/voices` — returns all voices in library; filter by language tag for Nepali
- `synthesize()`: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` — returns MP3 stream
- Pricing: `cost_per_million_chars = 240.0` (based on Pro plan $0.24/1K chars)
- `requires_api_key = True`
- `supported_formats = [MP3]`
- Voice cloning out of scope

#### Parler-TTS / AI4Bharat Indic (`providers/parler.py`)

- Dependencies: `parler-tts`, `transformers`, `torch` (heavy — optional)
- Model: `ai4bharat/indic-parler-tts` from HuggingFace
- `list_voices()`: returns hardcoded voice description presets (e.g. "Female, calm, clear Nepali accent", "Male, warm, conversational")
- `synthesize()`: loads model on first call (cached), generates audio from text + voice description prompt, returns WAV
- Pricing: `cost_per_million_chars = 0.0` (self-hosted, compute cost is separate)
- `requires_api_key = False`
- GPU required; provider only registers if CUDA is available or `PARLER_FORCE_CPU=true`
- `supported_formats = [WAV]`

#### Piper (`providers/piper.py`)

- No Python package dependency — calls the `piper` binary as subprocess
- Settings: `PIPER_BINARY_PATH`, `PIPER_MODELS_DIR`
- `list_voices()`: scans `PIPER_MODELS_DIR` for `ne_NP*.onnx` files, returns voice info from JSON sidecar files
- `synthesize()`: pipes text to `piper --model <path> --output_raw`, reads WAV bytes from stdout
- Pricing: `cost_per_million_chars = 0.0`
- `requires_api_key = False`
- `supported_formats = [WAV]`
- Provider only registers if piper binary exists at configured path

**TTSProvider enum** expands:

```python
class TTSProvider(str, Enum):
    EDGE_TTS = "edge_tts"
    AZURE = "azure"           # kept but not registered by default
    ELEVENLABS = "elevenlabs"
    PARLER_TTS = "parler_tts"
    PIPER = "piper"
```

**Registration in `__init__.py`:**

```python
def _create_router() -> TTSRouter:
    router = TTSRouter()
    router.register(EdgeTTSProvider())
    # Azure: only register if credentials are set
    if settings.AZURE_TTS_KEY:
        router.register(AzureTTSProvider())
    # ElevenLabs: only register if API key is set
    if settings.ELEVENLABS_API_KEY:
        router.register(ElevenLabsProvider())
    # Parler: only register if model available
    try:
        router.register(ParlerTTSProvider())
    except ImportError:
        pass
    # Piper: only register if binary exists
    try:
        router.register(PiperProvider())
    except FileNotFoundError:
        pass
    return router
```

### Credit Tiers

| Provider | Credits per voice call |
|---|---|
| Edge TTS | 2 |
| Piper | 2 |
| Parler-TTS | 3 |
| ElevenLabs | 5 |
| SMS (any) | 0.5 |
| WhatsApp (any) | 0.5 |
| Interactive voice call | 8 |

Update `COST_PER_INTERACTION` in `credits.py` to accept a provider parameter:

```python
VOICE_CREDITS = {
    "edge_tts": 2.0,
    "piper": 2.0,
    "parler_tts": 3.0,
    "elevenlabs": 5.0,
    "azure": 2.0,
}
INTERACTIVE_VOICE_CREDITS = 8.0
SMS_CREDITS = 0.5
WHATSAPP_CREDITS = 0.5
```

## 2. Voice/SMS Agent Inspector Upgrade

### Current State

- `agent_voice` inspector: script textarea + from-number dropdown
- `agent_sms` inspector: message textarea + from-number dropdown
- No TTS provider/voice selection, no credit estimation

### Changes to NodeInspector.tsx

#### Voice Agent Inspector — new fields:

1. **TTS Provider dropdown** — fetches `GET /tts/providers/details`, shows provider name + tier (free/premium)
2. **Voice dropdown** — fetches `POST /tts/voices` with selected provider + `ne-NP` locale, shows voice name + gender
3. **Preview button** — calls `POST /tts/synthesize` with a 10-word sample, plays audio blob via `<audio>` element
4. **Credit estimate** — computed from `contactCount × VOICE_CREDITS[provider]`, shows balance check

Node config shape expands:

```typescript
// agent_voice config
{
  script: string,
  from_number: string,
  tts_provider: string,   // "edge_tts" | "elevenlabs" | ...
  tts_voice: string,      // voice ID for the provider
}
```

#### SMS Agent Inspector — new field:

1. **Credit estimate** — `contactCount × 0.5`, shows balance sufficiency

#### Credit estimate component (shared):

```tsx
<CreditEstimate
  contactCount={contactEstimate}
  creditsPerAction={creditsForProvider}
/>
```

Fetches balance from `GET /credits/balance` on mount.

### Changes to flow_dispatch.py

`dispatch_voice()` currently uses Twilio `<Say>` (Twilio's native TTS). Change to use the TTS router:

1. Read `tts_provider` and `tts_voice` from node config
2. If set, synthesize audio via `tts_router.synthesize(script, TTSConfig(...))`
3. Store audio in `audio_store`, use `<Play>` TwiML instead of `<Say>`
4. If not set (backward compat), fall back to `<Say>`

### Changes to flow_orchestrator.py

After each action dispatch (live mode), consume credits:

```python
from app.services.credits import consume_credits, VOICE_CREDITS, SMS_CREDITS
# ... after dispatch_action completes:
credits_used = VOICE_CREDITS.get(tts_provider, 2.0) if kind == "agent_voice" else SMS_CREDITS
consume_credits(db, org_id=..., amount=credits_used * len(rows), ...)
```

## 3. Knowledge Base Flow Node

### Current State

KB system: pgvector store, Gemini text-embedding-004, cosine similarity search. Full CRUD API. Document types: PDF, TXT only. Connected only to inbound gateway agent (static context injection at session start).

### New Node: `lookup_kb`

**Category:** Processing
**Palette entry:**

```python
{ "kind": "lookup_kb", "label": "KB Lookup", "description": "Retrieve knowledge base context", "category": "processing" }
```

**Config shape:**

```typescript
{
  knowledge_base_id: string,  // UUID
  query_template: string,     // e.g. "info about {{name}}"
  top_k: number,              // 1-20, default 5
  output_variable: string,    // default "_kb_context"
}
```

**Inspector UI:**
- KB dropdown — fetches `GET /knowledge-bases?org_id=...`
- Query template textarea with variable autocomplete
- Top K slider (1-20)
- Output variable name input

**Orchestrator execution:**
1. For each contact row, render query_template with row data
2. Call `search_knowledge_base(db, kb_id, rendered_query, top_k)`
3. Format chunk results into a text block
4. Inject `row[output_variable] = formatted_context`
5. Downstream nodes can reference `{{_kb_context}}` in messages

### Expanded Document Ingestion

Add to `knowledge_base.py` service:

**DOCX support:**
- Package: `python-docx`
- `extract_text_from_docx(file_bytes)` — reads paragraphs, joins with `\n`

**XLSX/XLS support:**
- Package: `openpyxl`
- `extract_text_from_xlsx(file_bytes)` — reads all sheets, converts rows to text lines

**Markdown support:**
- No extra package — read as plain text, chunk directly

**Website URL support:**
- New endpoint: `POST /knowledge-bases/{kb_id}/documents/url` with body `{ url: string }`
- Fetch page with `httpx`, extract text with `BeautifulSoup` (`html.parser`)
- Store with `file_name = url`, `file_type = "url"`

Update `extract_text()` router:

```python
def extract_text(file_bytes: bytes, file_type: str) -> str:
    match file_type:
        case "pdf": return extract_text_from_pdf(file_bytes)
        case "txt" | "md": return file_bytes.decode("utf-8", errors="replace")
        case "docx": return extract_text_from_docx(file_bytes)
        case "xlsx" | "xls": return extract_text_from_xlsx(file_bytes)
        case _: raise ValueError(f"Unsupported file type: {file_type}")
```

Update upload endpoint to accept: `.pdf`, `.txt`, `.md`, `.docx`, `.xlsx`, `.xls`

### Frontend KB changes

Update `knowledge-bases/page.tsx` upload to show the expanded accepted file types. Add a URL input field with "Add from URL" button.

## 4. Two-Way Interactive Calls

### Current State

The Gemini Live interactive agent system is fully built:
- `GeminiLiveClient` — raw WebSocket to Gemini Live API
- `AgentSession` — lifecycle + state machine
- `HybridSession` — text-mode Gemini + Edge/Azure TTS synthesis
- `SessionPool` — concurrent session management
- `GatewayBridge` — current transport (Android phone WebSocket)
- Tool calling: lookup_account, check_balance, initiate_payment, transfer_to_human
- Barge-in, transcription, session resumption all working

**Missing:** Twilio Media Streams transport. The gateway bridge uses 16kHz PCM; Twilio streams 8kHz µ-law.

### New Components

#### TwilioMediaBridge (`backend/app/services/telephony/media_bridge.py`)

Mirrors `GatewayBridge` pattern but for Twilio Media Streams protocol:

**Twilio → Backend WebSocket messages:**
```json
{"event": "start", "streamSid": "...", "start": {"callSid": "...", "customParameters": {...}}}
{"event": "media", "media": {"payload": "<base64 8kHz mulaw>"}}
{"event": "stop"}
```

**Backend → Twilio WebSocket messages:**
```json
{"event": "media", "streamSid": "...", "media": {"payload": "<base64 8kHz mulaw>"}}
{"event": "clear", "streamSid": "..."}  // barge-in: clear playback buffer
```

**Audio resampling pipeline:**
```
Twilio 8kHz µ-law → decode to 16-bit PCM → resample to 16kHz → Gemini
Gemini 24kHz PCM → resample to 8kHz → encode to µ-law → Twilio
```

Use `audioop` (stdlib) for µ-law ↔ PCM conversion, `numpy` or custom linear interpolation for resampling.

#### WebSocket endpoint

```python
@router.websocket("/voice/media-stream/{session_id}")
async def twilio_media_stream(ws: WebSocket, session_id: str):
    bridge = TwilioMediaBridge(ws, session_id)
    await bridge.run()
```

#### TwiML for interactive calls

```python
@router.post("/voice/interactive-twiml/{session_id}")
def interactive_twiml(session_id: str):
    response = VoiceResponse()
    connect = Connect()
    stream = Stream(url=f"wss://{settings.BASE_URL}/api/v1/voice/media-stream/{session_id}")
    stream.parameter(name="session_id", value=session_id)
    connect.append(stream)
    response.append(connect)
    return Response(content=str(response), media_type="application/xml")
```

#### Flow dispatch

New function `dispatch_voice_interactive()` in `flow_dispatch.py`:

1. Create a `SessionConfig` from node config (system_prompt, voice, tools, KB, timeout)
2. If KB is configured, retrieve context and inject into system prompt
3. Store session config in an `interactive_session_store` (like `flow_script_store`)
4. Call `provider.initiate_call()` with TwiML URL pointing to `/voice/interactive-twiml/{session_id}`
5. Twilio connects → WebSocket → bridge → Gemini session created
6. Call runs until hangup, timeout, or transfer-to-human tool call
7. On completion, store transcripts in `FlowStepResult.metadata_`

#### New node: `agent_voice_interactive`

**Category:** Actions
**Config shape:**

```typescript
{
  system_prompt: string,        // with {{variable}} support
  output_mode: "native_audio" | "hybrid",
  tts_provider: string,         // for hybrid mode
  tts_voice: string,            // for hybrid mode
  knowledge_base_id: string | null,
  tools: string[],              // ["lookup_account", "check_balance", ...]
  max_duration_minutes: number, // default 10
  from_number: string,
}
```

**Inspector UI:**
- System prompt textarea with variable autocomplete
- Voice mode toggle (Native Audio vs Hybrid)
- If Hybrid: TTS provider + voice dropdowns (same as agent_voice)
- KB dropdown (optional)
- Tool checkboxes
- Max duration slider
- From number dropdown
- Credit estimate (8 credits per contact)

## Implementation Order

1. **TTS providers** (backend only) — add ElevenLabs, Parler, Piper providers + enum + registration
2. **Credits update** — tiered credit rates, estimate endpoint
3. **KB document ingestion** — DOCX, XLSX, URL, markdown support
4. **Voice inspector upgrade** — TTS/voice pickers, preview, credit estimate
5. **SMS inspector credit estimate** — simpler, just the estimate component
6. **KB Lookup node** — new node kind + inspector + orchestrator handler
7. **Twilio Media Bridge** — WebSocket handler + audio resampling
8. **Interactive voice node** — new node kind + inspector + dispatch + TwiML
9. **Frontend polish** — provider config page updates, KB upload expansion

## Files Modified/Created

### Backend — New:
- `backend/app/tts/providers/elevenlabs.py`
- `backend/app/tts/providers/parler.py`
- `backend/app/tts/providers/piper.py`
- `backend/app/services/telephony/media_bridge.py`

### Backend — Modified:
- `backend/app/tts/models.py` — TTSProvider enum
- `backend/app/tts/__init__.py` — registration
- `backend/app/services/credits.py` — tiered pricing
- `backend/app/services/knowledge_base.py` — DOCX, XLSX, URL, MD extraction
- `backend/app/services/flow_dispatch.py` — TTS-based voice dispatch + interactive dispatch
- `backend/app/services/flow_orchestrator.py` — KB lookup handler + credit consumption
- `backend/app/api/v1/endpoints/flows.py` — credit estimate endpoint
- `backend/app/api/v1/endpoints/knowledge_bases.py` — URL upload endpoint
- `backend/app/api/v1/endpoints/voice.py` — media-stream WS + interactive TwiML
- `backend/pyproject.toml` — new deps (elevenlabs, python-docx, openpyxl, beautifulsoup4)

### Frontend — Modified:
- `frontend/src/components/flows/NodeInspector.tsx` — voice inspector overhaul, KB lookup inspector, credit estimate
- `frontend/src/features/flows/nodeRegistry.ts` — lookup_kb + agent_voice_interactive palette entries
- `frontend/src/components/flows/FlowBuilder.tsx` — default configs for new node types
- `frontend/src/lib/api.ts` — credit estimate, KB list for flows
- `frontend/src/app/dashboard/knowledge-bases/page.tsx` — expanded file types + URL upload
