"""A/B test model — defines split tests across campaigns or TTS providers."""

import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ABTest(Base):
    """A/B test definition — tracks variant assignments and outcomes.

    Each ABTest links to a parent campaign and defines variants.
    Variant campaigns are tagged via Campaign.ab_test_id + Campaign.ab_test_variant.

    Typical structure for variants JSONB:
    [
        {"name": "control", "campaign_id": "<uuid>", "description": "Original voice"},
        {"name": "variant_b", "campaign_id": "<uuid>", "description": "New TTS provider"},
    ]
    """

    __tablename__ = "ab_tests"
    __table_args__ = (
        Index("ix_ab_tests_org_id", "org_id"),
        Index("ix_ab_tests_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(
        Enum("draft", "active", "completed", name="ab_test_status"),
        nullable=False,
        server_default="draft",
    )
    variants: Mapped[list | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="ab_test")

    def __repr__(self) -> str:
        return f"<ABTest {self.name} ({self.status})>"
