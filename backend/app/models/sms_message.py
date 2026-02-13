import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SmsMessage(Base):
    """Individual SMS message — either inbound (received) or outbound (sent).

    Linked to a conversation for threading. Tracks Twilio message SID
    and delivery status via webhook updates.
    """

    __tablename__ = "sms_messages"
    __table_args__ = (
        Index("ix_sms_messages_conversation_id", "conversation_id"),
        Index("ix_sms_messages_twilio_sid", "twilio_sid"),
        Index("ix_sms_messages_direction", "direction"),
        Index("ix_sms_messages_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sms_conversations.id"), nullable=False
    )
    direction: Mapped[str] = mapped_column(
        Enum("inbound", "outbound", name="sms_direction"),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    from_number: Mapped[str] = mapped_column(String(20), nullable=False)
    to_number: Mapped[str] = mapped_column(String(20), nullable=False)
    twilio_sid: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(
        Enum("queued", "sent", "delivered", "failed", "undelivered", "received", name="sms_message_status"),
        nullable=False,
        server_default="queued",
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    conversation: Mapped["SmsConversation"] = relationship(back_populates="messages")

    def __repr__(self) -> str:
        return f"<SmsMessage {self.direction} status={self.status}>"
