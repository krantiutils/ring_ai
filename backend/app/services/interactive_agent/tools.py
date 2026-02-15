"""Function calling tool definitions and executor for Gemini agent sessions.

Defines the function declarations that Gemini can invoke mid-conversation:
- lookup_account: Look up a customer account by phone number
- check_balance: Check the credit balance for an organization
- initiate_payment: Initiate a payment/credit purchase for an organization
- transfer_to_human: Transfer the call to a human operator

The ToolExecutor dispatches function calls to the appropriate backend service
and returns structured results that Gemini can use to continue the conversation.
"""

import logging
import uuid
from typing import Any

from google.genai.types import FunctionDeclaration, FunctionResponse, Tool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Function declarations — schemas Gemini uses to decide when/how to call tools
# ---------------------------------------------------------------------------

LOOKUP_ACCOUNT_DECLARATION = FunctionDeclaration(
    name="lookup_account",
    description=(
        "Look up a customer account by phone number. "
        "Returns the customer's name, account ID, and basic profile information. "
        "Use this when the caller asks about their account or needs to verify identity."
    ),
    parameters={
        "type": "object",
        "properties": {
            "phone_number": {
                "type": "string",
                "description": "The customer's phone number in E.164 format (e.g. +9771234567890)",
            },
        },
        "required": ["phone_number"],
    },
)

CHECK_BALANCE_DECLARATION = FunctionDeclaration(
    name="check_balance",
    description=(
        "Check the credit balance for an organization. "
        "Returns current balance, total purchased, and total consumed credits. "
        "Use this when the caller asks about their remaining credits or balance."
    ),
    parameters={
        "type": "object",
        "properties": {
            "org_id": {
                "type": "string",
                "description": "The organization UUID to check balance for",
            },
        },
        "required": ["org_id"],
    },
)

INITIATE_PAYMENT_DECLARATION = FunctionDeclaration(
    name="initiate_payment",
    description=(
        "Initiate a credit purchase for an organization. "
        "Adds the specified amount of credits to the organization's balance. "
        "Use this when the caller wants to buy or add credits to their account. "
        "Always confirm the amount with the caller before executing."
    ),
    parameters={
        "type": "object",
        "properties": {
            "org_id": {
                "type": "string",
                "description": "The organization UUID to add credits to",
            },
            "amount": {
                "type": "number",
                "description": "The amount of credits to purchase (must be positive)",
            },
            "description": {
                "type": "string",
                "description": "Description of the payment (e.g. 'Voice call credit top-up')",
            },
        },
        "required": ["org_id", "amount"],
    },
)

TRANSFER_TO_HUMAN_DECLARATION = FunctionDeclaration(
    name="transfer_to_human",
    description=(
        "Transfer the current call to a human operator. "
        "Use this when the caller explicitly asks to speak with a human, "
        "when the issue is too complex for AI to handle, "
        "or when the caller is frustrated and needs human assistance. "
        "Provide a reason and summary for the human operator."
    ),
    parameters={
        "type": "object",
        "properties": {
            "reason": {
                "type": "string",
                "description": "Why the transfer is happening (e.g. 'caller_request', 'complex_issue', 'escalation')",
            },
            "summary": {
                "type": "string",
                "description": "Brief summary of the conversation so far for the human operator",
            },
        },
        "required": ["reason"],
    },
)


# All available tool declarations, keyed by name for lookup
TOOL_DECLARATIONS: dict[str, FunctionDeclaration] = {
    "lookup_account": LOOKUP_ACCOUNT_DECLARATION,
    "check_balance": CHECK_BALANCE_DECLARATION,
    "initiate_payment": INITIATE_PAYMENT_DECLARATION,
    "transfer_to_human": TRANSFER_TO_HUMAN_DECLARATION,
}

# Default tools for agent sessions — all tools enabled
DEFAULT_TOOLS = list(TOOL_DECLARATIONS.keys())


def build_tools(tool_names: list[str] | None = None) -> list[Tool]:
    """Build a list of google.genai Tool objects from tool names.

    Args:
        tool_names: Names of tools to include. If None, includes all.

    Returns:
        List of Tool objects for the Gemini Live API config.

    Raises:
        ValueError: If an unknown tool name is provided.
    """
    if tool_names is None:
        tool_names = DEFAULT_TOOLS

    declarations = []
    for name in tool_names:
        if name not in TOOL_DECLARATIONS:
            raise ValueError(f"Unknown tool '{name}'. Available tools: {', '.join(TOOL_DECLARATIONS.keys())}")
        declarations.append(TOOL_DECLARATIONS[name])

    if not declarations:
        return []

    return [Tool(function_declarations=declarations)]


# ---------------------------------------------------------------------------
# Tool execution results
# ---------------------------------------------------------------------------


class ToolResult:
    """Result of executing a tool function call."""

    def __init__(self, name: str, call_id: str, result: dict[str, Any]) -> None:
        self.name = name
        self.call_id = call_id
        self.result = result

    def to_function_response(self) -> FunctionResponse:
        """Convert to a google.genai FunctionResponse for sending back to Gemini."""
        return FunctionResponse(
            id=self.call_id,
            name=self.name,
            response=self.result,
        )


