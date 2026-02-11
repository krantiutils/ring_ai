import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, LargeBinary, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TTSProviderConfig(Base):
    __tablename__ = "tts_provider_configs"
    __table_args__ = (
        UniqueConstraint("org_id", "provider", name="uq_tts_org_provider"),
        Index("ix_tts_provider_configs_org_id", "org_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    is_default: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    voice: Mapped[str] = mapped_column(String(100), nullable=False)
    rate: Mapped[str] = mapped_column(String(10), server_default="+0%")
    pitch: Mapped[str] = mapped_column(String(10), server_default="+0Hz")
    credentials_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped["Organization"] = relationship(back_populates="tts_configs")

    def __repr__(self) -> str:
        return f"<TTSProviderConfig {self.provider} (org={self.org_id})>"
