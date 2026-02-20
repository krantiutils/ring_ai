# Flow Execution Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Celery-powered execution engine that converts visual flow DAGs into per-row, branching contact pipelines with SMS/Voice dispatch.

**Architecture:** Hybrid orchestrator + dispatch workers. One Celery task walks the graph node-by-node, fanning out to a pool of dispatch worker tasks for SMS/Voice/WhatsApp. Per-row evaluation at condition/validation branches. New FlowDefinition/FlowRun/FlowStepResult models, separate from campaigns.

**Tech Stack:** Celery 5 + Redis, SQLAlchemy 2, FastAPI, pytest with `task_always_eager=True`

---

### Task 1: Install Celery + Redis Dependencies

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/core/celery_app.py`
- Modify: `backend/app/core/config.py`

**Step 1: Add dependencies to pyproject.toml**

In `backend/pyproject.toml`, add to the `dependencies` list:

```toml
    "celery[redis]>=5.4.0",
    "redis>=5.0.0",
```

**Step 2: Install them**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && pip3 install --break-system-packages celery[redis] redis`

**Step 3: Add Redis URL to config**

In `backend/app/core/config.py`, add to the `Settings` class:

```python
    CELERY_BROKER_URL: str = "redis://127.0.0.1:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://127.0.0.1:6379/1"
```

**Step 4: Create Celery app**

Create `backend/app/core/celery_app.py`:

```python
from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "ring_ai",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kathmandu",
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery_app.autodiscover_tasks(["app.services"])
```

**Step 5: Commit**

```bash
git add backend/pyproject.toml backend/app/core/celery_app.py backend/app/core/config.py
git commit -m "feat: add Celery + Redis infrastructure"
```

---

### Task 2: FlowDefinition Model

**Files:**
- Create: `backend/app/models/flow_definition.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_flow_models.py`

**Step 1: Write the failing test**

Create `backend/tests/test_flow_models.py`:

```python
import uuid

from app.models.flow_definition import FlowDefinition


def test_create_flow_definition(db):
    flow = FlowDefinition(
        user_id=uuid.uuid4(),
        name="Test Flow",
        nodes=[{"id": "t1", "data": {"kind": "trigger_manual"}}],
        edges=[],
        trigger_config={"type": "manual"},
        status="draft",
    )
    db.add(flow)
    db.commit()
    db.refresh(flow)

    assert flow.id is not None
    assert flow.name == "Test Flow"
    assert flow.status == "draft"
    assert len(flow.nodes) == 1
    assert flow.trigger_config["type"] == "manual"


def test_flow_definition_status_values(db):
    for status in ("draft", "active", "paused", "archived"):
        flow = FlowDefinition(
            user_id=uuid.uuid4(),
            name=f"Flow {status}",
            nodes=[],
            edges=[],
            status=status,
        )
        db.add(flow)
    db.commit()
    assert db.query(FlowDefinition).count() == 4
```

**Step 2: Run test to verify it fails**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.flow_definition'`

**Step 3: Write the model**

Create `backend/app/models/flow_definition.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FlowDefinition(Base):
    __tablename__ = "flow_definitions"
    __table_args__ = (
        Index("ix_flow_definitions_user_id", "user_id"),
        Index("ix_flow_definitions_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    nodes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    edges: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    trigger_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
```

Register in `backend/app/models/__init__.py` — add import and `__all__` entry:

```python
from app.models.flow_definition import FlowDefinition
```

Add `"FlowDefinition"` to `__all__`.

**Step 4: Run test to verify it passes**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_models.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/models/flow_definition.py backend/app/models/__init__.py backend/tests/test_flow_models.py
git commit -m "feat: add FlowDefinition model"
```

---

### Task 3: FlowRun + FlowStepResult Models

**Files:**
- Create: `backend/app/models/flow_run.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/test_flow_models.py`

**Step 1: Write the failing tests**

Append to `backend/tests/test_flow_models.py`:

```python
from app.models.flow_run import FlowRun, FlowStepResult


