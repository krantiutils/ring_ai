"""Knowledge base service — document processing, embedding, and RAG retrieval.

Handles the full RAG pipeline:
1. Document upload & text extraction (PDF/TXT)
2. Text chunking with sliding window overlap
3. Embedding generation via Gemini text-embedding-004
4. Vector similarity search via pgvector cosine distance
5. Context injection for Gemini Live sessions
"""

import io
import logging
import uuid

from google import genai
from pypdf import PdfReader
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge_base import KnowledgeBase, KnowledgeChunk, KnowledgeDocument

logger = logging.getLogger(__name__)

# Gemini embedding model — 768-dimensional output
EMBEDDING_MODEL = "text-embedding-004"

# Chunking parameters
CHUNK_SIZE_CHARS = 1000
CHUNK_OVERLAP_CHARS = 200


class KnowledgeBaseError(Exception):
    """Base error for knowledge base operations."""


class DocumentProcessingError(KnowledgeBaseError):
    """Failed to extract text from a document."""


class EmbeddingError(KnowledgeBaseError):
    """Failed to generate embeddings."""


# ---------------------------------------------------------------------------
# Document text extraction
# ---------------------------------------------------------------------------


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text content from a PDF file.

    Raises:
        DocumentProcessingError: If the PDF is unreadable or empty.
    """
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise DocumentProcessingError(f"Failed to read PDF: {exc}") from exc

    pages = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            pages.append(page_text)

    if not pages:
        raise DocumentProcessingError("PDF contains no extractable text")

    return "\n\n".join(pages)


def extract_text_from_txt(file_bytes: bytes) -> str:
    """Decode a plain text file.

    Tries UTF-8 first, falls back to latin-1.

    Raises:
        DocumentProcessingError: If decoding fails.
    """
    for encoding in ("utf-8", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise DocumentProcessingError("Failed to decode text file")


def extract_text(file_bytes: bytes, file_type: str) -> str:
    """Route to the correct text extractor based on file type.

    Args:
        file_bytes: Raw file contents.
        file_type: MIME type or extension hint (e.g. "pdf", "txt",
            "application/pdf", "text/plain").

    Raises:
        DocumentProcessingError: If file type is unsupported or extraction fails.
    """
    normalized = file_type.lower()
    if "pdf" in normalized:
        return extract_text_from_pdf(file_bytes)
    if "text" in normalized or "txt" in normalized:
        return extract_text_from_txt(file_bytes)
    raise DocumentProcessingError(f"Unsupported file type: {file_type}")


# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------


def chunk_text(
    text_content: str,
    chunk_size: int = CHUNK_SIZE_CHARS,
    overlap: int = CHUNK_OVERLAP_CHARS,
) -> list[str]:
    """Split text into overlapping chunks.

    Uses a sliding window approach: each chunk is ``chunk_size`` characters
    long, with ``overlap`` characters shared between consecutive chunks.

    Returns:
        A list of text chunks. Empty input returns an empty list.
    """
    if not text_content or not text_content.strip():
        return []

    text_content = text_content.strip()
    chunks: list[str] = []
    start = 0

    while start < len(text_content):
        end = start + chunk_size
        chunk = text_content[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap

    return chunks


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------


def _get_genai_client() -> genai.Client:
    """Create a Gemini client for embedding requests."""
    if not settings.GEMINI_API_KEY:
        raise EmbeddingError("GEMINI_API_KEY is required for embedding generation")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts using Gemini.

    Args:
        texts: List of text strings to embed.

    Returns:
        List of embedding vectors (each 768-dimensional).

    Raises:
        EmbeddingError: If the API call fails.
    """
    if not texts:
        return []

    client = _get_genai_client()
    embeddings: list[list[float]] = []

    # Gemini embed_content supports batching up to 100 texts
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        try:
            result = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=batch,
            )
            for emb in result.embeddings:
                embeddings.append(list(emb.values))
        except Exception as exc:
            raise EmbeddingError(f"Embedding API call failed: {exc}") from exc

    return embeddings


def generate_single_embedding(text_content: str) -> list[float]:
    """Generate an embedding vector for a single text string.

    Raises:
        EmbeddingError: If the API call fails.
    """
    results = generate_embeddings([text_content])
    if not results:
        raise EmbeddingError("No embedding returned for input text")
    return results[0]


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------


