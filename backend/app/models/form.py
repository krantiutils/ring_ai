import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Form(Base):
    """Survey/form definition with JSONB questions array.

    Each question in the questions array is a dict:
        {
            "type": "multiple_choice" | "text_input" | "rating" | "yes_no" | "numeric",
            "text": "Question text (supports Nepali)",
            "options": ["Option A", "Option B", ...],  # only for multiple_choice
            "required": true/false
        }
    """

    __tablename__ = "forms"
    __table_args__ = (
        Index("ix_forms_org_id", "org_id"),
        Index("ix_forms_status", "status"),
        Index("ix_forms_org_status", "org_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    questions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(
        Enum("draft", "active", "archived", name="form_status"),
        nullable=False,
        server_default="draft",
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="forms")
    responses: Mapped[list["FormResponse"]] = relationship(back_populates="form", cascade="all, delete-orphan")
    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="form", foreign_keys="Campaign.form_id")

    def __repr__(self) -> str:
        return f"<Form {self.title} ({self.status})>"
