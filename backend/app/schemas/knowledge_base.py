import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Knowledge Base
# ---------------------------------------------------------------------------


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    org_id: uuid.UUID


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class KnowledgeBaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    description: str | None
    document_count: int = 0
    created_at: datetime
    updated_at: datetime


class KnowledgeBaseListResponse(BaseModel):
    items: list[KnowledgeBaseResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Knowledge Document
# ---------------------------------------------------------------------------


class KnowledgeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kb_id: uuid.UUID
    file_name: str
    file_type: str
    status: str
    chunk_count: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class KnowledgeDocumentListResponse(BaseModel):
    items: list[KnowledgeDocumentResponse]
    total: int


# ---------------------------------------------------------------------------
# Search / Retrieval
# ---------------------------------------------------------------------------


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)


class KnowledgeSearchResult(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    file_name: str
    content: str
    score: float


class KnowledgeSearchResponse(BaseModel):
    results: list[KnowledgeSearchResult]
    query: str
