"""ROI analytics service — cost tracking, conversion metrics, A/B testing, ROI calculations."""

import logging
import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.ab_test import ABTest
from app.models.campaign import Campaign
from app.models.interaction import Interaction
from app.models.voice_model import VoiceModel
from app.schemas.roi import (
    ABTestCreate,
    ABTestResponse,
    ABTestResult,
    ABTestVariantResult,
    CampaignComparison,
    CampaignComparisonEntry,
    CampaignROI,
    CostBreakdown,
    ROICalculatorResult,
)
from app.services.campaigns import CAMPAIGN_TYPE_TO_INTERACTION_TYPE, COST_PER_INTERACTION

logger = logging.getLogger(__name__)

GEMINI_PROVIDER_NAMES = {"gemini", "google", "gemini-live"}


def _campaign_uses_gemini(db: Session, campaign: Campaign) -> bool:
    """Check if a campaign's voice model uses the Gemini provider."""
    if campaign.voice_model_id is None:
        return False
    voice_model = db.get(VoiceModel, campaign.voice_model_id)
    if voice_model is None:
        return False
    return voice_model.provider.lower() in GEMINI_PROVIDER_NAMES


# ---------------------------------------------------------------------------
# Cost constants — granular breakdown
# ---------------------------------------------------------------------------

# Per-interaction cost breakdown (NPR).
# The existing COST_PER_INTERACTION (2.0 for outbound_call) is a blended rate.
# Here we split it into TTS + telephony + Gemini for more granular reporting.
TTS_COST_PER_CALL = 0.5  # TTS synthesis cost per voice call
TELEPHONY_COST_PER_CALL = 1.5  # Twilio/SIP cost per voice call
GEMINI_COST_PER_CALL = 0.8  # Gemini interactive agent cost per call
SMS_COST = 0.5  # Per SMS
FORM_TELEPHONY_COST = 1.0  # Form calls (telephony only, TTS included)


def _cost_breakdown_for_campaign(
    campaign_type: str, completed: int, uses_gemini: bool = False,
) -> CostBreakdown:
    """Calculate itemised cost breakdown based on campaign type and completed count."""
    gemini_cost = 0.0

    if campaign_type == "voice":
        tts_cost = completed * TTS_COST_PER_CALL
        telephony_cost = completed * TELEPHONY_COST_PER_CALL
        if uses_gemini:
            gemini_cost = completed * GEMINI_COST_PER_CALL
    elif campaign_type == "text":
        tts_cost = 0.0
        telephony_cost = completed * SMS_COST
    elif campaign_type == "form":
        tts_cost = 0.0
        telephony_cost = completed * FORM_TELEPHONY_COST
    else:
        tts_cost = 0.0
        telephony_cost = 0.0

    total = tts_cost + telephony_cost + gemini_cost
    return CostBreakdown(
        tts_cost=round(tts_cost, 2),
        telephony_cost=round(telephony_cost, 2),
        gemini_cost=round(gemini_cost, 2),
        total_cost=round(total, 2),
    )


# ---------------------------------------------------------------------------
# Per-campaign ROI
# ---------------------------------------------------------------------------


def _query_campaign_metrics(db: Session, campaign_id: uuid.UUID) -> dict:
    """Fetch aggregated interaction metrics for a single campaign.

    Returns a dict with keys: total, completed, failed, avg_duration, total_duration,
    avg_sentiment.
    """
    base_filter = Interaction.campaign_id == campaign_id

    # Status counts
    status_rows = db.execute(
        select(Interaction.status, func.count())
        .where(base_filter)
        .group_by(Interaction.status)
    ).all()
    status_counts = {row[0]: row[1] for row in status_rows}

    total = sum(status_counts.values())
    completed = status_counts.get("completed", 0)
    failed = status_counts.get("failed", 0)

    # Average + total duration for completed calls
    dur_result = db.execute(
        select(
            func.avg(Interaction.duration_seconds),
            func.sum(Interaction.duration_seconds),
        ).where(
            base_filter,
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
        )
    ).one()
    avg_duration = float(dur_result[0]) if dur_result[0] is not None else None
    total_duration = float(dur_result[1]) if dur_result[1] is not None else None

    # Average sentiment
    avg_sentiment = db.execute(
        select(func.avg(Interaction.sentiment_score)).where(
            base_filter,
            Interaction.status == "completed",
            Interaction.sentiment_score.isnot(None),
        )
    ).scalar_one()
    avg_sentiment_val = round(float(avg_sentiment), 2) if avg_sentiment is not None else None

    return {
        "total": total,
        "completed": completed,
        "failed": failed,
        "avg_duration": avg_duration,
        "total_duration": total_duration,
        "avg_sentiment": avg_sentiment_val,
    }


