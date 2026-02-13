"""Agent call configuration API — configure and initiate AI agent calls.

POST /api/v1/voice/agent-call
    Configure an agent session with system prompt, voice, tools, and callback URL.
    The agent session is created and ready for audio streaming via the gateway bridge.

This endpoint is the entry point described in PRD Section 5.1 for configuring
interactive AI agent sessions with function calling capabilities.
"""

import logging
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.interactive_agent.models import OutputMode, SessionConfig
from app.services.interactive_agent.tools import DEFAULT_TOOLS, TOOL_DECLARATIONS

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/response schemas
# ---------------------------------------------------------------------------


class AgentCallRequest(BaseModel):
    """Request body for creating an agent call configuration."""

    system_prompt: str = Field(
        ...,
        description="System instruction for the AI agent (persona, behavior, language)",
    )
    voice_name: str = Field(
        default="Kore",
        description="Gemini voice to use (e.g. Kore, Puck, Charon)",
    )
    tools: list[str] = Field(
        default_factory=lambda: list(DEFAULT_TOOLS),
        description="List of tool names to enable. Available: lookup_account, check_balance, "
        "initiate_payment, transfer_to_human",
    )
    callback_url: str | None = Field(
        default=None,
        description="URL to POST call events to (tool executions, transcripts, call end)",
    )
    output_mode: str = Field(
        default="native_audio",
        description="Output mode: 'native_audio' or 'hybrid'",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="Model temperature (0.0 = deterministic, 2.0 = creative)",
    )
    timeout_minutes: int = Field(
        default=10,
        ge=1,
        le=60,
        description="Session timeout in minutes",
    )


class AgentCallResponse(BaseModel):
    """Response after creating an agent call configuration."""

    config_id: str = Field(..., description="Unique ID for this agent configuration")
    session_config: dict = Field(..., description="The resolved SessionConfig parameters")
    available_tools: list[str] = Field(..., description="Tools enabled for this session")


class AvailableToolsResponse(BaseModel):
    """Response listing all available tools."""

    tools: list[dict] = Field(..., description="Available tool declarations with metadata")


# ---------------------------------------------------------------------------
# In-memory config store — maps config_id → SessionConfig
# ---------------------------------------------------------------------------

_agent_configs: dict[str, SessionConfig] = {}
_agent_callbacks: dict[str, str] = {}


def get_agent_config(config_id: str) -> SessionConfig | None:
    """Look up a stored agent configuration by ID."""
    return _agent_configs.get(config_id)


def get_agent_callback(config_id: str) -> str | None:
    """Look up the callback URL for an agent configuration."""
    return _agent_callbacks.get(config_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/agent-call", response_model=AgentCallResponse, status_code=201)
def create_agent_call(
    payload: AgentCallRequest,
    request: Request,
):
    """Configure an AI agent call session.

    Creates a session configuration with the specified system prompt, voice,
    tools, and callback URL. The returned config_id can be used when creating
    a gateway call to apply this agent configuration.

    The agent session will be created with function calling enabled for the
    specified tools. During the call, Gemini will invoke tools as needed
    and the results are sent back automatically.
    """
    # Validate tool names
    invalid_tools = [t for t in payload.tools if t not in TOOL_DECLARATIONS]
    if invalid_tools:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown tool(s): {', '.join(invalid_tools)}. "
            f"Available: {', '.join(TOOL_DECLARATIONS.keys())}",
        )

    # Resolve output mode
    try:
        output_mode = OutputMode(payload.output_mode)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid output_mode: {payload.output_mode}. Use 'native_audio' or 'hybrid'.",
        )

    config_id = uuid.uuid4().hex

    session_config = SessionConfig(
        session_id=config_id,
        system_instruction=payload.system_prompt,
        voice_name=payload.voice_name,
        tool_names=payload.tools if payload.tools else None,
        output_mode=output_mode,
        temperature=payload.temperature,
        timeout_minutes=payload.timeout_minutes,
    )

    _agent_configs[config_id] = session_config
    if payload.callback_url:
        _agent_callbacks[config_id] = payload.callback_url

    logger.info(
        "Agent call configured: config_id=%s, voice=%s, tools=%s, callback=%s",
        config_id,
        payload.voice_name,
        payload.tools,
        payload.callback_url,
    )

    return AgentCallResponse(
        config_id=config_id,
        session_config=session_config.model_dump(exclude={"tool_names"}),
        available_tools=payload.tools,
    )


@router.get("/agent-call/tools", response_model=AvailableToolsResponse)
def list_available_tools():
    """List all available tools for agent call configuration.

    Returns the tool declarations with names and descriptions so callers
    can select which tools to enable for their agent sessions.
    """
    tools = []
    for name, decl in TOOL_DECLARATIONS.items():
        tools.append({
            "name": name,
            "description": decl.description,
        })
    return AvailableToolsResponse(tools=tools)