def create_knowledge_base(
    db: Session,
    org_id: uuid.UUID,
    name: str,
    description: str | None = None,
) -> KnowledgeBase:
    """Create a new knowledge base for an organization."""
    kb = KnowledgeBase(org_id=org_id, name=name, description=description)
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


def get_knowledge_base(
    db: Session,
    kb_id: uuid.UUID,
    org_id: uuid.UUID,
) -> KnowledgeBase | None:
    """Fetch a knowledge base by ID, scoped to org."""
    return db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.org_id == org_id,
        )
    ).scalar_one_or_none()


def list_knowledge_bases(
    db: Session,
    org_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[KnowledgeBase], int]:
    """List knowledge bases for an org with pagination.

    Returns:
        Tuple of (items, total_count).
    """
    base = select(KnowledgeBase).where(KnowledgeBase.org_id == org_id)
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()

    offset = (page - 1) * page_size
    items = db.execute(base.order_by(KnowledgeBase.created_at.desc()).offset(offset).limit(page_size)).scalars().all()
    return list(items), total


def update_knowledge_base(
    db: Session,
    kb: KnowledgeBase,
    name: str | None = None,
    description: str | None = None,
) -> KnowledgeBase:
    """Update knowledge base fields."""
    if name is not None:
        kb.name = name
    if description is not None:
        kb.description = description
    db.commit()
    db.refresh(kb)
    return kb


def delete_knowledge_base(db: Session, kb: KnowledgeBase) -> None:
    """Delete a knowledge base and all its documents/chunks (cascade)."""
    db.delete(kb)
    db.commit()


# ---------------------------------------------------------------------------
# Document upload & processing
# ---------------------------------------------------------------------------


def upload_document(
    db: Session,
    kb_id: uuid.UUID,
    file_name: str,
    file_type: str,
    file_bytes: bytes,
) -> KnowledgeDocument:
    """Upload and process a document into a knowledge base.

    1. Extract text from the uploaded file.
    2. Chunk the text.
    3. Generate embeddings for each chunk.
    4. Store everything in the database.

    Args:
        db: Database session.
        kb_id: Knowledge base ID to add the document to.
        file_name: Original file name.
        file_type: MIME type or extension hint.
        file_bytes: Raw file content.

    Returns:
        The created KnowledgeDocument with status "ready" on success.

    Raises:
        DocumentProcessingError: If text extraction fails.
        EmbeddingError: If embedding generation fails.
    """
    # Extract text
    content = extract_text(file_bytes, file_type)

    # Create the document record
    doc = KnowledgeDocument(
        kb_id=kb_id,
        file_name=file_name,
        file_type=file_type,
        content=content,
        status="processing",
    )
    db.add(doc)
    db.flush()  # Get the doc.id without committing

    try:
        # Chunk
        chunks = chunk_text(content)
        if not chunks:
            doc.status = "ready"
            doc.chunk_count = 0
            db.commit()
            db.refresh(doc)
            return doc

        # Generate embeddings
        embeddings = generate_embeddings(chunks)

        # Store chunks with embeddings
        for idx, (chunk_text_content, embedding) in enumerate(zip(chunks, embeddings)):
            chunk = KnowledgeChunk(
                document_id=doc.id,
                chunk_index=idx,
                content=chunk_text_content,
                embedding=embedding,
            )
            db.add(chunk)

        doc.status = "ready"
        doc.chunk_count = len(chunks)
        db.commit()
        db.refresh(doc)
        return doc

    except Exception as exc:
        doc.status = "error"
        doc.error_message = str(exc)
        db.commit()
        db.refresh(doc)
        raise


def delete_document(db: Session, doc: KnowledgeDocument) -> None:
    """Delete a document and all its chunks (cascade)."""
    db.delete(doc)
    db.commit()


def get_document(
    db: Session,
    doc_id: uuid.UUID,
    kb_id: uuid.UUID,
) -> KnowledgeDocument | None:
    """Fetch a document by ID, scoped to KB."""
    return db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == doc_id,
            KnowledgeDocument.kb_id == kb_id,
        )
    ).scalar_one_or_none()