def get_campaign_roi(db: Session, campaign_id: uuid.UUID) -> CampaignROI:
    """Compute full ROI metrics for a single campaign."""
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found")

    metrics = _query_campaign_metrics(db, campaign_id)
    uses_gemini = _campaign_uses_gemini(db, campaign)
    cost = _cost_breakdown_for_campaign(campaign.type, metrics["completed"], uses_gemini)

    total = metrics["total"]
    completed = metrics["completed"]
    conversion_rate = completed / total if total > 0 else None
    cost_per_interaction = cost.total_cost / total if total > 0 else None
    cost_per_conversion = cost.total_cost / completed if completed > 0 else None

    return CampaignROI(
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        campaign_type=campaign.type,
        campaign_status=campaign.status,
        cost_breakdown=cost,
        total_cost=cost.total_cost,
        total_interactions=total,
        completed_interactions=completed,
        failed_interactions=metrics["failed"],
        conversion_rate=round(conversion_rate, 4) if conversion_rate is not None else None,
        cost_per_interaction=round(cost_per_interaction, 2) if cost_per_interaction is not None else None,
        cost_per_conversion=round(cost_per_conversion, 2) if cost_per_conversion is not None else None,
        avg_duration_seconds=round(metrics["avg_duration"], 1) if metrics["avg_duration"] is not None else None,
        total_duration_seconds=metrics["total_duration"],
        avg_sentiment_score=metrics["avg_sentiment"],
    )


# ---------------------------------------------------------------------------
# Campaign comparison
# ---------------------------------------------------------------------------


def get_campaign_comparison(
    db: Session,
    campaign_ids: list[uuid.UUID],
) -> CampaignComparison:
    """Side-by-side comparison of multiple campaigns."""
    entries: list[CampaignComparisonEntry] = []

    for cid in campaign_ids:
        campaign = db.get(Campaign, cid)
        if campaign is None:
            logger.warning("Campaign %s not found, skipping from comparison", cid)
            continue

        metrics = _query_campaign_metrics(db, cid)
        uses_gemini = _campaign_uses_gemini(db, campaign)
        cost = _cost_breakdown_for_campaign(campaign.type, metrics["completed"], uses_gemini)

        total = metrics["total"]
        completed = metrics["completed"]
        conversion_rate = completed / total if total > 0 else None
        cost_per_conversion = cost.total_cost / completed if completed > 0 else None

        entries.append(
            CampaignComparisonEntry(
                campaign_id=campaign.id,
                campaign_name=campaign.name,
                campaign_type=campaign.type,
                campaign_status=campaign.status,
                total_interactions=total,
                completed=completed,
                failed=metrics["failed"],
                conversion_rate=round(conversion_rate, 4) if conversion_rate is not None else None,
                total_cost=cost.total_cost,
                cost_per_conversion=round(cost_per_conversion, 2) if cost_per_conversion is not None else None,
                avg_duration_seconds=round(metrics["avg_duration"], 1) if metrics["avg_duration"] is not None else None,
                avg_sentiment_score=metrics["avg_sentiment"],
            )
        )

    return CampaignComparison(campaigns=entries)


# ---------------------------------------------------------------------------
# A/B testing
# ---------------------------------------------------------------------------


def list_ab_tests(db: Session, org_id: uuid.UUID) -> list[ABTestResponse]:
    """List all A/B tests for an organization."""
    tests = db.execute(
        select(ABTest)
        .where(ABTest.org_id == org_id)
        .order_by(ABTest.created_at.desc())
    ).scalars().all()

    return [
        ABTestResponse(
            id=t.id,
            name=t.name,
            description=t.description,
            status=t.status,
            variants=t.variants or [],
            created_at=t.created_at.isoformat(),
        )
        for t in tests
    ]


