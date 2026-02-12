"""Analytics API — dashboard widgets, carrier breakdown, campaign category summary."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction

router = APIRouter()


@router.get("/")
def get_analytics():
    return {"message": "Analytics/Metrics endpoints"}


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
            func.count(func.distinct(Contact.id)).filter(
                Interaction.status == "completed"
            ).label("success"),
            func.count(func.distinct(Contact.id)).filter(
                Interaction.status == "failed"
            ).label("fail"),
        )
        .join(Interaction, Interaction.contact_id == Contact.id)
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
