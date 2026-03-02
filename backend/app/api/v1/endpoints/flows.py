import csv
import io
import ipaddress
import json
import socket
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun
from app.models.manual_table_source import ManualTableSource
from app.models.user import User
from app.schemas.flows import (
    FileUploadResponse,
    FlowDefinitionCreate,
    FlowDefinitionResponse,
    FlowRunCreate,
    FlowRunDetailResponse,
    FlowRunResponse,
    FlowStepResultResponse,
    ManualTableSourceResponse,
    ManualTableSourceUpsert,
    UrlSourcePreviewRequest,
    UrlSourcePreviewResponse,
)
from app.services.flow_orchestrator import run_flow

router = APIRouter()

MAX_SOURCE_DOWNLOAD_BYTES = 2 * 1024 * 1024
BLOCKED_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def _normalize_header_name(value: str) -> str:
    return value.strip().replace("\n", " ").replace("\r", " ")


def _sanitize_headers(headers: list[str]) -> list[str]:
    cleaned = [_normalize_header_name(header) for header in headers]
    cleaned = [header for header in cleaned if header]
    deduped: list[str] = []
    for idx, header in enumerate(cleaned):
        candidate = header
        suffix = 2
        while candidate in deduped:
            candidate = f"{header}_{suffix}"
            suffix += 1
        deduped.append(candidate if candidate else f"col_{idx + 1}")
    return deduped


def _sanitize_rows(rows: list[list[str]], headers: list[str], max_rows: int) -> list[list[str]]:
    width = len(headers)
    safe_rows: list[list[str]] = []
    for row in rows[:max_rows]:
        normalized = [(cell or "").strip() for cell in row]
        if len(normalized) < width:
            normalized.extend([""] * (width - len(normalized)))
        safe_rows.append(normalized[:width])
    return safe_rows


def _to_csv_text(headers: list[str], rows: list[list[str]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    return output.getvalue().strip()


def _is_blocked_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return any(
        [
            ip.is_private,
            ip.is_loopback,
            ip.is_link_local,
            ip.is_multicast,
            ip.is_reserved,
            ip.is_unspecified,
        ]
    )


def _validate_external_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=422, detail="URL must use http or https.")
    if not parsed.hostname:
        raise HTTPException(status_code=422, detail="URL host is required.")
    host = parsed.hostname.lower()
    if host in BLOCKED_HOSTS:
        raise HTTPException(status_code=422, detail="Localhost URLs are blocked.")
    try:
        info = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise HTTPException(status_code=422, detail="Could not resolve URL host.")
    for family, _, _, _, sockaddr in info:
        if family not in (socket.AF_INET, socket.AF_INET6):
            continue
        ip = sockaddr[0]
        if _is_blocked_ip(ip):
            raise HTTPException(status_code=422, detail="Private/internal network URLs are blocked.")
    return parsed.geturl()


def _download_source_text(url: str) -> str:
    timeout = httpx.Timeout(10.0, connect=5.0)
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        try:
            with client.stream("GET", url) as resp:
                if resp.status_code >= 400:
                    raise HTTPException(status_code=422, detail=f"Upstream returned HTTP {resp.status_code}.")
                chunks: list[bytes] = []
                downloaded = 0
                for chunk in resp.iter_bytes():
                    downloaded += len(chunk)
                    if downloaded > MAX_SOURCE_DOWNLOAD_BYTES:
                        raise HTTPException(status_code=422, detail="Source payload exceeds 2MB limit.")
                    chunks.append(chunk)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=422, detail=f"Could not fetch source URL: {exc}") from exc
    try:
        return b"".join(chunks).decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="Source response must be valid UTF-8.") from exc


def _extract_json_rows(payload: object) -> list[dict]:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        data = payload.get("data")
        items = payload.get("items")
        if isinstance(data, list):
            rows = data
        elif isinstance(items, list):
            rows = items
        else:
            raise HTTPException(status_code=422, detail="JSON payload must include array root/data/items.")
    else:
        raise HTTPException(status_code=422, detail="JSON payload must be an object or an array.")
    if not rows:
        return []
    if not isinstance(rows[0], dict):
        raise HTTPException(status_code=422, detail="JSON rows must be objects.")
    return [r for r in rows if isinstance(r, dict)]


