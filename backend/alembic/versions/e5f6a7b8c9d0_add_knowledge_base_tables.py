"""Add knowledge base tables for RAG integration.

Creates three tables:
- knowledge_bases: per-org knowledge bases
- knowledge_documents: uploaded documents (PDF, text)
- knowledge_chunks: text chunks with pgvector embeddings

Also enables the pgvector extension.

Revision ID: e5f6a7b8c9d0
Revises: d1e2f3a4b5c6
Create Date: 2026-02-13 23:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "e5f6a7b8c9d0"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # knowledge_bases
    op.create_table(
        "knowledge_bases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_bases_org_id", "knowledge_bases", ["org_id"])

    # knowledge_documents
    op.create_table(
        "knowledge_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("kb_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_bases.id"), nullable=False),
        sa.Column("file_name", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("chunk_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_documents_kb_id", "knowledge_documents", ["kb_id"])
    op.create_index("ix_knowledge_documents_status", "knowledge_documents", ["status"])

    # knowledge_chunks with pgvector embedding
    op.create_table(
        "knowledge_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_documents.id"), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_chunks_doc_id", "knowledge_chunks", ["document_id"])

    # Add vector column (768 dimensions for Gemini text-embedding-004)
    op.execute("ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(768)")

    # Create HNSW index for fast cosine similarity search
    op.execute(
        "CREATE INDEX ix_knowledge_chunks_embedding ON knowledge_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_index("ix_knowledge_chunks_embedding", table_name="knowledge_chunks")
    op.drop_index("ix_knowledge_chunks_doc_id", table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")

    op.drop_index("ix_knowledge_documents_status", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_kb_id", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")

    op.drop_index("ix_knowledge_bases_org_id", table_name="knowledge_bases")
    op.drop_table("knowledge_bases")
