import uuid

from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun, FlowStepResult


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
