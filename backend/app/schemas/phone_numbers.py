import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PhoneNumberCreate(BaseModel):
    phone_number: str = Field(
        ..., min_length=1, max_length=20, description="E.164 phone number"
    )
    org_id: uuid.UUID
    is_broker: bool = False


class PhoneNumberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone_number: str


class PhoneNumberDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone_number: str
    org_id: uuid.UUID
    is_active: bool
    is_broker: bool
    created_at: datetime
