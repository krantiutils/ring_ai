"""Phone number management API — active and broker phone endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.phone_number import PhoneNumber
from app.schemas.phone_numbers import (
    PhoneNumberCreate,
    PhoneNumberDetailResponse,
    PhoneNumberResponse,
)

router = APIRouter()


@router.get("/active", response_model=list[PhoneNumberResponse])
def list_active_phones(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """List active phone numbers for an organization."""
    phones = (
        db.execute(
            select(PhoneNumber).where(
                PhoneNumber.org_id == org_id,
                PhoneNumber.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    return phones


@router.get("/broker", response_model=list[PhoneNumberResponse])
def list_broker_phones(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """List broker (outbound caller ID) phone numbers for an organization."""
    phones = (
        db.execute(
            select(PhoneNumber).where(
                PhoneNumber.org_id == org_id,
                PhoneNumber.is_active.is_(True),
                PhoneNumber.is_broker.is_(True),
            )
        )
        .scalars()
        .all()
    )
    return phones


@router.post("/", response_model=PhoneNumberDetailResponse, status_code=201)
def create_phone_number(
    payload: PhoneNumberCreate,
    db: Session = Depends(get_db),
):
    """Register a new phone number for an organization."""
    # Check for duplicate active phone number in the same org
    existing = db.execute(
        select(PhoneNumber).where(
            PhoneNumber.org_id == payload.org_id,
            PhoneNumber.phone_number == payload.phone_number,
            PhoneNumber.is_active.is_(True),
        )
    ).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Phone number {payload.phone_number} is already registered and active for this organization",
        )

    phone = PhoneNumber(
        phone_number=payload.phone_number,
        org_id=payload.org_id,
        is_broker=payload.is_broker,
        is_active=True,
    )
    db.add(phone)
    db.commit()
    db.refresh(phone)
    return phone


@router.delete("/{phone_id}", status_code=204)
def deactivate_phone_number(
    phone_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Deactivate a phone number (soft delete)."""
    phone = db.get(PhoneNumber, phone_id)
    if phone is None:
        raise HTTPException(status_code=404, detail="Phone number not found")

    if not phone.is_active:
        raise HTTPException(status_code=409, detail="Phone number is already deactivated")

    phone.is_active = False
    db.commit()
