import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import get_admin_user, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.kyc import (
    KYCAdminVerifyRequest,
    KYCAdminVerifyResponse,
    KYCStatusResponse,
    KYCSubmitResponse,
)
from app.services.kyc import (
    KYCAlreadySubmittedError,
    KYCError,
    KYCFileValidationError,
    KYCInvalidStateError,
    KYCNotFoundError,
    admin_verify_kyc,
    get_latest_kyc,
    submit_kyc,
)

router = APIRouter()


@router.post("/kyc/submit", response_model=KYCSubmitResponse, status_code=201)
async def kyc_submit(
    document_type: str = Form(...),
    document_front: UploadFile = ...,
    document_back: UploadFile = ...,
    selfie: UploadFile = ...,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit KYC documents for verification.

    Accepts multipart form data with:
    - document_type: citizenship, passport, or driving_license
    - document_front: Front image of the document
    - document_back: Back image of the document
    - selfie: Selfie photo for identity matching
    """
    try:
        kyc = await submit_kyc(
            db,
            current_user,
            document_type,
            document_front,
            document_back,
            selfie,
        )
    except KYCAlreadySubmittedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except KYCFileValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except KYCError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return KYCSubmitResponse(id=kyc.id, status=kyc.status)


@router.get("/kyc/status", response_model=KYCStatusResponse | None)
def kyc_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current KYC verification status for the authenticated user."""
    kyc = get_latest_kyc(db, current_user.id)
    if kyc is None:
        return None
    return KYCStatusResponse(
        id=kyc.id,
        status=kyc.status,
        document_type=kyc.document_type,
        submitted_at=kyc.submitted_at,
        verified_at=kyc.verified_at,
        rejection_reason=kyc.rejection_reason,
    )


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

admin_router = APIRouter()


@admin_router.put("/kyc/{kyc_id}/verify", response_model=KYCAdminVerifyResponse)
def admin_kyc_verify(
    kyc_id: uuid.UUID,
    body: KYCAdminVerifyRequest,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Admin approve or reject a KYC submission."""
    try:
        kyc = admin_verify_kyc(db, kyc_id, body.action, body.rejection_reason)
    except KYCNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except KYCInvalidStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except KYCError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    action_msg = "approved" if body.action == "approve" else "rejected"
    return KYCAdminVerifyResponse(
        id=kyc.id,
        status=kyc.status,
        message=f"KYC {action_msg} successfully",
    )
