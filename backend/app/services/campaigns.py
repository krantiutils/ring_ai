"""Campaign service — business logic for campaign lifecycle, contacts, and execution."""

import asyncio
import csv
import io
import logging
import time
import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.template import Template
from app.schemas.campaigns import CampaignStats
from app.services.telephony import (
    AudioEntry,
    CallContext,
    SmsResult,
    audio_store,
    call_context_store,
    get_twilio_provider,
)
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.templates import UndefinedVariableError, render
from app.tts import tts_router
from app.tts.exceptions import TTSError
from app.tts.models import TTSConfig, TTSProvider

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
        super().__init__(f"Cannot transition from '{current_status}' to '{target_status}'")


class CampaignNotFound(CampaignError):
    """Raised when a campaign is not found."""


class ContactNotInCampaign(CampaignError):
    """Raised when a contact is not associated with a campaign."""


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

VALID_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"active", "scheduled"},
    "scheduled": {"active", "draft"},
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


def parse_contacts_csv(csv_bytes: bytes, org_id: uuid.UUID) -> tuple[list[dict], list[str]]:
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

        rows.append(
            {
                "phone": phone,
                "name": name,
                "metadata_": metadata if metadata else None,
                "org_id": org_id,
            }
        )

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
    existing_phones = set(db.execute(select(Contact.phone).where(Contact.org_id == campaign.org_id)).scalars().all())

    # Also get contacts already in this campaign to skip duplicates
    existing_campaign_contacts = set(
        db.execute(
            select(Contact.phone)
            .join(Interaction, Interaction.contact_id == Contact.id)
            .where(Interaction.campaign_id == campaign.id)
        )
        .scalars()
        .all()
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


def _assert_has_contacts(db: Session, campaign: Campaign) -> None:
    """Raise CampaignError if campaign has no contacts."""
    contact_count = db.execute(
        select(func.count()).select_from(Interaction).where(Interaction.campaign_id == campaign.id)
    ).scalar_one()
    if contact_count == 0:
        raise CampaignError("Cannot start campaign with no contacts")


def start_campaign(db: Session, campaign: Campaign) -> Campaign:
    """Transition campaign from draft → active.

    Validates that the campaign has at least one contact (pending interaction).
    """
    _assert_transition(campaign.status, "active")
    _assert_has_contacts(db, campaign)

    campaign.status = "active"
    campaign.scheduled_at = None
    db.commit()
    db.refresh(campaign)
    return campaign


def schedule_campaign(db: Session, campaign: Campaign, scheduled_at: datetime) -> Campaign:
    """Transition campaign from draft → scheduled.

    Validates contacts exist and that scheduled_at is in the future.
    """
    _assert_transition(campaign.status, "scheduled")
    _assert_has_contacts(db, campaign)

    now = datetime.now(timezone.utc)
    # Normalise to UTC for comparison
    compare_dt = scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=timezone.utc)
    if compare_dt <= now:
        raise CampaignError("Scheduled time must be in the future")

    campaign.status = "scheduled"
    campaign.scheduled_at = scheduled_at
    db.commit()
    db.refresh(campaign)
    return campaign


def cancel_schedule(db: Session, campaign: Campaign) -> Campaign:
    """Cancel a scheduled campaign — transition back to draft."""
    _assert_transition(campaign.status, "draft")
    campaign.status = "draft"
    campaign.scheduled_at = None
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
# Retry & Relaunch
# ---------------------------------------------------------------------------


class MaxRetriesExceeded(CampaignError):
    """Raised when a campaign has exhausted all retry attempts."""


class NoFailedInteractions(CampaignError):
    """Raised when retry is called but there are no failed interactions."""


