"""Tests for the in-app notifications system (ra-qdo8).

Covers:
- CRUD endpoints (list, mark-read, mark-all-read, delete)
- Unread count endpoint
- Service-layer auto-generation helpers
- Authentication enforcement
- Pagination and filtering
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.notifications import (
    create_notification,
    delete_notification,
    get_unread_count,
    list_notifications,
    mark_all_as_read,
    mark_as_read,
    notify_campaign_completed,
    notify_campaign_failed,
    notify_credit_balance_low,
    notify_kyc_status_change,
    notify_otp_delivery_failure,
    NotificationNotFound,
)

BASE_URL = "/api/v1/notifications"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_user(db: Session, **overrides) -> User:
    """Insert a user directly into the DB."""
    defaults = {
        "first_name": "Test",
        "last_name": "User",
        "username": f"testuser-{uuid.uuid4().hex[:8]}",
        "email": f"test-{uuid.uuid4().hex[:8]}@example.com",
        "password_hash": hash_password("strongpassword123"),
    }
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_header(user: User) -> dict:
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def _create_notif(db: Session, user: User, **overrides) -> Notification:
    """Create a notification directly in the DB."""
    defaults = {
        "user_id": user.id,
        "title": "Test Notification",
        "message": "This is a test notification.",
        "type": "info",
    }
    defaults.update(overrides)
    return create_notification(db, **defaults)


# ===========================================================================
# Service layer tests
# ===========================================================================


class TestCreateNotification:
    def test_create_basic(self, db: Session):
        user = _create_user(db)
        notif = create_notification(
            db, user_id=user.id, title="Hello", message="World"
        )
        assert notif.id is not None
        assert notif.user_id == user.id
        assert notif.title == "Hello"
        assert notif.message == "World"
        assert notif.type == "info"
        assert notif.is_read is False
        assert notif.created_at is not None

    def test_create_with_type(self, db: Session):
        user = _create_user(db)
        notif = create_notification(
            db, user_id=user.id, title="Error", message="Bad thing", type="error"
        )
        assert notif.type == "error"


class TestListNotifications:
    def test_list_empty(self, db: Session):
        user = _create_user(db)
        items, total = list_notifications(db, user.id)
        assert items == []
        assert total == 0

    def test_list_returns_user_only(self, db: Session):
        user1 = _create_user(db)
        user2 = _create_user(db)
        _create_notif(db, user1, title="For user1")
        _create_notif(db, user2, title="For user2")

        items, total = list_notifications(db, user1.id)
        assert total == 1
        assert items[0].title == "For user1"

    def test_list_ordered_by_created_at_desc(self, db: Session):
        from datetime import datetime, timedelta

        user = _create_user(db)
        base_time = datetime(2026, 1, 1, 12, 0, 0)

        # Create with explicit timestamps to ensure ordering
        for i, title in enumerate(["First", "Second", "Third"]):
            notif = Notification(
                user_id=user.id,
                title=title,
                message="test",
                type="info",
                created_at=base_time + timedelta(minutes=i),
            )
            db.add(notif)
        db.commit()

        items, total = list_notifications(db, user.id)
        assert total == 3
        # Most recent first
        assert items[0].title == "Third"
        assert items[2].title == "First"

    def test_filter_by_is_read(self, db: Session):
        user = _create_user(db)
        _create_notif(db, user, title="Unread")
        n2 = _create_notif(db, user, title="Read")
        mark_as_read(db, n2.id, user.id)

        unread, total_unread = list_notifications(db, user.id, is_read=False)
        assert total_unread == 1
        assert unread[0].title == "Unread"

        read, total_read = list_notifications(db, user.id, is_read=True)
        assert total_read == 1
        assert read[0].title == "Read"

    def test_pagination(self, db: Session):
        user = _create_user(db)
        for i in range(5):
            _create_notif(db, user, title=f"Notif {i}")

        page1, total = list_notifications(db, user.id, page=1, page_size=2)
        assert total == 5
        assert len(page1) == 2

        page3, _ = list_notifications(db, user.id, page=3, page_size=2)
        assert len(page3) == 1


class TestMarkAsRead:
    def test_mark_single_read(self, db: Session):
        user = _create_user(db)
        notif = _create_notif(db, user)
        assert notif.is_read is False

        updated = mark_as_read(db, notif.id, user.id)
        assert updated.is_read is True

    def test_mark_read_not_found(self, db: Session):
        user = _create_user(db)
        with pytest.raises(NotificationNotFound):
            mark_as_read(db, uuid.uuid4(), user.id)

    def test_mark_read_wrong_user(self, db: Session):
        user1 = _create_user(db)
        user2 = _create_user(db)
        notif = _create_notif(db, user1)

        with pytest.raises(NotificationNotFound):
            mark_as_read(db, notif.id, user2.id)


class TestMarkAllAsRead:
    def test_mark_all(self, db: Session):
        user = _create_user(db)
        _create_notif(db, user, title="A")
        _create_notif(db, user, title="B")
        _create_notif(db, user, title="C")

        count = mark_all_as_read(db, user.id)
        assert count == 3
        assert get_unread_count(db, user.id) == 0

    def test_mark_all_only_affects_user(self, db: Session):
        user1 = _create_user(db)
        user2 = _create_user(db)
        _create_notif(db, user1)
        _create_notif(db, user2)

        mark_all_as_read(db, user1.id)
        assert get_unread_count(db, user1.id) == 0
        assert get_unread_count(db, user2.id) == 1

    def test_mark_all_no_unread(self, db: Session):
        user = _create_user(db)
        count = mark_all_as_read(db, user.id)
        assert count == 0


class TestDeleteNotification:
    def test_delete_success(self, db: Session):
        user = _create_user(db)
        notif = _create_notif(db, user)
        delete_notification(db, notif.id, user.id)

        _, total = list_notifications(db, user.id)
        assert total == 0

    def test_delete_not_found(self, db: Session):
        user = _create_user(db)
        with pytest.raises(NotificationNotFound):
            delete_notification(db, uuid.uuid4(), user.id)

    def test_delete_wrong_user(self, db: Session):
        user1 = _create_user(db)
        user2 = _create_user(db)
        notif = _create_notif(db, user1)

        with pytest.raises(NotificationNotFound):
            delete_notification(db, notif.id, user2.id)


class TestUnreadCount:
    def test_count_zero(self, db: Session):
        user = _create_user(db)
        assert get_unread_count(db, user.id) == 0

    def test_count_after_create(self, db: Session):
        user = _create_user(db)
        _create_notif(db, user)
        _create_notif(db, user)
        assert get_unread_count(db, user.id) == 2

    def test_count_after_read(self, db: Session):
        user = _create_user(db)
        n1 = _create_notif(db, user)
        _create_notif(db, user)
        mark_as_read(db, n1.id, user.id)
        assert get_unread_count(db, user.id) == 1


# ===========================================================================
# Auto-generation trigger tests
# ===========================================================================


class TestAutoGenerationTriggers:
    def test_campaign_completed(self, db: Session):
        user = _create_user(db)
        notif = notify_campaign_completed(db, user.id, "My Campaign")
        assert notif.type == "success"
        assert "My Campaign" in notif.message
        assert "completed" in notif.message.lower()

    def test_campaign_failed(self, db: Session):
        user = _create_user(db)
        notif = notify_campaign_failed(db, user.id, "My Campaign", "timeout")
        assert notif.type == "error"
        assert "My Campaign" in notif.message
        assert "timeout" in notif.message

    def test_credit_balance_low(self, db: Session):
        user = _create_user(db)
        notif = notify_credit_balance_low(db, user.id, 5.50)
        assert notif.type == "warning"
        assert "5.50" in notif.message

    def test_kyc_status_verified(self, db: Session):
        user = _create_user(db)
        notif = notify_kyc_status_change(db, user.id, "verified")
        assert notif.type == "success"
        assert "verified" in notif.message

    def test_kyc_status_pending(self, db: Session):
        user = _create_user(db)
        notif = notify_kyc_status_change(db, user.id, "pending")
        assert notif.type == "info"
        assert "pending" in notif.message

    def test_otp_delivery_failure(self, db: Session):
        user = _create_user(db)
        notif = notify_otp_delivery_failure(db, user.id, "+9779812345678", "sms")
        assert notif.type == "error"
        assert "+9779812345678" in notif.message
        assert "sms" in notif.message


# ===========================================================================
# Endpoint tests
# ===========================================================================


class TestListEndpoint:
    def test_list_empty(self, client: TestClient, db: Session):
        user = _create_user(db)
        resp = client.get(BASE_URL, headers=_auth_header(user))
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 20

    def test_list_with_notifications(self, client: TestClient, db: Session):
        user = _create_user(db)
        _create_notif(db, user, title="N1")
        _create_notif(db, user, title="N2")

        resp = client.get(BASE_URL, headers=_auth_header(user))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_list_filter_is_read(self, client: TestClient, db: Session):
        user = _create_user(db)
        _create_notif(db, user, title="Unread")
        n2 = _create_notif(db, user, title="Read")
        mark_as_read(db, n2.id, user.id)

        resp = client.get(
            BASE_URL, headers=_auth_header(user), params={"is_read": "false"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "Unread"

    def test_list_pagination(self, client: TestClient, db: Session):
        user = _create_user(db)
        for i in range(5):
            _create_notif(db, user, title=f"N{i}")

        resp = client.get(
            BASE_URL,
            headers=_auth_header(user),
            params={"page": 2, "page_size": 2},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 2

    def test_list_no_auth(self, client: TestClient):
        resp = client.get(BASE_URL)
        assert resp.status_code in (401, 403)

    def test_list_other_user_not_visible(self, client: TestClient, db: Session):
        user1 = _create_user(db)
        user2 = _create_user(db)
        _create_notif(db, user1, title="User1 only")

        resp = client.get(BASE_URL, headers=_auth_header(user2))
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestMarkReadEndpoint:
    def test_mark_read(self, client: TestClient, db: Session):
        user = _create_user(db)
        notif = _create_notif(db, user)

        resp = client.patch(
            f"{BASE_URL}/{notif.id}/read", headers=_auth_header(user)
        )
        assert resp.status_code == 200
        assert resp.json()["is_read"] is True

    def test_mark_read_not_found(self, client: TestClient, db: Session):
        user = _create_user(db)
        resp = client.patch(
            f"{BASE_URL}/{uuid.uuid4()}/read", headers=_auth_header(user)
        )
        assert resp.status_code == 404

    def test_mark_read_wrong_user(self, client: TestClient, db: Session):
        user1 = _create_user(db)
        user2 = _create_user(db)
        notif = _create_notif(db, user1)

        resp = client.patch(
            f"{BASE_URL}/{notif.id}/read", headers=_auth_header(user2)
        )
        assert resp.status_code == 404

    def test_mark_read_no_auth(self, client: TestClient, db: Session):
        user = _create_user(db)
        notif = _create_notif(db, user)
        resp = client.patch(f"{BASE_URL}/{notif.id}/read")
        assert resp.status_code in (401, 403)


class TestMarkAllReadEndpoint:
    def test_mark_all_read(self, client: TestClient, db: Session):
        user = _create_user(db)
        _create_notif(db, user)
        _create_notif(db, user)

        resp = client.patch(f"{BASE_URL}/read-all", headers=_auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["updated"] == 2

    def test_mark_all_read_none_unread(self, client: TestClient, db: Session):
        user = _create_user(db)
        resp = client.patch(f"{BASE_URL}/read-all", headers=_auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["updated"] == 0

    def test_mark_all_read_no_auth(self, client: TestClient):
        resp = client.patch(f"{BASE_URL}/read-all")
        assert resp.status_code in (401, 403)


class TestDeleteEndpoint:
    def test_delete(self, client: TestClient, db: Session):
        user = _create_user(db)
        notif = _create_notif(db, user)

        resp = client.delete(
            f"{BASE_URL}/{notif.id}", headers=_auth_header(user)
        )
        assert resp.status_code == 204

        # Verify it's gone
        resp = client.get(BASE_URL, headers=_auth_header(user))
        assert resp.json()["total"] == 0

    def test_delete_not_found(self, client: TestClient, db: Session):
        user = _create_user(db)
        resp = client.delete(
            f"{BASE_URL}/{uuid.uuid4()}", headers=_auth_header(user)
        )
        assert resp.status_code == 404

    def test_delete_wrong_user(self, client: TestClient, db: Session):
        user1 = _create_user(db)
        user2 = _create_user(db)
        notif = _create_notif(db, user1)

        resp = client.delete(
            f"{BASE_URL}/{notif.id}", headers=_auth_header(user2)
        )
        assert resp.status_code == 404

    def test_delete_no_auth(self, client: TestClient, db: Session):
        user = _create_user(db)
        notif = _create_notif(db, user)
        resp = client.delete(f"{BASE_URL}/{notif.id}")
        assert resp.status_code in (401, 403)


class TestUnreadCountEndpoint:
    def test_unread_count_zero(self, client: TestClient, db: Session):
        user = _create_user(db)
        resp = client.get(
            f"{BASE_URL}/unread-count", headers=_auth_header(user)
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 0

    def test_unread_count_with_notifications(self, client: TestClient, db: Session):
        user = _create_user(db)
        _create_notif(db, user)
        _create_notif(db, user)

        resp = client.get(
            f"{BASE_URL}/unread-count", headers=_auth_header(user)
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 2

    def test_unread_count_after_mark_read(self, client: TestClient, db: Session):
        user = _create_user(db)
        n1 = _create_notif(db, user)
        _create_notif(db, user)
        mark_as_read(db, n1.id, user.id)

        resp = client.get(
            f"{BASE_URL}/unread-count", headers=_auth_header(user)
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 1

    def test_unread_count_no_auth(self, client: TestClient):
        resp = client.get(f"{BASE_URL}/unread-count")
        assert resp.status_code in (401, 403)


class TestSSEStream:
    def test_stream_requires_auth(self, client: TestClient):
        resp = client.get(f"{BASE_URL}/stream")
        assert resp.status_code in (401, 403)
