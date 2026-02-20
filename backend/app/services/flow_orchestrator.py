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
    # If a parent node already routed rows to this node, use them
    if step.node_id in row_sets:
        return row_sets[step.node_id]
    # Trigger and source nodes start with empty input
    if step.node_kind.startswith("trigger_") or step.node_kind.startswith("source_"):
        return []
    # End nodes may not have explicit rows routed to them
    if step.node_kind in ("end_success", "end_failure"):
        return []
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
        # For now, action nodes pass through rows (dispatch added later)
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

    # Unknown node -- pass through
    return input_rows, None, None, "completed"
