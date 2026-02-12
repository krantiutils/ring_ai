"""Campaign management API — CRUD, lifecycle, contacts, and stats."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.schemas.campaigns import (
    CampaignCreate,
    CampaignListResponse,
    CampaignResponse,
    CampaignStartRequest,
    CampaignUpdate,
    CampaignWithStats,
    ContactListResponse,
    ContactUploadResponse,
)
from app.services.campaigns import (
    CampaignError,
    InvalidStateTransition,
    calculate_stats,
    cancel_schedule,
    execute_campaign_batch,
    generate_report_csv,
    pause_campaign,
    resume_campaign,
    schedule_campaign,
    start_campaign,
    upload_contacts_to_campaign,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_campaign_or_404(campaign_id: uuid.UUID, db: Session) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


# ---------------------------------------------------------------------------
# Campaign CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=CampaignResponse, status_code=201)
def create_campaign(payload: CampaignCreate, db: Session = Depends(get_db)):
    campaign = Campaign(
        name=payload.name,
        type=payload.type,
        org_id=payload.org_id,
        category=payload.category,
        template_id=payload.template_id,
        voice_model_id=payload.voice_model_id,
        schedule_config=payload.schedule_config,
        status="draft",
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.get("/", response_model=CampaignListResponse)
def list_campaigns(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    type: str | None = Query(None),
    category: str | None = Query(None),
    db: Session = Depends(get_db),
):
    query = select(Campaign)
    count_query = select(func.count()).select_from(Campaign)

    if status is not None:
        query = query.where(Campaign.status == status)
        count_query = count_query.where(Campaign.status == status)
    if type is not None:
        query = query.where(Campaign.type == type)
        count_query = count_query.where(Campaign.type == type)
    if category is not None:
        query = query.where(Campaign.category == category)
        count_query = count_query.where(Campaign.category == category)

    total = db.execute(count_query).scalar_one()
    offset = (page - 1) * page_size
    campaigns = (
        db.execute(
            query.order_by(Campaign.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    return CampaignListResponse(
        items=campaigns,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{campaign_id}", response_model=CampaignWithStats)
def get_campaign(campaign_id: uuid.UUID, db: Session = Depends(get_db)):
    campaign = _get_campaign_or_404(campaign_id, db)
    stats = calculate_stats(db, campaign.id)
    return CampaignWithStats(
        id=campaign.id,
        org_id=campaign.org_id,
        name=campaign.name,
        type=campaign.type,
        status=campaign.status,
        category=campaign.category,
        template_id=campaign.template_id,
        voice_model_id=campaign.voice_model_id,
        schedule_config=campaign.schedule_config,
        scheduled_at=campaign.scheduled_at,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        stats=stats,
    )


@router.get("/{campaign_id}/report/download")
def download_campaign_report(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)
    filename = f"campaign_{campaign.name}_{campaign_id}.csv"
    # Sanitize filename: replace anything that's not alphanumeric, dash, underscore, or dot
    safe_filename = "".join(
        c if c.isalnum() or c in "-_." else "_" for c in filename
    )

    return StreamingResponse(
        generate_report_csv(db, campaign_id),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
        },
    )


@router.put("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: uuid.UUID,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)

    if campaign.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Can only update campaigns in draft status",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(campaign, field, value)

    db.commit()
    db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: uuid.UUID, db: Session = Depends(get_db)):
    campaign = _get_campaign_or_404(campaign_id, db)

    if campaign.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Can only delete campaigns in draft status",
        )

    # Delete associated interactions first
    db.execute(
        Interaction.__table__.delete().where(
            Interaction.campaign_id == campaign.id
        )
    )
    db.delete(campaign)
    db.commit()


# ---------------------------------------------------------------------------
# Campaign lifecycle
# ---------------------------------------------------------------------------


@router.post("/{campaign_id}/start", response_model=CampaignResponse)
def start_campaign_endpoint(
    campaign_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    body: CampaignStartRequest | None = None,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)
    schedule_dt = body.schedule if body else None

    try:
        if schedule_dt is not None:
            campaign = schedule_campaign(db, campaign, schedule_dt)
        else:
            campaign = start_campaign(db, campaign)
            # Kick off background executor only for immediate start
            background_tasks.add_task(
                execute_campaign_batch, campaign.id, SessionLocal
            )
    except InvalidStateTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except CampaignError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return campaign


@router.post("/{campaign_id}/cancel-schedule", response_model=CampaignResponse)
def cancel_schedule_endpoint(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)
    try:
        campaign = cancel_schedule(db, campaign)
    except InvalidStateTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return campaign


@router.post("/{campaign_id}/pause", response_model=CampaignResponse)
def pause_campaign_endpoint(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)
    try:
        campaign = pause_campaign(db, campaign)
    except InvalidStateTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return campaign


@router.post("/{campaign_id}/resume", response_model=CampaignResponse)
def resume_campaign_endpoint(
    campaign_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)
    try:
        campaign = resume_campaign(db, campaign)
    except InvalidStateTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Kick off background executor for remaining interactions
    background_tasks.add_task(execute_campaign_batch, campaign.id, SessionLocal)
    return campaign


# ---------------------------------------------------------------------------
# Contact management
# ---------------------------------------------------------------------------


@router.post(
    "/{campaign_id}/contacts",
    response_model=ContactUploadResponse,
    status_code=201,
)
async def upload_contacts(
    campaign_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)

    if campaign.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Can only upload contacts to campaigns in draft status",
        )

    if file.content_type and file.content_type not in (
        "text/csv",
        "application/vnd.ms-excel",
        "application/octet-stream",
    ):
        raise HTTPException(status_code=422, detail="File must be a CSV")

    csv_bytes = await file.read()
    if not csv_bytes:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")

    try:
        created, skipped, errors = upload_contacts_to_campaign(
            db, campaign, csv_bytes
        )
    except InvalidStateTransition:
        raise HTTPException(
            status_code=409,
            detail="Can only upload contacts to campaigns in draft status",
        )

    return ContactUploadResponse(created=created, skipped=skipped, errors=errors)


@router.get("/{campaign_id}/contacts", response_model=ContactListResponse)
def list_campaign_contacts(
    campaign_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _get_campaign_or_404(campaign_id, db)

    # Contacts in this campaign = contacts that have interactions in this campaign
    query = (
        select(Contact)
        .join(Interaction, Interaction.contact_id == Contact.id)
        .where(Interaction.campaign_id == campaign_id)
        .distinct()
    )
    count_query = (
        select(func.count(func.distinct(Contact.id)))
        .select_from(Contact)
        .join(Interaction, Interaction.contact_id == Contact.id)
        .where(Interaction.campaign_id == campaign_id)
    )

    total = db.execute(count_query).scalar_one()
    offset = (page - 1) * page_size
    contacts = (
        db.execute(query.offset(offset).limit(page_size))
        .scalars()
        .all()
    )

    return ContactListResponse(
        items=contacts,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.delete("/{campaign_id}/contacts/{contact_id}", status_code=204)
def remove_contact_from_campaign(
    campaign_id: uuid.UUID,
    contact_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    campaign = _get_campaign_or_404(campaign_id, db)

    if campaign.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Can only remove contacts from campaigns in draft status",
        )

    # Find the interaction linking this contact to this campaign
    interaction = db.execute(
        select(Interaction).where(
            Interaction.campaign_id == campaign_id,
            Interaction.contact_id == contact_id,
        )
    ).scalar_one_or_none()

    if interaction is None:
        raise HTTPException(
            status_code=404, detail="Contact not found in this campaign"
        )

    db.delete(interaction)
    db.commit()
