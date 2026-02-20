import uuid

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.services.flow_dispatch import dispatch_action
from app.services.flow_orchestrator import run_flow


@celery_app.task(name="flow.orchestrate", bind=True, max_retries=0)
def orchestrate_flow_task(self, flow_run_id: str):
    with SessionLocal() as db:
        run_flow(flow_run_id, db)


@celery_app.task(name="flow.dispatch_action", bind=True, max_retries=3)
def dispatch_action_task(self, flow_run_id: str, node_id: str, contact_row: dict):
    """Dispatch a single action (SMS/Voice/WhatsApp) for one contact row.

    Looks up the node config from the flow definition, then routes to the
    appropriate provider via dispatch_action().
    """
    with SessionLocal() as db:
        from app.models.flow_run import FlowRun
        from app.models.flow_definition import FlowDefinition

        run_uuid = uuid.UUID(flow_run_id) if isinstance(flow_run_id, str) else flow_run_id
        run = db.get(FlowRun, run_uuid)
        if not run:
            return

        flow = db.get(FlowDefinition, run.flow_id)
        if not flow:
            return

        # Find the node config
        node_data = None
        for node in flow.nodes:
            if node["id"] == node_id:
                node_data = node["data"]
                break

        if not node_data:
            return

        kind = node_data["kind"]
        config = node_data.get("config", {})

        dispatch_action(kind, contact_row, config)