def _get_retry_backoff_minutes(campaign: Campaign) -> list[int]:
    """Return the backoff schedule for this campaign.

    Uses campaign.retry_config["backoff_minutes"] if set,
    otherwise falls back to the global CAMPAIGN_RETRY_BACKOFF_MINUTES.
    """
    if campaign.retry_config and "backoff_minutes" in campaign.retry_config:
        return list(campaign.retry_config["backoff_minutes"])
    return list(settings.CAMPAIGN_RETRY_BACKOFF_MINUTES)


def _get_max_retries(campaign: Campaign) -> int:
    """Return the max retry count for this campaign.

    Uses campaign.retry_config["max_retries"] if set,
    otherwise falls back to the global CAMPAIGN_MAX_RETRIES.
    """
    if campaign.retry_config and "max_retries" in campaign.retry_config:
        return int(campaign.retry_config["max_retries"])
    return settings.CAMPAIGN_MAX_RETRIES


def retry_campaign(
    db: Session, campaign: Campaign
) -> tuple[int, datetime | None]:
    """Retry failed/no-answer contacts in a completed campaign.

    Creates new pending interactions for contacts whose interactions have
    status='failed' (which includes Twilio NO_ANSWER and BUSY).

    Returns (retried_count, scheduled_at) where scheduled_at is None for
    immediate execution or a future datetime for backoff-delayed retries.

    Raises:
        InvalidStateTransition: Campaign is not in 'completed' status.
        MaxRetriesExceeded: Campaign has already been retried the max number of times.
        NoFailedInteractions: No failed interactions found to retry.
    """
    if campaign.status != "completed":
        raise InvalidStateTransition(campaign.status, "active")

    max_retries = _get_max_retries(campaign)
    if campaign.retry_count >= max_retries:
        raise MaxRetriesExceeded(
            f"Campaign has already been retried {campaign.retry_count} "
            f"time(s) (max: {max_retries})"
        )

    # Find contacts with failed interactions that haven't already been
    # retried in a later round.
    # We want distinct contacts whose LATEST interaction is failed.
    failed_interactions = db.execute(
        select(Interaction).where(
            Interaction.campaign_id == campaign.id,
            Interaction.status == "failed",
        )
    ).scalars().all()

    if not failed_interactions:
        raise NoFailedInteractions(
            "No failed interactions to retry in this campaign"
        )

    # Deduplicate by contact_id — only retry each contact once.
    # A contact may have multiple failed interactions from previous
    # retry rounds; we only create one new interaction per contact.
    seen_contacts: set[uuid.UUID] = set()
    interaction_type = CAMPAIGN_TYPE_TO_INTERACTION_TYPE[campaign.type]
    retry_round = campaign.retry_count + 1
    retried = 0

    for interaction in failed_interactions:
        if interaction.contact_id in seen_contacts:
            continue
        seen_contacts.add(interaction.contact_id)

        new_interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=interaction.contact_id,
            type=interaction_type,
            status="pending",
            metadata_={"retry_round": retry_round},
        )
        db.add(new_interaction)
        retried += 1

    # Determine backoff delay
    backoff_schedule = _get_retry_backoff_minutes(campaign)
    delay_index = min(campaign.retry_count, len(backoff_schedule) - 1)
    delay_minutes = backoff_schedule[delay_index] if backoff_schedule else 0

    campaign.retry_count = retry_round
    scheduled_at = None

    if delay_minutes > 0:
        scheduled_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
        campaign.status = "scheduled"
        campaign.scheduled_at = scheduled_at
    else:
        campaign.status = "active"
        campaign.scheduled_at = None

    db.commit()
    db.refresh(campaign)
    return retried, scheduled_at


