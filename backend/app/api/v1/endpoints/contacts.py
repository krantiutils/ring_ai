"""Standalone contact management API — CRUD + attribute editing + template rendering."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.template import Template
from app.schemas.contacts import (
    ContactAttributesResponse,
    ContactAttributesUpdate,
    ContactDetailResponse,
    ContactUpdate,
)
from app.services.campaigns import detect_carrier
from app.services.templates import UndefinedVariableError, render

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_contact_or_404(contact_id: uuid.UUID, db: Session) -> Contact:
    contact = db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


def _contact_to_detail(contact: Contact) -> ContactDetailResponse:
    """Map a Contact ORM object to the detail response, renaming metadata_ → attributes."""
    attrs = contact.metadata_ if contact.metadata_ is not None else None
    # Ensure all values are strings (metadata JSONB may store mixed types)
    if attrs is not None:
        attrs = {k: str(v) for k, v in attrs.items()}
    return ContactDetailResponse(
        id=contact.id,
        org_id=contact.org_id,
        phone=contact.phone,
        name=contact.name,
        carrier=contact.carrier,
        attributes=attrs,
        created_at=contact.created_at,
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("/{contact_id}", response_model=ContactDetailResponse)
def get_contact(contact_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get a single contact by ID."""
    contact = _get_contact_or_404(contact_id, db)
    return _contact_to_detail(contact)


@router.patch("/{contact_id}", response_model=ContactDetailResponse)
def update_contact(
    contact_id: uuid.UUID,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
):
    """Edit contact phone and/or name."""
    contact = _get_contact_or_404(contact_id, db)

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=422, detail="No fields to update")

    # If phone is changing, check for duplicates within the same org
    if "phone" in update_data and update_data["phone"] != contact.phone:
        existing = db.execute(
            select(Contact).where(
                Contact.org_id == contact.org_id,
                Contact.phone == update_data["phone"],
                Contact.id != contact.id,
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Another contact with this phone number already exists in the organization",
            )

    for field, value in update_data.items():
        setattr(contact, field, value)

    # Re-detect carrier when phone number changes
    if "phone" in update_data:
        contact.carrier = detect_carrier(contact.phone)

    db.commit()
    db.refresh(contact)
    return _contact_to_detail(contact)


# ---------------------------------------------------------------------------
# Attribute editing
# ---------------------------------------------------------------------------


@router.patch(
    "/{contact_id}/attributes",
    response_model=ContactAttributesResponse,
)
def update_contact_attributes(
    contact_id: uuid.UUID,
    payload: ContactAttributesUpdate,
    db: Session = Depends(get_db),
):
    """Edit custom attributes (key-value pairs stored in metadata JSONB).

    Keys present in the payload are upserted. Keys whose value is an empty
    string are removed from the attribute map.
    """
    contact = _get_contact_or_404(contact_id, db)

    current: dict[str, str] = dict(contact.metadata_) if contact.metadata_ else {}

    for key, value in payload.attributes.items():
        if value == "":
            current.pop(key, None)
        else:
            current[key] = value

    # SQLAlchemy won't detect in-place dict mutation on JSONB columns,
    # so we must reassign the whole dict.
    contact.metadata_ = current if current else None
    db.commit()
    db.refresh(contact)

    return ContactAttributesResponse(
        attributes=dict(contact.metadata_) if contact.metadata_ else {},
    )


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete a contact and all associated interactions."""
    contact = _get_contact_or_404(contact_id, db)

    # Remove interactions referencing this contact first (FK constraint)
    db.execute(
        Interaction.__table__.delete().where(
            Interaction.contact_id == contact.id,
        )
    )
    db.delete(contact)
    db.commit()


# ---------------------------------------------------------------------------
# Template rendering for a contact
# ---------------------------------------------------------------------------


@router.post("/{contact_id}/render-template")
def render_template_for_contact(
    contact_id: uuid.UUID,
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Render a template using a contact's attributes as variables.

    Merges contact.phone and contact.name into the variable dict alongside
    all metadata keys, so templates like ``{name}`` and ``{age}`` resolve
    from the contact record.
    """
    contact = _get_contact_or_404(contact_id, db)

    template = db.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    # Build variable dict: phone + name + all metadata attributes
    variables: dict[str, str] = {}
    if contact.metadata_:
        variables.update({k: str(v) for k, v in contact.metadata_.items()})
    variables["phone"] = contact.phone
    if contact.name:
        variables["name"] = contact.name

    try:
        rendered_text = render(template.content, variables)
    except UndefinedVariableError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Missing variable '{exc.variable_name}' — not found in contact attributes",
        )

    return {"rendered_text": rendered_text, "type": template.type}
