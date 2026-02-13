"""ROI analytics API — cost tracking, campaign comparison, A/B testing, ROI calculator."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.roi import (
    ABTestCreate,
    ABTestResponse,
    ABTestResult,
    CampaignComparison,
    CampaignROI,
    ROICalculatorRequest,
    ROICalculatorResult,
)
from app.services.roi import (
    calculate_roi,
    create_ab_test,
    get_ab_test_results,
    get_campaign_comparison,
    get_campaign_roi,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /roi/campaigns/{campaign_id}
# ---------------------------------------------------------------------------


@router.get("/campaigns/{campaign_id}", response_model=CampaignROI)
def roi_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Per-campaign ROI: cost breakdown (TTS + telephony), conversion metrics, cost per conversion."""
    try:
        return get_campaign_roi(db, campaign_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /roi/compare
# ---------------------------------------------------------------------------


@router.get("/compare", response_model=CampaignComparison)
def roi_compare(
    campaign_ids: list[uuid.UUID] = Query(
        ...,
        description="Campaign IDs to compare (pass multiple times: ?campaign_ids=X&campaign_ids=Y)",
    ),
    db: Session = Depends(get_db),
):
    """Side-by-side comparison of multiple campaigns: metrics, costs, conversion rates."""
    if len(campaign_ids) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 campaign IDs are required for comparison",
        )
    return get_campaign_comparison(db, campaign_ids)


# ---------------------------------------------------------------------------
# POST /roi/ab-tests
# ---------------------------------------------------------------------------


@router.post("/ab-tests", response_model=ABTestResponse, status_code=201)
def create_ab_test_endpoint(
    data: ABTestCreate,
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """Create an A/B test linking 2+ campaigns as variants.

    Campaigns are tagged with the test ID and variant name for tracking.
    """
    try:
        return create_ab_test(db, org_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /roi/ab-tests/{ab_test_id}/results
# ---------------------------------------------------------------------------


@router.get("/ab-tests/{ab_test_id}/results", response_model=ABTestResult)
def ab_test_results(
    ab_test_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """A/B test results: per-variant metrics and chi-squared statistical significance."""
    try:
        return get_ab_test_results(db, ab_test_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /roi/calculator
# ---------------------------------------------------------------------------


@router.post("/calculator", response_model=ROICalculatorResult)
def roi_calculator(
    data: ROICalculatorRequest,
    db: Session = Depends(get_db),
):
    """ROI calculator: compare automated campaign cost against manual calling estimates.

    Computes total automated cost, estimated manual cost, savings, and cost per conversion.
    """
    return calculate_roi(
        db,
        campaign_ids=data.campaign_ids,
        manual_cost_per_call=data.manual_cost_per_call,
    )
