"""Knowledge base API — CRUD, document upload, and RAG search."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate,
    KnowledgeBaseListResponse,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    KnowledgeSearchResult,
)
from app.services.knowledge_base import (
    DocumentProcessingError,
    EmbeddingError,
    create_knowledge_base,
    delete_document,
    delete_knowledge_base,
    get_document,
    get_knowledge_base,
    list_documents,
    list_knowledge_bases,
    search_knowledge_base,
    update_knowledge_base,
    upload_document,
)

router = APIRouter()

ALLOWED_FILE_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "txt",
}
MAX_FILE_SIZE_MB = 20


# ---------------------------------------------------------------------------
# Knowledge Base CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=KnowledgeBaseResponse, status_code=201)
def create_kb(payload: KnowledgeBaseCreate, db: Session = Depends(get_db)):
    """Create a new knowledge base for an organization."""
    kb = create_knowledge_base(db, payload.org_id, payload.name, payload.description)
    doc_count = 0
    return KnowledgeBaseResponse(
        id=kb.id,
        org_id=kb.org_id,
        name=kb.name,
        description=kb.description,
        document_count=doc_count,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
    )


@router.get("/", response_model=KnowledgeBaseListResponse)
def list_kbs(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List knowledge bases for an organization."""
    items, total = list_knowledge_bases(db, org_id, page, page_size)
    return KnowledgeBaseListResponse(
        items=[
            KnowledgeBaseResponse(
                id=kb.id,
                org_id=kb.org_id,
                name=kb.name,
                description=kb.description,
                document_count=len(kb.documents),
                created_at=kb.created_at,
                updated_at=kb.updated_at,
            )
            for kb in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_kb(
    kb_id: uuid.UUID,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Get a specific knowledge base."""
    kb = get_knowledge_base(db, kb_id, org_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return KnowledgeBaseResponse(
        id=kb.id,
        org_id=kb.org_id,
        name=kb.name,
        description=kb.description,
        document_count=len(kb.documents),
        created_at=kb.created_at,
        updated_at=kb.updated_at,
    )


@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_kb(
    kb_id: uuid.UUID,
    payload: KnowledgeBaseUpdate,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Update a knowledge base."""
    kb = get_knowledge_base(db, kb_id, org_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    update_data = payload.model_dump(exclude_unset=True)
    kb = update_knowledge_base(db, kb, **update_data)
    return KnowledgeBaseResponse(
        id=kb.id,
        org_id=kb.org_id,
        name=kb.name,
        description=kb.description,
        document_count=len(kb.documents),
        created_at=kb.created_at,
        updated_at=kb.updated_at,
    )


@router.delete("/{kb_id}", status_code=204)
def delete_kb(
    kb_id: uuid.UUID,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Delete a knowledge base and all its documents."""
    kb = get_knowledge_base(db, kb_id, org_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    delete_knowledge_base(db, kb)


# ---------------------------------------------------------------------------
# Document management
# ---------------------------------------------------------------------------


@router.get("/{kb_id}/documents", response_model=KnowledgeDocumentListResponse)
def list_docs(
    kb_id: uuid.UUID,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """List documents in a knowledge base."""
    kb = get_knowledge_base(db, kb_id, org_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    items, total = list_documents(db, kb_id)
    return KnowledgeDocumentListResponse(
        items=[
            KnowledgeDocumentResponse(
                id=doc.id,
                kb_id=doc.kb_id,
                file_name=doc.file_name,
                file_type=doc.file_type,
                status=doc.status,
                chunk_count=doc.chunk_count,
                error_message=doc.error_message,
                created_at=doc.created_at,
                updated_at=doc.updated_at,
            )
            for doc in items
        ],
        total=total,
    )


@router.post("/{kb_id}/documents", response_model=KnowledgeDocumentResponse, status_code=201)
async def upload_doc(
    kb_id: uuid.UUID,
    file: UploadFile,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Upload a document (PDF or text) to a knowledge base.

    The document will be processed immediately: text extraction, chunking,
    and embedding generation all happen synchronously.
    """
    kb = get_knowledge_base(db, kb_id, org_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Validate file type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type: {content_type}. Allowed: PDF, plain text.",
        )

    # Read and validate file size
    file_bytes = await file.read()
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=422,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE_MB}MB.",
        )

    file_type = ALLOWED_FILE_TYPES[content_type]

    try:
        doc = upload_document(
            db=db,
            kb_id=kb_id,
            file_name=file.filename or "untitled",
            file_type=file_type,
            file_bytes=file_bytes,
        )
    except DocumentProcessingError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except EmbeddingError as exc:
        raise HTTPException(status_code=502, detail=f"Embedding generation failed: {exc}")

    return KnowledgeDocumentResponse(
        id=doc.id,
        kb_id=doc.kb_id,
        file_name=doc.file_name,
        file_type=doc.file_type,
        status=doc.status,
        chunk_count=doc.chunk_count,
        error_message=doc.error_message,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.delete("/{kb_id}/documents/{doc_id}", status_code=204)
def delete_doc(
    kb_id: uuid.UUID,
    doc_id: uuid.UUID,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Delete a document from a knowledge base."""
    kb = get_knowledge_base(db, kb_id, org_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    doc = get_document(db, doc_id, kb_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    delete_document(db, doc)


# ---------------------------------------------------------------------------
# RAG Search
# ---------------------------------------------------------------------------


@router.post("/{kb_id}/search", response_model=KnowledgeSearchResponse)
def search_kb(
    kb_id: uuid.UUID,
    payload: KnowledgeSearchRequest,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Search a knowledge base using natural language.

    Returns the most relevant document chunks ranked by cosine similarity.
    """
    kb = get_knowledge_base(db, kb_id, org_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    try:
        results = search_knowledge_base(db, kb_id, payload.query, payload.top_k)
    except EmbeddingError as exc:
        raise HTTPException(status_code=502, detail=f"Search failed: {exc}")

    return KnowledgeSearchResponse(
        results=[
            KnowledgeSearchResult(
                chunk_id=r["chunk_id"],
                document_id=r["document_id"],
                file_name=r["file_name"],
                content=r["content"],
                score=r["score"],
            )
            for r in results
        ],
        query=payload.query,
    )