def create_ab_test(db: Session, org_id: uuid.UUID, data: ABTestCreate) -> ABTestResponse:
    """Create an A/B test linking multiple campaigns as variants."""
    # Validate all campaigns exist and belong to the org
    campaigns = []
    for cid in data.campaign_ids:
        campaign = db.get(Campaign, cid)
        if campaign is None:
            raise ValueError(f"Campaign {cid} not found")
        if campaign.org_id != org_id:
            raise ValueError(f"Campaign {cid} does not belong to org {org_id}")
        campaigns.append(campaign)

    # Generate variant names
    if data.variant_names and len(data.variant_names) == len(data.campaign_ids):
        variant_names = data.variant_names
    else:
        variant_names = [
            f"variant_{chr(ord('a') + i)}" for i in range(len(data.campaign_ids))
        ]

    # Build variants structure
    variants = []
    for campaign, vname in zip(campaigns, variant_names):
        variants.append({
            "name": vname,
            "campaign_id": str(campaign.id),
            "campaign_name": campaign.name,
        })

    ab_test = ABTest(
        org_id=org_id,
        name=data.name,
        description=data.description,
        status="active",
        variants=variants,
    )
    db.add(ab_test)
    db.flush()

    # Tag campaigns with the A/B test
    for campaign, vname in zip(campaigns, variant_names):
        campaign.ab_test_id = ab_test.id
        campaign.ab_test_variant = vname

    db.commit()
    db.refresh(ab_test)

    return ABTestResponse(
        id=ab_test.id,
        name=ab_test.name,
        description=ab_test.description,
        status=ab_test.status,
        variants=variants,
        created_at=ab_test.created_at.isoformat(),
    )


def _chi_squared_test(observed: list[tuple[int, int]]) -> tuple[float, float]:
    """Perform chi-squared test on 2xN contingency table.

    Input: list of (successes, failures) per variant.
    Returns: (chi_squared_statistic, p_value).

    Uses the chi-squared approximation with Yates' correction for 2x2 tables.
    For larger tables, no correction is applied.
    """
    k = len(observed)
    if k < 2:
        return 0.0, 1.0

    # Total successes, failures, and grand total
    total_success = sum(s for s, _ in observed)
    total_failure = sum(f for _, f in observed)
    grand_total = total_success + total_failure

    if grand_total == 0:
        return 0.0, 1.0

    chi2 = 0.0
    for success, failure in observed:
        row_total = success + failure
        if row_total == 0:
            continue

        expected_success = row_total * total_success / grand_total
        expected_failure = row_total * total_failure / grand_total

        if expected_success > 0:
            chi2 += (success - expected_success) ** 2 / expected_success
        if expected_failure > 0:
            chi2 += (failure - expected_failure) ** 2 / expected_failure

    # Degrees of freedom = (rows - 1) * (cols - 1) = k - 1
    df = k - 1

    # Compute p-value using the regularized incomplete gamma function
    # P(X > chi2) = 1 - gamma_cdf(chi2, df/2)
    p_value = _chi2_survival(chi2, df)

    return round(chi2, 4), round(p_value, 6)


def _chi2_survival(x: float, df: int) -> float:
    """Compute survival function (1 - CDF) for chi-squared distribution.

    Uses the regularized incomplete gamma function approximation.
    Good enough for our A/B testing purposes — no scipy dependency needed.
    """
    if x <= 0:
        return 1.0
    if df <= 0:
        return 0.0

    # Use the series expansion for the regularized incomplete gamma function
    a = df / 2.0
    return 1.0 - _regularized_gamma_p(a, x / 2.0)


def _regularized_gamma_p(a: float, x: float) -> float:
    """Lower regularized incomplete gamma function P(a, x).

    Uses series expansion for small x and continued fraction for large x.
    """
    if x < 0:
        return 0.0
    if x == 0:
        return 0.0

    if x < a + 1:
        # Series expansion
        return _gamma_series(a, x)
    else:
        # Continued fraction (complement)
        return 1.0 - _gamma_cf(a, x)


def _gamma_series(a: float, x: float) -> float:
    """Series expansion for lower incomplete gamma P(a, x)."""
    max_iter = 200
    eps = 1e-10

    ap = a
    total = 1.0 / a
    delta = total

    for _ in range(max_iter):
        ap += 1.0
        delta *= x / ap
        total += delta
        if abs(delta) < abs(total) * eps:
            break

    return total * math.exp(-x + a * math.log(x) - math.lgamma(a))


def _gamma_cf(a: float, x: float) -> float:
    """Continued fraction for upper incomplete gamma Q(a, x)."""
    max_iter = 200
    eps = 1e-10
    tiny = 1e-30

    b = x + 1.0 - a
    c = 1.0 / tiny
    d = 1.0 / b
    h = d

    for i in range(1, max_iter + 1):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < tiny:
            d = tiny
        c = b + an / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break

    return h * math.exp(-x + a * math.log(x) - math.lgamma(a))


