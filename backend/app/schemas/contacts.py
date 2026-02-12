"""Pydantic schemas for standalone contact management."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ContactDetailResponse(BaseModel):
    """Full contact detail — standalone GET response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    phone: str
    name: str | None
    carrier: str | None = None
    attributes: dict[str, str] | None = Field(
        None,
        description="Custom key-value attributes stored in contact metadata",
    )
    created_at: datetime


class ContactUpdate(BaseModel):
    """PATCH body for editing contact phone/name."""

    phone: str | None = Field(None, min_length=1, max_length=20)
    name: str | None = Field(None, max_length=255)


class ContactAttributesUpdate(BaseModel):
    """PATCH body for editing contact custom attributes.

    Keys present in the payload are upserted; keys set to empty string are removed.
    """

    attributes: dict[str, str] = Field(
        ...,
        description=("Key-value pairs to upsert. Set a key's value to empty string to remove it."),
    )


class ContactAttributesResponse(BaseModel):
    """Response after attribute update — returns the full attribute dict."""

    attributes: dict[str, str]
