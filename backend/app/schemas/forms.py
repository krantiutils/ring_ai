import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

QuestionType = Literal["multiple_choice", "text_input", "rating", "yes_no", "numeric"]
FormStatus = Literal["draft", "active", "archived"]


# ---------------------------------------------------------------------------
# Question schemas
# ---------------------------------------------------------------------------


class Question(BaseModel):
    """Single question in a form."""

    type: QuestionType
    text: str = Field(..., min_length=1, max_length=1000)
    options: list[str] | None = Field(
        None,
        description="Answer options (required for multiple_choice, ignored for others)",
    )
    required: bool = True


# ---------------------------------------------------------------------------
# Form CRUD schemas
# ---------------------------------------------------------------------------


class FormCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    questions: list[Question] = Field(..., min_length=1)
    org_id: uuid.UUID


class FormUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    questions: list[Question] | None = None
    status: FormStatus | None = None


class FormResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    title: str
    description: str | None
    questions: list[dict[str, Any]]
    status: FormStatus
    created_at: datetime
    updated_at: datetime


class FormDetailResponse(FormResponse):
    response_count: int = 0


class FormListResponse(BaseModel):
    items: list[FormResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Form response schemas
# ---------------------------------------------------------------------------


class FormSubmission(BaseModel):
    """Submit answers to a form for a specific contact."""

    contact_id: uuid.UUID
    answers: dict[str, Any] = Field(
        ...,
        description="Map of question index (as string) to answer value",
    )


class FormResponseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    form_id: uuid.UUID
    contact_id: uuid.UUID
    answers: dict[str, Any]
    completed_at: datetime | None
    created_at: datetime


class FormResponseListResponse(BaseModel):
    items: list[FormResponseSchema]
    total: int
    page: int
    page_size: int
