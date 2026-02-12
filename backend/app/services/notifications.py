"""Notification service — creation, queries, and auto-generation triggers."""

import logging
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification

logger = logging.getLogger(__name__)


class NotificationError(Exception):
    """Base exception for notification operations."""


class NotificationNotFound(NotificationError):
    """Raised when a notification is not found."""


def create_notification(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str,
    message: str,
    type: str = "info",
) -> Notification:
    """Create and persist a new notification.

    Args:
        db: Database session.
        user_id: Target user.
        title: Short notification title.
        message: Notification body text.
        type: One of info, warning, success, error.

    Returns:
        The created Notification record.
    """
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    logger.info(
        "Notification created: id=%s user=%s type=%s title=%s",
        notification.id,
        user_id,
        type,
        title,
    )
    return notification


def get_notification(
    db: Session, notification_id: uuid.UUID, user_id: uuid.UUID
) -> Notification:
    """Fetch a single notification belonging to a user.

    Raises NotificationNotFound if not found or not owned by user.
    """
    notification = db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    ).scalar_one_or_none()
    if notification is None:
        raise NotificationNotFound(
            f"Notification {notification_id} not found for user {user_id}"
        )
    return notification


def list_notifications(
    db: Session,
    user_id: uuid.UUID,
    *,
    is_read: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Notification], int]:
    """List notifications for a user with optional read-status filter.

    Returns (notifications, total_count).
    """
    base = select(Notification).where(Notification.user_id == user_id)
    count_base = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id)
    )

    if is_read is not None:
        base = base.where(Notification.is_read == is_read)
        count_base = count_base.where(Notification.is_read == is_read)

    total = db.execute(count_base).scalar_one()
    offset = (page - 1) * page_size
    notifications = (
        db.execute(
            base.order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return notifications, total


def mark_as_read(
    db: Session, notification_id: uuid.UUID, user_id: uuid.UUID
) -> Notification:
    """Mark a single notification as read.

    Raises NotificationNotFound if not found.
    """
    notification = get_notification(db, notification_id, user_id)
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


def mark_all_as_read(db: Session, user_id: uuid.UUID) -> int:
    """Mark all unread notifications for a user as read.

    Returns the number of notifications updated.
    """
    result = db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    db.commit()
    count = result.rowcount
    logger.info("Marked %d notifications as read for user %s", count, user_id)
    return count


def delete_notification(
    db: Session, notification_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """Delete a notification.

    Raises NotificationNotFound if not found.
    """
    notification = get_notification(db, notification_id, user_id)
    db.delete(notification)
    db.commit()
    logger.info("Deleted notification %s for user %s", notification_id, user_id)


def get_unread_count(db: Session, user_id: uuid.UUID) -> int:
    """Get the count of unread notifications for a user."""
    count = db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
    ).scalar_one()
    return count


# ---------------------------------------------------------------------------
# Auto-generation helpers
# ---------------------------------------------------------------------------
# These functions create notifications for specific system events.
# Call them from the relevant service or endpoint when an event occurs.


def notify_campaign_completed(
    db: Session, user_id: uuid.UUID, campaign_name: str
) -> Notification:
    """Create a notification when a campaign completes successfully."""
    return create_notification(
        db,
        user_id=user_id,
        title="Campaign Completed",
        message=f'Your campaign "{campaign_name}" has been completed successfully.',
        type="success",
    )


def notify_campaign_failed(
    db: Session, user_id: uuid.UUID, campaign_name: str, reason: str
) -> Notification:
    """Create a notification when a campaign fails."""
    return create_notification(
        db,
        user_id=user_id,
        title="Campaign Failed",
        message=f'Your campaign "{campaign_name}" has failed: {reason}',
        type="error",
    )


def notify_credit_balance_low(
    db: Session, user_id: uuid.UUID, balance: float
) -> Notification:
    """Create a notification when credit balance drops below threshold."""
    return create_notification(
        db,
        user_id=user_id,
        title="Low Credit Balance",
        message=f"Your credit balance is low ({balance:.2f}). Please top up to continue services.",
        type="warning",
    )


def notify_kyc_status_change(
    db: Session, user_id: uuid.UUID, new_status: str
) -> Notification:
    """Create a notification when KYC verification status changes."""
    type_ = "success" if new_status == "verified" else "info"
    return create_notification(
        db,
        user_id=user_id,
        title="KYC Status Updated",
        message=f"Your KYC verification status has been updated to: {new_status}.",
        type=type_,
    )


def notify_otp_delivery_failure(
    db: Session, user_id: uuid.UUID, phone_number: str, method: str
) -> Notification:
    """Create a notification when OTP delivery fails."""
    return create_notification(
        db,
        user_id=user_id,
        title="OTP Delivery Failed",
        message=f"Failed to deliver OTP via {method} to {phone_number}. Please check the number and try again.",
        type="error",
    )
