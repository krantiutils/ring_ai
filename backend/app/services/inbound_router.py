"""Inbound call routing engine.

Evaluates routing rules when an INCOMING_CALL arrives from an Android
gateway. Determines whether the call should be answered (routed to
Gemini AI agent), rejected, or forwarded to a human operator.

Routing decision flow:
    1. Look up GatewayPhone by gateway_id → get organization
    2. Look up Contact by caller number + org (CRM identification)
    3. Load active InboundRoutingRules for the org, sorted by priority
    4. Evaluate rules against call metadata (caller pattern, time-of-day)
    5. First matching rule wins
    6. If no rules match → fallback to gateway auto_answer setting
    7. Return RoutingDecision with action + session config overrides
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models.contact import Contact
from app.models.gateway_phone import GatewayPhone
from app.models.inbound_routing_rule import InboundRoutingRule
from app.models.interaction import Interaction
from app.services.gateway_bridge.models import IncomingCallMessage, RoutingAction

logger = logging.getLogger(__name__)


@dataclass
class RoutingDecision:
    """Result of the routing engine's evaluation."""

    action: RoutingAction
    call_id: str
    org_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    contact_name: str | None = None
    gateway_phone_id: uuid.UUID | None = None
    rule_id: uuid.UUID | None = None
    rule_name: str | None = None
    forward_to: str | None = None
    system_instruction: str | None = None
    voice_name: str | None = None
    reject_reason: str = "rejected"


