"""Credit service — balance management, cost estimation, and deduction logic."""

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.credit import Credit
from app.models.credit_transaction import CreditTransaction
from app.models.interaction import Interaction
from app.services.campaigns import CAMPAIGN_TYPE_TO_INTERACTION_TYPE

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cost rates per interaction type (NPR)
# ---------------------------------------------------------------------------

COST_PER_INTERACTION: dict[str, float] = {
    "outbound_call": 2.0,
    "sms": 0.5,
    "form_response": 1.0,
}


class InsufficientCreditsError(Exception):
    """Raised when an org lacks credits for the requested operation."""

    def __init__(self, required: float, available: float) -> None:
        self.required = required
        self.available = available
        super().__init__(f"Insufficient credits: required {required}, available {available}")


class CreditNotFoundError(Exception):
    """Raised when no credit record exists for an org."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_or_create_credit(db: Session, org_id: uuid.UUID) -> Credit:
    """Return the Credit row for an org, creating one with zero balance if absent."""
    credit = db.execute(select(Credit).where(Credit.org_id == org_id)).scalar_one_or_none()

    if credit is None:
        credit = Credit(org_id=org_id, balance=0.0, total_purchased=0.0, total_consumed=0.0)
        db.add(credit)
        db.flush()

    return credit


def _interaction_cost(campaign_type: str) -> float:
    """Return the per-interaction cost for a campaign type."""
    interaction_type = CAMPAIGN_TYPE_TO_INTERACTION_TYPE.get(campaign_type)
    return COST_PER_INTERACTION.get(interaction_type, 1.0)


# ---------------------------------------------------------------------------
# Balance queries
# ---------------------------------------------------------------------------


def get_balance(db: Session, org_id: uuid.UUID) -> Credit:
    """Return the credit balance for an org."""
    return get_or_create_credit(db, org_id)


def get_transaction_history(
    db: Session,
    org_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[CreditTransaction], int]:
    """Return paginated transaction history for an org."""
    base = select(CreditTransaction).where(CreditTransaction.org_id == org_id)
    count_query = select(func.count()).select_from(CreditTransaction).where(CreditTransaction.org_id == org_id)

    total = db.execute(count_query).scalar_one()
    offset = (page - 1) * page_size
    transactions = (
        db.execute(base.order_by(CreditTransaction.created_at.desc()).offset(offset).limit(page_size)).scalars().all()
    )

    return transactions, total


# ---------------------------------------------------------------------------
# Cost estimation
# ---------------------------------------------------------------------------


def estimate_campaign_cost(db: Session, campaign: Campaign) -> dict:
    """Calculate pre-launch cost for a campaign.

    Returns a dict with estimation details including whether the org has
    sufficient credits.
    """
    # Count pending interactions (contacts) in this campaign
    total_contacts = db.execute(
        select(func.count())
        .select_from(Interaction)
        .where(
            Interaction.campaign_id == campaign.id,
            Interaction.status == "pending",
        )
    ).scalar_one()

    cost_per = _interaction_cost(campaign.type)
    estimated_total = total_contacts * cost_per

    credit = get_or_create_credit(db, campaign.org_id)

    return {
        "campaign_id": campaign.id,
        "campaign_name": campaign.name,
        "campaign_type": campaign.type,
        "total_contacts": total_contacts,
        "cost_per_interaction": cost_per,
        "estimated_total_cost": estimated_total,
        "current_balance": credit.balance,
        "sufficient_credits": credit.balance >= estimated_total,
    }


# ---------------------------------------------------------------------------
# Credit mutations
# ---------------------------------------------------------------------------


def purchase_credits(
    db: Session,
    org_id: uuid.UUID,
    amount: float,
    description: str | None = None,
) -> CreditTransaction:
    """Add credits to an org's balance (purchase)."""
    credit = get_or_create_credit(db, org_id)

    credit.balance += amount
    credit.total_purchased += amount

    transaction = CreditTransaction(
        org_id=org_id,
        credit_id=credit.id,
        amount=amount,
        type="purchase",
        description=description or f"Credit purchase: {amount}",
    )
    db.add(transaction)
    db.commit()
    db.refresh(credit)
    db.refresh(transaction)

    logger.info("Purchased %.2f credits for org %s (new balance: %.2f)", amount, org_id, credit.balance)
    return transaction


def check_sufficient_credits(db: Session, org_id: uuid.UUID, campaign: Campaign) -> None:
    """Raise InsufficientCreditsError if org can't afford to launch the campaign."""
    total_contacts = db.execute(
        select(func.count())
        .select_from(Interaction)
        .where(
            Interaction.campaign_id == campaign.id,
            Interaction.status == "pending",
        )
    ).scalar_one()

    cost_per = _interaction_cost(campaign.type)
    required = total_contacts * cost_per

    credit = get_or_create_credit(db, org_id)
    if credit.balance < required:
        raise InsufficientCreditsError(required=required, available=credit.balance)


def consume_credits(
    db: Session,
    org_id: uuid.UUID,
    amount: float,
    reference_id: str | None = None,
    description: str | None = None,
) -> CreditTransaction:
    """Deduct credits from an org's balance (consume).

    Called per successful interaction during campaign execution.
    """
    credit = get_or_create_credit(db, org_id)

    credit.balance -= amount
    credit.total_consumed += amount

    transaction = CreditTransaction(
        org_id=org_id,
        credit_id=credit.id,
        amount=-amount,
        type="consume",
        reference_id=reference_id,
        description=description or f"Credit consumed: {amount}",
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return transaction


def refund_credits(
    db: Session,
    org_id: uuid.UUID,
    amount: float,
    reference_id: str | None = None,
    description: str | None = None,
) -> CreditTransaction:
    """Refund credits to an org's balance (failed call that didn't connect)."""
    credit = get_or_create_credit(db, org_id)

    credit.balance += amount
    credit.total_consumed -= amount

    transaction = CreditTransaction(
        org_id=org_id,
        credit_id=credit.id,
        amount=amount,
        type="refund",
        reference_id=reference_id,
        description=description or f"Credit refunded: {amount}",
    )
    db.add(transaction)
    db.commit()

    return transaction
