"""Notification endpoints — CRUD, mark-read, unread count, and SSE stream."""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notifications import (
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)
from app.services.notifications import (
    NotificationNotFound,
    delete_notification,
    get_unread_count,
    list_notifications,
    mark_all_as_read,
    mark_as_read,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("/", response_model=NotificationListResponse)
def list_notifications_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_read: bool | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List notifications for the current user, with optional read-status filter."""
    notifications, total = list_notifications(
        db,
        current_user.id,
        is_read=is_read,
        page=page,
        page_size=page_size,
    )
    return NotificationListResponse(
        items=notifications,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a single notification as read."""
    try:
        notification = mark_as_read(db, notification_id, current_user.id)
    except NotificationNotFound:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@router.patch("/read-all", response_model=dict)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read for the current user."""
    count = mark_all_as_read(db, current_user.id)
    return {"updated": count}


@router.delete("/{notification_id}", status_code=204)
def delete_notification_endpoint(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a notification."""
    try:
        delete_notification(db, notification_id, current_user.id)
    except NotificationNotFound:
        raise HTTPException(status_code=404, detail="Notification not found")


# ---------------------------------------------------------------------------
# Unread count
# ---------------------------------------------------------------------------


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the count of unread notifications for the current user."""
    count = get_unread_count(db, current_user.id)
    return UnreadCountResponse(unread_count=count)


# ---------------------------------------------------------------------------
# SSE stream
# ---------------------------------------------------------------------------


@router.get("/stream")
async def notification_stream(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Server-Sent Events endpoint for real-time notification push.

    The client connects and receives new notifications as SSE events.
    Uses a polling approach against the database (checks every 2 seconds
    for notifications created after the last check).
    """

    async def event_generator():
        # Track the latest notification we've seen to only send new ones
        last_seen = db.execute(
            select(Notification.created_at)
            .where(Notification.user_id == current_user.id)
            .order_by(Notification.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        # Send initial unread count as the first event
        count = get_unread_count(db, current_user.id)
        yield f"event: unread_count\ndata: {json.dumps({'unread_count': count})}\n\n"

        while True:
            if await request.is_disconnected():
                break

            # Poll for new notifications since last_seen
            query = (
                select(Notification)
                .where(Notification.user_id == current_user.id)
                .order_by(Notification.created_at.asc())
            )
            if last_seen is not None:
                query = query.where(Notification.created_at > last_seen)

            new_notifications = db.execute(query).scalars().all()

            for notif in new_notifications:
                data = {
                    "id": str(notif.id),
                    "title": notif.title,
                    "message": notif.message,
                    "type": notif.type,
                    "is_read": notif.is_read,
                    "created_at": notif.created_at.isoformat(),
                }
                yield f"event: notification\ndata: {json.dumps(data)}\n\n"
                last_seen = notif.created_at

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