# ---------------------------------------------------------------------------
# Tool executor — dispatches function calls to backend services
# ---------------------------------------------------------------------------


class ToolExecutor:
    """Executes tool function calls by dispatching to backend services.

    This is the bridge between Gemini's function calling and the actual
    backend service layer. Each tool maps to one or more service calls.

    The executor is designed to be async and non-blocking. Database operations
    use a session factory to avoid holding connections during audio streaming.

    Usage::

        executor = ToolExecutor(db_session_factory=get_db_session)
        result = await executor.execute("lookup_account", {"phone_number": "+977..."}, call_id="fc-1")
        response = result.to_function_response()
    """

    def __init__(self, db_session_factory=None) -> None:
        self._db_session_factory = db_session_factory

    async def execute(self, name: str, args: dict[str, Any], call_id: str) -> ToolResult:
        """Execute a tool function call and return the result.

        Args:
            name: The function name to execute.
            args: The function arguments from Gemini.
            call_id: The function call ID for correlating the response.

        Returns:
            ToolResult with the execution outcome.
        """
        logger.info("Executing tool: %s(call_id=%s, args=%s)", name, call_id, args)

        try:
            if name == "lookup_account":
                result = await self._lookup_account(args)
            elif name == "check_balance":
                result = await self._check_balance(args)
            elif name == "initiate_payment":
                result = await self._initiate_payment(args)
            elif name == "transfer_to_human":
                result = await self._transfer_to_human(args)
            else:
                result = {"error": f"Unknown tool: {name}"}
        except Exception as exc:
            logger.error("Tool execution failed: %s — %s", name, exc, exc_info=True)
            result = {"error": f"Tool execution failed: {exc}"}

        logger.info("Tool result: %s(call_id=%s) -> %s", name, call_id, result)
        return ToolResult(name=name, call_id=call_id, result=result)

    async def _lookup_account(self, args: dict[str, Any]) -> dict[str, Any]:
        """Look up a customer account by phone number."""
        phone_number = args.get("phone_number", "")
        if not phone_number:
            return {"error": "phone_number is required"}

        if self._db_session_factory is None:
            return {"error": "Database not available"}

        from sqlalchemy import select

        from app.models.contact import Contact

        db = self._db_session_factory()
        try:
            contact = db.execute(select(Contact).where(Contact.phone == phone_number)).scalar_one_or_none()

            if contact is None:
                return {
                    "found": False,
                    "message": f"No account found for phone number {phone_number}",
                }

            return {
                "found": True,
                "account_id": str(contact.id),
                "org_id": str(contact.org_id),
                "name": contact.name or "Unknown",
                "phone": contact.phone,
                "carrier": contact.carrier,
                "attributes": dict(contact.metadata_) if contact.metadata_ else {},
            }
        finally:
            db.close()

    async def _check_balance(self, args: dict[str, Any]) -> dict[str, Any]:
        """Check the credit balance for an organization."""
        org_id_str = args.get("org_id", "")
        if not org_id_str:
            return {"error": "org_id is required"}

        if self._db_session_factory is None:
            return {"error": "Database not available"}

        from app.services.credits import get_balance

        try:
            org_id = uuid.UUID(org_id_str)
        except ValueError:
            return {"error": f"Invalid org_id format: {org_id_str}"}

        db = self._db_session_factory()
        try:
            credit = get_balance(db, org_id)
            return {
                "org_id": str(credit.org_id),
                "balance": float(credit.balance),
                "total_purchased": float(credit.total_purchased),
                "total_consumed": float(credit.total_consumed),
                "currency": "NPR",
            }
        finally:
            db.close()

    async def _initiate_payment(self, args: dict[str, Any]) -> dict[str, Any]:
        """Initiate a credit purchase for an organization."""
        org_id_str = args.get("org_id", "")
        amount = args.get("amount", 0)
        description = args.get("description", "Voice agent credit purchase")

        if not org_id_str:
            return {"error": "org_id is required"}
        if amount <= 0:
            return {"error": "amount must be positive"}

        if self._db_session_factory is None:
            return {"error": "Database not available"}

        from app.services.credits import purchase_credits

        try:
            org_id = uuid.UUID(org_id_str)
        except ValueError:
            return {"error": f"Invalid org_id format: {org_id_str}"}

        db = self._db_session_factory()
        try:
            transaction = purchase_credits(db, org_id, amount, description)
            return {
                "success": True,
                "transaction_id": str(transaction.id),
                "amount": float(transaction.amount),
                "description": transaction.description,
                "new_balance": float(transaction.amount),  # approximate; exact from check_balance
            }
        finally:
            db.close()

    async def _transfer_to_human(self, args: dict[str, Any]) -> dict[str, Any]:
        """Signal that the call should be transferred to a human operator.

        This doesn't perform the actual transfer (that's handled by the bridge/gateway).
        It returns a structured signal that the bridge layer intercepts.
        """
        reason = args.get("reason", "unspecified")
        summary = args.get("summary", "")

        return {
            "action": "transfer_to_human",
            "reason": reason,
            "summary": summary,
            "status": "transfer_requested",
        }
