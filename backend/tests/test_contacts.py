"""Tests for standalone contact management API — CRUD, attributes, template rendering."""

import uuid

import pytest

from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.campaign import Campaign
from app.models.template import Template

NONEXISTENT_UUID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_contact(db, org_id, phone="+9779801234567", name="Ram", metadata_=None):
    """Insert a contact directly via ORM and return it."""
    contact = Contact(
        phone=phone,
        name=name,
        metadata_=metadata_,
        org_id=org_id,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def _create_template(db, org_id, content="Hello {name}, age {age}", type_="voice"):
    """Insert a template directly via ORM and return it."""
    template = Template(
        name="Test Template",
        content=content,
        type=type_,
        org_id=org_id,
        language="ne",
        variables=["name", "age"],
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


# ---------------------------------------------------------------------------
# GET /contacts/{contact_id}
# ---------------------------------------------------------------------------


class TestGetContact:
    def test_get_existing_contact(self, client, db, org_id):
        contact = _create_contact(db, org_id, metadata_={"age": "25", "city": "Kathmandu"})
        resp = client.get(f"/api/v1/contacts/{contact.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(contact.id)
        assert data["phone"] == "+9779801234567"
        assert data["name"] == "Ram"
        assert data["attributes"] == {"age": "25", "city": "Kathmandu"}
        assert "created_at" in data

    def test_get_contact_no_metadata(self, client, db, org_id):
        contact = _create_contact(db, org_id, metadata_=None)
        resp = client.get(f"/api/v1/contacts/{contact.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["attributes"] is None

    def test_get_contact_empty_metadata(self, client, db, org_id):
        contact = _create_contact(db, org_id, metadata_={})
        resp = client.get(f"/api/v1/contacts/{contact.id}")
        assert resp.status_code == 200
        # Empty dict should serialize as empty dict, not null
        data = resp.json()
        assert data["attributes"] == {}

    def test_get_contact_not_found(self, client):
        resp = client.get(f"/api/v1/contacts/{NONEXISTENT_UUID}")
        assert resp.status_code == 404

    def test_get_contact_invalid_uuid(self, client):
        resp = client.get("/api/v1/contacts/not-a-uuid")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /contacts/{contact_id}
# ---------------------------------------------------------------------------


class TestUpdateContact:
    def test_update_name(self, client, db, org_id):
        contact = _create_contact(db, org_id)
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}",
            json={"name": "Sita"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Sita"
        assert resp.json()["phone"] == "+9779801234567"  # unchanged

    def test_update_phone(self, client, db, org_id):
        contact = _create_contact(db, org_id)
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}",
            json={"phone": "+9779801234999"},
        )
        assert resp.status_code == 200
        assert resp.json()["phone"] == "+9779801234999"

    def test_update_both(self, client, db, org_id):
        contact = _create_contact(db, org_id)
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}",
            json={"phone": "+9779801234999", "name": "Sita"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["phone"] == "+9779801234999"
        assert data["name"] == "Sita"

    def test_update_empty_body_rejected(self, client, db, org_id):
        contact = _create_contact(db, org_id)
        resp = client.patch(f"/api/v1/contacts/{contact.id}", json={})
        assert resp.status_code == 422

    def test_update_phone_duplicate_rejected(self, client, db, org_id):
        _create_contact(db, org_id, phone="+9779801234567")
        contact2 = _create_contact(db, org_id, phone="+9779801234568", name="Sita")
        resp = client.patch(
            f"/api/v1/contacts/{contact2.id}",
            json={"phone": "+9779801234567"},
        )
        assert resp.status_code == 409
        assert "already exists" in resp.json()["detail"]

    def test_update_phone_same_value_ok(self, client, db, org_id):
        """Setting phone to its current value should not trigger duplicate check."""
        contact = _create_contact(db, org_id, phone="+9779801234567")
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}",
            json={"phone": "+9779801234567"},
        )
        assert resp.status_code == 200

    def test_update_not_found(self, client):
        resp = client.patch(
            f"/api/v1/contacts/{NONEXISTENT_UUID}",
            json={"name": "Ghost"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /contacts/{contact_id}/attributes
# ---------------------------------------------------------------------------


class TestUpdateContactAttributes:
    def test_set_attributes_from_scratch(self, client, db, org_id):
        contact = _create_contact(db, org_id, metadata_=None)
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}/attributes",
            json={"attributes": {"age": "22", "name": "Ram", "salary": "200000"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["attributes"] == {"age": "22", "name": "Ram", "salary": "200000"}

    def test_upsert_existing_attributes(self, client, db, org_id):
        contact = _create_contact(db, org_id, metadata_={"age": "25", "city": "Kathmandu"})
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}/attributes",
            json={"attributes": {"age": "26", "tier": "VIP"}},
        )
        assert resp.status_code == 200
        attrs = resp.json()["attributes"]
        assert attrs["age"] == "26"  # updated
        assert attrs["city"] == "Kathmandu"  # preserved
        assert attrs["tier"] == "VIP"  # added

    def test_remove_attribute_with_empty_string(self, client, db, org_id):
        contact = _create_contact(db, org_id, metadata_={"age": "25", "city": "Kathmandu"})
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}/attributes",
            json={"attributes": {"city": ""}},
        )
        assert resp.status_code == 200
        attrs = resp.json()["attributes"]
        assert "city" not in attrs
        assert attrs["age"] == "25"  # preserved

    def test_remove_all_attributes(self, client, db, org_id):
        contact = _create_contact(db, org_id, metadata_={"age": "25"})
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}/attributes",
            json={"attributes": {"age": ""}},
        )
        assert resp.status_code == 200
        assert resp.json()["attributes"] == {}

    def test_attributes_not_found(self, client):
        resp = client.patch(
            f"/api/v1/contacts/{NONEXISTENT_UUID}/attributes",
            json={"attributes": {"age": "22"}},
        )
        assert resp.status_code == 404

    def test_empty_attributes_payload(self, client, db, org_id):
        """Sending empty attributes dict is valid — no-op."""
        contact = _create_contact(db, org_id, metadata_={"age": "25"})
        resp = client.patch(
            f"/api/v1/contacts/{contact.id}/attributes",
            json={"attributes": {}},
        )
        assert resp.status_code == 200
        assert resp.json()["attributes"] == {"age": "25"}


