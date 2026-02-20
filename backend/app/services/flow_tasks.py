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
