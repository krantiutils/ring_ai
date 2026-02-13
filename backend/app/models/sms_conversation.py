import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SmsConversation(Base):
    """Tracks a two-way SMS conversation between the org and a contact.

    Groups inbound + outbound messages into a threaded conversation.
    Status transitions: active -> needs_handoff -> closed (or active -> closed).
    """

    __tablename__ = "sms_conversations"
    __table_args__ = (
        Index("ix_sms_conversations_org_id", "org_id"),
        Index("ix_sms_conversations_contact_id", "contact_id"),
        Index("ix_sms_conversations_org_contact", "org_id", "contact_id"),
        Index("ix_sms_conversations_status", "status"),
        Index("ix_sms_conversations_last_message_at", "last_message_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("active", "needs_handoff", "closed", name="sms_conversation_status"),
        nullable=False,
        server_default="active",
    )
    last_message_at: Mapped[datetime | None] = mapped_column()
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    messages: Mapped[list["SmsMessage"]] = relationship(back_populates="conversation", order_by="SmsMessage.created_at")

    def __repr__(self) -> str:
        return f"<SmsConversation {self.id} status={self.status}>"
