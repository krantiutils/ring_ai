"""Analytics API — org overview, campaign analytics, event log, live progress, and category/carrier widgets."""

import asyncio
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.schemas.analytics import (
    AnalyticsEventResponse,
    CampaignAnalytics,
    CampaignProgress,
    EventListResponse,
    OverviewAnalytics,
)
from app.services.analytics import (
    get_campaign_analytics,
    get_campaign_progress,
    get_overview_analytics,
    query_events,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /analytics/overview
# ---------------------------------------------------------------------------


@router.get("/overview", response_model=OverviewAnalytics)
def analytics_overview(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    start_date: datetime | None = Query(None, description="Filter start (inclusive)"),
    end_date: datetime | None = Query(None, description="Filter end (inclusive)"),
    db: Session = Depends(get_db),
):
    """Organization-level analytics: campaign counts, reach, delivery rate, credits."""
    return get_overview_analytics(db, org_id, start_date, end_date)


# ---------------------------------------------------------------------------
# GET /analytics/campaigns/by-category  (must precede parameterized route)
# ---------------------------------------------------------------------------


@router.get("/campaigns/by-category")
def campaigns_by_category(db: Session = Depends(get_db)):
    """Dashboard widget: group campaigns by category with counts.

    Returns a list of {category, count} objects. Campaigns with no category
    are grouped under "uncategorized".
    """
    rows = db.execute(
        select(
            Campaign.category,
            func.count(Campaign.id).label("count"),
        ).group_by(Campaign.category)
    ).all()

    result = []
    for category, count in rows:
        result.append({
            "category": category if category is not None else "uncategorized",
            "count": count,
        })
    return result


# ---------------------------------------------------------------------------
# GET /analytics/campaigns/{campaign_id}
# ---------------------------------------------------------------------------


@router.get("/campaigns/{campaign_id}", response_model=CampaignAnalytics)
def analytics_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Detailed analytics for a single campaign."""
    try:
        return get_campaign_analytics(db, campaign_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Campaign not found")


# ---------------------------------------------------------------------------
# GET /analytics/events
# ---------------------------------------------------------------------------


@router.get("/events", response_model=EventListResponse)
def analytics_events(
    event_type: str | None = Query(None),
    campaign_id: uuid.UUID | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Query analytics events with filters, paginated."""
    items, total = query_events(
        db,
        event_type=event_type,
        campaign_id=campaign_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return EventListResponse(
        items=[AnalyticsEventResponse.model_validate(e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# GET /analytics/carrier-breakdown
# ---------------------------------------------------------------------------


@router.get("/carrier-breakdown")
def carrier_breakdown(
    campaign_id: uuid.UUID | None = Query(None, description="Optional campaign ID to filter by"),
    db: Session = Depends(get_db),
):
    """Carrier breakdown analytics table.

    Returns per-carrier stats: carrier name, total contacts, successful calls,
    failed calls, and pickup percentage.

    Optionally scoped to a specific campaign via campaign_id query param.
    """
    # Build base query joining contacts to interactions
    base = (
        select(
            Contact.carrier,
            func.count(func.distinct(Contact.id)).label("total"),
            func.count(func.distinct(Contact.id)).filter(Interaction.status == "completed").label("success"),
            func.count(func.distinct(Contact.id)).filter(Interaction.status == "failed").label("fail"),
        ).join(Interaction, Interaction.contact_id == Contact.id)
    )

    if campaign_id is not None:
        base = base.where(Interaction.campaign_id == campaign_id)

    base = base.group_by(Contact.carrier)

    rows = db.execute(base).all()

    result = []
    for carrier, total, success, fail in rows:
        pickup_pct = round((success / total) * 100, 1) if total > 0 else 0.0
        result.append({
            "carrier": carrier if carrier is not None else "Unknown",
            "total": total,
            "success": success,
            "fail": fail,
            "pickup_pct": pickup_pct,
        })
    return result


# ---------------------------------------------------------------------------
# GET /analytics/campaigns/{campaign_id}/live  (SSE)
# ---------------------------------------------------------------------------

SSE_POLL_INTERVAL_SECONDS = 2
SSE_MAX_DURATION_SECONDS = 300  # 5 minutes max


@router.get("/campaigns/{campaign_id}/live")
async def analytics_campaign_live(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Server-Sent Events stream for real-time campaign progress.

    Emits a JSON progress snapshot every 2 seconds.
    Terminates when the campaign reaches a terminal state (completed) or after 5 minutes.
    """
    # Validate campaign exists before starting the stream
    try:
        get_campaign_progress(db, campaign_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Campaign not found")

    async def event_generator():
        elapsed = 0
        while elapsed < SSE_MAX_DURATION_SECONDS:
            try:
                progress = get_campaign_progress(db, campaign_id)
                payload = progress.model_dump_json()
                yield f"data: {payload}\n\n"

                # Stop streaming if campaign is in a terminal state and fully processed
                if progress.campaign_status == "completed":
                    yield f"event: done\ndata: {payload}\n\n"
                    return
            except Exception:
                logger.exception("Error in SSE stream for campaign %s", campaign_id)
                yield f"event: error\ndata: {{\"error\": \"internal_error\"}}\n\n"
                return

            await asyncio.sleep(SSE_POLL_INTERVAL_SECONDS)
            elapsed += SSE_POLL_INTERVAL_SECONDS

        # Timeout — send final snapshot
        try:
            progress = get_campaign_progress(db, campaign_id)
            yield f"event: timeout\ndata: {progress.model_dump_json()}\n\n"
        except Exception:
            yield f"event: timeout\ndata: {{\"error\": \"timeout\"}}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