def relaunch_campaign(db: Session, campaign: Campaign) -> tuple[Campaign, int]:
    """Create a new draft campaign cloned from the original, targeting only
    contacts whose interactions failed.

    The new campaign has:
    - Same settings (type, template, schedule_config, retry_config)
    - Only contacts that had failed interactions in the source
    - Status: 'draft' (for review before launch)
    - source_campaign_id pointing back to the original

    Returns (new_campaign, contacts_imported).

    Raises:
        CampaignError: Campaign has no failed interactions to relaunch.
    """
    if campaign.status not in ("completed", "paused", "active"):
        raise CampaignError(
            f"Cannot relaunch a campaign in '{campaign.status}' status"
        )

    # Find distinct contacts with failed interactions
    failed_contact_ids = db.execute(
        select(Interaction.contact_id)
        .where(
            Interaction.campaign_id == campaign.id,
            Interaction.status == "failed",
        )
        .distinct()
    ).scalars().all()

    if not failed_contact_ids:
        raise NoFailedInteractions(
            "No failed interactions to relaunch in this campaign"
        )

    # Clone campaign
    new_campaign = Campaign(
        name=f"{campaign.name} (relaunch)",
        type=campaign.type,
        org_id=campaign.org_id,
        template_id=campaign.template_id,
        schedule_config=campaign.schedule_config,
        retry_config=campaign.retry_config,
        source_campaign_id=campaign.id,
        status="draft",
    )
    db.add(new_campaign)
    db.flush()

    # Create interactions for each failed contact
    interaction_type = CAMPAIGN_TYPE_TO_INTERACTION_TYPE[campaign.type]
    for contact_id in failed_contact_ids:
        db.add(Interaction(
            campaign_id=new_campaign.id,
            contact_id=contact_id,
            type=interaction_type,
            status="pending",
            metadata_={"source_campaign_id": str(campaign.id)},
        ))

    db.commit()
    db.refresh(new_campaign)
    return new_campaign, len(failed_contact_ids)


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
    base = select(func.count()).select_from(Interaction).where(Interaction.campaign_id == campaign_id)

    total = db.execute(base).scalar_one()
    if total == 0:
        return CampaignStats()

    completed = db.execute(base.where(Interaction.status == "completed")).scalar_one()
    failed = db.execute(base.where(Interaction.status == "failed")).scalar_one()
    pending = db.execute(base.where(Interaction.status == "pending")).scalar_one()
    in_progress = db.execute(base.where(Interaction.status == "in_progress")).scalar_one()

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
# Carrier detection (Nepal phone prefixes)
# ---------------------------------------------------------------------------

# Nepal mobile prefixes → carrier mapping
# Sources: NTA (Nepal Telecommunications Authority) allocations
_NEPAL_CARRIER_PREFIXES: dict[str, str] = {
    # NTC (Nepal Telecom)
    "984": "NTC",
    "985": "NTC",
    "986": "NTC",
    "974": "NTC",
    "975": "NTC",
    # Ncell
    "980": "Ncell",
    "981": "Ncell",
    "982": "Ncell",
    # Smart Cell
    "961": "Smart Cell",
    "962": "Smart Cell",
    "988": "Smart Cell",
    # UTL (United Telecom)
    "972": "UTL",
}


def detect_carrier(phone: str) -> str | None:
    """Detect Nepal mobile carrier from phone number prefix.

    Accepts numbers with or without country code (+977 / 977).
    Returns carrier name or None if not a recognized Nepal mobile number.
    """
    # Strip whitespace and leading +
    cleaned = phone.strip().lstrip("+")

    # Extract the subscriber number (strip country code 977 if present)
    if cleaned.startswith("977") and len(cleaned) >= 13:
        subscriber = cleaned[3:]
    elif cleaned.startswith("9") and len(cleaned) == 10:
        subscriber = cleaned
    else:
        return None

    # Match first 3 digits of subscriber number
    prefix = subscriber[:3]
    return _NEPAL_CARRIER_PREFIXES.get(prefix)


# ---------------------------------------------------------------------------
# CSV report generation
# ---------------------------------------------------------------------------

REPORT_CSV_COLUMNS = [
    "contact_number",
    "contact_name",
    "status",
    "call_duration",
    "credit_consumed",
    "carrier",
    "playback_url",
    "updated_at",
]


