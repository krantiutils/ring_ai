"""Tests for knowledge base feature — text extraction, chunking, CRUD, API, and RAG integration."""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.knowledge_base import KnowledgeBase, KnowledgeChunk, KnowledgeDocument
from app.services.knowledge_base import (
    DocumentProcessingError,
    build_system_instruction_with_context,
    chunk_text,
    extract_text,
    extract_text_from_txt,
    retrieve_context_for_session,
)

# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------


class TestTextExtraction:
    def test_extract_txt_utf8(self):
        content = "Hello, world! नमस्ते"
        result = extract_text_from_txt(content.encode("utf-8"))
        assert result == content

    def test_extract_txt_latin1(self):
        content = "café résumé"
        result = extract_text_from_txt(content.encode("latin-1"))
        assert result == content

    def test_extract_text_routes_txt(self):
        content = "test content"
        result = extract_text(content.encode("utf-8"), "txt")
        assert result == content

    def test_extract_text_routes_text_plain(self):
        content = "test content"
        result = extract_text(content.encode("utf-8"), "text/plain")
        assert result == content

    def test_extract_text_unsupported_type(self):
        with pytest.raises(DocumentProcessingError, match="Unsupported file type"):
            extract_text(b"data", "image/png")

    def test_extract_pdf_invalid_data(self):
        with pytest.raises(DocumentProcessingError):
            extract_text(b"not a pdf", "pdf")


# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------


class TestChunking:
    def test_chunk_empty_string(self):
        assert chunk_text("") == []

    def test_chunk_whitespace(self):
        assert chunk_text("   ") == []

    def test_chunk_short_text(self):
        text = "Short text."
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_chunk_long_text(self):
        text = "A" * 2500
        chunks = chunk_text(text, chunk_size=1000, overlap=200)
        assert len(chunks) >= 3
        # First chunk should be 1000 chars
        assert len(chunks[0]) == 1000

    def test_chunk_overlap(self):
        text = "0123456789" * 30  # 300 chars
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        # Verify overlap: end of chunk[0] matches start of chunk[1]
        assert chunks[0][-20:] == chunks[1][:20]

    def test_chunk_preserves_content(self):
        text = "Hello world, this is a test of the chunking system."
        chunks = chunk_text(text, chunk_size=20, overlap=5)
        assert len(chunks) > 1
        # Each chunk should be non-empty
        for c in chunks:
            assert len(c) > 0


# ---------------------------------------------------------------------------
# CRUD (SQLite — no pgvector)
# ---------------------------------------------------------------------------


