import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Credit(Base):
    """Organization credit balance — one row per org."""

    __tablename__ = "credits"
    __table_args__ = (
        Index("ix_credits_org_id", "org_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, unique=True
    )
    balance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_purchased: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_consumed: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped["Organization"] = relationship(back_populates="credit")
    transactions: Mapped[list["CreditTransaction"]] = relationship(
        back_populates="credit", order_by="CreditTransaction.created_at.desc()"
    )

    def __repr__(self) -> str:
        return f"<Credit org={self.org_id} balance={self.balance}>"