def generate_report_csv(db: Session, campaign_id: uuid.UUID) -> Generator[str, None, None]:
    """Generate CSV report rows for a campaign as a string generator.

    Yields CSV lines (header first, then one line per interaction).
    Joins interactions with contacts to produce the report.
    """
    # Write header
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(REPORT_CSV_COLUMNS)
    yield buf.getvalue()

    # Query all interactions for this campaign, joined with contacts
    query = (
        select(Interaction, Contact)
        .join(Contact, Interaction.contact_id == Contact.id)
        .where(Interaction.campaign_id == campaign_id)
        .order_by(Interaction.created_at)
    )

    results = db.execute(query).all()

    for interaction, contact in results:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                contact.phone,
                contact.name or "",
                interaction.status,
                interaction.duration_seconds if interaction.duration_seconds is not None else "",
                interaction.credit_consumed if interaction.credit_consumed is not None else "",
                detect_carrier(contact.phone) or "",
                interaction.audio_url or "",
                interaction.updated_at.isoformat() if interaction.updated_at else "",
            ]
        )
        yield buf.getvalue()


# ---------------------------------------------------------------------------
# Background executor
# ---------------------------------------------------------------------------

# Default TTS configuration for campaigns without explicit voice_config
_DEFAULT_TTS_PROVIDER = TTSProvider.EDGE_TTS
_DEFAULT_TTS_VOICE = "ne-NP-HemkalaNeural"


def _build_contact_variables(contact: Contact) -> dict[str, str]:
    """Build template variable dict from a contact record.

    Merges contact.name (as 'name') with any key/value pairs from
    contact.metadata_, converting all values to strings.
    """
    variables: dict[str, str] = {}
    if contact.name:
        variables["name"] = contact.name
    if contact.metadata_:
        for key, value in contact.metadata_.items():
            variables[key] = str(value)
    return variables


def _build_tts_config(template: Template) -> TTSConfig:
    """Build a TTSConfig from a template's voice_config, with defaults."""
    vc = template.voice_config or {}
    return TTSConfig(
        provider=TTSProvider(vc.get("provider", _DEFAULT_TTS_PROVIDER.value)),
        voice=vc.get("voice", _DEFAULT_TTS_VOICE),
        rate=vc.get("rate", "+0%"),
        pitch=vc.get("pitch", "+0Hz"),
        fallback_provider=(TTSProvider(vc["fallback_provider"]) if vc.get("fallback_provider") else None),
    )