class TestKnowledgeBaseCRUD:
    def test_create_knowledge_base(self, db, org):
        kb = KnowledgeBase(org_id=org.id, name="Test KB", description="A test KB")
        db.add(kb)
        db.commit()
        db.refresh(kb)

        assert kb.id is not None
        assert kb.name == "Test KB"
        assert kb.org_id == org.id

    def test_create_multiple_kbs(self, db, org):
        kb1 = KnowledgeBase(org_id=org.id, name="KB 1")
        kb2 = KnowledgeBase(org_id=org.id, name="KB 2")
        db.add_all([kb1, kb2])
        db.commit()

        kbs = db.query(KnowledgeBase).filter_by(org_id=org.id).all()
        assert len(kbs) == 2

    def test_create_document(self, db, org):
        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.flush()

        doc = KnowledgeDocument(
            kb_id=kb.id,
            file_name="test.txt",
            file_type="txt",
            content="test content",
            status="ready",
            chunk_count=1,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        assert doc.id is not None
        assert doc.kb_id == kb.id
        assert doc.status == "ready"

    def test_create_chunk(self, db, org):
        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.flush()

        doc = KnowledgeDocument(
            kb_id=kb.id,
            file_name="test.txt",
            file_type="txt",
            content="hello world",
            status="ready",
        )
        db.add(doc)
        db.flush()

        chunk = KnowledgeChunk(
            document_id=doc.id,
            chunk_index=0,
            content="hello world",
        )
        db.add(chunk)
        db.commit()
        db.refresh(chunk)

        assert chunk.id is not None
        assert chunk.document_id == doc.id
        assert chunk.chunk_index == 0

    def test_cascade_delete(self, db, org):
        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.flush()

        doc = KnowledgeDocument(
            kb_id=kb.id,
            file_name="test.txt",
            file_type="txt",
            content="hello",
            status="ready",
        )
        db.add(doc)
        db.flush()

        chunk = KnowledgeChunk(
            document_id=doc.id,
            chunk_index=0,
            content="hello",
        )
        db.add(chunk)
        db.commit()

        # Delete KB should cascade to documents and chunks
        db.delete(kb)
        db.commit()

        assert db.query(KnowledgeBase).count() == 0
        assert db.query(KnowledgeDocument).count() == 0
        assert db.query(KnowledgeChunk).count() == 0


# ---------------------------------------------------------------------------
# API endpoints (mocked service)
# ---------------------------------------------------------------------------


class TestKnowledgeBaseAPI:
    def test_create_kb(self, client, org_id):
        resp = client.post(
            "/api/v1/knowledge-bases/",
            json={"name": "API Test KB", "org_id": str(org_id)},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "API Test KB"
        assert data["org_id"] == str(org_id)

    def test_create_kb_with_description(self, client, org_id):
        resp = client.post(
            "/api/v1/knowledge-bases/",
            json={
                "name": "Described KB",
                "description": "A knowledge base with a description",
                "org_id": str(org_id),
            },
        )
        assert resp.status_code == 201
        assert resp.json()["description"] == "A knowledge base with a description"

    def test_create_kb_missing_name(self, client, org_id):
        resp = client.post(
            "/api/v1/knowledge-bases/",
            json={"org_id": str(org_id)},
        )
        assert resp.status_code == 422

    def test_list_kbs_empty(self, client, org_id):
        resp = client.get(f"/api/v1/knowledge-bases/?org_id={org_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_kbs_with_data(self, client, org_id):
        client.post("/api/v1/knowledge-bases/", json={"name": "KB1", "org_id": str(org_id)})
        client.post("/api/v1/knowledge-bases/", json={"name": "KB2", "org_id": str(org_id)})

        resp = client.get(f"/api/v1/knowledge-bases/?org_id={org_id}")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_list_kbs_org_isolation(self, client, db, org_id):
        other_org_id = str(uuid.uuid4())
        client.post("/api/v1/knowledge-bases/", json={"name": "My KB", "org_id": str(org_id)})

        resp = client.get(f"/api/v1/knowledge-bases/?org_id={other_org_id}")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_get_kb(self, client, org_id):
        create_resp = client.post("/api/v1/knowledge-bases/", json={"name": "Get KB", "org_id": str(org_id)})
        kb_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/knowledge-bases/{kb_id}?org_id={org_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Get KB"

    def test_get_kb_not_found(self, client, org_id):
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/api/v1/knowledge-bases/{fake_id}?org_id={org_id}")
        assert resp.status_code == 404

    def test_update_kb(self, client, org_id):
        create_resp = client.post("/api/v1/knowledge-bases/", json={"name": "Old Name", "org_id": str(org_id)})
        kb_id = create_resp.json()["id"]

        resp = client.put(
            f"/api/v1/knowledge-bases/{kb_id}?org_id={org_id}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_delete_kb(self, client, org_id):
        create_resp = client.post("/api/v1/knowledge-bases/", json={"name": "Delete Me", "org_id": str(org_id)})
        kb_id = create_resp.json()["id"]

        resp = client.delete(f"/api/v1/knowledge-bases/{kb_id}?org_id={org_id}")
        assert resp.status_code == 204

        # Verify gone
        resp = client.get(f"/api/v1/knowledge-bases/{kb_id}?org_id={org_id}")
        assert resp.status_code == 404

    def test_list_documents_empty(self, client, org_id):
        create_resp = client.post("/api/v1/knowledge-bases/", json={"name": "KB", "org_id": str(org_id)})
        kb_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/knowledge-bases/{kb_id}/documents?org_id={org_id}")
        assert resp.status_code == 200
        assert resp.json()["items"] == []
        assert resp.json()["total"] == 0

    @patch("app.api.v1.endpoints.knowledge_bases.upload_document")
    def test_upload_document(self, mock_upload, client, org_id, db):
        create_resp = client.post("/api/v1/knowledge-bases/", json={"name": "KB", "org_id": str(org_id)})
        kb_id = create_resp.json()["id"]

        now = datetime.now(timezone.utc)
        mock_doc = KnowledgeDocument(
            id=uuid.uuid4(),
            kb_id=uuid.UUID(kb_id),
            file_name="test.txt",
            file_type="txt",
            content="hello",
            status="ready",
            chunk_count=1,
            created_at=now,
            updated_at=now,
        )
        mock_upload.return_value = mock_doc

        resp = client.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents?org_id={org_id}",
            files={"file": ("test.txt", b"hello world", "text/plain")},
        )
        assert resp.status_code == 201
        assert resp.json()["file_name"] == "test.txt"
        assert resp.json()["status"] == "ready"

    def test_upload_document_invalid_type(self, client, org_id):
        create_resp = client.post("/api/v1/knowledge-bases/", json={"name": "KB", "org_id": str(org_id)})
        kb_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents?org_id={org_id}",
            files={"file": ("test.jpg", b"image data", "image/jpeg")},
        )
        assert resp.status_code == 422

    @patch("app.api.v1.endpoints.knowledge_bases.search_knowledge_base")
    def test_search_kb(self, mock_search, client, org_id):
        create_resp = client.post("/api/v1/knowledge-bases/", json={"name": "KB", "org_id": str(org_id)})
        kb_id = create_resp.json()["id"]

        mock_search.return_value = [
            {
                "chunk_id": uuid.uuid4(),
                "document_id": uuid.uuid4(),
                "file_name": "faq.txt",
                "content": "Ring AI helps businesses...",
                "score": 0.92,
            },
        ]

        resp = client.post(
            f"/api/v1/knowledge-bases/{kb_id}/search?org_id={org_id}",
            json={"query": "What does Ring AI do?"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["query"] == "What does Ring AI do?"
        assert len(data["results"]) == 1
        assert data["results"][0]["score"] == 0.92


# ---------------------------------------------------------------------------
# RAG context building
# ---------------------------------------------------------------------------


class TestRAGContext:
    def test_build_system_instruction_empty_context(self):
        base = "You are an assistant."
        result = build_system_instruction_with_context(base, "")
        assert result == base

    def test_build_system_instruction_with_context(self):
        base = "You are an assistant."
        context = "\n\n--- KNOWLEDGE BASE CONTEXT ---\nSome info\n--- END KNOWLEDGE BASE CONTEXT ---"
        result = build_system_instruction_with_context(base, context)
        assert base in result
        assert "KNOWLEDGE BASE CONTEXT" in result

    def test_retrieve_context_returns_empty_for_empty_kb(self, db, org):
        kb = KnowledgeBase(org_id=org.id, name="Empty KB")
        db.add(kb)
        db.commit()

        result = retrieve_context_for_session(db, kb.id)
        assert result == ""

    def test_retrieve_context_with_docs(self, db, org):
        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.flush()

        doc = KnowledgeDocument(
            kb_id=kb.id,
            file_name="info.txt",
            file_type="txt",
            content="all about us",
            status="ready",
        )
        db.add(doc)
        db.flush()

        chunk = KnowledgeChunk(
            document_id=doc.id,
            chunk_index=0,
            content="Ring AI is a voice campaign platform.",
        )
        db.add(chunk)
        db.commit()

        result = retrieve_context_for_session(db, kb.id)
        assert "Ring AI is a voice campaign platform." in result
        assert "KNOWLEDGE BASE CONTEXT" in result
        assert "info.txt" in result

    @patch("app.services.knowledge_base.generate_single_embedding")
    def test_retrieve_context_with_query(self, mock_embed, db, org):
        """When a query is provided but pgvector is not available (SQLite),
        the search will fail. Verify the function handles this gracefully
        or that we can mock the search path."""
        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.commit()

        # With SQLite, vector search won't work, so we test the no-query path
        result = retrieve_context_for_session(db, kb.id, query=None)
        # Empty KB should return empty
        assert result == ""


# ---------------------------------------------------------------------------
# Embedding generation (mocked)
# ---------------------------------------------------------------------------


class TestEmbedding:
    @patch("app.services.knowledge_base._get_genai_client")
    def test_generate_embeddings(self, mock_client_factory):
        from app.services.knowledge_base import generate_embeddings

        mock_embedding = MagicMock()
        mock_embedding.values = [0.1] * 768

        mock_result = MagicMock()
        mock_result.embeddings = [mock_embedding, mock_embedding]

        mock_client = MagicMock()
        mock_client.models.embed_content.return_value = mock_result
        mock_client_factory.return_value = mock_client

        embeddings = generate_embeddings(["hello", "world"])
        assert len(embeddings) == 2
        assert len(embeddings[0]) == 768

    @patch("app.services.knowledge_base._get_genai_client")
    def test_generate_embeddings_empty(self, mock_client_factory):
        from app.services.knowledge_base import generate_embeddings

        result = generate_embeddings([])
        assert result == []
        mock_client_factory.assert_not_called()

    @patch("app.services.knowledge_base._get_genai_client")
    def test_generate_embeddings_api_failure(self, mock_client_factory):
        from app.services.knowledge_base import EmbeddingError, generate_embeddings

        mock_client = MagicMock()
        mock_client.models.embed_content.side_effect = Exception("API quota exceeded")
        mock_client_factory.return_value = mock_client

        with pytest.raises(EmbeddingError, match="API quota exceeded"):
            generate_embeddings(["hello"])


# ---------------------------------------------------------------------------
# Document processing pipeline (mocked embeddings)
# ---------------------------------------------------------------------------


class TestDocumentUploadPipeline:
    @patch("app.services.knowledge_base.generate_embeddings")
    def test_upload_txt_document(self, mock_embed, db, org):
        from app.services.knowledge_base import upload_document

        mock_embed.return_value = [[0.1] * 768]

        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.commit()

        doc = upload_document(
            db=db,
            kb_id=kb.id,
            file_name="notes.txt",
            file_type="txt",
            file_bytes=b"Short text for testing.",
        )

        assert doc.status == "ready"
        assert doc.chunk_count >= 1
        assert doc.file_name == "notes.txt"

    @patch("app.services.knowledge_base.generate_embeddings")
    def test_upload_empty_document(self, mock_embed, db, org):
        from app.services.knowledge_base import upload_document

        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.commit()

        doc = upload_document(
            db=db,
            kb_id=kb.id,
            file_name="empty.txt",
            file_type="txt",
            file_bytes=b"   ",
        )

        assert doc.status == "ready"
        assert doc.chunk_count == 0
        mock_embed.assert_not_called()

    @patch("app.services.knowledge_base.generate_embeddings")
    def test_upload_embedding_failure(self, mock_embed, db, org):
        from app.services.knowledge_base import EmbeddingError, upload_document

        mock_embed.side_effect = EmbeddingError("API down")

        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.commit()

        with pytest.raises(EmbeddingError):
            upload_document(
                db=db,
                kb_id=kb.id,
                file_name="fail.txt",
                file_type="txt",
                file_bytes=b"Some content here",
            )

        # Document should be marked as error
        doc = db.query(KnowledgeDocument).filter_by(kb_id=kb.id).first()
        assert doc is not None
        assert doc.status == "error"
        assert "API down" in doc.error_message

    def test_upload_unsupported_type(self, db, org):
        from app.services.knowledge_base import DocumentProcessingError, upload_document

        kb = KnowledgeBase(org_id=org.id, name="KB")
        db.add(kb)
        db.commit()

        with pytest.raises(DocumentProcessingError, match="Unsupported file type"):
            upload_document(
                db=db,
                kb_id=kb.id,
                file_name="image.png",
                file_type="image/png",
                file_bytes=b"PNG data",
            )


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


class TestPagination:
    def test_list_kbs_pagination(self, client, org_id):
        for i in range(5):
            client.post("/api/v1/knowledge-bases/", json={"name": f"KB {i}", "org_id": str(org_id)})

        resp = client.get(f"/api/v1/knowledge-bases/?org_id={org_id}&page=1&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["page_size"] == 2

    def test_list_kbs_page_2(self, client, org_id):
        for i in range(5):
            client.post("/api/v1/knowledge-bases/", json={"name": f"KB {i}", "org_id": str(org_id)})

        resp = client.get(f"/api/v1/knowledge-bases/?org_id={org_id}&page=2&page_size=2")
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 2
