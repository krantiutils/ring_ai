import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class FlowRun(Base):
    __tablename__ = "flow_runs"
    __table_args__ = (
        Index("ix_flow_runs_flow_id", "flow_id"),
        Index("ix_flow_runs_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("flow_definitions.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    mode: Mapped[str] = mapped_column(String(20), nullable=False, server_default="live")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_node_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_rows: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    steps: Mapped[list["FlowStepResult"]] = relationship(back_populates="flow_run", cascade="all, delete-orphan")

    @property
    def contact_count(self) -> int:
        if self.steps:
            source_steps = [s for s in self.steps if s.node_kind.startswith("source_")]
            if source_steps:
                return max(s.output_row_count for s in source_steps)
        return len(self.contact_rows) if self.contact_rows else 0


class FlowStepResult(Base):
    __tablename__ = "flow_step_results"
    __table_args__ = (
        Index("ix_flow_step_results_run_id", "flow_run_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flow_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("flow_runs.id"), nullable=False)
    node_id: Mapped[str] = mapped_column(String(255), nullable=False)
    node_kind: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    input_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_true: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    rows_false: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    flow_run: Mapped["FlowRun"] = relationship(back_populates="steps")