def get_ab_test_results(db: Session, ab_test_id: uuid.UUID) -> ABTestResult:
    """Compute A/B test results with statistical significance."""
    ab_test = db.get(ABTest, ab_test_id)
    if ab_test is None:
        raise ValueError(f"A/B test {ab_test_id} not found")

    if not ab_test.variants:
        raise ValueError(f"A/B test {ab_test_id} has no variants defined")

    variant_results: list[ABTestVariantResult] = []
    observed: list[tuple[int, int]] = []  # (success, failure) per variant

    for variant in ab_test.variants:
        campaign_id = uuid.UUID(variant["campaign_id"])
        campaign = db.get(Campaign, campaign_id)
        if campaign is None:
            logger.warning("Campaign %s for variant %s not found", campaign_id, variant["name"])
            continue

        metrics = _query_campaign_metrics(db, campaign_id)
        uses_gemini = _campaign_uses_gemini(db, campaign)
        cost = _cost_breakdown_for_campaign(campaign.type, metrics["completed"], uses_gemini)

        total = metrics["total"]
        completed = metrics["completed"]
        failed = metrics["failed"]
        conversion_rate = completed / total if total > 0 else None
        cost_per_conversion = cost.total_cost / completed if completed > 0 else None

        # Resolve TTS provider/voice for the variant
        tts_provider = None
        tts_voice = None
        if campaign.voice_model_id:
            vm = db.get(VoiceModel, campaign.voice_model_id)
            if vm:
                tts_provider = vm.provider
                tts_voice = vm.voice_display_name

        variant_results.append(
            ABTestVariantResult(
                variant_name=variant["name"],
                campaign_id=campaign_id,
                campaign_name=campaign.name,
                campaign_type=campaign.type,
                tts_provider=tts_provider,
                tts_voice=tts_voice,
                total_interactions=total,
                completed=completed,
                failed=failed,
                conversion_rate=round(conversion_rate, 4) if conversion_rate is not None else None,
                total_cost=cost.total_cost,
                cost_per_conversion=round(cost_per_conversion, 2) if cost_per_conversion is not None else None,
                avg_duration_seconds=round(metrics["avg_duration"], 1) if metrics["avg_duration"] is not None else None,
                avg_sentiment_score=metrics["avg_sentiment"],
            )
        )
        observed.append((completed, total - completed))

    # Statistical test
    chi2, p_value = _chi_squared_test(observed)
    is_significant = p_value < 0.05

    # Determine winner
    winner = None
    if is_significant and variant_results:
        best = max(
            variant_results,
            key=lambda v: v.conversion_rate if v.conversion_rate is not None else -1,
        )
        if best.conversion_rate is not None:
            winner = best.variant_name

    return ABTestResult(
        ab_test_id=ab_test.id,
        name=ab_test.name,
        status=ab_test.status,
        variants=variant_results,
        chi_squared=chi2,
        p_value=p_value,
        is_significant=is_significant,
        winner=winner,
    )


# ---------------------------------------------------------------------------
# ROI calculator
# ---------------------------------------------------------------------------


def calculate_roi(
    db: Session,
    campaign_ids: list[uuid.UUID],
    manual_cost_per_call: float = 15.0,
) -> ROICalculatorResult:
    """Calculate ROI comparing automated campaigns against manual calling cost."""
    total_automated_cost = 0.0
    total_interactions = 0
    total_completed = 0
    campaigns_analyzed = 0

    for cid in campaign_ids:
        campaign = db.get(Campaign, cid)
        if campaign is None:
            logger.warning("Campaign %s not found, skipping from ROI calculation", cid)
            continue

        metrics = _query_campaign_metrics(db, cid)
        uses_gemini = _campaign_uses_gemini(db, campaign)
        cost = _cost_breakdown_for_campaign(campaign.type, metrics["completed"], uses_gemini)

        total_automated_cost += cost.total_cost
        total_interactions += metrics["total"]
        total_completed += metrics["completed"]
        campaigns_analyzed += 1

    # Manual cost estimate: what it would cost if every interaction were manual
    total_manual_cost = total_interactions * manual_cost_per_call
    cost_savings = total_manual_cost - total_automated_cost
    savings_pct = (cost_savings / total_manual_cost * 100) if total_manual_cost > 0 else None

    conversion_rate = total_completed / total_interactions if total_interactions > 0 else None
    cost_per_conversion = total_automated_cost / total_completed if total_completed > 0 else None

    return ROICalculatorResult(
        total_automated_cost=round(total_automated_cost, 2),
        total_manual_cost_estimate=round(total_manual_cost, 2),
        cost_savings=round(cost_savings, 2),
        cost_savings_percentage=round(savings_pct, 1) if savings_pct is not None else None,
        total_interactions=total_interactions,
        total_completed=total_completed,
        overall_conversion_rate=round(conversion_rate, 4) if conversion_rate is not None else None,
        cost_per_conversion=round(cost_per_conversion, 2) if cost_per_conversion is not None else None,
        campaigns_analyzed=campaigns_analyzed,
    )
