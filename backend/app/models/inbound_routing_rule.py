"""Inbound call routing rules.

Priority-ordered rules evaluated when an INCOMING_CALL arrives from
an Android gateway. Rules match on caller number pattern and time-of-day
to determine the routing action (answer, reject, or forward).

Rules are evaluated lowest-priority-number-first. The first matching rule
wins. If no rules match, the gateway phone's auto_answer setting is used
as fallback (auto_answer=true → ANSWER with defaults).
"""

import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, Enum, ForeignKey, Index, Integer, String, Text, Time, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InboundRoutingRule(Base):
    __tablename__ = "inbound_routing_rules"
    __table_args__ = (
        Index("ix_inbound_routing_rules_org_id", "org_id"),
        Index("ix_inbound_routing_rules_org_active", "org_id", "is_active"),
        Index("ix_inbound_routing_rules_org_priority", "org_id", "priority"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    caller_pattern: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="Caller number pattern. Prefix match with trailing '*' (e.g. '+9771*'), "
        "or exact match. NULL matches all callers.",
    )
    match_type: Mapped[str] = mapped_column(
        Enum("all", "prefix", "exact", "contact_only", name="inbound_routing_match_type"),
        nullable=False,
        server_default="all",
    )
    action: Mapped[str] = mapped_column(
        Enum("answer", "reject", "forward", name="inbound_routing_action"),
        nullable=False,
        server_default="answer",
    )
    forward_to: Mapped[str | None] = mapped_column(
        String(20), nullable=True, doc="Phone number to forward to when action is 'forward'."
    )
    system_instruction: Mapped[str | None] = mapped_column(
        Text, nullable=True, doc="Override system instruction for the Gemini agent on this rule."
    )
    voice_name: Mapped[str | None] = mapped_column(
        String(50), nullable=True, doc="Override voice name for the Gemini agent on this rule."
    )
    time_start: Mapped[time | None] = mapped_column(
        Time, nullable=True, doc="Start of active time window (inclusive). NULL means no time restriction."
    )
    time_end: Mapped[time | None] = mapped_column(
        Time, nullable=True, doc="End of active time window (inclusive). NULL means no time restriction."
    )
    days_of_week: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
        doc="Active days as integers (0=Monday, 6=Sunday). NULL means all days.",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    organization: Mapped["Organization"] = relationship()

    def __repr__(self) -> str:
        return f"<InboundRoutingRule '{self.name}' action={self.action} priority={self.priority}>"
