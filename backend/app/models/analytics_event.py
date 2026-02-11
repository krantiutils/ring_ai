import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    __table_args__ = (
        Index("ix_analytics_events_interaction_id", "interaction_id"),
        Index("ix_analytics_events_event_type", "event_type"),
        Index("ix_analytics_events_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    interaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("interactions.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_data: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    interaction: Mapped["Interaction"] = relationship(
        back_populates="analytics_events"
    )

    def __repr__(self) -> str:
        return f"<AnalyticsEvent {self.event_type}>"
