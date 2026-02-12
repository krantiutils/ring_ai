import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PhoneNumber(Base):
    """Phone numbers associated with an organization.

    Broker phones: numbers the org uses as caller ID for outbound calls.
    Active phones: all active numbers associated with the org.
    """

    __tablename__ = "phone_numbers"
    __table_args__ = (
        Index("ix_phone_numbers_org_id", "org_id"),
        Index("ix_phone_numbers_org_active", "org_id", "is_active"),
        Index("ix_phone_numbers_org_broker", "org_id", "is_broker"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    is_broker: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="phone_numbers")

    def __repr__(self) -> str:
        flags = []
        if self.is_active:
            flags.append("active")
        if self.is_broker:
            flags.append("broker")
        return f"<PhoneNumber {self.phone_number} ({', '.join(flags)})>"
