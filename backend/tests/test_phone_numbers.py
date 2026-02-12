"""Tests for phone number management API endpoints."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.models import Organization, PhoneNumber


class TestListActivePhones:
    """GET /api/v1/phone-numbers/active"""

    def test_empty_list(self, client: TestClient, org_id: uuid.UUID):
        resp = client.get(f"/api/v1/phone-numbers/active?org_id={org_id}")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_active_phones(self, client: TestClient, db, org: Organization):
        phone1 = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=True, is_broker=False
        )
        phone2 = PhoneNumber(
            phone_number="+9779876543", org_id=org.id, is_active=True, is_broker=True
        )
        # Inactive phone should NOT appear
        phone3 = PhoneNumber(
            phone_number="+9770000000", org_id=org.id, is_active=False, is_broker=False
        )
        db.add_all([phone1, phone2, phone3])
        db.commit()

        resp = client.get(f"/api/v1/phone-numbers/active?org_id={org.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        numbers = {p["phone_number"] for p in data}
        assert numbers == {"+9771234567", "+9779876543"}

    def test_scoped_to_org(self, client: TestClient, db, org: Organization):
        other_org = Organization(name="Other Org")
        db.add(other_org)
        db.commit()
        db.refresh(other_org)

        phone_mine = PhoneNumber(
            phone_number="+9771111111", org_id=org.id, is_active=True
        )
        phone_other = PhoneNumber(
            phone_number="+9772222222", org_id=other_org.id, is_active=True
        )
        db.add_all([phone_mine, phone_other])
        db.commit()

        resp = client.get(f"/api/v1/phone-numbers/active?org_id={org.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["phone_number"] == "+9771111111"

    def test_missing_org_id_param(self, client: TestClient):
        resp = client.get("/api/v1/phone-numbers/active")
        assert resp.status_code == 422


class TestListBrokerPhones:
    """GET /api/v1/phone-numbers/broker"""

    def test_empty_list(self, client: TestClient, org_id: uuid.UUID):
        resp = client.get(f"/api/v1/phone-numbers/broker?org_id={org_id}")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_only_broker_phones(
        self, client: TestClient, db, org: Organization
    ):
        broker = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=True, is_broker=True
        )
        non_broker = PhoneNumber(
            phone_number="+9779876543", org_id=org.id, is_active=True, is_broker=False
        )
        db.add_all([broker, non_broker])
        db.commit()

        resp = client.get(f"/api/v1/phone-numbers/broker?org_id={org.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["phone_number"] == "+9771234567"

    def test_excludes_inactive_brokers(
        self, client: TestClient, db, org: Organization
    ):
        inactive_broker = PhoneNumber(
            phone_number="+9771234567",
            org_id=org.id,
            is_active=False,
            is_broker=True,
        )
        db.add(inactive_broker)
        db.commit()

        resp = client.get(f"/api/v1/phone-numbers/broker?org_id={org.id}")
        assert resp.status_code == 200
        assert resp.json() == []


class TestCreatePhoneNumber:
    """POST /api/v1/phone-numbers/"""

    def test_create_active_phone(self, client: TestClient, org_id: uuid.UUID):
        resp = client.post(
            "/api/v1/phone-numbers/",
            json={"phone_number": "+9771234567", "org_id": str(org_id)},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["phone_number"] == "+9771234567"
        assert data["org_id"] == str(org_id)
        assert data["is_active"] is True
        assert data["is_broker"] is False
        assert "id" in data
        assert "created_at" in data

    def test_create_broker_phone(self, client: TestClient, org_id: uuid.UUID):
        resp = client.post(
            "/api/v1/phone-numbers/",
            json={
                "phone_number": "+9771234567",
                "org_id": str(org_id),
                "is_broker": True,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_broker"] is True
        assert data["is_active"] is True

    def test_duplicate_active_phone_rejected(
        self, client: TestClient, db, org: Organization
    ):
        existing = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=True
        )
        db.add(existing)
        db.commit()

        resp = client.post(
            "/api/v1/phone-numbers/",
            json={"phone_number": "+9771234567", "org_id": str(org.id)},
        )
        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"]

    def test_duplicate_inactive_phone_allowed(
        self, client: TestClient, db, org: Organization
    ):
        """Re-registering a deactivated number should work."""
        existing = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=False
        )
        db.add(existing)
        db.commit()

        resp = client.post(
            "/api/v1/phone-numbers/",
            json={"phone_number": "+9771234567", "org_id": str(org.id)},
        )
        assert resp.status_code == 201

    def test_same_number_different_org_allowed(
        self, client: TestClient, db, org: Organization
    ):
        other_org = Organization(name="Other Org")
        db.add(other_org)
        db.commit()
        db.refresh(other_org)

        existing = PhoneNumber(
            phone_number="+9771234567", org_id=other_org.id, is_active=True
        )
        db.add(existing)
        db.commit()

        resp = client.post(
            "/api/v1/phone-numbers/",
            json={"phone_number": "+9771234567", "org_id": str(org.id)},
        )
        assert resp.status_code == 201

    def test_empty_phone_number_rejected(
        self, client: TestClient, org_id: uuid.UUID
    ):
        resp = client.post(
            "/api/v1/phone-numbers/",
            json={"phone_number": "", "org_id": str(org_id)},
        )
        assert resp.status_code == 422


class TestDeactivatePhoneNumber:
    """DELETE /api/v1/phone-numbers/{phone_id}"""

    def test_deactivate_phone(self, client: TestClient, db, org: Organization):
        phone = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=True
        )
        db.add(phone)
        db.commit()
        db.refresh(phone)

        resp = client.delete(f"/api/v1/phone-numbers/{phone.id}")
        assert resp.status_code == 204

        # Verify it's deactivated
        db.refresh(phone)
        assert phone.is_active is False

    def test_deactivate_not_found(self, client: TestClient):
        fake_id = uuid.uuid4()
        resp = client.delete(f"/api/v1/phone-numbers/{fake_id}")
        assert resp.status_code == 404

    def test_deactivate_already_inactive(
        self, client: TestClient, db, org: Organization
    ):
        phone = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=False
        )
        db.add(phone)
        db.commit()
        db.refresh(phone)

        resp = client.delete(f"/api/v1/phone-numbers/{phone.id}")
        assert resp.status_code == 409
        assert "already deactivated" in resp.json()["detail"]

    def test_deactivated_phone_not_in_active_list(
        self, client: TestClient, db, org: Organization
    ):
        phone = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=True
        )
        db.add(phone)
        db.commit()
        db.refresh(phone)

        # Deactivate
        resp = client.delete(f"/api/v1/phone-numbers/{phone.id}")
        assert resp.status_code == 204

        # Should not appear in active list
        resp = client.get(f"/api/v1/phone-numbers/active?org_id={org.id}")
        assert resp.status_code == 200
        assert resp.json() == []


class TestPhoneNumberModel:
    """Direct model tests for PhoneNumber."""

    def test_create_phone_number(self, db, org: Organization):
        phone = PhoneNumber(
            phone_number="+9771234567",
            org_id=org.id,
            is_active=True,
            is_broker=True,
        )
        db.add(phone)
        db.commit()
        db.refresh(phone)

        assert phone.id is not None
        assert phone.phone_number == "+9771234567"
        assert phone.org_id == org.id
        assert phone.is_active is True
        assert phone.is_broker is True
        assert phone.created_at is not None

    def test_repr(self, db, org: Organization):
        phone = PhoneNumber(
            phone_number="+9771234567",
            org_id=org.id,
            is_active=True,
            is_broker=True,
        )
        db.add(phone)
        db.commit()
        db.refresh(phone)
        assert "active" in repr(phone)
        assert "broker" in repr(phone)

    def test_organization_relationship(self, db, org: Organization):
        phone = PhoneNumber(
            phone_number="+9771234567", org_id=org.id, is_active=True
        )
        db.add(phone)
        db.commit()
        db.refresh(org)

        assert len(org.phone_numbers) == 1
        assert org.phone_numbers[0].phone_number == "+9771234567"


class TestBrokerPhoneResolution:
    """Test that the voice endpoint resolves broker phones correctly."""

    def test_voice_call_uses_broker_phone_when_no_from_number(
        self, client: TestClient, db, org: Organization
    ):
        """When no from_number is provided, the voice endpoint should
        use the org's broker phone number."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.models import Template
        from app.services.telephony.models import CallResult, CallStatus

        # Create a broker phone for the org
        broker = PhoneNumber(
            phone_number="+9779999999",
            org_id=org.id,
            is_active=True,
            is_broker=True,
        )
        db.add(broker)

        # Create a voice template
        template = Template(
            name="Test Voice",
            type="voice",
            language="ne",
            content="Hello {name}",
            org_id=org.id,
        )
        db.add(template)
        db.commit()
        db.refresh(template)

        mock_provider = MagicMock()
        mock_provider.default_from_number = ""
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(call_id="CA_test", status=CallStatus.INITIATED)
        )

        mock_tts_result = MagicMock()
        mock_tts_result.audio_bytes = b"fake-audio"

        with (
            patch(
                "app.api.v1.endpoints.voice.get_twilio_provider",
                return_value=mock_provider,
            ),
            patch(
                "app.api.v1.endpoints.voice.tts_router.synthesize",
                new_callable=AsyncMock,
                return_value=mock_tts_result,
            ),
            patch(
                "app.api.v1.endpoints.voice.settings",
                TWILIO_BASE_URL="http://example.com",
            ),
        ):
            resp = client.post(
                "/api/v1/voice/campaign-call",
                json={
                    "to": "+9771111111",
                    "template_id": str(template.id),
                    "variables": {"name": "Test"},
                },
            )
            assert resp.status_code == 201

            # Verify broker phone was used as from_number
            call_args = mock_provider.initiate_call.call_args
            assert call_args.kwargs["from_number"] == "+9779999999"
