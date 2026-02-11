import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TemplateType = Literal["voice", "text"]


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)
    type: TemplateType
    org_id: uuid.UUID
    language: str = "ne"
    voice_config: dict | None = None


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = Field(None, min_length=1)
    type: TemplateType | None = None
    language: str | None = None
    voice_config: dict | None = None


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    content: str
    type: TemplateType
    language: str
    variables: list[str] | None
    voice_config: dict | None
    created_at: datetime


class TemplateListResponse(BaseModel):
    items: list[TemplateResponse]
    total: int
    page: int
    page_size: int


class RenderRequest(BaseModel):
    variables: dict[str, str] = Field(
        ...,
        description="Map of variable names to values for substitution",
    )


class RenderResponse(BaseModel):
    rendered_text: str
    type: TemplateType


class ValidateResponse(BaseModel):
    is_valid: bool
    required_variables: list[str]
    variables_with_defaults: list[str]
    conditional_variables: list[str]
    errors: list[str]
