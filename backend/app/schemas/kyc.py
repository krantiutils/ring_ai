import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class KYCStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    document_type: str
    submitted_at: datetime
    verified_at: datetime | None
    rejection_reason: str | None


class KYCSubmitResponse(BaseModel):
    id: uuid.UUID
    status: str
    message: str = "KYC documents submitted successfully"


class KYCAdminVerifyRequest(BaseModel):
    action: str  # "approve" or "reject"
    rejection_reason: str | None = None


class KYCAdminVerifyResponse(BaseModel):
    id: uuid.UUID
    status: str
    message: str