def test_create_flow_run(db):
    flow = FlowDefinition(
        user_id=uuid.uuid4(),
        name="Test Flow",
        nodes=[],
        edges=[],
        status="active",
    )
    db.add(flow)
    db.commit()

    run = FlowRun(
        flow_id=flow.id,
        status="pending",
        contact_rows=[{"name": "Ram", "phone": "+9779800000000"}],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    assert run.id is not None
    assert run.status == "pending"
    assert len(run.contact_rows) == 1
    assert run.flow_id == flow.id


def test_create_flow_step_result(db):
    flow = FlowDefinition(user_id=uuid.uuid4(), name="F", nodes=[], edges=[], status="active")
    db.add(flow)
    db.commit()

    run = FlowRun(flow_id=flow.id, status="running", contact_rows=[])
    db.add(run)
    db.commit()

    step = FlowStepResult(
        flow_run_id=run.id,
        node_id="v1",
        node_kind="validation",
        status="completed",
        input_row_count=10,
        output_row_count=8,
        rows_true=[{"name": "Ram"}] * 8,
        rows_false=[{"name": "Bad"}] * 2,
    )
    db.add(step)
    db.commit()
    db.refresh(step)

    assert step.input_row_count == 10
    assert step.output_row_count == 8
    assert len(step.rows_true) == 8
    assert len(step.rows_false) == 2


def test_flow_run_tracks_current_node(db):
    flow = FlowDefinition(user_id=uuid.uuid4(), name="F", nodes=[], edges=[], status="active")
    db.add(flow)
    db.commit()

    run = FlowRun(flow_id=flow.id, status="running", contact_rows=[], current_node_id="sms1")
    db.add(run)
    db.commit()
    db.refresh(run)

    assert run.current_node_id == "sms1"

    run.current_node_id = "end1"
    run.status = "completed"
    db.commit()
    db.refresh(run)

    assert run.current_node_id == "end1"
    assert run.status == "completed"
```

**Step 2: Run test to verify it fails**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.flow_run'`

**Step 3: Write the models**

Create `backend/app/models/flow_run.py`:

```python
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
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_node_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_rows: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    steps: Mapped[list["FlowStepResult"]] = relationship(back_populates="flow_run", cascade="all, delete-orphan")


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
    metadata_: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    flow_run: Mapped["FlowRun"] = relationship(back_populates="steps")
```

Register in `__init__.py`:

```python
from app.models.flow_run import FlowRun, FlowStepResult
```

Add `"FlowRun"` and `"FlowStepResult"` to `__all__`.

**Step 4: Run tests**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_models.py -v`
Expected: all 5 tests PASS

**Step 5: Commit**

```bash
git add backend/app/models/flow_run.py backend/app/models/__init__.py backend/tests/test_flow_models.py
git commit -m "feat: add FlowRun and FlowStepResult models"
```

---

### Task 4: Graph Compiler — Core

The compiler is a pure function: nodes + edges in, ExecutionPlan out. No DB, no I/O. Heavily tested.

**Files:**
- Create: `backend/app/services/flow_compiler.py`
- Create: `backend/tests/test_flow_compiler.py`

**Step 1: Write the failing tests**

Create `backend/tests/test_flow_compiler.py`:

```python
import pytest

from app.services.flow_compiler import compile_flow, CompileError, ExecutionPlan, ExecutionStep


# --- Test helpers ---

def _node(id: str, kind: str, config: dict | None = None) -> dict:
    return {"id": id, "data": {"kind": kind, "config": config or {}}}


def _edge(id: str, source: str, target: str, source_handle: str | None = None) -> dict:
    e = {"id": id, "source": source, "target": target}
    if source_handle:
        e["sourceHandle"] = source_handle
    return e


# --- Layer 1: Compiler unit tests ---

class TestLinearFlow:
    """trigger -> source -> sms -> end"""

    def test_produces_correct_step_order(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977"}),
            _node("sms1", "agent_sms", {"message": "Hello {{name}}"}),
            _node("e1", "end_success"),
        ]
        edges = [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "sms1"),
            _edge("e3", "sms1", "e1"),
        ]
        plan = compile_flow(nodes, edges)

        assert isinstance(plan, ExecutionPlan)
        assert plan.trigger_node_id == "t1"
        assert plan.source_node_id == "s1"
        kinds = [s.node_kind for s in plan.steps]
        assert kinds == ["trigger_manual", "source_manual_table", "agent_sms", "end_success"]

    def test_step_outputs_link_correctly(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("e1", "end_success"),
        ]
        edges = [_edge("e1", "t1", "s1"), _edge("e2", "s1", "e1")]
        plan = compile_flow(nodes, edges)

        t_step = plan.steps[0]
        s_step = plan.steps[1]
        assert t_step.outputs == {"default": "s1"}
        assert s_step.inputs == {"default": "t1"}


class TestConditionBranch:
    """source -> condition -> [sms (true), voice (false)] -> end"""

    def test_condition_splits_to_two_targets(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("c1", "condition", {"field": "age", "operator": ">", "value": "30"}),
            _node("sms1", "agent_sms"),
            _node("v1", "agent_voice"),
            _node("e1", "end_success"),
        ]
        edges = [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "c1"),
            _edge("e3", "c1", "sms1", "true"),
            _edge("e4", "c1", "v1", "false"),
            _edge("e5", "sms1", "e1"),
            _edge("e6", "v1", "e1"),
        ]
        plan = compile_flow(nodes, edges)

        c_step = next(s for s in plan.steps if s.node_id == "c1")
        assert c_step.outputs == {"true": "sms1", "false": "v1"}
        assert "c1" in plan.branch_points
        assert set(plan.branch_points["c1"]) == {"sms1", "v1"}


class TestValidationBranch:
    """source -> validation -> [sms (valid), end_fail (invalid)]"""

    def test_validation_splits_valid_invalid(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms"),
            _node("f1", "end_failure"),
        ]
        edges = [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "sms1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
        ]
        plan = compile_flow(nodes, edges)

        v_step = next(s for s in plan.steps if s.node_id == "v1")
        assert v_step.outputs == {"valid": "sms1", "invalid": "f1"}


class TestCompilerErrors:

    def test_rejects_no_trigger(self):
        nodes = [_node("s1", "source_manual_table"), _node("e1", "end_success")]
        edges = [_edge("e1", "s1", "e1")]
        with pytest.raises(CompileError, match="trigger"):
            compile_flow(nodes, edges)

    def test_rejects_orphan_node(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("e1", "end_success"),
            _node("orphan", "agent_sms"),  # not connected
        ]
        edges = [_edge("e1", "t1", "s1"), _edge("e2", "s1", "e1")]
        with pytest.raises(CompileError, match="unreachable"):
            compile_flow(nodes, edges)

    def test_rejects_no_end_node(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("sms1", "agent_sms"),
        ]
        edges = [_edge("e1", "t1", "s1"), _edge("e2", "s1", "sms1")]
        with pytest.raises(CompileError, match="end"):
            compile_flow(nodes, edges)
```

**Step 2: Run test to verify it fails**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_compiler.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write the compiler**

Create `backend/app/services/flow_compiler.py`:

```python
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field


class CompileError(Exception):
    pass


@dataclass
class ExecutionStep:
    node_id: str
    node_kind: str
    config: dict
    inputs: dict[str, str] = field(default_factory=dict)   # handle -> source_node_id
    outputs: dict[str, str] = field(default_factory=dict)  # handle -> target_node_id


@dataclass
class ExecutionPlan:
    steps: list[ExecutionStep]
    trigger_node_id: str
    source_node_id: str
    branch_points: dict[str, list[str]]  # node_id -> [target_ids]


