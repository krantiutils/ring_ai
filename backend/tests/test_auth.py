import time

import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.models.user import User
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    hash_password,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
API_KEYS_GEN_URL = "/api/v1/auth/api-keys/generate"
API_KEYS_URL = "/api/v1/auth/api-keys"
PROFILE_URL = "/api/v1/auth/user-profile"


def _register_payload(**overrides):
    base = {
        "first_name": "Test",
        "last_name": "User",
        "username": "testuser",
        "email": "test@example.com",
        "phone": "+9779800000000",
        "password": "strongpassword123",
    }
    base.update(overrides)
    return base


def _create_test_user(db, **overrides):
    """Insert a user directly into the DB and return it."""
    defaults = {
        "first_name": "Test",
        "last_name": "User",
        "username": "testuser",
        "email": "test@example.com",
        "phone": "+9779800000000",
        "password_hash": hash_password("strongpassword123"),
    }
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# Registration tests
# ===========================================================================


class TestRegister:
    def test_register_success(self, client: TestClient):
        resp = client.post(REGISTER_URL, json=_register_payload())
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert "id" in data

    def test_register_duplicate_email(self, client: TestClient):
        client.post(REGISTER_URL, json=_register_payload())
        resp = client.post(
            REGISTER_URL,
            json=_register_payload(username="other"),
        )
        assert resp.status_code == 409
        assert "Email already registered" in resp.json()["detail"]

    def test_register_duplicate_username(self, client: TestClient):
        client.post(REGISTER_URL, json=_register_payload())
        resp = client.post(
            REGISTER_URL,
            json=_register_payload(email="other@example.com"),
        )
        assert resp.status_code == 409
        assert "Username already taken" in resp.json()["detail"]

    def test_register_short_password(self, client: TestClient):
        resp = client.post(REGISTER_URL, json=_register_payload(password="short"))
        assert resp.status_code == 422

    def test_register_missing_fields(self, client: TestClient):
        resp = client.post(REGISTER_URL, json={"email": "x@x.com"})
        assert resp.status_code == 422

    def test_register_email_case_insensitive(self, client: TestClient):
        client.post(REGISTER_URL, json=_register_payload())
        resp = client.post(
            REGISTER_URL,
            json=_register_payload(username="other", email="TEST@example.com"),
        )
        assert resp.status_code == 409


# ===========================================================================
# Login tests
# ===========================================================================


