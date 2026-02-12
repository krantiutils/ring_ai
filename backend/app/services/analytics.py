"""Analytics service — SQL aggregation queries for org and campaign metrics."""

import logging
import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.analytics_event import AnalyticsEvent
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.schemas.analytics import (
    CampaignAnalytics,
    CampaignProgress,
    DailyBucket,
    HourlyBucket,
    OverviewAnalytics,
    PeriodCredits,
)
from app.services.campaigns import CAMPAIGN_TYPE_TO_INTERACTION_TYPE, COST_PER_INTERACTION

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Nepal carrier detection
# ---------------------------------------------------------------------------

# NTC (Nepal Telecom) mobile prefixes
NTC_PREFIXES = {"984", "985", "986", "974", "975", "976"}

# Ncell prefixes
NCELL_PREFIXES = {"980", "981", "982", "961", "962"}


def detect_carrier(phone: str) -> str:
    """Detect Nepal mobile carrier from phone number.

    Expects E.164 format (+977XXXXXXXXXX) or local format (9XXXXXXXXX).
    Returns "NTC", "Ncell", or "Other".
    """
    # Strip to digits only
    digits = "".join(c for c in phone if c.isdigit())

    # Handle +977 country code
    if digits.startswith("977") and len(digits) >= 13:
        digits = digits[3:]  # Strip country code

    # Now we expect 10-digit local number starting with 9
    if len(digits) >= 3:
        prefix = digits[:3]
        if prefix in NTC_PREFIXES:
            return "NTC"
        if prefix in NCELL_PREFIXES:
            return "Ncell"

    return "Other"


# ---------------------------------------------------------------------------
# GET /analytics/overview
# ---------------------------------------------------------------------------


