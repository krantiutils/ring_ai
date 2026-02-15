"""Form/Survey API — CRUD, response collection, and CSV export."""

import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.contact import Contact
from app.models.form import Form
from app.models.form_response import FormResponse
from app.schemas.forms import (
    FormCreate,
    FormDetailResponse,
    FormListResponse,
    FormResponseListResponse,
    FormResponseSchema,
    FormSubmission,
    FormUpdate,
)
from app.schemas.forms import (
    FormResponse as FormResponseOut,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_form_or_404(form_id: uuid.UUID, db: Session) -> Form:
    form = db.get(Form, form_id)
    if form is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


def _validate_questions(questions: list[dict]) -> list[str]:
    """Validate question definitions, return list of errors."""
    errors: list[str] = []
    for i, q in enumerate(questions):
        if q.get("type") == "multiple_choice":
            opts = q.get("options")
            if not opts or len(opts) < 2:
                errors.append(f"Question {i}: multiple_choice requires at least 2 options")
            if opts and len(opts) > 9:
                errors.append(f"Question {i}: multiple_choice supports at most 9 options (DTMF digits 1-9)")
        if q.get("type") == "rating":
            # Rating is always 1-5, no options needed
            pass
    return errors


def _validate_answers(form: Form, answers: dict) -> list[str]:
    """Validate submitted answers against form questions."""
    errors: list[str] = []
    questions = form.questions or []

    for i, question in enumerate(questions):
        key = str(i)
        q_type = question.get("type")
        required = question.get("required", True)
        value = answers.get(key)

        if required and value is None:
            errors.append(f"Question {i} ('{question.get('text', '')}') is required")
            continue

        if value is None:
            continue

        if q_type == "multiple_choice":
            options = question.get("options", [])
            if value not in options:
                errors.append(f"Question {i}: '{value}' is not a valid option")
        elif q_type == "rating":
            try:
                rating = int(value)
                if rating < 1 or rating > 5:
                    errors.append(f"Question {i}: rating must be between 1 and 5")
            except (ValueError, TypeError):
                errors.append(f"Question {i}: rating must be an integer")
        elif q_type == "yes_no":
            if value not in (True, False, "yes", "no"):
                errors.append(f"Question {i}: yes_no answer must be true/false or yes/no")
        elif q_type == "numeric":
            try:
                float(value)
            except (ValueError, TypeError):
                errors.append(f"Question {i}: numeric answer must be a number")

    return errors


# ---------------------------------------------------------------------------
# Form CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=FormResponseOut, status_code=201)
def create_form(payload: FormCreate, db: Session = Depends(get_db)):
    questions_raw = [q.model_dump() for q in payload.questions]

    validation_errors = _validate_questions(questions_raw)
    if validation_errors:
        raise HTTPException(status_code=422, detail="; ".join(validation_errors))

    form = Form(
        title=payload.title,
        description=payload.description,
        questions=questions_raw,
        org_id=payload.org_id,
        status="draft",
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return form


@router.get("/", response_model=FormListResponse)
def list_forms(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    org_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    query = select(Form)
    count_query = select(func.count()).select_from(Form)

    if status is not None:
        query = query.where(Form.status == status)
        count_query = count_query.where(Form.status == status)
    if org_id is not None:
        query = query.where(Form.org_id == org_id)
        count_query = count_query.where(Form.org_id == org_id)

    total = db.execute(count_query).scalar_one()
    offset = (page - 1) * page_size
    forms = db.execute(query.order_by(Form.created_at.desc()).offset(offset).limit(page_size)).scalars().all()

    return FormListResponse(
        items=forms,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{form_id}", response_model=FormDetailResponse)
def get_form(form_id: uuid.UUID, db: Session = Depends(get_db)):
    form = _get_form_or_404(form_id, db)

    response_count = db.execute(
        select(func.count()).select_from(FormResponse).where(FormResponse.form_id == form.id)
    ).scalar_one()

    return FormDetailResponse(
        id=form.id,
        org_id=form.org_id,
        title=form.title,
        description=form.description,
        questions=form.questions,
        status=form.status,
        created_at=form.created_at,
        updated_at=form.updated_at,
        response_count=response_count,
    )


@router.put("/{form_id}", response_model=FormResponseOut)
def update_form(
    form_id: uuid.UUID,
    payload: FormUpdate,
    db: Session = Depends(get_db),
):
    form = _get_form_or_404(form_id, db)

    if form.status == "archived":
        raise HTTPException(status_code=409, detail="Cannot update an archived form")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=422, detail="No fields to update")

    if "questions" in update_data and update_data["questions"] is not None:
        questions_raw = [q.model_dump() for q in payload.questions]
        validation_errors = _validate_questions(questions_raw)
        if validation_errors:
            raise HTTPException(status_code=422, detail="; ".join(validation_errors))
        update_data["questions"] = questions_raw

    for field, value in update_data.items():
        setattr(form, field, value)

    db.commit()
    db.refresh(form)
    return form


@router.delete("/{form_id}", status_code=204)
def delete_form(form_id: uuid.UUID, db: Session = Depends(get_db)):
    form = _get_form_or_404(form_id, db)

    # Check if any campaigns reference this form
    if form.campaigns:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete form with associated campaigns",
        )

    db.delete(form)
    db.commit()


# ---------------------------------------------------------------------------
# Form responses
# ---------------------------------------------------------------------------


@router.post("/{form_id}/responses", response_model=FormResponseSchema, status_code=201)
def submit_form_response(
    form_id: uuid.UUID,
    payload: FormSubmission,
    db: Session = Depends(get_db),
):
    form = _get_form_or_404(form_id, db)

    if form.status != "active":
        raise HTTPException(status_code=409, detail="Form is not active — cannot accept responses")

    contact = db.get(Contact, payload.contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    validation_errors = _validate_answers(form, payload.answers)
    if validation_errors:
        raise HTTPException(status_code=422, detail="; ".join(validation_errors))

    form_response = FormResponse(
        form_id=form.id,
        contact_id=payload.contact_id,
        answers=payload.answers,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(form_response)
    db.commit()
    db.refresh(form_response)
    return form_response


@router.get("/{form_id}/responses", response_model=FormResponseListResponse)
def list_form_responses(
    form_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _get_form_or_404(form_id, db)

    count_query = select(func.count()).select_from(FormResponse).where(FormResponse.form_id == form_id)
    total = db.execute(count_query).scalar_one()

    offset = (page - 1) * page_size
    responses = (
        db.execute(
            select(FormResponse)
            .where(FormResponse.form_id == form_id)
            .order_by(FormResponse.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    return FormResponseListResponse(
        items=responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{form_id}/responses/download")
def download_form_responses(
    form_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Export all form responses as CSV."""
    form = _get_form_or_404(form_id, db)

    responses = (
        db.execute(select(FormResponse).where(FormResponse.form_id == form_id).order_by(FormResponse.created_at.asc()))
        .scalars()
        .all()
    )

    questions = form.questions or []

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row: response_id, contact_id, Q1 text, Q2 text, ..., completed_at
    header = ["response_id", "contact_id"]
    for i, q in enumerate(questions):
        header.append(f"Q{i + 1}: {q.get('text', '')}")
    header.append("completed_at")
    writer.writerow(header)

    # Data rows
    for resp in responses:
        row = [str(resp.id), str(resp.contact_id)]
        for i in range(len(questions)):
            answer = resp.answers.get(str(i), "")
            row.append(str(answer) if answer is not None else "")
        row.append(resp.completed_at.isoformat() if resp.completed_at else "")
        writer.writerow(row)

    output.seek(0)

    filename = f"form_{form.title.replace(' ', '_')}_{form_id}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