@router.post("/sources/url-preview", response_model=UrlSourcePreviewResponse)
def preview_url_source(
    payload: UrlSourcePreviewRequest,
    _current_user: User = Depends(get_current_user),
):
    validated_url = _validate_external_url(payload.url)
    raw_text = _download_source_text(validated_url)

    headers: list[str] = []
    rows: list[list[str]] = []

    if payload.source_kind == "source_url_csv":
        reader = csv.reader(io.StringIO(raw_text))
        parsed_rows = list(reader)
        if not parsed_rows:
            raise HTTPException(status_code=422, detail="CSV source is empty.")
        headers = _sanitize_headers([cell.strip() for cell in parsed_rows[0]])
        if not headers:
            raise HTTPException(status_code=422, detail="CSV header row is missing.")
        rows = _sanitize_rows(parsed_rows[1:], headers, payload.max_rows)
    else:
        try:
            body = json.loads(raw_text)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid JSON payload.") from exc
        records = _extract_json_rows(body)
        if not records:
            return UrlSourcePreviewResponse(
                headers=[],
                preview_rows=[],
                total_rows=0,
                mapping="",
                sample_csv="",
            )
        headers = _sanitize_headers(list(records[0].keys()))
        if not headers:
            raise HTTPException(status_code=422, detail="JSON records have no usable keys.")
        raw_rows = [[str(record.get(header, "")).strip() for header in headers] for record in records]
        rows = _sanitize_rows(raw_rows, headers, payload.max_rows)

    return UrlSourcePreviewResponse(
        headers=headers,
        preview_rows=rows[: payload.max_preview_rows],
        total_rows=len(rows),
        mapping=",".join(headers),
        sample_csv=_to_csv_text(headers, rows[:20]),
    )


@router.post("/sources/file-upload", response_model=FileUploadResponse)
async def upload_source_file(
    file: UploadFile = File(...),
    _current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=422, detail="Filename is required.")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".xlsx"):
        raise HTTPException(status_code=422, detail="Only .csv and .xlsx files are supported.")

    content = await file.read()
    if len(content) > MAX_SOURCE_DOWNLOAD_BYTES:
        raise HTTPException(status_code=422, detail="File exceeds 2MB limit.")

    headers: list[str] = []
    all_rows: list[list[str]] = []

    if ext == ".csv":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=422, detail="CSV file must be valid UTF-8.")
        reader = csv.reader(io.StringIO(text))
        parsed_rows = list(reader)
        if not parsed_rows:
            raise HTTPException(status_code=422, detail="CSV file is empty.")
        headers = _sanitize_headers([cell.strip() for cell in parsed_rows[0]])
        all_rows = _sanitize_rows(parsed_rows[1:], headers, max_rows=10000)
    else:
        try:
            import openpyxl
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl is not installed on this server.")
        with tempfile.NamedTemporaryFile(suffix=".xlsx") as tmp:
            tmp.write(content)
            tmp.flush()
            wb = openpyxl.load_workbook(tmp.name, read_only=True)
            ws = wb.active
            if ws is None:
                raise HTTPException(status_code=422, detail="XLSX file has no active sheet.")
            row_iter = ws.iter_rows(values_only=True)
            first_row = next(row_iter, None)
            if first_row is None:
                raise HTTPException(status_code=422, detail="XLSX file is empty.")
            headers = _sanitize_headers([str(cell or "").strip() for cell in first_row])
            raw_rows = [[str(cell or "").strip() for cell in row] for row in row_iter]
            all_rows = _sanitize_rows(raw_rows, headers, max_rows=10000)
            wb.close()

    if not headers:
        raise HTTPException(status_code=422, detail="File header row is missing or empty.")

    file_id = str(uuid.uuid4())

    return FileUploadResponse(
        file_id=file_id,
        headers=headers,
        preview_rows=all_rows[:10],
        total_rows=len(all_rows),
    )


