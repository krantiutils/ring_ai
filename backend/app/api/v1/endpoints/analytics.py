"""Analytics endpoints — playback tracking and voice message listen duration."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.schemas.analytics import (
    CampaignPlaybackDetail,
    ContactPlayback,
    DashboardPlaybackWidget,
    PlaybackBucket,
    PlaybackDistribution,
)

router = APIRouter()


@router.get("/")
def get_analytics():
    return {"message": "Analytics/Metrics endpoints"}


@router.get(
    "/campaigns/{campaign_id}/playback",
    response_model=CampaignPlaybackDetail,
)
def get_campaign_playback(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Per-contact playback data for a campaign, plus aggregate stats."""
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Per-contact playback
    query = (
        select(Interaction, Contact)
        .join(Contact, Interaction.contact_id == Contact.id)
        .where(Interaction.campaign_id == campaign_id)
        .order_by(Interaction.created_at)
    )
    results = db.execute(query).all()

    contacts = []
    for interaction, contact in results:
        contacts.append(
            ContactPlayback(
                contact_id=contact.id,
                contact_phone=contact.phone,
                contact_name=contact.name,
                playback_duration_seconds=interaction.playback_duration_seconds,
                playback_percentage=interaction.playback_percentage,
                audio_duration_seconds=interaction.audio_duration_seconds,
                call_duration_seconds=interaction.duration_seconds,
                status=interaction.status,
            )
        )

    # Aggregates
    avg_pct = db.execute(
        select(func.avg(Interaction.playback_percentage)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.playback_percentage.isnot(None),
        )
    ).scalar_one()

    avg_dur = db.execute(
        select(func.avg(Interaction.playback_duration_seconds)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.playback_duration_seconds.isnot(None),
        )
    ).scalar_one()

    return CampaignPlaybackDetail(
        campaign_id=campaign_id,
        avg_playback_percentage=round(float(avg_pct), 1) if avg_pct is not None else None,
        avg_playback_duration_seconds=float(avg_dur) if avg_dur is not None else None,
        contacts=contacts,
    )


@router.get(
    "/campaigns/{campaign_id}/playback/distribution",
    response_model=PlaybackDistribution,
)
def get_campaign_playback_distribution(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Playback distribution across 4 buckets for a campaign.

    Buckets: 0-25%, 26-50%, 51-75%, 76-100%
    Only counts completed interactions with playback data.
    """
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    bucket_expr = case(
        (Interaction.playback_percentage <= 25, "0-25%"),
        (Interaction.playback_percentage <= 50, "26-50%"),
        (Interaction.playback_percentage <= 75, "51-75%"),
        else_="76-100%",
    )

    query = (
        select(bucket_expr.label("bucket"), func.count().label("count"))
        .where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.playback_percentage.isnot(None),
        )
        .group_by(bucket_expr)
    )
    rows = db.execute(query).all()

    # Ensure all 4 buckets are present (even with 0 count)
    bucket_counts = {r.bucket: r.count for r in rows}
    all_buckets = ["0-25%", "26-50%", "51-75%", "76-100%"]
    buckets = [
        PlaybackBucket(bucket=b, count=bucket_counts.get(b, 0))
        for b in all_buckets
    ]

    return PlaybackDistribution(campaign_id=campaign_id, buckets=buckets)


@router.get("/dashboard/playback", response_model=DashboardPlaybackWidget)
def get_dashboard_playback(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Dashboard widget: org-wide average playback % and distribution.

    Joins through campaigns to filter by org_id.
    """
    # Org-wide average playback percentage
    avg_pct = db.execute(
        select(func.avg(Interaction.playback_percentage))
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.status == "completed",
            Interaction.playback_percentage.isnot(None),
        )
    ).scalar_one()

    # Total completed calls with playback data
    total_completed = db.execute(
        select(func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.status == "completed",
            Interaction.playback_percentage.isnot(None),
        )
    ).scalar_one()

    # Distribution buckets across all org campaigns
    bucket_expr = case(
        (Interaction.playback_percentage <= 25, "0-25%"),
        (Interaction.playback_percentage <= 50, "26-50%"),
        (Interaction.playback_percentage <= 75, "51-75%"),
        else_="76-100%",
    )

    rows = db.execute(
        select(bucket_expr.label("bucket"), func.count().label("count"))
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.status == "completed",
            Interaction.playback_percentage.isnot(None),
        )
        .group_by(bucket_expr)
    ).all()

    bucket_counts = {r.bucket: r.count for r in rows}
    all_buckets = ["0-25%", "26-50%", "51-75%", "76-100%"]
    distribution = [
        PlaybackBucket(bucket=b, count=bucket_counts.get(b, 0))
        for b in all_buckets
    ]

    return DashboardPlaybackWidget(
        avg_playback_percentage=round(float(avg_pct), 1) if avg_pct is not None else None,
        total_completed_calls=total_completed,
        distribution=distribution,
    )