_BRANCHING_KINDS = {"condition", "validation"}
_SOURCE_KINDS = {
    "source_manual_table", "source_csv", "source_xlsx",
    "source_url_json", "source_url_csv", "source_numbers",
    "source_google_contacts", "source_file",
}


def compile_flow(nodes: list[dict], edges: list[dict]) -> ExecutionPlan:
    node_map: dict[str, dict] = {}
    for n in nodes:
        node_map[n["id"]] = n

    # Find trigger
    triggers = [n for n in nodes if n["data"]["kind"].startswith("trigger_")]
    if not triggers:
        raise CompileError("Flow must contain at least one trigger node.")
    trigger = triggers[0]

    # Find end nodes
    ends = [n for n in nodes if n["data"]["kind"] in ("end_success", "end_failure")]
    if not ends:
        raise CompileError("Flow must contain at least one end node.")

    # Build adjacency: source_id -> [(target_id, source_handle)]
    adj: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    # Build reverse adjacency: target_id -> [(source_id, source_handle)]
    rev_adj: dict[str, list[tuple[str, str | None]]] = defaultdict(list)

    for e in edges:
        src = e["source"]
        tgt = e["target"]
        handle = e.get("sourceHandle")
        adj[src].append((tgt, handle))
        rev_adj[tgt].append((src, handle))

    # BFS from trigger to find reachable nodes
    reachable: set[str] = set()
    queue: deque[str] = deque([trigger["id"]])
    while queue:
        nid = queue.popleft()
        if nid in reachable:
            continue
        reachable.add(nid)
        for tgt, _ in adj.get(nid, []):
            queue.append(tgt)

    # Check for orphans
    unreachable = set(node_map.keys()) - reachable
    if unreachable:
        names = ", ".join(unreachable)
        raise CompileError(f"Nodes are unreachable from trigger: {names}")

    # Topological sort (Kahn's algorithm)
    in_degree: dict[str, int] = {nid: 0 for nid in reachable}
    for nid in reachable:
        for tgt, _ in adj.get(nid, []):
            if tgt in reachable:
                in_degree[tgt] = in_degree.get(tgt, 0) + 1

    topo_queue: deque[str] = deque(nid for nid, deg in in_degree.items() if deg == 0)
    sorted_ids: list[str] = []
    while topo_queue:
        nid = topo_queue.popleft()
        sorted_ids.append(nid)
        for tgt, _ in adj.get(nid, []):
            if tgt in reachable:
                in_degree[tgt] -= 1
                if in_degree[tgt] == 0:
                    topo_queue.append(tgt)

    # Build steps
    steps: list[ExecutionStep] = []
    branch_points: dict[str, list[str]] = {}

    for nid in sorted_ids:
        n = node_map[nid]
        kind = n["data"]["kind"]
        config = n["data"].get("config", {})

        # Resolve outputs
        outputs: dict[str, str] = {}
        targets = adj.get(nid, [])
        if kind in _BRANCHING_KINDS:
            for tgt, handle in targets:
                if handle:
                    outputs[handle] = tgt
                else:
                    outputs.setdefault("default", tgt)
            if len(targets) > 1:
                branch_points[nid] = [tgt for tgt, _ in targets]
        else:
            if len(targets) == 1:
                outputs["default"] = targets[0][0]
            elif len(targets) > 1:
                for i, (tgt, handle) in enumerate(targets):
                    outputs[handle or f"path_{i}"] = tgt

        # Resolve inputs
        inputs: dict[str, str] = {}
        sources = rev_adj.get(nid, [])
        if len(sources) == 1:
            inputs["default"] = sources[0][0]
        elif len(sources) > 1:
            for src, handle in sources:
                inputs[handle or "default"] = src

        steps.append(ExecutionStep(
            node_id=nid,
            node_kind=kind,
            config=config,
            inputs=inputs,
            outputs=outputs,
        ))

    # Find source node
    source_node_id = ""
    for s in steps:
        if s.node_kind in _SOURCE_KINDS:
            source_node_id = s.node_id
            break

    return ExecutionPlan(
        steps=steps,
        trigger_node_id=trigger["id"],
        source_node_id=source_node_id,
        branch_points=branch_points,
    )
```

**Step 4: Run tests**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_compiler.py -v`
Expected: all 7 tests PASS

**Step 5: Commit**

```bash
git add backend/app/services/flow_compiler.py backend/tests/test_flow_compiler.py
git commit -m "feat: graph compiler — nodes+edges to ExecutionPlan"
```

---

### Task 5: Node Executors — Pure Row Logic

Each node executor is a pure function: takes rows in, returns rows out (possibly split). No DB, no I/O.

**Files:**
- Create: `backend/app/services/flow_executors.py`
- Create: `backend/tests/test_flow_executors.py`

**Step 1: Write the failing tests**

Create `backend/tests/test_flow_executors.py`:

