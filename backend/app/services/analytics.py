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
    DashboardSummary,
    HourlyBucket,
    OverviewAnalytics,
    PeriodCredits,
    PlaybackBucket,
    TopCampaign,
    WeeklyCreditUsage,
)
from app.services.campaigns import CAMPAIGN_TYPE_TO_INTERACTION_TYPE, COST_PER_INTERACTION

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Nepal carrier detection
# ---------------------------------------------------------------------------

NTC_PREFIXES = {"984", "985", "986", "974", "975", "976"}
NCELL_PREFIXES = {"980", "981", "982", "961", "962"}


def detect_carrier(phone: str) -> str:
    """Detect Nepal mobile carrier from phone number."""
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("977") and len(digits) >= 13:
        digits = digits[3:]
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

    status_rows = db.execute(
        select(Campaign.status, func.count())
        .where(Campaign.org_id == org_id)
        .group_by(Campaign.status)
    ).all()
    campaigns_by_status = {row[0]: row[1] for row in status_rows}

    interaction_filter = [
        Interaction.campaign_id == Campaign.id,
        Campaign.org_id == org_id,
    ]
    if start_date is not None:
        interaction_filter.append(Interaction.created_at >= start_date)
    if end_date is not None:
        interaction_filter.append(Interaction.created_at <= end_date)

    total_contacts_reached = db.execute(
        select(func.count(func.distinct(Interaction.contact_id)))
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(*interaction_filter, Interaction.status == "completed")
    ).scalar_one()

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

    credits_consumed = 0.0
    for itype, _count in type_counts_rows:
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

    status_rows = db.execute(
        select(Interaction.status, func.count())
        .where(Interaction.campaign_id == campaign_id)
        .group_by(Interaction.status)
    ).all()
    status_breakdown = {row[0]: row[1] for row in status_rows}

    total = sum(status_breakdown.values())
    completed = status_breakdown.get("completed", 0)

    completion_rate = completed / total if total > 0 else None

    avg_dur = db.execute(
        select(func.avg(Interaction.duration_seconds)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
        )
    ).scalar_one()
    avg_duration = float(avg_dur) if avg_dur is not None else None

    interaction_type = CAMPAIGN_TYPE_TO_INTERACTION_TYPE.get(campaign.type)
    cost_per = COST_PER_INTERACTION.get(interaction_type, 1.0)
    credit_consumption = completed * cost_per

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


# ---------------------------------------------------------------------------
# GET /analytics/dashboard
# ---------------------------------------------------------------------------


