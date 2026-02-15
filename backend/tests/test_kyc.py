import io
import uuid

from fastapi.testclient import TestClient

from app.models.kyc_verification import KYCVerification
from app.models.user import User
from app.services.auth import create_access_token, hash_password

# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------

KYC_SUBMIT_URL = "/api/v1/auth/kyc/submit"
KYC_STATUS_URL = "/api/v1/auth/kyc/status"
ADMIN_KYC_VERIFY_URL = "/api/v1/admin/kyc/{kyc_id}/verify"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_test_user(db, **overrides) -> User:
    defaults = {
        "first_name": "Test",
        "last_name": "User",
        "username": "kycuser",
        "email": "kyc@example.com",
        "phone": "+9779800000000",
        "password_hash": hash_password("strongpassword123"),
    }
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_admin_user(db) -> User:
    user = User(
        first_name="Admin",
        last_name="User",
        username="adminuser",
        email="admin@example.com",
        password_hash=hash_password("adminpassword123"),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _fake_image(name: str = "doc.jpg", content: bytes = b"\xff\xd8\xff" + b"x" * 100) -> tuple:
    """Create a fake JPEG-like upload tuple for TestClient."""
    return (name, io.BytesIO(content), "image/jpeg")


def _submit_kyc(client: TestClient, token: str, document_type: str = "passport") -> dict:
    """Helper to submit KYC with default files."""
    resp = client.post(
        KYC_SUBMIT_URL,
        headers=_auth_header(token),
        data={"document_type": document_type},
        files={
            "document_front": _fake_image("front.jpg"),
            "document_back": _fake_image("back.jpg"),
            "selfie": _fake_image("selfie.jpg"),
        },
    )
    return resp


def _create_submitted_kyc(db, user: User) -> KYCVerification:
    """Insert a submitted KYC record directly into the DB."""
    kyc = KYCVerification(
        user_id=user.id,
        status=KYCVerification.STATUS_SUBMITTED,
        document_type="passport",
        document_front_url="/fake/front.jpg",
        document_back_url="/fake/back.jpg",
        selfie_url="/fake/selfie.jpg",
    )
    db.add(kyc)
    db.commit()
    db.refresh(kyc)
    return kyc


# ===========================================================================
# KYC Submit tests
# ===========================================================================


class TestKYCSubmit:
    def test_submit_success(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = _submit_kyc(client, token)
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "submitted"
        assert "id" in data

    def test_submit_no_auth(self, client: TestClient):
        resp = client.post(
            KYC_SUBMIT_URL,
            data={"document_type": "passport"},
            files={
                "document_front": _fake_image(),
                "document_back": _fake_image(),
                "selfie": _fake_image(),
            },
        )
        assert resp.status_code in (401, 403)

    def test_submit_invalid_document_type(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = client.post(
            KYC_SUBMIT_URL,
            headers=_auth_header(token),
            data={"document_type": "invalid_type"},
            files={
                "document_front": _fake_image(),
                "document_back": _fake_image(),
                "selfie": _fake_image(),
            },
        )
        assert resp.status_code == 400
        assert "invalid_type" in resp.json()["detail"].lower() or "Invalid" in resp.json()["detail"]

    def test_submit_all_valid_document_types(self, client: TestClient, db):
        """Each valid document type should succeed."""
        for i, doc_type in enumerate(["citizenship", "passport", "driving_license"]):
            user = _create_test_user(
                db,
                username=f"user_{doc_type}",
                email=f"{doc_type}@example.com",
            )
            token = create_access_token(user.id)
            resp = _submit_kyc(client, token, document_type=doc_type)
            assert resp.status_code == 201, f"Failed for {doc_type}: {resp.json()}"

    def test_submit_duplicate_rejected(self, client: TestClient, db):
        """Cannot submit KYC when one is already submitted/pending."""
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp1 = _submit_kyc(client, token)
        assert resp1.status_code == 201

        resp2 = _submit_kyc(client, token)
        assert resp2.status_code == 409

    def test_submit_after_rejection_allowed(self, client: TestClient, db):
        """User can re-submit after a previous KYC was rejected."""
        user = _create_test_user(db)
        kyc = _create_submitted_kyc(db, user)
        kyc.status = KYCVerification.STATUS_REJECTED
        kyc.rejection_reason = "Blurry document"
        db.commit()

        token = create_access_token(user.id)
        resp = _submit_kyc(client, token)
        assert resp.status_code == 201

    def test_submit_empty_file(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = client.post(
            KYC_SUBMIT_URL,
            headers=_auth_header(token),
            data={"document_type": "passport"},
            files={
                "document_front": ("front.jpg", io.BytesIO(b""), "image/jpeg"),
                "document_back": _fake_image(),
                "selfie": _fake_image(),
            },
        )
        assert resp.status_code == 422
        assert "empty" in resp.json()["detail"].lower()


# ===========================================================================
# KYC Status tests
# ===========================================================================


class TestKYCStatus:
    def test_status_no_kyc(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = client.get(KYC_STATUS_URL, headers=_auth_header(token))
        assert resp.status_code == 200
        assert resp.json() is None

    def test_status_after_submit(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        _submit_kyc(client, token)
        resp = client.get(KYC_STATUS_URL, headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "submitted"
        assert data["document_type"] == "passport"
        assert data["verified_at"] is None
        assert data["rejection_reason"] is None

    def test_status_no_auth(self, client: TestClient):
        resp = client.get(KYC_STATUS_URL)
        assert resp.status_code in (401, 403)


# ===========================================================================
# Admin KYC Verify tests
# ===========================================================================


class TestAdminKYCVerify:
    def test_approve_success(self, client: TestClient, db):
        user = _create_test_user(db)
        admin = _create_admin_user(db)
        kyc = _create_submitted_kyc(db, user)

        admin_token = create_access_token(admin.id)
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            headers=_auth_header(admin_token),
            json={"action": "approve"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "verified"
        assert "approved" in data["message"]

        # Verify user's is_kyc_verified flag was set
        db.refresh(user)
        assert user.is_kyc_verified is True

    def test_reject_success(self, client: TestClient, db):
        user = _create_test_user(db)
        admin = _create_admin_user(db)
        kyc = _create_submitted_kyc(db, user)

        admin_token = create_access_token(admin.id)
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            headers=_auth_header(admin_token),
            json={"action": "reject", "rejection_reason": "Document is blurry"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "rejected"

        # Verify user's is_kyc_verified flag was NOT set
        db.refresh(user)
        assert user.is_kyc_verified is False

    def test_reject_without_reason_fails(self, client: TestClient, db):
        user = _create_test_user(db)
        admin = _create_admin_user(db)
        kyc = _create_submitted_kyc(db, user)

        admin_token = create_access_token(admin.id)
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            headers=_auth_header(admin_token),
            json={"action": "reject"},
        )
        assert resp.status_code == 400

    def test_non_admin_forbidden(self, client: TestClient, db):
        user = _create_test_user(db)
        kyc = _create_submitted_kyc(db, user)

        user_token = create_access_token(user.id)
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            headers=_auth_header(user_token),
            json={"action": "approve"},
        )
        assert resp.status_code == 403
        assert "admin" in resp.json()["detail"].lower()

    def test_verify_nonexistent_kyc(self, client: TestClient, db):
        admin = _create_admin_user(db)
        admin_token = create_access_token(admin.id)
        fake_id = uuid.uuid4()
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=fake_id),
            headers=_auth_header(admin_token),
            json={"action": "approve"},
        )
        assert resp.status_code == 404

    def test_verify_already_verified(self, client: TestClient, db):
        user = _create_test_user(db)
        admin = _create_admin_user(db)
        kyc = _create_submitted_kyc(db, user)
        kyc.status = KYCVerification.STATUS_VERIFIED
        db.commit()

        admin_token = create_access_token(admin.id)
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            headers=_auth_header(admin_token),
            json={"action": "approve"},
        )
        assert resp.status_code == 409

    def test_invalid_action(self, client: TestClient, db):
        user = _create_test_user(db)
        admin = _create_admin_user(db)
        kyc = _create_submitted_kyc(db, user)

        admin_token = create_access_token(admin.id)
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            headers=_auth_header(admin_token),
            json={"action": "banana"},
        )
        assert resp.status_code == 400

    def test_no_auth(self, client: TestClient, db):
        user = _create_test_user(db)
        kyc = _create_submitted_kyc(db, user)
        resp = client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            json={"action": "approve"},
        )
        assert resp.status_code in (401, 403)


# ===========================================================================
# User profile KYC flag tests
# ===========================================================================


class TestUserProfileKYCFlag:
    def test_profile_shows_kyc_not_verified_by_default(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = client.get("/api/v1/auth/user-profile", headers=_auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["is_kyc_verified"] is False

    def test_profile_shows_kyc_verified_after_approval(self, client: TestClient, db):
        user = _create_test_user(db)
        admin = _create_admin_user(db)
        kyc = _create_submitted_kyc(db, user)

        admin_token = create_access_token(admin.id)
        client.put(
            ADMIN_KYC_VERIFY_URL.format(kyc_id=kyc.id),
            headers=_auth_header(admin_token),
            json={"action": "approve"},
        )

        user_token = create_access_token(user.id)
        resp = client.get("/api/v1/auth/user-profile", headers=_auth_header(user_token))
        assert resp.status_code == 200
        assert resp.json()["is_kyc_verified"] is True
