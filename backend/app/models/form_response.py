import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class FormResponse(Base):
    """A contact's answers to a form/survey.

    The answers field is a JSONB dict mapping question index (as string key)
    to the answer value:
        {
            "0": "Option A",        # multiple_choice answer
            "1": "Free text here",  # text_input answer
            "2": 4,                 # rating (1-5)
            "3": true,              # yes_no
            "4": 42                 # numeric
        }
    """

    __tablename__ = "form_responses"
    __table_args__ = (
        Index("ix_form_responses_form_id", "form_id"),
        Index("ix_form_responses_contact_id", "contact_id"),
        Index("ix_form_responses_form_contact", "form_id", "contact_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    form_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("forms.id"), nullable=False
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=False
    )
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    completed_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    form: Mapped["Form"] = relationship(back_populates="responses")
    contact: Mapped["Contact"] = relationship(back_populates="form_responses")

    def __repr__(self) -> str:
        completed = "complete" if self.completed_at else "partial"
        return f"<FormResponse form={self.form_id} ({completed})>"
