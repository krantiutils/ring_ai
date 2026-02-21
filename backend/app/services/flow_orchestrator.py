from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun, FlowStepResult
from app.services.flow_compiler import compile_flow, ExecutionStep
from app.services.flow_dispatch import DispatchResult, dispatch_action
from app.services.flow_executors import (
    execute_condition,
    execute_deduplicate,
    execute_normalize_phone,
    execute_source,
    execute_validation,
)

_BRANCHING_KINDS = {"condition", "validation"}
_ACTION_KINDS = {"agent_sms", "agent_voice", "agent_whatsapp", "action_webhook", "agent_voice_interactive"}


def run_flow(flow_run_id, db: Session) -> None:
    if isinstance(flow_run_id, str):
        flow_run_id = _uuid.UUID(flow_run_id)
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
    mode = run.mode  # "live" or "dry_run"
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
        output_rows, rows_true, rows_false, status = _execute_step(step, input_rows, mode=mode)

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

        # Build step metadata
        step_metadata: dict | None = None
        if mode == "dry_run" and step.node_kind in _ACTION_KINDS and output_rows:
            step_metadata = {"sample_messages": [r.get("_rendered_message", "") for r in output_rows[:5]]}

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
            metadata_=step_metadata,
        )
        db.add(result)
        db.commit()

        # Track contact count from source nodes
        if step.node_kind.startswith("source_") and output_rows:
            run.contact_rows = output_rows
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
    step: ExecutionStep, input_rows: list[dict], *, mode: str = "live"
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

    if kind == "lookup_kb":
        from app.core.database import SessionLocal
        from app.services.knowledge_base import search_knowledge_base
        from app.services.flow_dispatch import render_template

        kb_id = config.get("knowledge_base_id", "")
        query_template = config.get("query_template", "")
        top_k = int(config.get("top_k", 5))
        output_var = config.get("output_variable", "_kb_context")

        if not kb_id or not query_template:
            return input_rows, None, None, "skipped"

        enriched_rows = []
        with SessionLocal() as kb_db:
            for row in input_rows:
                query = render_template(query_template, row)
                try:
                    import uuid as _uuid_mod
                    results = search_knowledge_base(kb_db, _uuid_mod.UUID(kb_id), query, top_k)
                    context_text = "\n\n".join(
                        f"[{r.get('file_name', 'doc')}] {r.get('content', '')}"
                        for r in results
                    )
                except Exception as exc:
                    context_text = f"[KB lookup error: {exc}]"
                enriched = dict(row)
                enriched[output_var] = context_text
                enriched_rows.append(enriched)
        return enriched_rows, None, None, "completed"

    if kind in _ACTION_KINDS:
        if not input_rows:
            return [], None, None, "skipped"

        # Check for rate limit from upstream rate_limit node
        per_minute = 0
        if input_rows:
            per_minute = input_rows[0].get("_rate_limit_per_minute", 0)

        dispatched_rows = []
        failed_count = 0
        for i, row in enumerate(input_rows):
            if mode == "dry_run":
                from app.services.flow_dispatch import render_template
                if kind in ("agent_sms", "agent_whatsapp"):
                    rendered = render_template(str(config.get("message", "")), row)
                elif kind == "agent_voice":
                    rendered = render_template(str(config.get("script", "")), row)
                elif kind == "agent_voice_interactive":
                    rendered = render_template(str(config.get("system_prompt", "")), row)
                else:
                    rendered = ""
                enriched = dict(row)
                enriched["_dispatch_status"] = "simulated"
                enriched["_dispatch_id"] = ""
                enriched["_rendered_message"] = rendered
                dispatched_rows.append(enriched)
            else:
                if per_minute and i > 0:
                    import time
                    time.sleep(60.0 / per_minute)
                result = dispatch_action(kind, row, config)
                enriched = dict(row)
                enriched["_dispatch_status"] = result.status
                enriched["_dispatch_id"] = result.provider_id
                if result.error:
                    enriched["_dispatch_error"] = result.error
                    failed_count += 1
                dispatched_rows.append(enriched)
        status = "completed" if failed_count == 0 else "partial"
        return dispatched_rows, None, None, status

    if kind in ("end_success", "end_failure"):
        return input_rows, None, None, "completed"

    if kind == "wait":
        return input_rows, None, None, "completed"

    if kind == "rate_limit":
        per_minute = config.get("per_minute", 0)
        if per_minute:
            return [dict(r, _rate_limit_per_minute=per_minute) for r in input_rows], None, None, "completed"
        return input_rows, None, None, "completed"

    if kind == "sender_number":
        from_number = config.get("number", "")
        if from_number:
            return [dict(r, _from_number=from_number) for r in input_rows], None, None, "completed"
        return input_rows, None, None, "completed"

    if kind == "business_hours":
        return input_rows, None, None, "completed"

    if kind == "error_handler":
        return input_rows, None, None, "completed"

    if kind == "merge":
        return input_rows, None, None, "completed"

    # Unknown node -- pass through
    return input_rows, None, None, "completed"
