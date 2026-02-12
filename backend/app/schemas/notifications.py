import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

NotificationType = Literal["info", "warning", "success", "error"]


class NotificationCreate(BaseModel):
    """Request body for creating a notification (internal/admin use)."""

    user_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    type: NotificationType = "info"


class NotificationResponse(BaseModel):
    """Single notification response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    message: str
    type: NotificationType
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Paginated notification list."""

    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int


class UnreadCountResponse(BaseModel):
    """Unread notification count."""

    unread_count: int
