"""Credit management API — balance, history, estimation, and purchase."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.schemas.credits import (
    CostEstimateResponse,
    CreditBalanceResponse,
    CreditHistoryResponse,
    CreditPurchaseRequest,
    CreditTransactionResponse,
)
from app.services.credits import (
    estimate_campaign_cost,
    get_balance,
    get_transaction_history,
    purchase_credits,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Balance
# ---------------------------------------------------------------------------


@router.get("/balance", response_model=CreditBalanceResponse)
def get_credit_balance(
    org_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    """Get the credit balance for an organization."""
    credit = get_balance(db, org_id)
    return CreditBalanceResponse(
        org_id=credit.org_id,
        balance=credit.balance,
        total_purchased=credit.total_purchased,
        total_consumed=credit.total_consumed,
    )


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@router.get("/history", response_model=CreditHistoryResponse)
def get_credit_history(
    org_id: uuid.UUID = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get paginated credit transaction history for an organization."""
    transactions, total = get_transaction_history(db, org_id, page, page_size)
    return CreditHistoryResponse(
        items=transactions,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# Purchase (admin/internal)
# ---------------------------------------------------------------------------


@router.post("/purchase", response_model=CreditTransactionResponse, status_code=201)
def purchase_credits_endpoint(
    payload: CreditPurchaseRequest,
    db: Session = Depends(get_db),
):
    """Add credits to an organization's balance."""
    transaction = purchase_credits(db, payload.org_id, payload.amount, payload.description)
    return transaction


# ---------------------------------------------------------------------------
# Campaign cost estimation
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns/{campaign_id}/estimate",
    response_model=CostEstimateResponse,
)
def estimate_campaign_cost_endpoint(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Calculate pre-launch cost estimation for a campaign.

    Returns the estimated total cost, per-interaction cost, contact count,
    current balance, and whether credits are sufficient.
    """
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    estimate = estimate_campaign_cost(db, campaign)
    return CostEstimateResponse(**estimate)
