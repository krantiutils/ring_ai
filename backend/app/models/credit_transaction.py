import uuid
from datetime import datetime

from sqlalchemy import Enum, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CreditTransaction(Base):
    """Immutable log of credit changes — purchase, consume, or refund."""

    __tablename__ = "credit_transactions"
    __table_args__ = (
        Index("ix_credit_transactions_org_id", "org_id"),
        Index("ix_credit_transactions_credit_id", "credit_id"),
        Index("ix_credit_transactions_type", "type"),
        Index("ix_credit_transactions_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    credit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credits.id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    type: Mapped[str] = mapped_column(
        Enum("purchase", "consume", "refund", name="credit_transaction_type"),
        nullable=False,
    )
    reference_id: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    credit: Mapped["Credit"] = relationship(back_populates="transactions")

    def __repr__(self) -> str:
        return f"<CreditTransaction {self.type} {self.amount}>"
