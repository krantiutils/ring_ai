import uuid
from datetime import datetime

from sqlalchemy import Enum, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Interaction(Base):
    __tablename__ = "interactions"
    __table_args__ = (
        Index("ix_interactions_campaign_id", "campaign_id"),
        Index("ix_interactions_contact_id", "contact_id"),
        Index("ix_interactions_status", "status"),
        Index("ix_interactions_campaign_status", "campaign_id", "status"),
        Index("ix_interactions_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=False)
    type: Mapped[str] = mapped_column(
        Enum(
            "outbound_call",
            "inbound_call",
            "sms",
            "form_response",
            name="interaction_type",
        ),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Enum(
            "pending",
            "in_progress",
            "completed",
            "failed",
            name="interaction_status",
        ),
        nullable=False,
        server_default="pending",
    )
    started_at: Mapped[datetime | None] = mapped_column()
    ended_at: Mapped[datetime | None] = mapped_column()
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    credit_consumed: Mapped[float | None] = mapped_column(Float)
    transcript: Mapped[str | None] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(String(500))
    audio_duration_seconds: Mapped[int | None] = mapped_column(Integer)
    playback_duration_seconds: Mapped[int | None] = mapped_column(Integer)
    playback_percentage: Mapped[float | None] = mapped_column(Float)
    sentiment_score: Mapped[float | None] = mapped_column(Float)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    campaign: Mapped["Campaign"] = relationship(back_populates="interactions")
    contact: Mapped["Contact"] = relationship(back_populates="interactions")
    analytics_events: Mapped[list["AnalyticsEvent"]] = relationship(back_populates="interaction")

    def __repr__(self) -> str:
        return f"<Interaction {self.type}/{self.status}>"
