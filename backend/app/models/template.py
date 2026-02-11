import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Template(Base):
    __tablename__ = "templates"
    __table_args__ = (
        Index("ix_templates_org_id", "org_id"),
        Index("ix_templates_org_type", "org_id", "type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(
        Enum("voice", "text", name="template_type"), nullable=False
    )
    language: Mapped[str] = mapped_column(String(10), server_default="ne")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[dict | None] = mapped_column(JSONB)
    voice_config: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="templates")
    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="template")

    def __repr__(self) -> str:
        return f"<Template {self.name} ({self.type})>"
