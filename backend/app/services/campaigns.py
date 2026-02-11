"""Campaign service — business logic for campaign lifecycle, contacts, and execution."""

import csv
import io
import logging
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.schemas.campaigns import CampaignStats

logger = logging.getLogger(__name__)

# Mapping from campaign type to interaction type
CAMPAIGN_TYPE_TO_INTERACTION_TYPE = {
    "voice": "outbound_call",
    "text": "sms",
    "form": "form_response",
}


class CampaignError(Exception):
    """Base exception for campaign operations."""


class InvalidStateTransition(CampaignError):
    """Raised when a campaign state transition is not allowed."""

    def __init__(self, current_status: str, target_status: str) -> None:
        self.current_status = current_status
        self.target_status = target_status
        super().__init__(
            f"Cannot transition from '{current_status}' to '{target_status}'"
        )


class CampaignNotFound(CampaignError):
    """Raised when a campaign is not found."""


class ContactNotInCampaign(CampaignError):
    """Raised when a contact is not associated with a campaign."""


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

VALID_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"active"},
    "active": {"paused", "completed"},
    "paused": {"active"},
    "completed": set(),
}


def _assert_transition(current: str, target: str) -> None:
    allowed = VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidStateTransition(current, target)


# ---------------------------------------------------------------------------
# Contact CSV parsing
# ---------------------------------------------------------------------------

REQUIRED_CSV_COLUMNS = {"phone"}
KNOWN_CSV_COLUMNS = {"phone", "name"}


def parse_contacts_csv(
    csv_bytes: bytes, org_id: uuid.UUID
) -> tuple[list[dict], list[str]]:
    """Parse a CSV file into contact dicts.

    Expected columns: phone (required), name (optional), anything else → metadata.

    Returns (parsed_rows, errors) where each row is a dict with keys:
        phone, name, metadata_, org_id
    """
    errors: list[str] = []
    rows: list[dict] = []

    try:
        text = csv_bytes.decode("utf-8-sig")  # Handle BOM
    except UnicodeDecodeError:
        return [], ["CSV file is not valid UTF-8"]

    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        return [], ["CSV file has no header row"]

    fieldnames = {f.strip().lower() for f in reader.fieldnames}

    missing = REQUIRED_CSV_COLUMNS - fieldnames
    if missing:
        return [], [f"Missing required columns: {', '.join(sorted(missing))}"]

    # Metadata columns = anything that's not phone or name
    normalized_fieldnames = [f.strip().lower() for f in reader.fieldnames]
    metadata_columns = [c for c in normalized_fieldnames if c not in KNOWN_CSV_COLUMNS]

    for line_num, row in enumerate(reader, start=2):
        # Normalize keys
        normalized_row = {k.strip().lower(): v.strip() if v else "" for k, v in row.items()}

        phone = normalized_row.get("phone", "").strip()
        if not phone:
            errors.append(f"Row {line_num}: missing phone number")
            continue

        name = normalized_row.get("name", "").strip() or None

        metadata = {}
        for col in metadata_columns:
            val = normalized_row.get(col, "").strip()
            if val:
                metadata[col] = val

        rows.append({
            "phone": phone,
            "name": name,
            "metadata_": metadata if metadata else None,
            "org_id": org_id,
        })

    return rows, errors


