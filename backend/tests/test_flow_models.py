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