class TestLogin:
    def test_login_success(self, client: TestClient, db):
        _create_test_user(db)
        resp = client.post(
            LOGIN_URL,
            json={"email": "test@example.com", "password": "strongpassword123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        # Refresh token should be set as HttpOnly cookie
        assert "refresh_token" in resp.cookies

    def test_login_wrong_password(self, client: TestClient, db):
        _create_test_user(db)
        resp = client.post(
            LOGIN_URL,
            json={"email": "test@example.com", "password": "wrongpassword"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client: TestClient):
        resp = client.post(
            LOGIN_URL,
            json={"email": "nobody@example.com", "password": "whatever"},
        )
        assert resp.status_code == 401

    def test_login_inactive_user(self, client: TestClient, db):
        _create_test_user(db, is_active=False)
        resp = client.post(
            LOGIN_URL,
            json={"email": "test@example.com", "password": "strongpassword123"},
        )
        assert resp.status_code == 403

    def test_login_returns_valid_jwt(self, client: TestClient, db):
        user = _create_test_user(db)
        resp = client.post(
            LOGIN_URL,
            json={"email": "test@example.com", "password": "strongpassword123"},
        )
        token = resp.json()["access_token"]
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert payload["sub"] == str(user.id)
        assert payload["type"] == "access"


# ===========================================================================
# Refresh tests
# ===========================================================================


class TestRefresh:
    def test_refresh_success(self, client: TestClient, db):
        _create_test_user(db)
        # Login first to get refresh cookie
        client.post(
            LOGIN_URL,
            json={"email": "test@example.com", "password": "strongpassword123"},
        )
        # The TestClient carries cookies automatically
        resp = client.post(REFRESH_URL)
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_no_cookie(self, client: TestClient):
        resp = client.post(REFRESH_URL)
        assert resp.status_code == 401
        assert "Refresh token missing" in resp.json()["detail"]

    def test_refresh_expired_token(self, client: TestClient, db):
        user = _create_test_user(db)
        # Create an already-expired refresh token
        expired_payload = {
            "sub": str(user.id),
            "exp": time.time() - 10,
            "type": "refresh",
        }
        expired_token = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        client.cookies.set("refresh_token", expired_token)
        resp = client.post(REFRESH_URL)
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    def test_refresh_with_access_token_type_rejected(self, client: TestClient, db):
        user = _create_test_user(db)
        access_token = create_access_token(user.id)
        client.cookies.set("refresh_token", access_token)
        resp = client.post(REFRESH_URL)
        assert resp.status_code == 401
        assert "Invalid token type" in resp.json()["detail"]


# ===========================================================================
# User profile tests
# ===========================================================================


class TestUserProfile:
    def test_get_profile(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = client.get(PROFILE_URL, headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["first_name"] == "Test"
        assert data["is_verified"] is False

    def test_get_profile_no_auth(self, client: TestClient):
        resp = client.get(PROFILE_URL)
        assert resp.status_code in (401, 403)

    def test_get_profile_invalid_token(self, client: TestClient):
        resp = client.get(PROFILE_URL, headers=_auth_header("garbage"))
        assert resp.status_code == 401

    def test_get_profile_expired_token(self, client: TestClient, db):
        user = _create_test_user(db)
        expired_payload = {
            "sub": str(user.id),
            "exp": time.time() - 10,
            "type": "access",
        }
        expired_token = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        resp = client.get(PROFILE_URL, headers=_auth_header(expired_token))
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    def test_get_profile_deleted_user(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        # Delete the user
        db.delete(user)
        db.commit()
        resp = client.get(PROFILE_URL, headers=_auth_header(token))
        assert resp.status_code == 401


# ===========================================================================
# API key tests
# ===========================================================================


class TestAPIKeys:
    def test_generate_api_key(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = client.post(API_KEYS_GEN_URL, headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["api_key"].startswith("rai_")
        assert "Store it securely" in data["message"]

    def test_get_api_key_metadata(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        # Generate first
        gen_resp = client.post(API_KEYS_GEN_URL, headers=_auth_header(token))
        raw_key = gen_resp.json()["api_key"]
        # Fetch metadata
        resp = client.get(API_KEYS_URL, headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["key_prefix"] == raw_key[:8]
        assert "created_at" in data

    def test_get_api_key_none_exists(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        resp = client.get(API_KEYS_URL, headers=_auth_header(token))
        assert resp.status_code == 200
        assert resp.json() is None

    def test_generate_revokes_previous(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        # Generate two keys — first should be soft-deleted
        resp1 = client.post(API_KEYS_GEN_URL, headers=_auth_header(token))
        first_key = resp1.json()["api_key"]
        resp2 = client.post(API_KEYS_GEN_URL, headers=_auth_header(token))
        second_key = resp2.json()["api_key"]

        # First key should no longer authenticate
        resp = client.get(PROFILE_URL, headers=_auth_header(first_key))
        assert resp.status_code == 401

        # Second key should work
        resp = client.get(PROFILE_URL, headers=_auth_header(second_key))
        assert resp.status_code == 200

    def test_api_key_auth(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        gen_resp = client.post(API_KEYS_GEN_URL, headers=_auth_header(token))
        api_key = gen_resp.json()["api_key"]
        # Use API key to access protected endpoint
        resp = client.get(PROFILE_URL, headers=_auth_header(api_key))
        assert resp.status_code == 200
        assert resp.json()["email"] == "test@example.com"

    def test_invalid_api_key(self, client: TestClient):
        resp = client.get(PROFILE_URL, headers=_auth_header("rai_bogus_key_value"))
        assert resp.status_code == 401

    def test_api_key_no_auth(self, client: TestClient):
        resp = client.post(API_KEYS_GEN_URL)
        assert resp.status_code in (401, 403)


# ===========================================================================
# Token type confusion tests
# ===========================================================================


class TestTokenTypeSafety:
    def test_refresh_token_cannot_access_protected_endpoints(self, client: TestClient, db):
        user = _create_test_user(db)
        refresh_token = create_refresh_token(user.id)
        resp = client.get(PROFILE_URL, headers=_auth_header(refresh_token))
        assert resp.status_code == 401
        assert "Invalid token type" in resp.json()["detail"]

    def test_access_token_cannot_refresh(self, client: TestClient, db):
        user = _create_test_user(db)
        access_token = create_access_token(user.id)
        client.cookies.set("refresh_token", access_token)
        resp = client.post(REFRESH_URL)
        assert resp.status_code == 401


# ===========================================================================
# Edge cases
# ===========================================================================


class TestEdgeCases:
    def test_token_with_bad_user_id(self, client: TestClient):
        payload = {
            "sub": "not-a-uuid",
            "exp": time.time() + 3600,
            "type": "access",
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        resp = client.get(PROFILE_URL, headers=_auth_header(token))
        assert resp.status_code == 401

    def test_token_with_missing_sub(self, client: TestClient):
        payload = {
            "exp": time.time() + 3600,
            "type": "access",
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        resp = client.get(PROFILE_URL, headers=_auth_header(token))
        assert resp.status_code == 401

    def test_token_with_wrong_secret(self, client: TestClient, db):
        user = _create_test_user(db)
        payload = {
            "sub": str(user.id),
            "exp": time.time() + 3600,
            "type": "access",
        }
        token = jwt.encode(payload, "wrong-secret", algorithm="HS256")
        resp = client.get(PROFILE_URL, headers=_auth_header(token))
        assert resp.status_code == 401

    def test_inactive_user_api_key_rejected(self, client: TestClient, db):
        user = _create_test_user(db)
        token = create_access_token(user.id)
        gen_resp = client.post(API_KEYS_GEN_URL, headers=_auth_header(token))
        api_key = gen_resp.json()["api_key"]
        # Deactivate the user
        user.is_active = False
        db.commit()
        resp = client.get(PROFILE_URL, headers=_auth_header(api_key))
        assert resp.status_code == 403
