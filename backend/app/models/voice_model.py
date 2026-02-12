import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VoiceModel(Base):
    """Available TTS voice models for campaigns.

    Stores display metadata for voices available through Edge TTS and Azure.
    Used by the voice-models API to present voice options to the frontend.

    org_id is nullable: NULL means global (available to all orgs),
    a specific org_id means the voice is only available to that org.
    """

    __tablename__ = "voice_models"
    __table_args__ = (
        Index("ix_voice_models_provider", "provider"),
        Index("ix_voice_models_internal_name", "voice_internal_name", unique=True),
        Index("ix_voice_models_org_id", "org_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    voice_display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    voice_internal_name: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    locale: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ne-NP")
    gender: Mapped[str | None] = mapped_column(String(20))
    is_premium: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    organization: Mapped["Organization | None"] = relationship()

    def __repr__(self) -> str:
        return f"<VoiceModel {self.voice_display_name} ({self.voice_internal_name})>"
