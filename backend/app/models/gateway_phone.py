"""Android gateway phone registration.

Maps a physical Android gateway device to an organization. Stores
per-gateway configuration like auto-answer behavior, default voice,
and system instruction override for the Gemini AI agent.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GatewayPhone(Base):
    __tablename__ = "gateway_phones"
    __table_args__ = (
        Index("ix_gateway_phones_gateway_id", "gateway_id", unique=True),
        Index("ix_gateway_phones_org_id", "org_id"),
        Index("ix_gateway_phones_org_active", "org_id", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gateway_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255))
    auto_answer: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    system_instruction: Mapped[str | None] = mapped_column(Text)
    voice_name: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="gateway_phones")

    def __repr__(self) -> str:
        flags = []
        if self.is_active:
            flags.append("active")
        if self.auto_answer:
            flags.append("auto-answer")
        return f"<GatewayPhone {self.gateway_id} ({', '.join(flags)})>"