def upload_contacts_to_campaign(
    db: Session,
    campaign: Campaign,
    csv_bytes: bytes,
) -> tuple[int, int, list[str]]:
    """Parse CSV and create Contact + Interaction records for a campaign.

    Returns (created_count, skipped_count, errors).
    """
    if campaign.status != "draft":
        raise InvalidStateTransition(campaign.status, "draft")

    parsed, parse_errors = parse_contacts_csv(csv_bytes, campaign.org_id)
    if parse_errors and not parsed:
        return 0, 0, parse_errors

    interaction_type = CAMPAIGN_TYPE_TO_INTERACTION_TYPE[campaign.type]
    created = 0
    skipped = 0

    # Batch: collect existing contacts in this org to avoid duplicates
    existing_phones = set(
        db.execute(
            select(Contact.phone).where(Contact.org_id == campaign.org_id)
        ).scalars().all()
    )

    # Also get contacts already in this campaign to skip duplicates
    existing_campaign_contacts = set(
        db.execute(
            select(Contact.phone)
            .join(Interaction, Interaction.contact_id == Contact.id)
            .where(Interaction.campaign_id == campaign.id)
        ).scalars().all()
    )

    for row in parsed:
        phone = row["phone"]

        if phone in existing_campaign_contacts:
            skipped += 1
            continue

        # Find or create the contact
        if phone in existing_phones:
            contact = db.execute(
                select(Contact).where(
                    Contact.org_id == campaign.org_id,
                    Contact.phone == phone,
                )
            ).scalar_one()
        else:
            contact = Contact(
                phone=phone,
                name=row["name"],
                metadata_=row["metadata_"],
                org_id=campaign.org_id,
            )
            db.add(contact)
            db.flush()
            existing_phones.add(phone)

        # Create pending interaction
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type=interaction_type,
            status="pending",
        )
        db.add(interaction)
        existing_campaign_contacts.add(phone)
        created += 1

    db.commit()
    return created, skipped, parse_errors


# ---------------------------------------------------------------------------
# Campaign lifecycle
# ---------------------------------------------------------------------------


def start_campaign(db: Session, campaign: Campaign) -> Campaign:
    """Transition campaign from draft → active.

    Validates that the campaign has at least one contact (pending interaction).
    """
    _assert_transition(campaign.status, "active")

    # Verify there are contacts
    contact_count = db.execute(
        select(func.count())
        .select_from(Interaction)
        .where(Interaction.campaign_id == campaign.id)
    ).scalar_one()

    if contact_count == 0:
        raise CampaignError("Cannot start campaign with no contacts")

    campaign.status = "active"
    db.commit()
    db.refresh(campaign)
    return campaign


def pause_campaign(db: Session, campaign: Campaign) -> Campaign:
    """Transition campaign from active → paused."""
    _assert_transition(campaign.status, "paused")
    campaign.status = "paused"
    db.commit()
    db.refresh(campaign)
    return campaign


def resume_campaign(db: Session, campaign: Campaign) -> Campaign:
    """Transition campaign from paused → active."""
    if campaign.status != "paused":
        raise InvalidStateTransition(campaign.status, "active")
    campaign.status = "active"
    db.commit()
    db.refresh(campaign)
    return campaign


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

# Rough cost estimates per interaction type (NPR)
COST_PER_INTERACTION = {
    "outbound_call": 2.0,
    "sms": 0.5,
    "form_response": 1.0,
}


def calculate_stats(db: Session, campaign_id: uuid.UUID) -> CampaignStats:
    """Calculate campaign statistics from interaction records."""
    base = select(func.count()).select_from(Interaction).where(
        Interaction.campaign_id == campaign_id
    )

    total = db.execute(base).scalar_one()
    if total == 0:
        return CampaignStats()

    completed = db.execute(
        base.where(Interaction.status == "completed")
    ).scalar_one()
    failed = db.execute(
        base.where(Interaction.status == "failed")
    ).scalar_one()
    pending = db.execute(
        base.where(Interaction.status == "pending")
    ).scalar_one()
    in_progress = db.execute(
        base.where(Interaction.status == "in_progress")
    ).scalar_one()

    # Average duration for completed interactions with duration
    avg_dur_result = db.execute(
        select(func.avg(Interaction.duration_seconds)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
        )
    ).scalar_one()
    avg_duration = float(avg_dur_result) if avg_dur_result is not None else None

    # Delivery rate = completed / total
    delivery_rate = (completed / total) if total > 0 else None

    # Cost estimate: completed * cost_per_interaction_type
    # Get the campaign type to determine interaction type
    campaign = db.get(Campaign, campaign_id)
    if campaign is not None:
        interaction_type = CAMPAIGN_TYPE_TO_INTERACTION_TYPE.get(campaign.type)
        cost_per = COST_PER_INTERACTION.get(interaction_type, 1.0)
        cost_estimate = completed * cost_per
    else:
        cost_estimate = None

    return CampaignStats(
        total_contacts=total,
        completed=completed,
        failed=failed,
        pending=pending,
        in_progress=in_progress,
        avg_duration_seconds=avg_duration,
        delivery_rate=delivery_rate,
        cost_estimate=cost_estimate,
    )


