"""Campaign scheduler — polls for due scheduled campaigns and activates them."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.campaign import Campaign
from app.services.campaigns import execute_campaign_batch

logger = logging.getLogger(__name__)


def activate_due_campaigns(db: Session) -> int:
    """Find campaigns with status='scheduled' and scheduled_at <= now, activate them.

    Returns the number of campaigns activated.
    """
    now = datetime.now(timezone.utc)

    due_campaigns = (
        db.execute(
            select(Campaign).where(
                Campaign.status == "scheduled",
                Campaign.scheduled_at <= now,
            )
        )
        .scalars()
        .all()
    )

    activated = 0
    for campaign in due_campaigns:
        campaign.status = "active"
        campaign.scheduled_at = None
        db.commit()
        db.refresh(campaign)
        activated += 1
        logger.info("Scheduler activated campaign %s (%s)", campaign.id, campaign.name)

        # Trigger batch executor in a separate session
        execute_campaign_batch(campaign.id, SessionLocal)

    return activated


async def scheduler_loop() -> None:
    """Background loop that polls for due campaigns every SCHEDULER_POLL_INTERVAL_SECONDS."""
    interval = settings.SCHEDULER_POLL_INTERVAL_SECONDS
    logger.info("Campaign scheduler started (poll interval: %ds)", interval)

    while True:
        try:
            db = SessionLocal()
            try:
                count = activate_due_campaigns(db)
                if count > 0:
                    logger.info("Scheduler activated %d campaign(s)", count)
            finally:
                db.close()
        except Exception:
            logger.exception("Error in scheduler loop")

        await asyncio.sleep(interval)
