import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    username: str = Field(..., min_length=3, max_length=150)
    email: str = Field(..., min_length=5, max_length=255)
    phone: str | None = Field(None, max_length=20)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str
    message: str = "Registration successful"


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    username: str
    email: str
    phone: str | None
    address: str | None
    profile_picture: str | None
    is_verified: bool


class APIKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key_prefix: str
    last_used: datetime | None
    created_at: datetime


class APIKeyGenerateResponse(BaseModel):
    api_key: str
    message: str = "API key generated. Store it securely — it cannot be retrieved again."
