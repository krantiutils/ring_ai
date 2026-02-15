"""Inbound call routing configuration API.

CRUD endpoints for managing gateway phones and inbound routing rules.
These configure how the system handles incoming calls from Android gateways.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.gateway_phone import GatewayPhone
from app.models.inbound_routing_rule import InboundRoutingRule
from app.schemas.inbound import (
    GatewayPhoneCreate,
    GatewayPhoneResponse,
    GatewayPhoneUpdate,
    InboundRoutingRuleCreate,
    InboundRoutingRuleResponse,
    InboundRoutingRuleUpdate,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Gateway Phones
# ---------------------------------------------------------------------------


@router.get("/gateway-phones", response_model=list[GatewayPhoneResponse])
def list_gateway_phones(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """List gateway phones for an organization."""
    phones = (
        db.execute(select(GatewayPhone).where(GatewayPhone.org_id == org_id).order_by(GatewayPhone.created_at.desc()))
        .scalars()
        .all()
    )
    return phones


@router.post("/gateway-phones", response_model=GatewayPhoneResponse, status_code=201)
def create_gateway_phone(
    payload: GatewayPhoneCreate,
    db: Session = Depends(get_db),
):
    """Register a new gateway phone."""
    existing = db.execute(
        select(GatewayPhone).where(GatewayPhone.gateway_id == payload.gateway_id)
    ).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Gateway device '{payload.gateway_id}' is already registered",
        )

    phone = GatewayPhone(
        gateway_id=payload.gateway_id,
        org_id=payload.org_id,
        phone_number=payload.phone_number,
        label=payload.label,
        auto_answer=payload.auto_answer,
        system_instruction=payload.system_instruction,
        voice_name=payload.voice_name,
    )
    db.add(phone)
    db.commit()
    db.refresh(phone)
    return phone


@router.get("/gateway-phones/{phone_id}", response_model=GatewayPhoneResponse)
def get_gateway_phone(
    phone_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get a single gateway phone by ID."""
    phone = db.get(GatewayPhone, phone_id)
    if phone is None:
        raise HTTPException(status_code=404, detail="Gateway phone not found")
    return phone


@router.patch("/gateway-phones/{phone_id}", response_model=GatewayPhoneResponse)
def update_gateway_phone(
    phone_id: uuid.UUID,
    payload: GatewayPhoneUpdate,
    db: Session = Depends(get_db),
):
    """Update a gateway phone's configuration."""
    phone = db.get(GatewayPhone, phone_id)
    if phone is None:
        raise HTTPException(status_code=404, detail="Gateway phone not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(phone, field, value)

    db.commit()
    db.refresh(phone)
    return phone


@router.delete("/gateway-phones/{phone_id}", status_code=204)
def deactivate_gateway_phone(
    phone_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Deactivate a gateway phone (soft delete)."""
    phone = db.get(GatewayPhone, phone_id)
    if phone is None:
        raise HTTPException(status_code=404, detail="Gateway phone not found")

    phone.is_active = False
    db.commit()


# ---------------------------------------------------------------------------
# Inbound Routing Rules
# ---------------------------------------------------------------------------


@router.get("/routing-rules", response_model=list[InboundRoutingRuleResponse])
def list_routing_rules(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """List inbound routing rules for an organization, sorted by priority."""
    rules = (
        db.execute(
            select(InboundRoutingRule).where(InboundRoutingRule.org_id == org_id).order_by(InboundRoutingRule.priority)
        )
        .scalars()
        .all()
    )
    return rules


@router.post("/routing-rules", response_model=InboundRoutingRuleResponse, status_code=201)
def create_routing_rule(
    payload: InboundRoutingRuleCreate,
    db: Session = Depends(get_db),
):
    """Create a new inbound routing rule."""
    if payload.action == "forward" and not payload.forward_to:
        raise HTTPException(
            status_code=422,
            detail="forward_to is required when action is 'forward'",
        )

    rule = InboundRoutingRule(
        org_id=payload.org_id,
        name=payload.name,
        caller_pattern=payload.caller_pattern,
        match_type=payload.match_type,
        action=payload.action,
        forward_to=payload.forward_to,
        system_instruction=payload.system_instruction,
        voice_name=payload.voice_name,
        time_start=payload.time_start,
        time_end=payload.time_end,
        days_of_week=payload.days_of_week,
        priority=payload.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/routing-rules/{rule_id}", response_model=InboundRoutingRuleResponse)
def get_routing_rule(
    rule_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get a single routing rule by ID."""
    rule = db.get(InboundRoutingRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    return rule


@router.patch("/routing-rules/{rule_id}", response_model=InboundRoutingRuleResponse)
def update_routing_rule(
    rule_id: uuid.UUID,
    payload: InboundRoutingRuleUpdate,
    db: Session = Depends(get_db),
):
    """Update an inbound routing rule."""
    rule = db.get(InboundRoutingRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    update_data = payload.model_dump(exclude_unset=True)

    # Validate forward_to if action is being set to "forward"
    new_action = update_data.get("action", rule.action)
    new_forward_to = update_data.get("forward_to", rule.forward_to)
    if new_action == "forward" and not new_forward_to:
        raise HTTPException(
            status_code=422,
            detail="forward_to is required when action is 'forward'",
        )

    for field, value in update_data.items():
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/routing-rules/{rule_id}", status_code=204)
def delete_routing_rule(
    rule_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Delete a routing rule."""
    rule = db.get(InboundRoutingRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    db.delete(rule)
    db.commit()
