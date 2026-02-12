import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OTPRecord(Base):
    __tablename__ = "otp_records"
    __table_args__ = (
        Index("ix_otp_records_org_id", "org_id"),
        Index("ix_otp_records_phone_number", "phone_number"),
        Index("ix_otp_records_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    otp: Mapped[str] = mapped_column(String(20), nullable=False)
    otp_options: Mapped[str] = mapped_column(Enum("personnel", "generated", name="otp_type"), nullable=False)
    sms_send_options: Mapped[str] = mapped_column(Enum("text", "voice", name="delivery_method"), nullable=False)
    voice_input: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    organization: Mapped["Organization"] = relationship()

    def __repr__(self) -> str:
        return f"<OTPRecord {self.phone_number} ({self.sms_send_options})>"
