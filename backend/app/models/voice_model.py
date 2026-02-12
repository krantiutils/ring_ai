import uuid
from datetime import datetime

from sqlalchemy import Boolean, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VoiceModel(Base):
    """Available TTS voice models for campaigns.

    Stores display metadata for voices available through Edge TTS and Azure.
    Used by the voice-models API to present voice options to the frontend.
    """

    __tablename__ = "voice_models"
    __table_args__ = (
        Index("ix_voice_models_provider", "provider"),
        Index("ix_voice_models_internal_name", "voice_internal_name", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    voice_display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    voice_internal_name: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    locale: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ne-NP")
    gender: Mapped[str | None] = mapped_column(String(20))
    is_premium: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def __repr__(self) -> str:
        return f"<VoiceModel {self.voice_display_name} ({self.voice_internal_name})>"
