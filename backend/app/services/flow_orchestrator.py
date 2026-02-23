from __future__ import annotations

import ast
import operator
import re
import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun, FlowStepResult
from app.models.sms_message import SmsMessage
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
_ASSIGNMENT_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$")


def _parse_capture_columns(raw: object) -> list[str]:
    text = str(raw or "")
    if not text.strip():
        return []
    seen: set[str] = set()
    cols: list[str] = []
    for part in text.replace(";", ",").replace("\n", ",").split(","):
        col = part.strip()
        if not col or col in seen:
            continue
        seen.add(col)
        cols.append(col)
    return cols


_ALLOWED_FUNCS = {
    "upper": lambda v: str(v).upper(),
    "lower": lambda v: str(v).lower(),
    "len": lambda v: len(str(v)),
    "int": lambda v: int(float(v)) if str(v).strip() else 0,
    "float": lambda v: float(v) if str(v).strip() else 0.0,
    "str": lambda v: str(v),
    "abs": lambda v: abs(float(v)),
    "coalesce": lambda *vals: next((v for v in vals if str(v) != ""), ""),
}

_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_ALLOWED_CMPOPS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
}


def _safe_eval(expr: str, ctx: dict[str, object]) -> object:
    tree = ast.parse(expr, mode="eval")

    def _eval(node: ast.AST) -> object:
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return ctx.get(node.id, "")
        if isinstance(node, ast.BinOp):
            op_fn = _ALLOWED_BINOPS.get(type(node.op))
            if not op_fn:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            return op_fn(_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp):
            v = _eval(node.operand)
            if isinstance(node.op, ast.USub):
                return -float(v)
            if isinstance(node.op, ast.UAdd):
                return float(v)
            if isinstance(node.op, ast.Not):
                return not bool(v)
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        if isinstance(node, ast.BoolOp):
            values = [_eval(v) for v in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
            raise ValueError(f"Unsupported bool operator: {type(node.op).__name__}")
        if isinstance(node, ast.Compare):
            left = _eval(node.left)
            for op, right_node in zip(node.ops, node.comparators):
                right = _eval(right_node)
                cmp_fn = _ALLOWED_CMPOPS.get(type(op))
                if not cmp_fn or not cmp_fn(left, right):
                    return False
                left = right
            return True
        if isinstance(node, ast.IfExp):
            return _eval(node.body) if _eval(node.test) else _eval(node.orelse)
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("Only direct function calls are allowed")
            fn = _ALLOWED_FUNCS.get(node.func.id)
            if not fn:
                raise ValueError(f"Function not allowed: {node.func.id}")
            args = [_eval(a) for a in node.args]
            return fn(*args)
        raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    return _eval(tree)


def _parse_enrich_assignments(raw: object) -> list[tuple[str, str]]:
    text = str(raw or "")
    assignments: list[tuple[str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = _ASSIGNMENT_RE.match(line)
        if not match:
            continue
        assignments.append((match.group(1), match.group(2)))
    return assignments


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

    # row_routes maps target node_id -> source node_id -> list of row dicts
    row_routes: dict[str, dict[str, list[dict]]] = {}

    for step in plan.steps:
        # Check cancellation
        db.refresh(run)
        if run.status == "cancelled":
            return

        run.current_node_id = step.node_id
        db.commit()

        started = datetime.now(timezone.utc)

        # Determine input rows for this step
        input_rows = _resolve_input_rows(step, row_routes)

        # Execute the node
        output_rows, branch_rows, status = _execute_step(step, input_rows, db=db, mode=mode)

        # Store outputs for downstream nodes (each handle -> list of target IDs)
        if branch_rows is not None:
            for handle, target_id in step.outputs.items():
                rows = branch_rows.get(handle, branch_rows.get("default", []))
                _append_routed_rows(row_routes, target_id, step.node_id, rows)
        else:
            for _, target_id in step.outputs.items():
                _append_routed_rows(row_routes, target_id, step.node_id, output_rows)

        capture_columns = _parse_capture_columns(step.config.get("capture_columns")) if step.node_kind == "agent_voice_interactive" else []

        # Build step metadata
        step_metadata: dict | None = None
        if mode == "dry_run" and step.node_kind in _ACTION_KINDS and output_rows:
            step_metadata = {"sample_messages": [r.get("_rendered_message", "") for r in output_rows[:5]]}
        if step.node_kind in _ACTION_KINDS and output_rows:
            status_counts: dict[str, int] = {}
            sample_errors: list[str] = []
            for row in output_rows:
                dispatch_status = str(row.get("_dispatch_status", "")).strip()
                if dispatch_status:
                    status_counts[dispatch_status] = status_counts.get(dispatch_status, 0) + 1
                dispatch_error = str(row.get("_dispatch_error", "")).strip()
                if dispatch_error and dispatch_error not in sample_errors:
                    sample_errors.append(dispatch_error)
            action_meta = {
                "dispatch_status_counts": status_counts,
                "failed_count": status_counts.get("failed", 0),
                "success_count": len(output_rows) - status_counts.get("failed", 0),
            }
            if sample_errors:
                action_meta["sample_dispatch_errors"] = sample_errors[:5]
            step_metadata = {**(step_metadata or {}), **action_meta}
        if step.node_kind == "enrich_columns":
            assignments = _parse_enrich_assignments(step.config.get("columns", ""))
            new_fields = [name for name, _ in assignments]
            sample_new_fields: list[dict[str, object]] = []
            if new_fields and output_rows:
                for row in output_rows[:5]:
                    sample_new_fields.append({name: row.get(name, "") for name in new_fields})
            step_metadata = {
                **(step_metadata or {}),
                "new_fields": new_fields,
                "sample_new_fields": sample_new_fields,
            }
        if step.node_kind == "response_capture":
            out_col = str(step.config.get("output_column", "response_text") or "response_text")
            status_col = str(step.config.get("status_column", "response_status") or "response_status")
            step_metadata = {
                **(step_metadata or {}),
                "new_fields": [out_col, status_col],
                "capture_channel": str(step.config.get("channel", "sms") or "sms"),
                "wait_minutes": str(step.config.get("wait_minutes", "15") or "15"),
            }
        if capture_columns:
            sample_captured_fields = [
                {col: str(row.get(col, "")) for col in capture_columns}
                for row in output_rows[:5]
            ]
            step_metadata = {
                **(step_metadata or {}),
                "capture_columns": capture_columns,
                "sample_captured_fields": sample_captured_fields,
            }

        rows_true = branch_rows.get("true") if branch_rows else None
        rows_false = branch_rows.get("false") if branch_rows else None
        if rows_true is None and branch_rows:
            rows_true = branch_rows.get("valid")
            rows_false = branch_rows.get("invalid")
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
        if step.node_kind == "agent_voice_interactive" and output_rows:
            # Keep latest interactive rows (including capture columns) available on run.
            run.contact_rows = output_rows
            db.commit()

    run.status = "completed"
    run.completed_at = datetime.now(timezone.utc)
    db.commit()


def _resolve_input_rows(step: ExecutionStep, row_sets: dict[str, dict[str, list[dict]]]) -> list[dict]:
    # If parent nodes routed rows to this node, resolve selected source or combine.
    incoming_map = row_sets.get(step.node_id)
    if incoming_map:
        input_from = str(step.config.get("input_from", "")).strip()
        if input_from and input_from != "__all__":
            return list(incoming_map.get(input_from, []))

        combined: list[dict] = []
        if step.input_sources:
            for src in step.input_sources:
                combined.extend(incoming_map.get(src, []))
        else:
            for rows in incoming_map.values():
                combined.extend(rows)
        return combined
    # Trigger and source nodes start with empty input
    if step.node_kind.startswith("trigger_") or step.node_kind.startswith("source_"):
        return []
    # End nodes may not have explicit rows routed to them
    if step.node_kind in ("end_success", "end_failure"):
        return []
    return []


def _execute_step(
    step: ExecutionStep,
    input_rows: list[dict],
    *,
    db: Session,
    mode: str = "live",
) -> tuple[list[dict], dict[str, list[dict]] | None, str]:
    """Returns (output_rows, branch_rows, status)."""
    kind = step.node_kind
    config = step.config

    if kind.startswith("trigger_"):
        return [], None, "completed"

    if kind.startswith("source_"):
        rows = execute_source(kind, config)
        return rows, None, "completed"

    if kind == "condition":
        true_rows, false_rows = execute_condition(input_rows, config)
        return true_rows + false_rows, {"true": true_rows, "false": false_rows}, "completed"

    if kind == "validation":
        valid, invalid = execute_validation(input_rows, config)
        return valid + invalid, {"valid": valid, "invalid": invalid}, "completed"

    if kind == "dtmf_menu":
        digit_field = str(config.get("digit_field", "dtmf_digit")).strip() or "dtmf_digit"
        fallback_handle = str(config.get("fallback_handle", "no_input")).strip() or "no_input"
        grouped: dict[str, list[dict]] = {}
        for row in input_rows:
            raw_digit = str(row.get(digit_field, "")).strip()
            handle = f"press_{raw_digit}" if raw_digit else fallback_handle
            grouped.setdefault(handle, []).append(row)
        return input_rows, grouped, "completed"

    if kind == "deduplicate":
        rows = execute_deduplicate(input_rows, config)
        return rows, None, "completed"

    if kind == "normalize_phone":
        rows = execute_normalize_phone(input_rows, config)
        return rows, None, "completed"

    if kind == "enrich_columns":
        assignments = _parse_enrich_assignments(config.get("columns", ""))
        if not assignments:
            return input_rows, None, "skipped"
        enriched_rows: list[dict] = []
        for idx, row in enumerate(input_rows, start=1):
            updated = dict(row)
            nf = len([k for k in row.keys() if not str(k).startswith("_")])
            ctx: dict[str, object] = dict(updated)
            ctx["NR"] = idx
            ctx["FNR"] = idx
            ctx["NF"] = nf
            ctx["row_number"] = idx
            ctx["record_number"] = idx
            ctx["field_count"] = nf
            for target_col, expr in assignments:
                value: object
                try:
                    value = _safe_eval(expr, ctx)
                except Exception:
                    value = expr
                updated[target_col] = value
                ctx[target_col] = value
            enriched_rows.append(updated)
        return enriched_rows, None, "completed"

    if kind == "response_capture":
        if not input_rows:
            return [], {"received": [], "timeout": []}, "skipped"
        channel = str(config.get("channel", "sms")).strip().lower() or "sms"
        output_column = str(config.get("output_column", "response_text")).strip() or "response_text"
        status_column = str(config.get("status_column", "response_status")).strip() or "response_status"
        wait_minutes_raw = str(config.get("wait_minutes", "15")).strip() or "15"
        try:
            wait_minutes = max(1, int(float(wait_minutes_raw)))
        except Exception:
            wait_minutes = 15
        timeout_seconds = wait_minutes * 60

        captured_rows: list[dict] = []
        received_rows: list[dict] = []
        timeout_rows: list[dict] = []
        captured = 0
        now_utc = datetime.now(timezone.utc)
        for row in input_rows:
            updated = dict(row)
            dispatch_id = str(row.get("_dispatch_id", "")).strip()

            if channel == "sms":
                phone = str(row.get("phone", "")).strip()
                if not dispatch_id and not phone:
                    updated[status_column] = "missing_phone"
                    updated.setdefault(output_column, "")
                    captured_rows.append(updated)
                    continue

                inbound = None
                if dispatch_id:
                    outbound = db.execute(
                        select(SmsMessage).where(SmsMessage.twilio_sid == dispatch_id)
                    ).scalars().first()
                    if outbound is not None:
                        conversation_id = outbound.conversation_id
                        created_at = outbound.created_at
                        inbound_query = (
                            select(SmsMessage)
                            .where(SmsMessage.conversation_id == conversation_id)
                            .where(SmsMessage.direction == "inbound")
                            .where(SmsMessage.created_at >= created_at)
                            .order_by(SmsMessage.created_at.asc())
                        )
                        inbound = db.execute(inbound_query).scalars().first()
                        if inbound is not None and getattr(inbound, "created_at", None) is not None:
                            age_seconds = (now_utc - inbound.created_at).total_seconds()
                            if age_seconds > timeout_seconds:
                                inbound = None
                if inbound is None and phone:
                    inbound = db.execute(
                        select(SmsMessage)
                        .where(SmsMessage.direction == "inbound")
                        .where(SmsMessage.from_number == phone)
                        .order_by(SmsMessage.created_at.desc())
                    ).scalars().first()
                    if inbound is not None and getattr(inbound, "created_at", None) is not None:
                        age_seconds = (now_utc - inbound.created_at).total_seconds()
                        if age_seconds > timeout_seconds:
                            inbound = None

                if inbound:
                    updated[output_column] = inbound.body
                    updated[status_column] = "captured"
                    captured += 1
                    received_rows.append(updated)
                else:
                    updated.setdefault(output_column, "")
                    updated[status_column] = "timeout"
                    timeout_rows.append(updated)
            elif channel == "dtmf":
                from app.services.flow_dispatch import flow_dtmf_store

                if not dispatch_id:
                    updated[status_column] = "timeout"
                    updated.setdefault(output_column, "")
                    timeout_rows.append(updated)
                else:
                    dtmf_entry = flow_dtmf_store.get(dispatch_id)
                    digit = str((dtmf_entry or {}).get("digit", "")).strip() if isinstance(dtmf_entry, dict) else ""
                    if digit:
                        updated[output_column] = digit
                        updated[status_column] = "captured"
                        captured += 1
                        received_rows.append(updated)
                    else:
                        updated.setdefault(output_column, "")
                        updated[status_column] = "timeout"
                        timeout_rows.append(updated)
            else:
                updated[status_column] = "unsupported_channel"
                updated.setdefault(output_column, "")
                timeout_rows.append(updated)
            captured_rows.append(updated)
        status = "completed" if captured == len(input_rows) else ("partial" if captured > 0 else "skipped")
        return captured_rows, {"received": received_rows, "timeout": timeout_rows}, status

    if kind == "lookup_kb":
        from app.core.database import SessionLocal
        from app.services.knowledge_base import search_knowledge_base
        from app.services.flow_dispatch import render_template

        kb_id = config.get("knowledge_base_id", "")
        query_template = config.get("query_template", "")
        top_k = int(config.get("top_k", 5))
        output_var = config.get("output_variable", "_kb_context")

        if not kb_id or not query_template:
            return input_rows, None, "skipped"

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
        return enriched_rows, None, "completed"

    if kind in _ACTION_KINDS:
        if not input_rows:
            return [], None, "skipped"

        capture_columns = _parse_capture_columns(config.get("capture_columns")) if kind == "agent_voice_interactive" else []

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
                if kind == "agent_voice_interactive" and capture_columns:
                    for col in capture_columns:
                        enriched[col] = "[simulated response]"
                    enriched["_capture_status"] = "simulated"
                dispatched_rows.append(enriched)
            else:
                if per_minute and i > 0:
                    import time
                    time.sleep(60.0 / per_minute)
                result = dispatch_action(kind, row, config)
                enriched = dict(row)
                enriched["_dispatch_status"] = result.status
                enriched["_dispatch_id"] = result.provider_id
                if kind == "agent_voice_interactive" and capture_columns:
                    for col in capture_columns:
                        enriched.setdefault(col, "")
                    enriched["_capture_status"] = "pending"
                if result.error:
                    enriched["_dispatch_error"] = result.error
                    failed_count += 1
                dispatched_rows.append(enriched)
        if failed_count == 0:
            status = "completed"
        elif failed_count == len(input_rows):
            status = "failed"
        else:
            status = "partial"
        return dispatched_rows, None, status

    if kind in ("end_success", "end_failure"):
        return input_rows, None, "completed"

    if kind == "wait":
        return input_rows, None, "completed"

    if kind == "rate_limit":
        per_minute = config.get("per_minute", 0)
        if per_minute:
            return [dict(r, _rate_limit_per_minute=per_minute) for r in input_rows], None, "completed"
        return input_rows, None, "completed"

    if kind == "sender_number":
        from_number = config.get("number", "")
        if from_number:
            return [dict(r, _from_number=from_number) for r in input_rows], None, "completed"
        return input_rows, None, "completed"

    if kind == "business_hours":
        return input_rows, None, "completed"

    if kind == "error_handler":
        return input_rows, None, "completed"

    if kind == "merge":
        return input_rows, None, "completed"

    # Unknown node -- pass through
    return input_rows, None, "completed"


def _append_routed_rows(
    row_routes: dict[str, dict[str, list[dict]]],
    target_node_id: str,
    source_node_id: str,
    rows: list[dict],
) -> None:
    if target_node_id not in row_routes:
        row_routes[target_node_id] = {}
    if source_node_id not in row_routes[target_node_id]:
        row_routes[target_node_id][source_node_id] = []
    row_routes[target_node_id][source_node_id].extend(rows)
