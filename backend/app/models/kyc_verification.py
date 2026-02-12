import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class KYCVerification(Base):
    __tablename__ = "kyc_verifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    document_type: Mapped[str] = mapped_column(String(30), nullable=False)
    document_front_url: Mapped[str] = mapped_column(String(500), nullable=False)
    document_back_url: Mapped[str] = mapped_column(String(500), nullable=False)
    selfie_url: Mapped[str] = mapped_column(String(500), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="kyc_verifications")

    # Valid status values
    STATUS_PENDING = "pending"
    STATUS_SUBMITTED = "submitted"
    STATUS_VERIFIED = "verified"
    STATUS_REJECTED = "rejected"
    VALID_STATUSES = {STATUS_PENDING, STATUS_SUBMITTED, STATUS_VERIFIED, STATUS_REJECTED}

    # Valid document types
    DOCTYPE_CITIZENSHIP = "citizenship"
    DOCTYPE_PASSPORT = "passport"
    DOCTYPE_DRIVING_LICENSE = "driving_license"
    VALID_DOCUMENT_TYPES = {DOCTYPE_CITIZENSHIP, DOCTYPE_PASSPORT, DOCTYPE_DRIVING_LICENSE}

    def __repr__(self) -> str:
        return f"<KYCVerification user_id={self.user_id} status={self.status}>"