async def _dispatch_voice_call(
    interaction: Interaction,
    contact: Contact,
    template: Template | None,
    campaign: Campaign,
    preloaded_audio: bytes | None = None,
) -> str:
    """Render template + synthesize TTS, or use pre-recorded audio, then initiate Twilio call.

    If the campaign has an audio_file, preloaded_audio must be provided (read
    once per batch for efficiency). Template rendering and TTS are skipped.

    Returns the Twilio CallSid on success.

    Raises:
        UndefinedVariableError: If a required template variable is missing.
        TTSError: If TTS synthesis fails.
        TelephonyConfigurationError: If Twilio is not configured.
        TelephonyProviderError: If the Twilio call initiation fails.
    """
    if preloaded_audio is not None:
        # Pre-recorded audio path: skip TTS entirely
        content_type = (
            "audio/wav" if campaign.audio_file and campaign.audio_file.endswith(".wav")
            else "audio/mpeg"
        )
        audio_id = str(uuid.uuid4())
        audio_store.put(
            audio_id,
            AudioEntry(audio_bytes=preloaded_audio, content_type=content_type),
        )
    else:
        # TTS path: render template and synthesize
        if template is None:
            raise TelephonyConfigurationError(
                "Campaign has no template and no audio file — cannot dispatch voice call"
            )
        variables = _build_contact_variables(contact)
        rendered_text = render(template.content, variables)

        tts_config = _build_tts_config(template)
        tts_result = await tts_router.synthesize(rendered_text, tts_config)

        audio_id = str(uuid.uuid4())
        audio_store.put(
            audio_id,
            AudioEntry(
                audio_bytes=tts_result.audio_bytes,
                content_type="audio/mpeg",
            ),
        )

    # 4. Get Twilio provider and base URL
    provider = get_twilio_provider()
    from_number = provider.default_from_number
    base_url = settings.TWILIO_BASE_URL

    if not base_url:
        audio_store.delete(audio_id)
        raise TelephonyConfigurationError("TWILIO_BASE_URL not configured — cannot generate callback URLs")

    # 5. Set up call context
    temp_call_id = str(uuid.uuid4())
    call_context = CallContext(
        call_id=temp_call_id,
        audio_id=audio_id,
        interaction_id=interaction.id,
    )
    call_context_store.put(temp_call_id, call_context)

    twiml_url = f"{base_url}/api/v1/voice/twiml/{temp_call_id}"
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    # 6. Initiate call
    try:
        result = await provider.initiate_call(
            to=contact.phone,
            from_number=from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
    except TelephonyProviderError:
        audio_store.delete(audio_id)
        call_context_store.delete(temp_call_id)
        raise

    # 7. Update context with real Twilio CallSid
    call_context.call_id = result.call_id
    call_context_store.put(result.call_id, call_context)

    return result.call_id


async def _dispatch_sms(
    interaction: Interaction,
    contact: Contact,
    template: Template,
    campaign: Campaign,
) -> str:
    """Render template and send SMS via Twilio.

    Returns the Twilio message SID on success.

    Raises:
        UndefinedVariableError: If a required template variable is missing.
        TelephonyConfigurationError: If Twilio is not configured.
        TelephonyProviderError: If the Twilio SMS send fails.
    """
    # 1. Render template with contact variables
    variables = _build_contact_variables(contact)
    rendered_text = render(template.content, variables)

    # 2. Send SMS via Twilio
    provider = get_twilio_provider()
    from_number = provider.default_from_number

    result: SmsResult = await provider.send_sms(
        to=contact.phone,
        from_number=from_number,
        body=rendered_text,
    )

    return result.message_id


def _dispatch_interaction(
    interaction: Interaction,
    contact: Contact,
    template: Template | None,
    campaign: Campaign,
    db: Session,
    preloaded_audio: bytes | None = None,
) -> None:
    """Dispatch a single interaction (voice or text).

    Voice: marks interaction as 'in_progress' — Twilio webhook updates final status.
    SMS: marks interaction as 'completed' immediately on successful send.
    On error, exceptions propagate to the batch executor for retry handling.
    """
    if campaign.type == "voice":
        call_sid = asyncio.run(
            _dispatch_voice_call(
                interaction,
                contact,
                template,
                campaign,
                preloaded_audio=preloaded_audio,
            )
        )
        meta = {
            **(interaction.metadata_ or {}),
            "twilio_call_sid": call_sid,
        }
        if template is not None:
            meta["template_id"] = str(template.id)
        if campaign.audio_file:
            meta["audio_source"] = "uploaded"
        interaction.metadata_ = meta
        # Voice calls stay 'in_progress' — the webhook updates final status
        db.commit()

    elif campaign.type == "text":
        message_sid = asyncio.run(
            _dispatch_sms(interaction, contact, template, campaign)
        )
        interaction.status = "completed"
        interaction.ended_at = datetime.now(timezone.utc)
        interaction.metadata_ = {
            **(interaction.metadata_ or {}),
            "twilio_message_sid": message_sid,
            "template_id": str(template.id),
        }
        db.commit()

    else:
        logger.warning(
            "Unsupported campaign type '%s' for interaction %s",
            campaign.type,
            interaction.id,
        )
        interaction.status = "failed"
        interaction.ended_at = datetime.now(timezone.utc)
        interaction.metadata_ = {
            **(interaction.metadata_ or {}),
            "error": f"Unsupported campaign type: {campaign.type}",
        }
        db.commit()


def execute_campaign_batch(campaign_id: uuid.UUID, db_factory) -> None:
    """Process a batch of pending interactions for a campaign.

    This is designed to run as a background task. It:
    1. Fetches a batch of pending interactions
    2. Loads the campaign template
    3. For each interaction: renders template, synthesizes TTS, initiates call
    4. Handles retries for failed interactions (up to CAMPAIGN_MAX_RETRIES)
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

        # Load template (required unless campaign has a pre-recorded audio file)
        template = db.get(Template, campaign.template_id) if campaign.template_id else None
        if template is None and not campaign.audio_file:
            logger.error(
                "Campaign %s has no template and no audio file, cannot execute",
                campaign_id,
            )
            return

        # Pre-load audio file once for the entire batch (if using pre-recorded audio)
        preloaded_audio: bytes | None = None
        if campaign.audio_file:
            try:
                with open(campaign.audio_file, "rb") as af:
                    preloaded_audio = af.read()
            except OSError:
                logger.error(
                    "Campaign %s audio file not readable: %s",
                    campaign_id,
                    campaign.audio_file,
                )
                return

        batch_size = settings.CAMPAIGN_BATCH_SIZE
        max_retries = settings.CAMPAIGN_MAX_RETRIES
        rate_limit = settings.CAMPAIGN_RATE_LIMIT_PER_SECOND
        interval = 1.0 / rate_limit if rate_limit > 0 else 0

        # Fetch pending interactions
        pending_interactions = (
            db.execute(
                select(Interaction)
                .where(
                    Interaction.campaign_id == campaign_id,
                    Interaction.status == "pending",
                )
                .limit(batch_size)
            )
            .scalars()
            .all()
        )

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

            # Load contact for this interaction
            contact = db.get(Contact, interaction.contact_id)
            if contact is None:
                logger.error(
                    "Contact %s not found for interaction %s, marking failed",
                    interaction.contact_id,
                    interaction.id,
                )
                interaction.status = "failed"
                interaction.ended_at = datetime.now(timezone.utc)
                interaction.metadata_ = {
                    **(interaction.metadata_ or {}),
                    "error": "Contact not found",
                }
                db.commit()
                continue

            try:
                _dispatch_interaction(
                    interaction,
                    contact,
                    template,
                    campaign,
                    db,
                    preloaded_audio=preloaded_audio,
                )
            except (
                UndefinedVariableError,
                TTSError,
                TelephonyConfigurationError,
                TelephonyProviderError,
            ) as exc:
                retry_count = (interaction.metadata_ or {}).get("retry_count", 0)
                logger.warning(
                    "Dispatch failed for interaction %s (attempt %d/%d): %s",
                    interaction.id,
                    retry_count + 1,
                    max_retries,
                    exc,
                )

                if retry_count + 1 < max_retries:
                    # Re-queue for retry
                    interaction.status = "pending"
                    interaction.started_at = None
                    interaction.metadata_ = {
                        **(interaction.metadata_ or {}),
                        "retry_count": retry_count + 1,
                        "last_error": str(exc),
                    }
                    db.commit()
                else:
                    # Exhausted retries — mark as failed
                    interaction.status = "failed"
                    interaction.ended_at = datetime.now(timezone.utc)
                    interaction.metadata_ = {
                        **(interaction.metadata_ or {}),
                        "retry_count": retry_count + 1,
                        "last_error": str(exc),
                        "error": f"Failed after {max_retries} attempts: {exc}",
                    }
                    db.commit()
            except Exception:
                logger.exception("Unexpected error processing interaction %s", interaction.id)
                interaction.status = "failed"
                interaction.ended_at = datetime.now(timezone.utc)
                interaction.metadata_ = {
                    **(interaction.metadata_ or {}),
                    "error": "Unexpected error during dispatch",
                }
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
