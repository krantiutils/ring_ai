import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.kyc_verification import KYCVerification
from app.models.user import User

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class KYCError(Exception):
    """Base exception for KYC operations."""


class KYCAlreadySubmittedError(KYCError):
    """Raised when user already has a pending or verified KYC."""


class KYCNotFoundError(KYCError):
    """Raised when KYC record is not found."""


class KYCInvalidStateError(KYCError):
    """Raised when KYC is in a state that doesn't allow the requested action."""


class KYCFileValidationError(KYCError):
    """Raised when uploaded file fails validation."""


def _validate_upload(file: UploadFile, label: str) -> None:
    """Validate a single uploaded file."""
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise KYCFileValidationError(
            f"{label}: Invalid file type '{file.content_type}'. Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}"
        )
    if file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext and ext not in ALLOWED_EXTENSIONS:
            raise KYCFileValidationError(
                f"{label}: Invalid file extension '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )


async def _save_file(file: UploadFile, user_id: uuid.UUID, category: str) -> str:
    """Save an uploaded file to disk and return the relative path."""
    upload_dir = Path(settings.KYC_UPLOAD_DIR) / str(user_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = ""
    if file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
    if not ext:
        ext = ".jpg"

    filename = f"{category}_{uuid.uuid4().hex}{ext}"
    file_path = upload_dir / filename

    max_bytes = settings.KYC_MAX_FILE_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise KYCFileValidationError(
            f"{category}: File too large ({len(content)} bytes). Maximum: {settings.KYC_MAX_FILE_SIZE_MB} MB"
        )
    if not content:
        raise KYCFileValidationError(f"{category}: Uploaded file is empty")

    file_path.write_bytes(content)
    return str(file_path)


def get_latest_kyc(db: Session, user_id: uuid.UUID) -> KYCVerification | None:
    """Get the most recent KYC submission for a user."""
    return (
        db.query(KYCVerification)
        .filter(KYCVerification.user_id == user_id)
        .order_by(KYCVerification.created_at.desc())
        .first()
    )


def get_kyc_by_id(db: Session, kyc_id: uuid.UUID) -> KYCVerification | None:
    """Get a KYC record by its ID."""
    return db.query(KYCVerification).filter(KYCVerification.id == kyc_id).first()


async def submit_kyc(
    db: Session,
    user: User,
    document_type: str,
    document_front: UploadFile,
    document_back: UploadFile,
    selfie: UploadFile,
) -> KYCVerification:
    """Submit KYC documents for verification."""
    if document_type not in KYCVerification.VALID_DOCUMENT_TYPES:
        raise KYCError(
            f"Invalid document type '{document_type}'. "
            f"Allowed: {', '.join(sorted(KYCVerification.VALID_DOCUMENT_TYPES))}"
        )

    existing = get_latest_kyc(db, user.id)
    if existing and existing.status in (
        KYCVerification.STATUS_PENDING,
        KYCVerification.STATUS_SUBMITTED,
        KYCVerification.STATUS_VERIFIED,
    ):
        raise KYCAlreadySubmittedError(f"KYC already {existing.status}. Cannot submit again.")

    _validate_upload(document_front, "document_front")
    _validate_upload(document_back, "document_back")
    _validate_upload(selfie, "selfie")

    front_path = await _save_file(document_front, user.id, "front")
    back_path = await _save_file(document_back, user.id, "back")
    selfie_path = await _save_file(selfie, user.id, "selfie")

    kyc = KYCVerification(
        user_id=user.id,
        status=KYCVerification.STATUS_SUBMITTED,
        document_type=document_type,
        document_front_url=front_path,
        document_back_url=back_path,
        selfie_url=selfie_path,
    )
    db.add(kyc)
    db.commit()
    db.refresh(kyc)
    return kyc


def admin_verify_kyc(
    db: Session,
    kyc_id: uuid.UUID,
    action: str,
    rejection_reason: str | None = None,
) -> KYCVerification:
    """Admin approve or reject a KYC submission."""
    kyc = get_kyc_by_id(db, kyc_id)
    if kyc is None:
        raise KYCNotFoundError("KYC record not found")

    if kyc.status != KYCVerification.STATUS_SUBMITTED:
        raise KYCInvalidStateError(f"KYC is '{kyc.status}', can only verify submissions with status 'submitted'")

    if action == "approve":
        kyc.status = KYCVerification.STATUS_VERIFIED
        kyc.verified_at = datetime.now(timezone.utc)
        kyc.rejection_reason = None
        # Update the user's KYC verification flag
        user = db.query(User).filter(User.id == kyc.user_id).one()
        user.is_kyc_verified = True
    elif action == "reject":
        if not rejection_reason:
            raise KYCError("Rejection reason is required when rejecting KYC")
        kyc.status = KYCVerification.STATUS_REJECTED
        kyc.rejection_reason = rejection_reason
    else:
        raise KYCError(f"Invalid action '{action}'. Must be 'approve' or 'reject'.")

    db.commit()
    db.refresh(kyc)
    return kyc