class InboundCallRouter:
    """Evaluates routing rules for incoming calls.

    Uses synchronous DB sessions internally, wrapped in asyncio.to_thread()
    to avoid blocking the event loop (the project uses sync SQLAlchemy).
    """

    def __init__(self, session_factory: sessionmaker) -> None:
        self._session_factory = session_factory

    async def route(self, msg: IncomingCallMessage) -> RoutingDecision:
        """Evaluate routing rules for an incoming call.

        Args:
            msg: The INCOMING_CALL message from the gateway.

        Returns:
            RoutingDecision indicating ANSWER, REJECT, or FORWARD.
        """
        return await asyncio.to_thread(self._route_sync, msg)

    def _route_sync(self, msg: IncomingCallMessage) -> RoutingDecision:
        """Synchronous routing logic (runs in a thread)."""
        db: Session = self._session_factory()
        try:
            return self._evaluate(db, msg)
        except Exception:
            logger.exception("Routing error for call %s", msg.call_id)
            # On error, default to ANSWER so calls aren't silently dropped
            return RoutingDecision(action=RoutingAction.ANSWER, call_id=msg.call_id)
        finally:
            db.close()

    def _evaluate(self, db: Session, msg: IncomingCallMessage) -> RoutingDecision:
        """Core routing evaluation logic."""
        # 1. Look up gateway phone → organization
        gw_phone = db.execute(
            select(GatewayPhone).where(
                GatewayPhone.gateway_id == msg.gateway_id,
                GatewayPhone.is_active.is_(True),
            )
        ).scalar_one_or_none()

        if gw_phone is None:
            logger.warning(
                "Unknown gateway %s for call %s — defaulting to ANSWER",
                msg.gateway_id,
                msg.call_id,
            )
            return RoutingDecision(action=RoutingAction.ANSWER, call_id=msg.call_id)

        org_id = gw_phone.org_id

        # 2. Look up contact by caller number + org
        contact = db.execute(
            select(Contact).where(
                Contact.org_id == org_id,
                Contact.phone == msg.from_number,
            )
        ).scalar_one_or_none()

        contact_id = contact.id if contact else None
        contact_name = contact.name if contact else None

        # 3. Load active routing rules, sorted by priority (lowest = highest priority)
        rules = (
            db.execute(
                select(InboundRoutingRule)
                .where(
                    InboundRoutingRule.org_id == org_id,
                    InboundRoutingRule.is_active.is_(True),
                )
                .order_by(InboundRoutingRule.priority)
            )
            .scalars()
            .all()
        )

        # 4. Evaluate rules
        now = datetime.now(timezone.utc)
        for rule in rules:
            if self._rule_matches(rule, msg.from_number, contact, now):
                logger.info(
                    "Call %s matched rule '%s' (id=%s) → %s",
                    msg.call_id,
                    rule.name,
                    rule.id,
                    rule.action,
                )
                decision = RoutingDecision(
                    action=RoutingAction(rule.action),
                    call_id=msg.call_id,
                    org_id=org_id,
                    contact_id=contact_id,
                    contact_name=contact_name,
                    gateway_phone_id=gw_phone.id,
                    rule_id=rule.id,
                    rule_name=rule.name,
                )
                # Apply rule-specific overrides
                if rule.action == "forward" and rule.forward_to:
                    decision.forward_to = rule.forward_to
                if rule.action == "answer":
                    decision.system_instruction = rule.system_instruction
                    decision.voice_name = rule.voice_name
                return decision

        # 5. No rules matched — fallback to gateway auto_answer
        if gw_phone.auto_answer:
            logger.info(
                "Call %s: no rules matched, auto_answer=true → ANSWER",
                msg.call_id,
            )
            return RoutingDecision(
                action=RoutingAction.ANSWER,
                call_id=msg.call_id,
                org_id=org_id,
                contact_id=contact_id,
                contact_name=contact_name,
                gateway_phone_id=gw_phone.id,
                system_instruction=gw_phone.system_instruction,
                voice_name=gw_phone.voice_name,
            )

        # auto_answer=false and no rules → REJECT
        logger.info(
            "Call %s: no rules matched, auto_answer=false → REJECT",
            msg.call_id,
        )
        return RoutingDecision(
            action=RoutingAction.REJECT,
            call_id=msg.call_id,
            org_id=org_id,
            contact_id=contact_id,
            contact_name=contact_name,
            gateway_phone_id=gw_phone.id,
            reject_reason="no_matching_rule",
        )

    def _rule_matches(
        self,
        rule: InboundRoutingRule,
        caller_number: str,
        contact: Contact | None,
        now: datetime,
    ) -> bool:
        """Check if a routing rule matches the current call."""
        # Time-of-day check
        if not self._time_matches(rule, now):
            return False

        # Day-of-week check
        if rule.days_of_week is not None:
            current_day = now.weekday()  # 0=Monday, 6=Sunday
            if current_day not in rule.days_of_week:
                return False

        # Caller pattern check
        match rule.match_type:
            case "all":
                return True
            case "prefix":
                if rule.caller_pattern is None:
                    return True
                pattern = rule.caller_pattern.rstrip("*")
                return caller_number.startswith(pattern)
            case "exact":
                return rule.caller_pattern is not None and caller_number == rule.caller_pattern
            case "contact_only":
                return contact is not None
            case _:
                logger.warning("Unknown match_type '%s' in rule %s", rule.match_type, rule.id)
                return False

    @staticmethod
    def _time_matches(rule: InboundRoutingRule, now: datetime) -> bool:
        """Check if the current time falls within the rule's active window."""
        if rule.time_start is None and rule.time_end is None:
            return True

        current_time = now.time()
        start = rule.time_start or time(0, 0)
        end = rule.time_end or time(23, 59, 59)

        if start <= end:
            # Normal range (e.g., 09:00 to 17:00)
            return start <= current_time <= end
        else:
            # Overnight range (e.g., 22:00 to 06:00)
            return current_time >= start or current_time <= end

    async def log_interaction(
        self,
        decision: RoutingDecision,
        msg: IncomingCallMessage,
    ) -> uuid.UUID | None:
        """Log an inbound call interaction to the database.

        Returns the interaction ID, or None if logging fails.
        """
        return await asyncio.to_thread(self._log_interaction_sync, decision, msg)

    def _log_interaction_sync(
        self,
        decision: RoutingDecision,
        msg: IncomingCallMessage,
    ) -> uuid.UUID | None:
        db: Session = self._session_factory()
        try:
            interaction = Interaction(
                org_id=decision.org_id,
                contact_id=decision.contact_id,
                type="inbound_call",
                status="in_progress" if decision.action == RoutingAction.ANSWER else "completed",
                started_at=datetime.now(timezone.utc),
                metadata_={
                    "call_id": msg.call_id,
                    "gateway_id": msg.gateway_id,
                    "from_number": msg.from_number,
                    "to_number": msg.to_number,
                    "carrier": msg.carrier,
                    "sim_slot": msg.sim_slot,
                    "routing_action": decision.action.value,
                    "routing_rule_id": str(decision.rule_id) if decision.rule_id else None,
                    "routing_rule_name": decision.rule_name,
                    "forward_to": decision.forward_to,
                    "contact_name": decision.contact_name,
                },
            )
            db.add(interaction)
            db.commit()
            db.refresh(interaction)
            logger.info(
                "Logged inbound_call interaction %s for call %s (action=%s)",
                interaction.id,
                msg.call_id,
                decision.action.value,
            )
            return interaction.id
        except Exception:
            db.rollback()
            logger.exception("Failed to log inbound interaction for call %s", msg.call_id)
            return None
        finally:
            db.close()