@router.post("/sources/manual-table", response_model=ManualTableSourceResponse, status_code=status.HTTP_201_CREATED)
def create_manual_table_source(
    payload: ManualTableSourceUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    headers = _sanitize_headers(payload.headers)
    if not headers:
        raise HTTPException(status_code=422, detail="At least one header is required.")
    rows = _sanitize_rows(payload.rows, headers, max_rows=5000)
    source = ManualTableSource(
        user_id=current_user.id,
        name=payload.name.strip(),
        headers=headers,
        rows=rows,
        row_count=len(rows),
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def _get_source_or_404(source_id: uuid.UUID, current_user: User, db: Session) -> ManualTableSource:
    source = (
        db.query(ManualTableSource)
        .filter(ManualTableSource.id == source_id, ManualTableSource.user_id == current_user.id)
        .first()
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Manual table source not found.")
    return source


@router.get("/sources/manual-table/{source_id}", response_model=ManualTableSourceResponse)
def get_manual_table_source(
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_source_or_404(source_id, current_user, db)


@router.put("/sources/manual-table/{source_id}", response_model=ManualTableSourceResponse)
def update_manual_table_source(
    source_id: uuid.UUID,
    payload: ManualTableSourceUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source = _get_source_or_404(source_id, current_user, db)
    headers = _sanitize_headers(payload.headers)
    if not headers:
        raise HTTPException(status_code=422, detail="At least one header is required.")
    rows = _sanitize_rows(payload.rows, headers, max_rows=5000)
    source.name = payload.name.strip()
    source.headers = headers
    source.rows = rows
    source.row_count = len(rows)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


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


@router.delete("/definitions/{flow_id}", status_code=204)
def delete_flow_definition(
    flow_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = db.query(FlowDefinition).filter_by(id=flow_id, user_id=current_user.id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    db.delete(flow)
    db.commit()


_phone_numbers_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 300  # 5 minutes


@router.get("/phone-numbers")
def list_flow_phone_numbers(
    current_user: User = Depends(get_current_user),
):
    cache_key = str(current_user.id)
    now = time.time()
    cached = _phone_numbers_cache.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    default_from_number = ""
    try:
        from app.services.telephony import get_twilio_provider
        provider = get_twilio_provider()
        default_from_number = provider.default_from_number or ""
        numbers = provider.list_phone_numbers()
    except Exception:
        numbers = []

    payload = {
        "default_from_number": default_from_number,
        "numbers": numbers,
    }
    _phone_numbers_cache[cache_key] = (now, payload)
    return payload


@router.post("/estimate-credits")
async def estimate_flow_credits(
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Estimate credits for a flow action node."""
    from app.services.credits import flow_action_credits, get_or_create_credit

    kind = body.get("kind", "")
    tts_provider = body.get("tts_provider")
    contact_count = body.get("contact_count", 0)

    credits_per = flow_action_credits(kind, tts_provider)
    total = credits_per * contact_count

    credit = get_or_create_credit(db, current_user.org_id)

    return {
        "credits_per_action": credits_per,
        "contact_count": contact_count,
        "estimated_total": total,
        "current_balance": credit.balance,
        "sufficient": credit.balance >= total,
    }


@router.post("/definitions/{flow_id}/run", response_model=FlowRunResponse)
def trigger_flow_run(
    flow_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    body: FlowRunCreate = FlowRunCreate(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = db.query(FlowDefinition).filter_by(id=flow_id, user_id=current_user.id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")

    run = FlowRun(flow_id=flow.id, status="pending", contact_rows=[], mode=body.mode)
    db.add(run)
    db.commit()
    db.refresh(run)

    # Try Celery first; fall back to in-process background task
    celery_dispatched = False
    try:
        from app.services.flow_tasks import orchestrate_flow_task
        # Check if any Celery workers are online before dispatching
        inspect = orchestrate_flow_task.app.control.inspect()
        active_workers = inspect.ping(timeout=0.5)
        if active_workers:
            result = orchestrate_flow_task.delay(str(run.id))
            run.celery_task_id = result.id
            db.commit()
            celery_dispatched = True
    except Exception:
        pass

    if not celery_dispatched:
        _run_id = run.id
        def _run_in_background():
            from app.core.database import SessionLocal
            with SessionLocal() as session:
                run_flow(_run_id, session)
        background_tasks.add_task(_run_in_background)

    return run


@router.post("/runs/{run_id}/cancel", response_model=FlowRunResponse)
def cancel_flow_run(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = (
        db.query(FlowRun)
        .join(FlowDefinition, FlowRun.flow_id == FlowDefinition.id)
        .filter(FlowRun.id == run_id, FlowDefinition.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    run.status = "cancelled"
    db.commit()
    db.refresh(run)
    return run


@router.get("/runs", response_model=list[FlowRunResponse])
def list_flow_runs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
):
    from sqlalchemy.orm import selectinload
    query = (
        db.query(FlowRun)
        .options(selectinload(FlowRun.steps))
        .join(FlowDefinition, FlowRun.flow_id == FlowDefinition.id)
        .filter(FlowDefinition.user_id == current_user.id)
        .order_by(FlowRun.created_at.desc())
    )
    if status:
        query = query.filter(FlowRun.status == status)
    runs = query.offset(offset).limit(limit).all()
    return runs


@router.get("/runs/{run_id}", response_model=FlowRunDetailResponse)
def get_flow_run(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = (
        db.query(FlowRun)
        .join(FlowDefinition, FlowRun.flow_id == FlowDefinition.id)
        .filter(FlowRun.id == run_id, FlowDefinition.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    flow = db.get(FlowDefinition, run.flow_id)
    steps = [FlowStepResultResponse.from_orm_step(s) for s in run.steps]
    return FlowRunDetailResponse(
        id=run.id,
        flow_id=run.flow_id,
        status=run.status,
        mode=run.mode,
        started_at=run.started_at,
        completed_at=run.completed_at,
        current_node_id=run.current_node_id,
        error=run.error,
        contact_count=run.contact_count,
        steps=steps,
        flow_name=flow.name if flow else "",
    )
