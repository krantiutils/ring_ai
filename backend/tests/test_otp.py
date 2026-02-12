"""Tests for OTP service — generation, delivery, and API endpoints."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import OTPRecord
from app.services.otp import (
    OTPDeliveryError,
    OTPValidationError,
    generate_otp,
)


# ---------------------------------------------------------------------------
# OTP generation tests
# ---------------------------------------------------------------------------


class TestGenerateOTP:
    def test_default_length(self):
        otp = generate_otp()
        assert len(otp) == 6
        assert otp.isdigit()

    def test_custom_length(self):
        for length in (4, 5, 7, 8, 10):
            otp = generate_otp(length)
            assert len(otp) == length
            assert otp.isdigit()

    def test_zero_padded(self):
        """OTP should be zero-padded to the requested length."""
        # Run enough times that we'd expect at least one leading-zero case
        seen_leading_zero = False
        for _ in range(1000):
            otp = generate_otp(6)
            assert len(otp) == 6
            if otp[0] == "0":
                seen_leading_zero = True
                break
        # Statistically very likely to see a leading zero in 1000 tries
        # but don't hard-assert in case of extreme (un)luck — just verify format
        assert all(len(generate_otp(6)) == 6 for _ in range(10))

    def test_invalid_length_too_short(self):
        with pytest.raises(OTPValidationError):
            generate_otp(3)

    def test_invalid_length_too_long(self):
        with pytest.raises(OTPValidationError):
            generate_otp(11)

    def test_uniqueness(self):
        """Multiple generations should produce varied results."""
        otps = {generate_otp(6) for _ in range(100)}
        # At least some variety (statistically near-certain)
        assert len(otps) > 1


# ---------------------------------------------------------------------------
# OTP send endpoint tests — SMS (text)
# ---------------------------------------------------------------------------


class TestSendOTPText:
    @patch("app.api.v1.endpoints.otp.send_otp_sms")
    def test_send_generated_otp_via_text(self, mock_send_sms, client, db, org):
        mock_send_sms.return_value = "SM-test-123"

        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "Your OTP is {otp}. Do not share.",
                "sms_send_options": "text",
                "otp_options": "generated",
                "otp_length": 6,
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "sent"
        assert len(data["otp"]) == 6
        assert data["otp"].isdigit()
        assert data["id"] is not None

        # Verify SMS was called with {otp} replaced
        mock_send_sms.assert_called_once()
        call_kwargs = mock_send_sms.call_args
        message_body = call_kwargs.kwargs.get("message_body") or call_kwargs[1].get("message_body") or call_kwargs[0][1]
        assert "{otp}" not in message_body
        assert data["otp"] in message_body

        # Verify DB record created
        record = db.query(OTPRecord).first()
        assert record is not None
        assert record.phone_number == "+9779812345678"
        assert record.otp_options == "generated"
        assert record.sms_send_options == "text"
        assert "{otp}" not in record.message

    @patch("app.api.v1.endpoints.otp.send_otp_sms")
    def test_send_personnel_otp_via_text(self, mock_send_sms, client, db, org):
        mock_send_sms.return_value = "SM-test-456"

        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "Your code is {otp}.",
                "sms_send_options": "text",
                "otp_options": "personnel",
                "otp": "1234",
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["otp"] == "1234"

        # Verify the message has the custom OTP substituted
        record = db.query(OTPRecord).first()
        assert record.otp == "1234"
        assert "1234" in record.message

    def test_personnel_otp_missing_value(self, client, org):
        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "Your OTP is {otp}.",
                "sms_send_options": "text",
                "otp_options": "personnel",
                # otp is missing
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 422
        assert "otp field is required" in response.json()["detail"]

    @patch("app.api.v1.endpoints.otp.send_otp_sms")
    def test_send_otp_custom_length(self, mock_send_sms, client, org):
        mock_send_sms.return_value = "SM-test-789"

        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "OTP: {otp}",
                "sms_send_options": "text",
                "otp_options": "generated",
                "otp_length": 8,
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 201
        assert len(response.json()["otp"]) == 8


# ---------------------------------------------------------------------------
# OTP send endpoint tests — Voice
# ---------------------------------------------------------------------------


class TestSendOTPVoice:
    @patch("app.api.v1.endpoints.otp.send_otp_voice")
    def test_send_otp_via_voice(self, mock_send_voice, client, db, org):
        mock_send_voice.return_value = "CA-test-voice-1"

        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "तपाईंको OTP {otp} हो।",
                "sms_send_options": "voice",
                "otp_options": "generated",
                "voice_input": 1,
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "sent"
        assert "voice" in data["message"]

        # Verify voice delivery was called
        mock_send_voice.assert_called_once()

        # Verify DB record
        record = db.query(OTPRecord).first()
        assert record.sms_send_options == "voice"
        assert record.voice_input == 1

    def test_voice_missing_voice_input(self, client, org):
        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "OTP: {otp}",
                "sms_send_options": "voice",
                "otp_options": "generated",
                # voice_input is missing
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 422
        assert "voice_input is required" in response.json()["detail"]

    @patch("app.api.v1.endpoints.otp.send_otp_voice")
    def test_voice_delivery_failure(self, mock_send_voice, client, org):
        mock_send_voice.side_effect = OTPDeliveryError(
            "voice", "TTS synthesis failed"
        )

        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "OTP: {otp}",
                "sms_send_options": "voice",
                "otp_options": "generated",
                "voice_input": 1,
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 502

    @patch("app.api.v1.endpoints.otp.send_otp_sms")
    def test_sms_delivery_failure(self, mock_send_sms, client, org):
        mock_send_sms.side_effect = OTPDeliveryError(
            "text", "Twilio error"
        )

        response = client.post(
            "/api/v1/otp/send",
            json={
                "number": "+9779812345678",
                "message": "OTP: {otp}",
                "sms_send_options": "text",
                "otp_options": "generated",
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 502


# ---------------------------------------------------------------------------
# OTP list endpoint tests
# ---------------------------------------------------------------------------


class TestListOTPs:
    def test_list_empty(self, client):
        response = client.get("/api/v1/otp/list")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 20

    def test_list_with_records(self, client, db, org):
        # Create some OTP records directly
        for i in range(3):
            record = OTPRecord(
                org_id=org.id,
                phone_number=f"+977981234567{i}",
                message=f"OTP is {100000 + i}",
                otp=str(100000 + i),
                otp_options="generated",
                sms_send_options="text",
            )
            db.add(record)
        db.commit()

        response = client.get("/api/v1/otp/list")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

        # Verify record structure
        item = data["items"][0]
        assert "id" in item
        assert "phone_number" in item
        assert "message" in item
        assert "otp" in item
        assert "otp_options" in item
        assert "sms_send_options" in item
        assert "created_at" in item

    def test_list_pagination(self, client, db, org):
        # Create 5 records
        for i in range(5):
            record = OTPRecord(
                org_id=org.id,
                phone_number=f"+977981234567{i}",
                message=f"OTP is {100000 + i}",
                otp=str(100000 + i),
                otp_options="generated",
                sms_send_options="text",
            )
            db.add(record)
        db.commit()

        # Page 1 with page_size=2
        response = client.get("/api/v1/otp/list?page=1&page_size=2")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 2

        # Page 3 with page_size=2
        response = client.get("/api/v1/otp/list?page=3&page_size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1  # 5th record

    def test_list_invalid_page(self, client):
        response = client.get("/api/v1/otp/list?page=0")
        assert response.status_code == 422

    def test_list_invalid_page_size(self, client):
        response = client.get("/api/v1/otp/list?page_size=0")
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# OTP model tests
# ---------------------------------------------------------------------------


class TestOTPModel:
    def test_create_otp_record(self, db, org):
        record = OTPRecord(
            org_id=org.id,
            phone_number="+9779812345678",
            message="Your OTP is 123456",
            otp="123456",
            otp_options="generated",
            sms_send_options="text",
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        assert record.id is not None
        assert record.phone_number == "+9779812345678"
        assert record.otp == "123456"
        assert record.otp_options == "generated"
        assert record.sms_send_options == "text"
        assert record.voice_input is None
        assert record.created_at is not None

    def test_create_voice_otp_record(self, db, org):
        record = OTPRecord(
            org_id=org.id,
            phone_number="+9779812345678",
            message="तपाईंको OTP 654321 हो।",
            otp="654321",
            otp_options="personnel",
            sms_send_options="voice",
            voice_input=1,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        assert record.sms_send_options == "voice"
        assert record.voice_input == 1
        assert record.otp_options == "personnel"

    def test_repr(self, db, org):
        record = OTPRecord(
            org_id=org.id,
            phone_number="+9779812345678",
            message="test",
            otp="123456",
            otp_options="generated",
            sms_send_options="text",
        )
        assert "+9779812345678" in repr(record)
        assert "text" in repr(record)


# ---------------------------------------------------------------------------
# OTP exception tests
# ---------------------------------------------------------------------------


class TestOTPExceptions:
    def test_delivery_error(self):
        err = OTPDeliveryError("text", "network timeout")
        assert "text" in str(err)
        assert "network timeout" in str(err)
        assert err.method == "text"
        assert err.detail == "network timeout"

    def test_validation_error(self):
        err = OTPValidationError("bad length")
        assert "bad length" in str(err)
