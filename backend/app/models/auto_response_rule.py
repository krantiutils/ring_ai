import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AutoResponseRule(Base):
    """Keyword-based auto-response rule for inbound SMS.

    When an inbound message matches the keyword (exact or contains),
    the system automatically sends the response_template back.
    Rules are evaluated in priority order (lower = higher priority).
    """

    __tablename__ = "auto_response_rules"
    __table_args__ = (
        Index("ix_auto_response_rules_org_id", "org_id"),
        Index("ix_auto_response_rules_org_active", "org_id", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    match_type: Mapped[str] = mapped_column(
        Enum("exact", "contains", name="auto_response_match_type"),
        nullable=False,
        server_default="contains",
    )
    response_template: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    organization: Mapped["Organization"] = relationship()

    def __repr__(self) -> str:
        return f"<AutoResponseRule keyword='{self.keyword}' active={self.is_active}>"