# ---------------------------------------------------------------------------
# DELETE /contacts/{contact_id}
# ---------------------------------------------------------------------------


class TestDeleteContact:
    def test_delete_contact(self, client, db, org_id):
        contact = _create_contact(db, org_id)
        resp = client.delete(f"/api/v1/contacts/{contact.id}")
        assert resp.status_code == 204

        # Verify gone
        resp = client.get(f"/api/v1/contacts/{contact.id}")
        assert resp.status_code == 404

    def test_delete_contact_with_interactions(self, client, db, org_id):
        """Deleting a contact should also delete associated interactions."""
        contact = _create_contact(db, org_id)
        campaign = Campaign(
            name="Test Campaign",
            type="voice",
            org_id=org_id,
            status="draft",
        )
        db.add(campaign)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()

        resp = client.delete(f"/api/v1/contacts/{contact.id}")
        assert resp.status_code == 204

        # Interaction should also be gone
        from sqlalchemy import select
        remaining = db.execute(
            select(Interaction).where(Interaction.contact_id == contact.id)
        ).scalar_one_or_none()
        assert remaining is None

    def test_delete_not_found(self, client):
        resp = client.delete(f"/api/v1/contacts/{NONEXISTENT_UUID}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /contacts/{contact_id}/render-template
# ---------------------------------------------------------------------------


class TestRenderTemplateForContact:
    def test_render_with_metadata(self, client, db, org_id):
        contact = _create_contact(
            db, org_id,
            name="Ram",
            metadata_={"age": "25"},
        )
        template = _create_template(db, org_id, content="Hello {name}, age {age}")

        resp = client.post(
            f"/api/v1/contacts/{contact.id}/render-template",
            params={"template_id": str(template.id)},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rendered_text"] == "Hello Ram, age 25"
        assert data["type"] == "voice"

    def test_render_phone_substitution(self, client, db, org_id):
        contact = _create_contact(db, org_id, phone="+9779801234567", name="Ram")
        template = _create_template(db, org_id, content="Call {phone} for {name}")

        resp = client.post(
            f"/api/v1/contacts/{contact.id}/render-template",
            params={"template_id": str(template.id)},
        )
        assert resp.status_code == 200
        assert resp.json()["rendered_text"] == "Call +9779801234567 for Ram"

    def test_render_with_defaults(self, client, db, org_id):
        contact = _create_contact(db, org_id, name="Ram", metadata_=None)
        template = _create_template(db, org_id, content="Hello {name}, age {age|18}")

        resp = client.post(
            f"/api/v1/contacts/{contact.id}/render-template",
            params={"template_id": str(template.id)},
        )
        assert resp.status_code == 200
        assert resp.json()["rendered_text"] == "Hello Ram, age 18"

    def test_render_missing_variable_422(self, client, db, org_id):
        contact = _create_contact(db, org_id, name="Ram", metadata_=None)
        template = _create_template(db, org_id, content="Hello {name}, salary {salary}")

        resp = client.post(
            f"/api/v1/contacts/{contact.id}/render-template",
            params={"template_id": str(template.id)},
        )
        assert resp.status_code == 422
        assert "salary" in resp.json()["detail"]

    def test_render_contact_not_found(self, client, db, org_id):
        template = _create_template(db, org_id)
        resp = client.post(
            f"/api/v1/contacts/{NONEXISTENT_UUID}/render-template",
            params={"template_id": str(template.id)},
        )
        assert resp.status_code == 404

    def test_render_template_not_found(self, client, db, org_id):
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/contacts/{contact.id}/render-template",
            params={"template_id": NONEXISTENT_UUID},
        )
        assert resp.status_code == 404

    def test_render_conditional_block(self, client, db, org_id):
        contact = _create_contact(
            db, org_id,
            name="Ram",
            metadata_={"vip": "true"},
        )
        template = _create_template(
            db, org_id,
            content="Hello {name}!{?vip} You are VIP!{/vip}",
        )
        resp = client.post(
            f"/api/v1/contacts/{contact.id}/render-template",
            params={"template_id": str(template.id)},
        )
        assert resp.status_code == 200
        assert resp.json()["rendered_text"] == "Hello Ram! You are VIP!"

    def test_render_conditional_block_falsy(self, client, db, org_id):
        contact = _create_contact(db, org_id, name="Ram", metadata_=None)
        template = _create_template(
            db, org_id,
            content="Hello {name}!{?vip} You are VIP!{/vip}",
        )
        resp = client.post(
            f"/api/v1/contacts/{contact.id}/render-template",
            params={"template_id": str(template.id)},
        )
        assert resp.status_code == 200
        assert resp.json()["rendered_text"] == "Hello Ram!"