def get_overview_analytics(
    db: Session,
    org_id: uuid.UUID,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> OverviewAnalytics:
    """Compute organization-level analytics."""

    # --- Campaign counts by status ---
    status_rows = db.execute(
        select(Campaign.status, func.count())
        .where(Campaign.org_id == org_id)
        .group_by(Campaign.status)
    ).all()
    campaigns_by_status = {row[0]: row[1] for row in status_rows}

    # --- Base interaction filter (org-scoped, date-filtered) ---
    interaction_filter = [
        Interaction.campaign_id == Campaign.id,
        Campaign.org_id == org_id,
    ]
    if start_date is not None:
        interaction_filter.append(Interaction.created_at >= start_date)
    if end_date is not None:
        interaction_filter.append(Interaction.created_at <= end_date)

    # --- Total contacts reached (distinct contacts with completed interactions) ---
    total_contacts_reached = db.execute(
        select(func.count(func.distinct(Interaction.contact_id)))
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(*interaction_filter, Interaction.status == "completed")
    ).scalar_one()

    # --- Total calls and SMS ---
    type_counts_rows = db.execute(
        select(Interaction.type, func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(*interaction_filter)
        .group_by(Interaction.type)
    ).all()
    type_counts = {row[0]: row[1] for row in type_counts_rows}
    total_calls = type_counts.get("outbound_call", 0) + type_counts.get("inbound_call", 0)
    total_sms = type_counts.get("sms", 0)

    # --- Average call duration ---
    avg_dur = db.execute(
        select(func.avg(Interaction.duration_seconds))
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            *interaction_filter,
            Interaction.type.in_(["outbound_call", "inbound_call"]),
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
        )
    ).scalar_one()
    avg_call_duration = float(avg_dur) if avg_dur is not None else None

    # --- Overall delivery rate ---
    total_interactions = db.execute(
        select(func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(*interaction_filter)
    ).scalar_one()

    completed_interactions = db.execute(
        select(func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(*interaction_filter, Interaction.status == "completed")
    ).scalar_one()

    delivery_rate = (
        completed_interactions / total_interactions
        if total_interactions > 0
        else None
    )

    # --- Credits consumed ---
    # Sum cost per completed interaction grouped by type
    credits_consumed = 0.0
    for itype, count in type_counts_rows:
        # Only count completed for credits
        completed_of_type = db.execute(
            select(func.count())
            .select_from(Interaction)
            .join(Campaign, Interaction.campaign_id == Campaign.id)
            .where(
                *interaction_filter,
                Interaction.type == itype,
                Interaction.status == "completed",
            )
        ).scalar_one()
        cost_per = COST_PER_INTERACTION.get(itype, 1.0)
        credits_consumed += completed_of_type * cost_per

    # --- Credits by period (daily) ---
    # Fetch completed interactions with timestamps and types, bucket in Python
    # (avoids dialect-specific date casting — works on both PostgreSQL and SQLite)
    completed_rows = db.execute(
        select(Interaction.created_at, Interaction.type)
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(*interaction_filter, Interaction.status == "completed")
    ).all()

    day_credits: dict[str, float] = defaultdict(float)
    for created_at, itype in completed_rows:
        if created_at is not None:
            day_str = str(created_at.date()) if isinstance(created_at, datetime) else str(created_at)[:10]
            cost_per = COST_PER_INTERACTION.get(itype, 1.0)
            day_credits[day_str] += cost_per

    credits_by_period = [
        PeriodCredits(period=day, credits=credits)
        for day, credits in sorted(day_credits.items())
    ]

    return OverviewAnalytics(
        campaigns_by_status=campaigns_by_status,
        total_contacts_reached=total_contacts_reached,
        total_calls=total_calls,
        total_sms=total_sms,
        avg_call_duration_seconds=avg_call_duration,
        overall_delivery_rate=delivery_rate,
        credits_consumed=credits_consumed,
        credits_by_period=credits_by_period,
        start_date=start_date,
        end_date=end_date,
    )


# ---------------------------------------------------------------------------
# GET /analytics/campaigns/{id}
# ---------------------------------------------------------------------------


def get_campaign_analytics(db: Session, campaign_id: uuid.UUID) -> CampaignAnalytics:
    """Compute detailed analytics for a single campaign."""

    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found")

    # --- Status breakdown ---
    status_rows = db.execute(
        select(Interaction.status, func.count())
        .where(Interaction.campaign_id == campaign_id)
        .group_by(Interaction.status)
    ).all()
    status_breakdown = {row[0]: row[1] for row in status_rows}

    total = sum(status_breakdown.values())
    completed = status_breakdown.get("completed", 0)

    # --- Completion rate ---
    completion_rate = completed / total if total > 0 else None

    # --- Average duration ---
    avg_dur = db.execute(
        select(func.avg(Interaction.duration_seconds)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
        )
    ).scalar_one()
    avg_duration = float(avg_dur) if avg_dur is not None else None

    # --- Credit consumption ---
    interaction_type = CAMPAIGN_TYPE_TO_INTERACTION_TYPE.get(campaign.type)
    cost_per = COST_PER_INTERACTION.get(interaction_type, 1.0)
    credit_consumption = completed * cost_per

    # --- Hourly and daily distributions ---
    # Fetch completed interaction timestamps and bucket in Python
    # (avoids dialect-specific EXTRACT/CAST — works on both PostgreSQL and SQLite)
    completed_timestamps = db.execute(
        select(Interaction.created_at)
        .where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.created_at.isnot(None),
        )
    ).scalars().all()

    hourly_counts: dict[int, int] = defaultdict(int)
    daily_counts: dict[str, int] = defaultdict(int)
    for ts in completed_timestamps:
        if isinstance(ts, datetime):
            hourly_counts[ts.hour] += 1
            daily_counts[str(ts.date())] += 1

    hourly_distribution = [
        HourlyBucket(hour=h, count=c)
        for h, c in sorted(hourly_counts.items())
    ]
    daily_distribution = [
        DailyBucket(date=d, count=c)
        for d, c in sorted(daily_counts.items())
    ]

    # --- Carrier breakdown ---
    # Fetch phone numbers of contacts in this campaign
    contact_phones = db.execute(
        select(Contact.phone)
        .join(Interaction, Interaction.contact_id == Contact.id)
        .where(Interaction.campaign_id == campaign_id)
        .distinct()
    ).scalars().all()

    carrier_counts: dict[str, int] = {}
    for phone in contact_phones:
        carrier = detect_carrier(phone)
        carrier_counts[carrier] = carrier_counts.get(carrier, 0) + 1

    return CampaignAnalytics(
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        campaign_type=campaign.type,
        campaign_status=campaign.status,
        status_breakdown=status_breakdown,
        completion_rate=completion_rate,
        avg_duration_seconds=avg_duration,
        credit_consumption=credit_consumption,
        hourly_distribution=hourly_distribution,
        daily_distribution=daily_distribution,
        carrier_breakdown=carrier_counts,
    )


# ---------------------------------------------------------------------------
# GET /analytics/events
# ---------------------------------------------------------------------------


def query_events(
    db: Session,
    event_type: str | None = None,
    campaign_id: uuid.UUID | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[AnalyticsEvent], int]:
    """Query analytics events with filters. Returns (items, total_count)."""

    query = select(AnalyticsEvent)
    count_query = select(func.count()).select_from(AnalyticsEvent)

    filters = []
    if event_type is not None:
        filters.append(AnalyticsEvent.event_type == event_type)
    if campaign_id is not None:
        filters.append(
            AnalyticsEvent.interaction_id.in_(
                select(Interaction.id).where(Interaction.campaign_id == campaign_id)
            )
        )
    if start_date is not None:
        filters.append(AnalyticsEvent.created_at >= start_date)
    if end_date is not None:
        filters.append(AnalyticsEvent.created_at <= end_date)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    total = db.execute(count_query).scalar_one()

    offset = (page - 1) * page_size
    items = (
        db.execute(
            query.order_by(AnalyticsEvent.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    return items, total


# ---------------------------------------------------------------------------
# GET /analytics/campaigns/{id}/live
# ---------------------------------------------------------------------------


def get_campaign_progress(db: Session, campaign_id: uuid.UUID) -> CampaignProgress:
    """Get current campaign progress snapshot."""

    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found")

    status_rows = db.execute(
        select(Interaction.status, func.count())
        .where(Interaction.campaign_id == campaign_id)
        .group_by(Interaction.status)
    ).all()
    status_counts = {row[0]: row[1] for row in status_rows}

    total = sum(status_counts.values())
    completed = status_counts.get("completed", 0)
    failed = status_counts.get("failed", 0)
    pending = status_counts.get("pending", 0)
    in_progress = status_counts.get("in_progress", 0)

    completion_pct = ((completed + failed) / total * 100) if total > 0 else 0.0

    return CampaignProgress(
        campaign_id=campaign.id,
        campaign_status=campaign.status,
        total=total,
        completed=completed,
        failed=failed,
        pending=pending,
        in_progress=in_progress,
        completion_percentage=round(completion_pct, 2),
    )