```python
import pytest

from app.services.flow_executors import (
    execute_condition,
    execute_validation,
    execute_deduplicate,
    execute_normalize_phone,
    execute_source,
)


# --- Condition executor tests ---

class TestConditionExecutor:

    def test_numeric_greater_than_splits_correctly(self):
        rows = [
            {"name": "Ram", "age": "34"},
            {"name": "Sita", "age": "28"},
            {"name": "Hari", "age": "45"},
        ]
        config = {"field": "age", "operator": ">", "value": "30"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 2  # Ram(34), Hari(45)
        assert len(false_rows) == 1  # Sita(28)
        assert {r["name"] for r in true_rows} == {"Ram", "Hari"}

    def test_string_equality(self):
        rows = [
            {"name": "Ram", "city": "Kathmandu"},
            {"name": "Sita", "city": "Pokhara"},
        ]
        config = {"field": "city", "operator": "==", "value": "Kathmandu"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 1
        assert true_rows[0]["name"] == "Ram"

    def test_contains_operator(self):
        rows = [
            {"name": "Ram", "phone": "+9779800000000"},
            {"name": "Sita", "phone": "+1234567890"},
        ]
        config = {"field": "phone", "operator": "contains", "value": "+977"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 1
        assert true_rows[0]["name"] == "Ram"

    def test_starts_with_operator(self):
        rows = [
            {"name": "Ram", "phone": "+9779800000000"},
            {"name": "Sita", "phone": "+1234567890"},
        ]
        config = {"field": "phone", "operator": "startsWith", "value": "+977"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 1

    def test_missing_field_goes_to_false(self):
        rows = [{"name": "Ram"}, {"name": "Sita", "age": "30"}]
        config = {"field": "age", "operator": ">", "value": "25"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(false_rows) == 1  # Ram has no age
        assert false_rows[0]["name"] == "Ram"

    def test_all_operators(self):
        rows = [{"v": "10"}]
        assert execute_condition(rows, {"field": "v", "operator": "<", "value": "20"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": ">=", "value": "10"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": "<=", "value": "10"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": "!=", "value": "5"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": "==", "value": "10"})[0] == rows


# --- Validation executor tests ---

class TestValidationExecutor:

    def test_rows_with_all_required_columns_are_valid(self):
        rows = [{"name": "Ram", "phone": "+977"}, {"name": "Sita", "phone": "+977"}]
        config = {"required_columns": "name,phone"}
        valid, invalid = execute_validation(rows, config)
        assert len(valid) == 2
        assert len(invalid) == 0

    def test_rows_missing_required_column_are_invalid(self):
        rows = [
            {"name": "Ram", "phone": "+977"},
            {"name": "Sita"},  # missing phone
            {"phone": "+977"},  # missing name
        ]
        config = {"required_columns": "name,phone"}
        valid, invalid = execute_validation(rows, config)
        assert len(valid) == 1
        assert valid[0]["name"] == "Ram"
        assert len(invalid) == 2

    def test_empty_value_counts_as_missing(self):
        rows = [{"name": "Ram", "phone": ""}, {"name": "Sita", "phone": "+977"}]
        config = {"required_columns": "name,phone"}
        valid, invalid = execute_validation(rows, config)
        assert len(valid) == 1
        assert valid[0]["name"] == "Sita"


# --- Deduplicate executor tests ---

class TestDeduplicateExecutor:

    def test_dedup_by_phone_keep_first(self):
        rows = [
            {"name": "Ram", "phone": "+977"},
            {"name": "Sita", "phone": "+1"},
            {"name": "Ram2", "phone": "+977"},  # duplicate
        ]
        config = {"dedup_column": "phone", "keep": "first"}
        result = execute_deduplicate(rows, config)
        assert len(result) == 2
        assert result[0]["name"] == "Ram"  # first kept

    def test_dedup_by_phone_keep_last(self):
        rows = [
            {"name": "Ram", "phone": "+977"},
            {"name": "Sita", "phone": "+1"},
            {"name": "Ram2", "phone": "+977"},
        ]
        config = {"dedup_column": "phone", "keep": "last"}
        result = execute_deduplicate(rows, config)
        assert len(result) == 2
        assert result[1]["name"] == "Ram2"  # last kept

    def test_no_duplicates_passes_through(self):
        rows = [{"name": "Ram", "phone": "+1"}, {"name": "Sita", "phone": "+2"}]
        config = {"dedup_column": "phone", "keep": "first"}
        result = execute_deduplicate(rows, config)
        assert len(result) == 2


# --- Normalize phone executor tests ---

class TestNormalizePhoneExecutor:

    def test_adds_country_code(self):
        rows = [{"name": "Ram", "phone": "9800000000"}]
        config = {"phone_column": "phone", "country_code": "+977", "format": "e164"}
        result = execute_normalize_phone(rows, config)
        assert result[0]["phone"] == "+9779800000000"

    def test_already_has_country_code(self):
        rows = [{"name": "Ram", "phone": "+9779800000000"}]
        config = {"phone_column": "phone", "country_code": "+977", "format": "e164"}
        result = execute_normalize_phone(rows, config)
        assert result[0]["phone"] == "+9779800000000"

    def test_strips_spaces_and_dashes(self):
        rows = [{"name": "Ram", "phone": "980-000-0000"}]
        config = {"phone_column": "phone", "country_code": "+977", "format": "e164"}
        result = execute_normalize_phone(rows, config)
        assert result[0]["phone"] == "+9779800000000"


# --- Source executor tests ---

class TestSourceExecutor:

    def test_manual_table_parses_csv(self):
        config = {"sample_csv": "name,phone\nRam,+977\nSita,+1"}
        rows = execute_source("source_manual_table", config)
        assert len(rows) == 2
        assert rows[0] == {"name": "Ram", "phone": "+977"}
        assert rows[1] == {"name": "Sita", "phone": "+1"}

    def test_numbers_source(self):
        config = {"numbers": "+9779800000000,+9779811111111"}
        rows = execute_source("source_numbers", config)
        assert len(rows) == 2
        assert rows[0] == {"phone": "+9779800000000"}
        assert rows[1] == {"phone": "+9779811111111"}

    def test_empty_csv_returns_empty(self):
        config = {"sample_csv": ""}
        rows = execute_source("source_manual_table", config)
        assert rows == []
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_executors.py -v`
Expected: FAIL

**Step 3: Write the executors**

Create `backend/app/services/flow_executors.py`:

```python
from __future__ import annotations

import csv
import io
import re


def _try_float(v: str) -> float | None:
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def execute_condition(rows: list[dict], config: dict) -> tuple[list[dict], list[dict]]:
    field = str(config.get("field", ""))
    operator = str(config.get("operator", ""))
    value = str(config.get("value", ""))

    true_rows: list[dict] = []
    false_rows: list[dict] = []

    for row in rows:
        cell = str(row.get(field, ""))
        if not cell and field not in row:
            false_rows.append(row)
            continue

        result = False
        cell_num = _try_float(cell)
        val_num = _try_float(value)

        if operator in (">", "<", ">=", "<=") and cell_num is not None and val_num is not None:
            if operator == ">":
                result = cell_num > val_num
            elif operator == "<":
                result = cell_num < val_num
            elif operator == ">=":
                result = cell_num >= val_num
            elif operator == "<=":
                result = cell_num <= val_num
        elif operator == "==":
            result = cell == value
        elif operator == "!=":
            result = cell != value
        elif operator == "contains":
            result = value in cell
        elif operator == "startsWith":
            result = cell.startswith(value)

        (true_rows if result else false_rows).append(row)

    return true_rows, false_rows


def execute_validation(rows: list[dict], config: dict) -> tuple[list[dict], list[dict]]:
    required = [c.strip() for c in str(config.get("required_columns", "")).split(",") if c.strip()]
    valid: list[dict] = []
    invalid: list[dict] = []

    for row in rows:
        if all(row.get(col) for col in required):
            valid.append(row)
        else:
            invalid.append(row)

    return valid, invalid


def execute_deduplicate(rows: list[dict], config: dict) -> list[dict]:
    column = str(config.get("dedup_column", ""))
    keep = str(config.get("keep", "first"))

    if keep == "last":
        seen: dict[str, int] = {}
        for i, row in enumerate(rows):
            key = str(row.get(column, ""))
            seen[key] = i
        indices = sorted(seen.values())
        return [rows[i] for i in indices]
    else:
        seen_keys: set[str] = set()
        result: list[dict] = []
        for row in rows:
            key = str(row.get(column, ""))
            if key not in seen_keys:
                seen_keys.add(key)
                result.append(row)
        return result


def execute_normalize_phone(rows: list[dict], config: dict) -> list[dict]:
    column = str(config.get("phone_column", "phone"))
    country_code = str(config.get("country_code", "+977"))
    # format_ = str(config.get("format", "e164"))  # reserved for future formats

    result: list[dict] = []
    for row in rows:
        new_row = dict(row)
        phone = re.sub(r"[\s\-]", "", str(new_row.get(column, "")))
        if phone and not phone.startswith("+"):
            phone = country_code + phone
        new_row[column] = phone
        result.append(new_row)
    return result


def execute_source(kind: str, config: dict) -> list[dict]:
    if kind == "source_numbers":
        numbers = [n.strip() for n in str(config.get("numbers", "")).split(",") if n.strip()]
        return [{"phone": n} for n in numbers]

    if kind == "source_google_contacts":
        return []  # placeholder — not yet implemented

    # CSV-based sources (manual_table, csv, xlsx, url_csv, url_json)
    sample_csv = str(config.get("sample_csv", ""))
    if not sample_csv:
        return []

    reader = csv.reader(io.StringIO(sample_csv))
    parsed = list(reader)
    if not parsed:
        return []

    headers = [h.strip() for h in parsed[0]]
    rows: list[dict] = []
    for row_cells in parsed[1:]:
        row = {}
        for i, header in enumerate(headers):
            row[header] = row_cells[i].strip() if i < len(row_cells) else ""
        rows.append(row)
    return rows
```

**Step 4: Run tests**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_executors.py -v`
Expected: all 18 tests PASS

**Step 5: Commit**

```bash
git add backend/app/services/flow_executors.py backend/tests/test_flow_executors.py
git commit -m "feat: node executors — condition, validation, deduplicate, normalize, source"
```

---

### Task 6: Orchestrator — Core Loop

The orchestrator walks the execution plan, calling node executors and recording step results. Action nodes are stubbed for now (Task 7 adds dispatch).

**Files:**
- Create: `backend/app/services/flow_orchestrator.py`
- Create: `backend/tests/test_flow_orchestrator.py`

**Step 1: Write the failing tests (Layer 3 — node-against-node)**

Create `backend/tests/test_flow_orchestrator.py`:

```python
import uuid

import pytest

from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun, FlowStepResult
from app.services.flow_orchestrator import run_flow


def _node(id, kind, config=None):
    return {"id": id, "data": {"kind": kind, "config": config or {}}}


def _edge(id, source, target, source_handle=None):
    e = {"id": id, "source": source, "target": target}
    if source_handle:
        e["sourceHandle"] = source_handle
    return e


def _make_flow(db, nodes, edges, status="active"):
    flow = FlowDefinition(
        user_id=uuid.uuid4(),
        name="Test",
        nodes=nodes,
        edges=edges,
        status=status,
    )
    db.add(flow)
    db.commit()
    return flow


def _make_run(db, flow, status="pending"):
    run = FlowRun(flow_id=flow.id, status=status, contact_rows=[])
    db.add(run)
    db.commit()
    return run


