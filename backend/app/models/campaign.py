import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        Index("ix_campaigns_org_id", "org_id"),
        Index("ix_campaigns_status", "status"),
        Index("ix_campaigns_org_status", "org_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(Enum("voice", "text", "form", name="campaign_type"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(
            "draft",
            "scheduled",
            "active",
            "paused",
            "completed",
            name="campaign_status",
        ),
        nullable=False,
        server_default="draft",
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.id"))
    schedule_config: Mapped[dict | None] = mapped_column(JSONB)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    retry_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    retry_config: Mapped[dict | None] = mapped_column(JSONB)
    source_campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="campaigns")
    template: Mapped["Template | None"] = relationship(back_populates="campaigns")
    interactions: Mapped[list["Interaction"]] = relationship(back_populates="campaign")

    def __repr__(self) -> str:
        return f"<Campaign {self.name} ({self.type}/{self.status})>"
