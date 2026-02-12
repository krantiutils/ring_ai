"""Tests for credit system — balance, estimation, deduction, and history."""

import io
import uuid

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.credit import Credit
from app.models.credit_transaction import CreditTransaction
from app.models.interaction import Interaction
from app.services.credits import (
    InsufficientCreditsError,
    check_sufficient_credits,
    consume_credits,
    estimate_campaign_cost,
    get_balance,
    get_or_create_credit,
    get_transaction_history,
    purchase_credits,
    refund_credits,
)

NONEXISTENT_UUID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_csv(rows: list[list[str]], header: list[str] | None = None) -> bytes:
    buf = io.StringIO()
    if header is None:
        header = ["phone", "name"]
    buf.write(",".join(header) + "\n")
    for row in rows:
        buf.write(",".join(row) + "\n")
    return buf.getvalue().encode("utf-8")


def _upload_csv(client, campaign_id, csv_bytes):
    return client.post(
        f"/api/v1/campaigns/{campaign_id}/contacts",
        files={"file": ("contacts.csv", csv_bytes, "text/csv")},
    )


def _create_campaign(client, org_id, **overrides):
    payload = {
        "name": "Test Campaign",
        "type": "voice",
        "org_id": str(org_id),
        **overrides,
    }
    resp = client.post("/api/v1/campaigns/", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _campaign_with_contacts(db, org, num_contacts=2):
    """Create a draft campaign with contacts and pending interactions directly."""
    campaign = Campaign(
        name="Credit Test Campaign",
        type="voice",
        org_id=org.id,
        status="draft",
    )
    db.add(campaign)
    db.flush()

    for i in range(num_contacts):
        contact = Contact(phone=f"+977980123456{i}", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)

    db.commit()
    return campaign


# ---------------------------------------------------------------------------
# Credit service — get_or_create_credit
# ---------------------------------------------------------------------------


class TestGetOrCreateCredit:
    def test_creates_credit_if_absent(self, db, org):
        credit = get_or_create_credit(db, org.id)
        assert credit is not None
        assert credit.org_id == org.id
        assert credit.balance == 0.0
        assert credit.total_purchased == 0.0
        assert credit.total_consumed == 0.0

    def test_returns_existing_credit(self, db, org):
        credit1 = get_or_create_credit(db, org.id)
        db.commit()
        credit2 = get_or_create_credit(db, org.id)
        assert credit1.id == credit2.id

    def test_different_orgs_get_different_credits(self, db, org):
        from app.models.organization import Organization

        org2 = Organization(name="Other Org")
        db.add(org2)
        db.commit()

        c1 = get_or_create_credit(db, org.id)
        c2 = get_or_create_credit(db, org2.id)
        assert c1.id != c2.id


# ---------------------------------------------------------------------------
# Credit service — purchase
# ---------------------------------------------------------------------------


class TestPurchaseCredits:
    def test_purchase_increases_balance(self, db, org):
        tx = purchase_credits(db, org.id, 100.0, "Initial purchase")
        assert tx.type == "purchase"
        assert tx.amount == 100.0

        credit = get_balance(db, org.id)
        assert credit.balance == 100.0
        assert credit.total_purchased == 100.0

    def test_multiple_purchases_accumulate(self, db, org):
        purchase_credits(db, org.id, 50.0)
        purchase_credits(db, org.id, 75.0)

        credit = get_balance(db, org.id)
        assert credit.balance == 125.0
        assert credit.total_purchased == 125.0

    def test_purchase_creates_transaction(self, db, org):
        purchase_credits(db, org.id, 200.0, "Bulk purchase")

        transactions, total = get_transaction_history(db, org.id)
        assert total == 1
        assert transactions[0].type == "purchase"
        assert transactions[0].amount == 200.0
        assert transactions[0].description == "Bulk purchase"


# ---------------------------------------------------------------------------
# Credit service — consume
# ---------------------------------------------------------------------------


class TestConsumeCredits:
    def test_consume_decreases_balance(self, db, org):
        purchase_credits(db, org.id, 100.0)
        consume_credits(db, org.id, 10.0, reference_id="test-ref")

        credit = get_balance(db, org.id)
        assert credit.balance == 90.0
        assert credit.total_consumed == 10.0

    def test_consume_transaction_has_negative_amount(self, db, org):
        purchase_credits(db, org.id, 100.0)
        tx = consume_credits(db, org.id, 5.0)

        assert tx.type == "consume"
        assert tx.amount == -5.0

    def test_consume_with_reference(self, db, org):
        purchase_credits(db, org.id, 100.0)
        tx = consume_credits(
            db, org.id, 2.0,
            reference_id="interaction-123",
            description="Voice call",
        )
        assert tx.reference_id == "interaction-123"
        assert tx.description == "Voice call"


# ---------------------------------------------------------------------------
# Credit service — refund
# ---------------------------------------------------------------------------


class TestRefundCredits:
    def test_refund_restores_balance(self, db, org):
        purchase_credits(db, org.id, 100.0)
        consume_credits(db, org.id, 10.0)
        refund_credits(db, org.id, 10.0, description="Failed call refund")

        credit = get_balance(db, org.id)
        assert credit.balance == 100.0
        assert credit.total_consumed == 0.0

    def test_refund_creates_transaction(self, db, org):
        purchase_credits(db, org.id, 100.0)
        consume_credits(db, org.id, 10.0)
        tx = refund_credits(db, org.id, 10.0, reference_id="failed-call")

        assert tx.type == "refund"
        assert tx.amount == 10.0
        assert tx.reference_id == "failed-call"


# ---------------------------------------------------------------------------
# Credit service — estimation
# ---------------------------------------------------------------------------


class TestEstimateCampaignCost:
    def test_estimate_voice_campaign(self, db, org):
        campaign = _campaign_with_contacts(db, org, num_contacts=5)
        # Ensure org has some credits
        purchase_credits(db, org.id, 100.0)

        estimate = estimate_campaign_cost(db, campaign)
        assert estimate["campaign_id"] == campaign.id
        assert estimate["total_contacts"] == 5
        assert estimate["cost_per_interaction"] == 2.0  # voice rate
        assert estimate["estimated_total_cost"] == 10.0
        assert estimate["current_balance"] == 100.0
        assert estimate["sufficient_credits"] is True

    def test_estimate_insufficient_credits(self, db, org):
        campaign = _campaign_with_contacts(db, org, num_contacts=5)
        # Only 5 credits, need 10
        purchase_credits(db, org.id, 5.0)

        estimate = estimate_campaign_cost(db, campaign)
        assert estimate["sufficient_credits"] is False
        assert estimate["estimated_total_cost"] == 10.0
        assert estimate["current_balance"] == 5.0

    def test_estimate_zero_contacts(self, db, org):
        campaign = Campaign(
            name="Empty", type="voice", org_id=org.id, status="draft"
        )
        db.add(campaign)
        db.commit()

        estimate = estimate_campaign_cost(db, campaign)
        assert estimate["total_contacts"] == 0
        assert estimate["estimated_total_cost"] == 0.0
        assert estimate["sufficient_credits"] is True

    def test_estimate_text_campaign_rate(self, db, org):
        campaign = Campaign(
            name="SMS Campaign", type="text", org_id=org.id, status="draft"
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779801234567", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="sms",
            status="pending",
        )
        db.add(interaction)
        db.commit()

        purchase_credits(db, org.id, 100.0)
        estimate = estimate_campaign_cost(db, campaign)
        assert estimate["cost_per_interaction"] == 0.5
        assert estimate["estimated_total_cost"] == 0.5


# ---------------------------------------------------------------------------
# Credit service — balance check
# ---------------------------------------------------------------------------


class TestCheckSufficientCredits:
    def test_sufficient_credits_passes(self, db, org):
        campaign = _campaign_with_contacts(db, org, num_contacts=2)
        purchase_credits(db, org.id, 100.0)

        # Should not raise
        check_sufficient_credits(db, org.id, campaign)

    def test_insufficient_credits_raises(self, db, org):
        campaign = _campaign_with_contacts(db, org, num_contacts=5)
        purchase_credits(db, org.id, 1.0)

        with pytest.raises(InsufficientCreditsError) as exc_info:
            check_sufficient_credits(db, org.id, campaign)

        assert exc_info.value.required == 10.0
        assert exc_info.value.available == 1.0

    def test_zero_balance_raises(self, db, org):
        campaign = _campaign_with_contacts(db, org, num_contacts=1)

        with pytest.raises(InsufficientCreditsError):
            check_sufficient_credits(db, org.id, campaign)

    def test_exact_balance_passes(self, db, org):
        campaign = _campaign_with_contacts(db, org, num_contacts=2)
        # Need exactly 4.0 credits (2 contacts * 2.0 per voice call)
        purchase_credits(db, org.id, 4.0)

        check_sufficient_credits(db, org.id, campaign)


# ---------------------------------------------------------------------------
# Transaction history
# ---------------------------------------------------------------------------


class TestTransactionHistory:
    def test_empty_history(self, db, org):
        transactions, total = get_transaction_history(db, org.id)
        assert total == 0
        assert transactions == []

    def test_history_returns_all_transactions(self, db, org):
        purchase_credits(db, org.id, 100.0, "First")
        consume_credits(db, org.id, 10.0, description="Second")
        refund_credits(db, org.id, 5.0, description="Third")

        transactions, total = get_transaction_history(db, org.id)
        assert total == 3
        types = {t.type for t in transactions}
        assert types == {"purchase", "consume", "refund"}

    def test_history_pagination(self, db, org):
        for i in range(5):
            purchase_credits(db, org.id, 10.0, f"Purchase {i}")

        transactions, total = get_transaction_history(db, org.id, page=1, page_size=2)
        assert total == 5
        assert len(transactions) == 2

        transactions2, _ = get_transaction_history(db, org.id, page=3, page_size=2)
        assert len(transactions2) == 1


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


class TestCreditBalanceAPI:
    def test_get_balance_new_org(self, client, org_id):
        resp = client.get(f"/api/v1/credits/balance?org_id={org_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["balance"] == 0.0
        assert data["total_purchased"] == 0.0
        assert data["total_consumed"] == 0.0
        assert data["org_id"] == str(org_id)

    def test_get_balance_after_purchase(self, client, org_id, db):
        purchase_credits(db, org_id, 500.0)

        resp = client.get(f"/api/v1/credits/balance?org_id={org_id}")
        assert resp.status_code == 200
        assert resp.json()["balance"] == 500.0


class TestCreditHistoryAPI:
    def test_empty_history(self, client, org_id):
        resp = client.get(f"/api/v1/credits/history?org_id={org_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_history_with_transactions(self, client, org_id, db):
        purchase_credits(db, org_id, 100.0, "Test purchase")
        consume_credits(db, org_id, 5.0, description="Test consume")

        resp = client.get(f"/api/v1/credits/history?org_id={org_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_history_pagination(self, client, org_id, db):
        for i in range(5):
            purchase_credits(db, org_id, 10.0, f"Purchase {i}")

        resp = client.get(
            f"/api/v1/credits/history?org_id={org_id}&page=1&page_size=2"
        )
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 2


class TestCreditPurchaseAPI:
    def test_purchase_credits(self, client, org_id):
        resp = client.post(
            "/api/v1/credits/purchase",
            json={
                "org_id": str(org_id),
                "amount": 100.0,
                "description": "Test purchase",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "purchase"
        assert data["amount"] == 100.0
        assert data["description"] == "Test purchase"

    def test_purchase_zero_rejected(self, client, org_id):
        resp = client.post(
            "/api/v1/credits/purchase",
            json={"org_id": str(org_id), "amount": 0},
        )
        assert resp.status_code == 422

    def test_purchase_negative_rejected(self, client, org_id):
        resp = client.post(
            "/api/v1/credits/purchase",
            json={"org_id": str(org_id), "amount": -10.0},
        )
        assert resp.status_code == 422


class TestCostEstimationAPI:
    def test_estimate_campaign(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
            ["+9779801234569", "Hari"],
        ])
        _upload_csv(client, created["id"], csv_bytes)

        # Add some credits
        purchase_credits(db, org_id, 100.0)

        resp = client.post(
            f"/api/v1/credits/campaigns/{created['id']}/estimate"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_contacts"] == 3
        assert data["cost_per_interaction"] == 2.0
        assert data["estimated_total_cost"] == 6.0
        assert data["current_balance"] == 100.0
        assert data["sufficient_credits"] is True

    def test_estimate_campaign_not_found(self, client):
        resp = client.post(
            f"/api/v1/credits/campaigns/{NONEXISTENT_UUID}/estimate"
        )
        assert resp.status_code == 404

    def test_estimate_insufficient_credits(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
        _upload_csv(client, created["id"], csv_bytes)

        # No credits purchased — balance is 0
        resp = client.post(
            f"/api/v1/credits/campaigns/{created['id']}/estimate"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sufficient_credits"] is False
        assert data["estimated_total_cost"] == 4.0
        assert data["current_balance"] == 0.0


# ---------------------------------------------------------------------------
# Campaign start — credit check integration
# ---------------------------------------------------------------------------


class TestCampaignStartCreditCheck:
    def _campaign_with_contacts_via_api(self, client, org_id):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
        _upload_csv(client, created["id"], csv_bytes)
        return created

    def test_start_with_sufficient_credits(self, client, org_id, db):
        created = self._campaign_with_contacts_via_api(client, org_id)
        purchase_credits(db, org_id, 100.0)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_start_with_insufficient_credits(self, client, org_id):
        created = self._campaign_with_contacts_via_api(client, org_id)
        # No credits — should reject

        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 402
        detail = resp.json()["detail"]
        assert detail["required"] == 4.0
        assert detail["available"] == 0.0

    def test_start_with_exact_credits(self, client, org_id, db):
        created = self._campaign_with_contacts_via_api(client, org_id)
        # Need 4.0 credits (2 contacts * 2.0 per voice call)
        purchase_credits(db, org_id, 4.0)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
