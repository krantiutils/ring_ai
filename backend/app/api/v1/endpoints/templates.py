import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Template
from app.schemas.templates import (
    RenderRequest,
    RenderResponse,
    TemplateCreate,
    TemplateListResponse,
    TemplateResponse,
    TemplateUpdate,
    ValidateResponse,
)
from app.services.templates import (
    UndefinedVariableError,
    extract_variables,
    get_conditional_variables,
    get_required_variables,
    get_variables_with_defaults,
    render,
    validate_template,
)

router = APIRouter()


@router.post("/", response_model=TemplateResponse, status_code=201)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)):
    is_valid, errors = validate_template(payload.content)
    if not is_valid:
        raise HTTPException(status_code=422, detail={"errors": errors})

    variables = extract_variables(payload.content)

    template = Template(
        name=payload.name,
        content=payload.content,
        type=payload.type,
        org_id=payload.org_id,
        language=payload.language,
        variables=variables,
        voice_config=payload.voice_config,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/", response_model=TemplateListResponse)
def list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    type: str | None = Query(None, alias="type"),
    db: Session = Depends(get_db),
):
    query = select(Template)
    count_query = select(func.count()).select_from(Template)

    if type is not None:
        query = query.where(Template.type == type)
        count_query = count_query.where(Template.type == type)

    total = db.execute(count_query).scalar_one()
    offset = (page - 1) * page_size
    templates = db.execute(query.order_by(Template.created_at.desc()).offset(offset).limit(page_size)).scalars().all()

    return TemplateListResponse(
        items=templates,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: uuid.UUID, db: Session = Depends(get_db)):
    template = db.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(
    template_id: uuid.UUID,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
):
    template = db.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "content" in update_data:
        is_valid, errors = validate_template(update_data["content"])
        if not is_valid:
            raise HTTPException(status_code=422, detail={"errors": errors})
        update_data["variables"] = extract_variables(update_data["content"])

    for field, value in update_data.items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: uuid.UUID, db: Session = Depends(get_db)):
    template = db.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()


@router.post("/{template_id}/render", response_model=RenderResponse)
def render_template(
    template_id: uuid.UUID,
    payload: RenderRequest,
    db: Session = Depends(get_db),
):
    template = db.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    try:
        rendered_text = render(template.content, payload.variables)
    except UndefinedVariableError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required variable: {exc.variable_name}",
        )

    return RenderResponse(
        rendered_text=rendered_text,
        type=template.type,
    )


@router.post("/{template_id}/validate", response_model=ValidateResponse)
def validate_template_endpoint(template_id: uuid.UUID, db: Session = Depends(get_db)):
    template = db.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    is_valid, errors = validate_template(template.content)
    required = get_required_variables(template.content)
    with_defaults = get_variables_with_defaults(template.content)
    conditionals = get_conditional_variables(template.content)

    return ValidateResponse(
        is_valid=is_valid,
        required_variables=required,
        variables_with_defaults=with_defaults,
        conditional_variables=conditionals,
        errors=errors,
    )