def list_documents(
    db: Session,
    kb_id: uuid.UUID,
) -> tuple[list[KnowledgeDocument], int]:
    """List all documents in a knowledge base.

    Returns:
        Tuple of (items, total_count).
    """
    base = select(KnowledgeDocument).where(KnowledgeDocument.kb_id == kb_id)
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    items = db.execute(base.order_by(KnowledgeDocument.created_at.desc())).scalars().all()
    return list(items), total


# ---------------------------------------------------------------------------
# RAG retrieval
# ---------------------------------------------------------------------------


def search_knowledge_base(
    db: Session,
    kb_id: uuid.UUID,
    query: str,
    top_k: int = 5,
) -> list[dict]:
    """Search a knowledge base using vector similarity.

    Generates an embedding for the query, then performs cosine distance
    search against all chunks in the knowledge base.

    Args:
        db: Database session.
        kb_id: Knowledge base to search.
        query: Natural language query.
        top_k: Number of results to return.

    Returns:
        List of dicts with keys: chunk_id, document_id, file_name,
        content, score.
    """
    query_embedding = generate_single_embedding(query)

    # pgvector cosine distance operator: <=>
    # Lower distance = more similar, so we convert to a similarity score.
    results = db.execute(
        text("""
            SELECT
                kc.id AS chunk_id,
                kc.document_id,
                kd.file_name,
                kc.content,
                1 - (kc.embedding <=> :query_embedding::vector) AS score
            FROM knowledge_chunks kc
            JOIN knowledge_documents kd ON kd.id = kc.document_id
            WHERE kd.kb_id = :kb_id
                AND kd.status = 'ready'
                AND kc.embedding IS NOT NULL
            ORDER BY kc.embedding <=> :query_embedding::vector
            LIMIT :top_k
        """),
        {
            "query_embedding": str(query_embedding),
            "kb_id": str(kb_id),
            "top_k": top_k,
        },
    ).fetchall()

    return [
        {
            "chunk_id": row.chunk_id,
            "document_id": row.document_id,
            "file_name": row.file_name,
            "content": row.content,
            "score": float(row.score),
        }
        for row in results
    ]


def retrieve_context_for_session(
    db: Session,
    kb_id: uuid.UUID,
    query: str | None = None,
    top_k: int = 5,
) -> str:
    """Retrieve relevant knowledge base context for a Gemini session.

    If no query is provided, returns the top chunks by most recent
    insertion (useful for pre-seeding context at session start).

    Args:
        db: Database session.
        kb_id: Knowledge base to pull context from.
        query: Optional search query for targeted retrieval.
        top_k: Number of chunks to include.

    Returns:
        A formatted string of context passages to inject into
        the system instruction.
    """
    if query:
        results = search_knowledge_base(db, kb_id, query, top_k=top_k)
    else:
        # No query — return most recent chunks as general context
        rows = db.execute(
            select(KnowledgeChunk.content, KnowledgeDocument.file_name)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(
                KnowledgeDocument.kb_id == kb_id,
                KnowledgeDocument.status == "ready",
            )
            .order_by(KnowledgeChunk.created_at.desc())
            .limit(top_k)
        ).fetchall()
        results = [{"file_name": row.file_name, "content": row.content} for row in rows]

    if not results:
        return ""

    context_parts = []
    for r in results:
        source = r.get("file_name", "unknown")
        content = r["content"]
        context_parts.append(f"[Source: {source}]\n{content}")

    return (
        "\n\n--- KNOWLEDGE BASE CONTEXT ---\n"
        "Use the following business-specific information to answer questions accurately. "
        "If the information below doesn't cover the question, say so honestly.\n\n"
        + "\n\n".join(context_parts)
        + "\n--- END KNOWLEDGE BASE CONTEXT ---"
    )


def build_system_instruction_with_context(
    base_instruction: str,
    kb_context: str,
) -> str:
    """Combine the default system instruction with RAG context.

    Args:
        base_instruction: The default system instruction for Gemini.
        kb_context: Context retrieved from the knowledge base.

    Returns:
        Enhanced system instruction with injected context.
    """
    if not kb_context:
        return base_instruction
    return f"{base_instruction}\n\n{kb_context}"