# ---------------------------------------------------------------------------
# Background executor
# ---------------------------------------------------------------------------


def execute_campaign_batch(campaign_id: uuid.UUID, db_factory) -> None:
    """Process a batch of pending interactions for a campaign.

    This is designed to run as a background task. It:
    1. Fetches a batch of pending interactions
    2. Marks them as in_progress
    3. Simulates processing (actual TTS/SMS integration is a separate concern)
    4. Marks them as completed or failed
    5. If all interactions are done, marks campaign as completed

    Args:
        campaign_id: The campaign to process.
        db_factory: A callable that returns a new DB session (e.g., SessionLocal).
    """
    db = db_factory()
    try:
        campaign = db.get(Campaign, campaign_id)
        if campaign is None or campaign.status != "active":
            logger.info(
                "Campaign %s is not active (status=%s), skipping batch",
                campaign_id,
                campaign.status if campaign else "NOT_FOUND",
            )
            return

        batch_size = settings.CAMPAIGN_BATCH_SIZE
        rate_limit = settings.CAMPAIGN_RATE_LIMIT_PER_SECOND
        interval = 1.0 / rate_limit if rate_limit > 0 else 0

        # Fetch pending interactions
        pending_interactions = db.execute(
            select(Interaction)
            .where(
                Interaction.campaign_id == campaign_id,
                Interaction.status == "pending",
            )
            .limit(batch_size)
        ).scalars().all()

        if not pending_interactions:
            # Check if campaign is done
            remaining = db.execute(
                select(func.count())
                .select_from(Interaction)
                .where(
                    Interaction.campaign_id == campaign_id,
                    Interaction.status.in_(["pending", "in_progress"]),
                )
            ).scalar_one()

            if remaining == 0:
                campaign.status = "completed"
                db.commit()
                logger.info("Campaign %s completed — all interactions processed", campaign_id)
            return

        for interaction in pending_interactions:
            # Check if campaign was paused mid-batch
            db.refresh(campaign)
            if campaign.status != "active":
                logger.info("Campaign %s no longer active, stopping batch", campaign_id)
                break

            interaction.status = "in_progress"
            interaction.started_at = datetime.now(timezone.utc)
            db.commit()

            try:
                # TODO: Actual TTS/SMS/form dispatch goes here
                # For now, mark as completed immediately (MVP stub)
                interaction.status = "completed"
                interaction.ended_at = datetime.now(timezone.utc)
                if interaction.started_at:
                    delta = interaction.ended_at - interaction.started_at
                    interaction.duration_seconds = int(delta.total_seconds())
                db.commit()
            except Exception:
                logger.exception(
                    "Failed to process interaction %s", interaction.id
                )
                interaction.status = "failed"
                interaction.ended_at = datetime.now(timezone.utc)
                db.commit()

            # Rate limiting
            if interval > 0:
                time.sleep(interval)

        # Check if there are more pending — if so, this would be re-queued
        # For BackgroundTasks MVP, we process one batch per start/resume call
        remaining = db.execute(
            select(func.count())
            .select_from(Interaction)
            .where(
                Interaction.campaign_id == campaign_id,
                Interaction.status.in_(["pending", "in_progress"]),
            )
        ).scalar_one()

        if remaining == 0:
            db.refresh(campaign)
            if campaign.status == "active":
                campaign.status = "completed"
                db.commit()
                logger.info("Campaign %s completed — all interactions processed", campaign_id)

    except Exception:
        logger.exception("Error in campaign batch executor for %s", campaign_id)
    finally:
        db.close()
