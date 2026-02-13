import uuid
from datetime import datetime

from sqlalchemy import Enum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key_hash: Mapped[str | None] = mapped_column(String(255), index=True)
    plan: Mapped[str] = mapped_column(
        Enum("startup", "mid", "enterprise", name="org_plan"),
        nullable=False,
        server_default="startup",
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="organization")
    contacts: Mapped[list["Contact"]] = relationship(back_populates="organization")
    templates: Mapped[list["Template"]] = relationship(back_populates="organization")
    forms: Mapped[list["Form"]] = relationship(back_populates="organization")
    tts_configs: Mapped[list["TTSProviderConfig"]] = relationship(back_populates="organization")
    phone_numbers: Mapped[list["PhoneNumber"]] = relationship(back_populates="organization")
    gateway_phones: Mapped[list["GatewayPhone"]] = relationship(back_populates="organization")
    credit: Mapped["Credit | None"] = relationship(back_populates="organization", uselist=False)

    def __repr__(self) -> str:
        return f"<Organization {self.name}>"
