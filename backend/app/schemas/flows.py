import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SourceKind = Literal["source_url_json", "source_url_csv"]


class UrlSourcePreviewRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    source_kind: SourceKind
    max_preview_rows: int = Field(default=6, ge=1, le=50)
    max_rows: int = Field(default=2000, ge=1, le=10000)


class UrlSourcePreviewResponse(BaseModel):
    headers: list[str]
    preview_rows: list[list[str]]
    total_rows: int
    mapping: str
    sample_csv: str


class ManualTableSourceUpsert(BaseModel):
    name: str = Field(default="Manual Table Source", min_length=1, max_length=255)
    headers: list[str] = Field(default_factory=list, max_length=128)
    rows: list[list[str]] = Field(default_factory=list, max_length=5000)


class ManualTableSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    headers: list[str]
    rows: list[list[str]]
    row_count: int
    created_at: datetime
    updated_at: datetime