class TestLinearExecution:
    """trigger -> source(2 rows) -> sms -> end"""

    def test_completes_with_correct_step_count(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nSita,+1"}),
            _node("sms1", "agent_sms", {"message": "Hi {{name}}"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "sms1"),
            _edge("e3", "sms1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)
        db.refresh(run)

        assert run.status == "completed"
        steps = db.query(FlowStepResult).filter_by(flow_run_id=run.id).all()
        assert len(steps) == 4  # trigger, source, sms, end

    def test_source_step_records_row_count(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nSita,+1"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        source_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="s1").first()
        assert source_step.output_row_count == 2


class TestValidationBranching:
    """source -> validation(valid->sms, invalid->end_fail)"""

    def test_valid_rows_reach_sms_invalid_reach_end(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nBad,"}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("f1", "end_failure"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "sms1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)
        db.refresh(run)

        v_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="v1").first()
        assert len(v_step.rows_true) == 1   # Ram has phone
        assert len(v_step.rows_false) == 1  # Bad has empty phone

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 1  # only valid rows

    def test_all_invalid_skips_sms(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nBad1,\nBad2,"}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("f1", "end_failure"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "sms1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 0
        assert sms_step.status == "skipped"


class TestConditionBranching:
    """source -> condition(age>30) -> [sms(true), voice(false)] -> end"""

    def test_rows_split_by_condition(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone,age\nRam,+977,34\nSita,+1,28\nHari,+977,45"}),
            _node("c1", "condition", {"field": "age", "operator": ">", "value": "30"}),
            _node("sms1", "agent_sms", {"message": "Old"}),
            _node("v1", "agent_voice", {"script": "Young"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "c1"),
            _edge("e3", "c1", "sms1", "true"),
            _edge("e4", "c1", "v1", "false"),
            _edge("e5", "sms1", "e1"),
            _edge("e6", "v1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        voice_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="v1").first()
        assert sms_step.input_row_count == 2   # Ram + Hari
        assert voice_step.input_row_count == 1  # Sita


class TestChainedFiltering:
    """source -> validation -> condition -> sms -> end"""

    def test_validation_then_condition(self, db):
        csv_data = "name,phone,age\nRam,+977,34\nBad,,28\nSita,+1,25\nHari,+977,45"
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": csv_data}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("c1", "condition", {"field": "age", "operator": ">", "value": "30"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("sms2", "agent_sms", {"message": "Lo"}),
            _node("f1", "end_failure"),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "c1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
            _edge("e5", "c1", "sms1", "true"),
            _edge("e6", "c1", "sms2", "false"),
            _edge("e7", "sms1", "e1"),
            _edge("e8", "sms2", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        # Bad is filtered by validation (no phone), 3 remain
        v_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="v1").first()
        assert len(v_step.rows_true) == 3

        # Of the 3 valid, Ram(34) and Hari(45) pass age>30, Sita(25) fails
        sms1_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        sms2_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms2").first()
        assert sms1_step.input_row_count == 2  # Ram + Hari
        assert sms2_step.input_row_count == 1  # Sita


class TestDeduplicateThenSms:
    """source -> deduplicate -> sms -> end (no double-messaging)"""

    def test_dedup_prevents_double_message(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nSita,+1\nRam2,+977"}),
            _node("d1", "deduplicate", {"dedup_column": "phone", "keep": "first"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "d1"),
            _edge("e3", "d1", "sms1"),
            _edge("e4", "sms1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 2  # Ram + Sita (duplicate removed)


class TestNormalizeThenValidation:
    """source -> normalize -> validation -> sms (normalized phone passes validation)"""

    def test_normalize_helps_pass_validation(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,9800000000"}),
            _node("n1", "normalize_phone", {"phone_column": "phone", "country_code": "+977", "format": "e164"}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("f1", "end_failure"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "n1"),
            _edge("e3", "n1", "v1"),
            _edge("e4", "v1", "sms1", "valid"),
            _edge("e5", "v1", "f1", "invalid"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 1  # normalized phone passes


class TestCancellation:

    def test_cancel_stops_execution(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "sms1"),
            _edge("e3", "sms1", "e1"),
        ])
        run = _make_run(db, flow, status="cancelled")

        run_flow(run.id, db)
        db.refresh(run)

        assert run.status == "cancelled"
        steps = db.query(FlowStepResult).filter_by(flow_run_id=run.id).all()
        assert len(steps) == 0  # nothing executed


class TestRowCountIntegrity:
    """100 rows through a 50/50 condition — no rows lost or duplicated"""

    def test_no_rows_lost_in_split(self, db):
        header = "name,phone,age"
        data_rows = [f"Person{i},+977{i:07d},{20 + i}" for i in range(100)]
        csv_data = header + "\n" + "\n".join(data_rows)

        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": csv_data}),
            _node("c1", "condition", {"field": "age", "operator": ">=", "value": "70"}),
            _node("sms1", "agent_sms", {"message": "Old"}),
            _node("sms2", "agent_sms", {"message": "Young"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "c1"),
            _edge("e3", "c1", "sms1", "true"),
            _edge("e4", "c1", "sms2", "false"),
            _edge("e5", "sms1", "e1"),
            _edge("e6", "sms2", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        c_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="c1").first()
        sms1_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        sms2_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms2").first()

        # ages 20..119, >= 70 means ages 70..119 = 50 true, ages 20..69 = 50 false
        assert sms1_step.input_row_count + sms2_step.input_row_count == 100
        assert sms1_step.input_row_count == 50
        assert sms2_step.input_row_count == 50
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_orchestrator.py -v`
Expected: FAIL

**Step 3: Write the orchestrator**

Create `backend/app/services/flow_orchestrator.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun, FlowStepResult
from app.services.flow_compiler import compile_flow, ExecutionStep
from app.services.flow_executors import (
    execute_condition,
    execute_deduplicate,
    execute_normalize_phone,
    execute_source,
    execute_validation,
)

_BRANCHING_KINDS = {"condition", "validation"}
_ACTION_KINDS = {"agent_sms", "agent_voice", "agent_whatsapp", "action_webhook"}


def run_flow(flow_run_id, db: Session) -> None:
    run = db.get(FlowRun, flow_run_id)
    if not run or run.status == "cancelled":
        return

    flow = db.get(FlowDefinition, run.flow_id)
    if not flow:
        run.status = "failed"
        run.error = "FlowDefinition not found"
        db.commit()
        return

    run.status = "running"
    run.started_at = datetime.now(timezone.utc)
    db.commit()

    try:
        plan = compile_flow(flow.nodes, flow.edges)
    except Exception as exc:
        run.status = "failed"
        run.error = f"Compile error: {exc}"
        db.commit()
        return

    # row_sets maps node_id -> list of row dicts
    row_sets: dict[str, list[dict]] = {}

    for step in plan.steps:
        # Check cancellation
        db.refresh(run)
        if run.status == "cancelled":
            return

        run.current_node_id = step.node_id
        db.commit()

        started = datetime.now(timezone.utc)

        # Determine input rows for this step
        input_rows = _resolve_input_rows(step, row_sets)

        # Execute the node
        output_rows, rows_true, rows_false, status = _execute_step(step, input_rows)

        # Store outputs for downstream nodes
        if step.node_kind in _BRANCHING_KINDS:
            for handle, target_id in step.outputs.items():
                if handle in ("true", "valid"):
                    row_sets[target_id] = rows_true or []
                elif handle in ("false", "invalid"):
                    row_sets[target_id] = rows_false or []
                else:
                    row_sets[target_id] = output_rows
        else:
            for handle, target_id in step.outputs.items():
                row_sets[target_id] = output_rows

        # Record step result
        result = FlowStepResult(
            flow_run_id=run.id,
            node_id=step.node_id,
            node_kind=step.node_kind,
            status=status,
            input_row_count=len(input_rows),
            output_row_count=len(output_rows),
            rows_true=rows_true,
            rows_false=rows_false,
            started_at=started,
            completed_at=datetime.now(timezone.utc),
        )
        db.add(result)
        db.commit()

    run.status = "completed"
    run.completed_at = datetime.now(timezone.utc)
    db.commit()


def _resolve_input_rows(step: ExecutionStep, row_sets: dict[str, list[dict]]) -> list[dict]:
    if step.node_id in row_sets:
        return row_sets[step.node_id]
    # Trigger and source nodes start with empty input
    if step.node_kind.startswith("trigger_") or step.node_kind.startswith("source_"):
        return []
    # End nodes may not have explicit rows
    if step.node_kind in ("end_success", "end_failure"):
        return row_sets.get(step.node_id, [])
    # Default: look up from first input
    for handle, src_id in step.inputs.items():
        if src_id in row_sets:
            return row_sets.get(step.node_id, row_sets.get(src_id, []))
    return []


def _execute_step(
    step: ExecutionStep, input_rows: list[dict]
) -> tuple[list[dict], list[dict] | None, list[dict] | None, str]:
    """Returns (output_rows, rows_true, rows_false, status)."""
    kind = step.node_kind
    config = step.config

    if kind.startswith("trigger_"):
        return [], None, None, "completed"

    if kind.startswith("source_"):
        rows = execute_source(kind, config)
        return rows, None, None, "completed"

    if kind == "condition":
        true_rows, false_rows = execute_condition(input_rows, config)
        return true_rows + false_rows, true_rows, false_rows, "completed"

    if kind == "validation":
        valid, invalid = execute_validation(input_rows, config)
        return valid + invalid, valid, invalid, "completed"

    if kind == "deduplicate":
        rows = execute_deduplicate(input_rows, config)
        return rows, None, None, "completed"

    if kind == "normalize_phone":
        rows = execute_normalize_phone(input_rows, config)
        return rows, None, None, "completed"

    if kind in _ACTION_KINDS:
        if not input_rows:
            return [], None, None, "skipped"
        # For now, action nodes pass through rows (dispatch added in Task 7)
        return input_rows, None, None, "completed"

    if kind in ("end_success", "end_failure"):
        return input_rows, None, None, "completed"

    if kind == "wait":
        return input_rows, None, None, "completed"

    if kind == "rate_limit":
        return input_rows, None, None, "completed"

    if kind == "business_hours":
        return input_rows, None, None, "completed"

    if kind == "error_handler":
        return input_rows, None, None, "completed"

    if kind == "merge":
        return input_rows, None, None, "completed"

    # Unknown node — pass through
    return input_rows, None, None, "completed"
```

**Step 4: Run tests**

Run: `cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/test_flow_orchestrator.py -v`
Expected: all 10 tests PASS

**Step 5: Commit**

```bash
git add backend/app/services/flow_orchestrator.py backend/tests/test_flow_orchestrator.py
git commit -m "feat: flow orchestrator — walks graph, executes nodes, records steps"
```

---

### Task 7: Flow CRUD API Endpoints

Save, load, run, and cancel flows from the frontend.

**Files:**
- Modify: `backend/app/schemas/flows.py`
- Modify: `backend/app/api/v1/endpoints/flows.py`

**Step 1: Add Pydantic schemas**

Append to `backend/app/schemas/flows.py`:

```python
class FlowDefinitionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    trigger_config: dict | None = None
    status: str = "draft"


class FlowDefinitionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    nodes: list[dict]
    edges: list[dict]
    trigger_config: dict | None
    status: str
    created_at: datetime
    updated_at: datetime


class FlowRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    flow_id: uuid.UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    current_node_id: str | None
    error: str | None
```

**Step 2: Add endpoints**

Append to `backend/app/api/v1/endpoints/flows.py`:

```python
from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun, FlowStepResult
from app.services.flow_orchestrator import run_flow
from app.schemas.flows import FlowDefinitionCreate, FlowDefinitionResponse, FlowRunResponse
from fastapi import BackgroundTasks


@router.post("/definitions", response_model=FlowDefinitionResponse, status_code=status.HTTP_201_CREATED)
def create_flow_definition(
    payload: FlowDefinitionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = FlowDefinition(
        user_id=current_user.id,
        name=payload.name,
        nodes=payload.nodes,
        edges=payload.edges,
        trigger_config=payload.trigger_config,
        status=payload.status,
    )
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return flow


@router.get("/definitions", response_model=list[FlowDefinitionResponse])
def list_flow_definitions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flows = db.query(FlowDefinition).filter_by(user_id=current_user.id).order_by(FlowDefinition.updated_at.desc()).all()
    return flows


@router.get("/definitions/{flow_id}", response_model=FlowDefinitionResponse)
def get_flow_definition(
    flow_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = db.query(FlowDefinition).filter_by(id=flow_id, user_id=current_user.id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return flow


@router.put("/definitions/{flow_id}", response_model=FlowDefinitionResponse)
def update_flow_definition(
    flow_id: uuid.UUID,
    payload: FlowDefinitionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = db.query(FlowDefinition).filter_by(id=flow_id, user_id=current_user.id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    flow.name = payload.name
    flow.nodes = payload.nodes
    flow.edges = payload.edges
    flow.trigger_config = payload.trigger_config
    flow.status = payload.status
    db.commit()
    db.refresh(flow)
    return flow


@router.post("/definitions/{flow_id}/run", response_model=FlowRunResponse)
def trigger_flow_run(
    flow_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = db.query(FlowDefinition).filter_by(id=flow_id, user_id=current_user.id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")

    run = FlowRun(flow_id=flow.id, status="pending", contact_rows=[])
    db.add(run)
    db.commit()
    db.refresh(run)

    def _run_in_background():
        from app.core.database import SessionLocal
        with SessionLocal() as session:
            run_flow(run.id, session)

    background_tasks.add_task(_run_in_background)
    return run


@router.post("/runs/{run_id}/cancel", response_model=FlowRunResponse)
def cancel_flow_run(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = db.query(FlowRun).filter_by(id=run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    run.status = "cancelled"
    db.commit()
    db.refresh(run)
    return run
```

**Step 3: Commit**

```bash
git add backend/app/schemas/flows.py backend/app/api/v1/endpoints/flows.py
git commit -m "feat: flow CRUD API — save, load, run, cancel flows"
```

---

### Task 8: Frontend Save/Load Flow to Backend

Connect the flow builder's Save/Load to the new backend endpoints.

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/flows/FlowBuilder.tsx`

**Step 1: Add API methods**

In `frontend/src/lib/api.ts`, add these methods to the `api` object:

```typescript
async createFlowDefinition(payload: { name: string; nodes: unknown[]; edges: unknown[]; trigger_config?: unknown; status?: string }) {
  return request<{ id: string; name: string; nodes: unknown[]; edges: unknown[]; status: string; created_at: string; updated_at: string }>(
    "/flows/definitions",
    { method: "POST", body: JSON.stringify(payload) },
  );
},

async listFlowDefinitions() {
  return request<Array<{ id: string; name: string; status: string; updated_at: string }>>(
    "/flows/definitions",
  );
},

async getFlowDefinition(flowId: string) {
  return request<{ id: string; name: string; nodes: unknown[]; edges: unknown[]; trigger_config: unknown; status: string }>(
    `/flows/definitions/${flowId}`,
  );
},

async updateFlowDefinition(flowId: string, payload: { name: string; nodes: unknown[]; edges: unknown[]; trigger_config?: unknown; status?: string }) {
  return request<{ id: string; name: string; nodes: unknown[]; edges: unknown[]; status: string }>(
    `/flows/definitions/${flowId}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
},

async triggerFlowRun(flowId: string) {
  return request<{ id: string; flow_id: string; status: string }>(
    `/flows/definitions/${flowId}/run`,
    { method: "POST" },
  );
},

async cancelFlowRun(runId: string) {
  return request<{ id: string; status: string }>(
    `/flows/runs/${runId}/cancel`,
    { method: "POST" },
  );
},
```

**Step 2: Update FlowBuilder to save/load from backend**

In `FlowBuilder.tsx`, add state for flow ID and update save/load functions to call the backend API when available, falling back to localStorage. This is a UI integration step — the exact changes depend on the current save/load functions.

Key changes:
- `saveDraft()` → calls `api.createFlowDefinition()` or `api.updateFlowDefinition()` and stores the flow ID
- `loadDraft()` → calls `api.listFlowDefinitions()` to show saved flows
- Add "Run Flow" button that calls `api.triggerFlowRun()`

**Step 3: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/flows/FlowBuilder.tsx
git commit -m "feat: connect flow builder save/load/run to backend API"
```

---

### Task 9: Celery Tasks (Production Wiring)

Wire the orchestrator into proper Celery tasks for production use with Redis.

**Files:**
- Create: `backend/app/services/flow_tasks.py`

**Step 1: Create Celery task wrappers**

Create `backend/app/services/flow_tasks.py`:

```python
from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.services.flow_orchestrator import run_flow


@celery_app.task(name="flow.orchestrate", bind=True, max_retries=0)
def orchestrate_flow_task(self, flow_run_id: str):
    with SessionLocal() as db:
        run_flow(flow_run_id, db)


@celery_app.task(name="flow.dispatch_action", bind=True, max_retries=3)
def dispatch_action_task(self, flow_run_id: str, node_id: str, contact_row: dict):
    # Placeholder for actual SMS/Voice dispatch
    # Will be wired to Twilio in a future task
    pass
```

**Step 2: Update the run endpoint to use Celery when available**

In the `/definitions/{flow_id}/run` endpoint, check if Celery is configured:

```python
try:
    from app.services.flow_tasks import orchestrate_flow_task
    result = orchestrate_flow_task.delay(str(run.id))
    run.celery_task_id = result.id
    db.commit()
except ImportError:
    # Fallback to BackgroundTasks if Celery not available
    background_tasks.add_task(_run_in_background)
```

**Step 3: Commit**

```bash
git add backend/app/services/flow_tasks.py backend/app/api/v1/endpoints/flows.py
git commit -m "feat: Celery task wrappers for flow orchestration"
```

---

### Task 10: Final Test Run and Verification

**Step 1: Run full test suite**

```bash
cd /home/cdjk/gt/ring_ai/crew/dave/backend && python -m pytest tests/ -v --tb=short
```

Expected: All tests across `test_flow_models.py`, `test_flow_compiler.py`, `test_flow_executors.py`, `test_flow_orchestrator.py` pass.

**Step 2: Verify backend starts**

```bash
cd /home/cdjk/gt/ring_ai/crew/dave/backend && uvicorn app.main:app --port 8001 --reload
```

Check: No import errors, server starts clean.

**Step 3: Commit any fixes**

```bash
git add -A && git commit -m "chore: flow execution engine polish"
```