def get_dashboard_summary(db: Session, org_id: uuid.UUID) -> DashboardSummary:
    """Compute the full dashboard summary for the home page."""

    # --- Campaigns by type ---
    type_rows = db.execute(
        select(Campaign.type, func.count())
        .where(Campaign.org_id == org_id)
        .group_by(Campaign.type)
    ).all()
    campaigns_by_type = {row[0]: row[1] for row in type_rows}

    total_campaigns = sum(campaigns_by_type.values())

    # --- Campaigns by status ---
    status_rows = db.execute(
        select(Campaign.status, func.count())
        .where(Campaign.org_id == org_id)
        .group_by(Campaign.status)
    ).all()
    campaigns_breakdown = {row[0]: row[1] for row in status_rows}

    # --- All org interactions ---
    org_interactions = (
        select(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(Campaign.org_id == org_id)
    )

    # Call outcomes (status breakdown for call-type interactions)
    outcome_rows = db.execute(
        select(Interaction.status, func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.type.in_(["outbound_call", "inbound_call"]),
        )
        .group_by(Interaction.status)
    ).all()
    call_outcomes = {row[0]: row[1] for row in outcome_rows}

    # Total outbound calls
    total_outbound_calls = db.execute(
        select(func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(Campaign.org_id == org_id, Interaction.type == "outbound_call")
    ).scalar_one()

    successful_calls = db.execute(
        select(func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.type == "outbound_call",
            Interaction.status == "completed",
        )
    ).scalar_one()

    failed_calls = db.execute(
        select(func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.type == "outbound_call",
            Interaction.status == "failed",
        )
    ).scalar_one()

    # Total outbound SMS
    total_outbound_sms = db.execute(
        select(func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(Campaign.org_id == org_id, Interaction.type == "sms")
    ).scalar_one()

    # Total call duration
    total_duration = db.execute(
        select(func.coalesce(func.sum(Interaction.duration_seconds), 0))
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.type.in_(["outbound_call", "inbound_call"]),
            Interaction.duration_seconds.isnot(None),
        )
    ).scalar_one()

    # --- Credits (computed from completed interactions) ---
    completed_by_type = db.execute(
        select(Interaction.type, func.count())
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(Campaign.org_id == org_id, Interaction.status == "completed")
        .group_by(Interaction.type)
    ).all()

    total_credits_used = 0.0
    avg_credit_spent: dict[str, float] = {}
    for itype, count in completed_by_type:
        cost_per = COST_PER_INTERACTION.get(itype, 1.0)
        total_credits_used += count * cost_per
        avg_credit_spent[itype] = cost_per

    # --- Top performing campaign ---
    top_campaign = None
    campaign_ids = db.execute(
        select(Campaign.id, Campaign.name)
        .where(Campaign.org_id == org_id, Campaign.status != "draft")
    ).all()

    best_rate = -1.0
    for cid, cname in campaign_ids:
        ctotal = db.execute(
            select(func.count()).where(Interaction.campaign_id == cid)
        ).scalar_one()
        if ctotal == 0:
            continue
        ccompleted = db.execute(
            select(func.count()).where(
                Interaction.campaign_id == cid, Interaction.status == "completed"
            )
        ).scalar_one()
        rate = ccompleted / ctotal
        if rate > best_rate:
            best_rate = rate
            top_campaign = TopCampaign(name=cname, success_rate=round(rate, 4))

    # --- Playback distribution (from interaction metadata) ---
    playback_distribution = [
        PlaybackBucket(range="0-25%", count=0),
        PlaybackBucket(range="26-50%", count=0),
        PlaybackBucket(range="51-75%", count=0),
        PlaybackBucket(range="76-100%", count=0),
    ]

    interactions_with_meta = db.execute(
        select(Interaction.metadata_)
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(
            Campaign.org_id == org_id,
            Interaction.type.in_(["outbound_call", "inbound_call"]),
            Interaction.metadata_.isnot(None),
        )
    ).scalars().all()

    total_playback = 0.0
    playback_count = 0
    for meta in interactions_with_meta:
        if isinstance(meta, dict) and "playback_percent" in meta:
            pct = float(meta["playback_percent"])
            total_playback += pct
            playback_count += 1
            if pct <= 25:
                playback_distribution[0].count += 1
            elif pct <= 50:
                playback_distribution[1].count += 1
            elif pct <= 75:
                playback_distribution[2].count += 1
            else:
                playback_distribution[3].count += 1

    avg_playback = total_playback / playback_count if playback_count > 0 else 0.0

    # --- Credit usage over time (weekly) ---
    completed_with_ts = db.execute(
        select(Interaction.created_at, Interaction.type)
        .select_from(Interaction)
        .join(Campaign, Interaction.campaign_id == Campaign.id)
        .where(Campaign.org_id == org_id, Interaction.status == "completed")
        .order_by(Interaction.created_at)
    ).all()

    weekly_buckets: dict[str, dict[str, float]] = defaultdict(lambda: {"message": 0.0, "call": 0.0})
    for ts, itype in completed_with_ts:
        if ts is not None and isinstance(ts, datetime):
            # ISO week
            week_str = ts.strftime("%Y-W%W")
            cost = COST_PER_INTERACTION.get(itype, 1.0)
            if itype in ("outbound_call", "inbound_call"):
                weekly_buckets[week_str]["call"] += cost
            else:
                weekly_buckets[week_str]["message"] += cost

    credit_usage_over_time = [
        WeeklyCreditUsage(week=w, message=d["message"], call=d["call"])
        for w, d in sorted(weekly_buckets.items())
    ]

    return DashboardSummary(
        campaigns_by_type=campaigns_by_type,
        call_outcomes=call_outcomes,
        credits_purchased=0.0,  # No credit purchase tracking yet
        credits_topup=0.0,
        top_performing_campaign=top_campaign,
        total_credits_used=total_credits_used,
        remaining_credits=0.0,
        total_campaigns=total_campaigns,
        campaigns_breakdown=campaigns_breakdown,
        total_outbound_calls=total_outbound_calls,
        successful_calls=successful_calls,
        failed_calls=failed_calls,
        total_outbound_sms=total_outbound_sms,
        total_call_duration_seconds=float(total_duration),
        total_owned_numbers=0,  # Twilio number tracking not implemented
        avg_playback_percent=round(avg_playback, 2),
        avg_credit_spent=avg_credit_spent,
        playback_distribution=playback_distribution,
        credit_usage_over_time=credit_usage_over_time,
    )
