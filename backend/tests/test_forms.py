"""Tests for form/survey system — CRUD, responses, CSV export, voice TwiML."""

import csv
import io
import uuid

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.form import Form
from app.models.form_response import FormResponse
from app.models.interaction import Interaction
from app.services.telephony.models import FormCallContext

NONEXISTENT_UUID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_form(
    db,
    org_id,
    title="Customer Satisfaction Survey",
    description="Rate our service",
    questions=None,
    status="draft",
):
    if questions is None:
        questions = [
            {
                "type": "multiple_choice",
                "text": "How did you find us?",
                "options": ["TV", "Radio", "Internet", "Friend"],
                "required": True,
            },
            {
                "type": "rating",
                "text": "Rate our service",
                "options": None,
                "required": True,
            },
            {
                "type": "yes_no",
                "text": "Would you recommend us?",
                "options": None,
                "required": True,
            },
        ]
    form = Form(
        title=title,
        description=description,
        questions=questions,
        org_id=org_id,
        status=status,
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return form


def _create_contact(db, org_id, phone="+9779801234567", name="Ram"):
    contact = Contact(phone=phone, name=name, org_id=org_id)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def _create_form_response(db, form_id, contact_id, answers=None):
    from datetime import datetime, timezone

    resp = FormResponse(
        form_id=form_id,
        contact_id=contact_id,
        answers=answers or {"0": "TV", "1": 4, "2": True},
        completed_at=datetime.now(timezone.utc),
    )
    db.add(resp)
    db.commit()
    db.refresh(resp)
    return resp


# ---------------------------------------------------------------------------
# POST /forms — Create Form
# ---------------------------------------------------------------------------


class TestCreateForm:
    def test_create_form_success(self, client, db, org_id):
        payload = {
            "title": "Delivery Feedback",
            "description": "Post-delivery survey",
            "org_id": str(org_id),
            "questions": [
                {
                    "type": "rating",
                    "text": "Rate delivery speed",
                    "required": True,
                },
                {
                    "type": "yes_no",
                    "text": "Was package intact?",
                    "required": True,
                },
            ],
        }
        resp = client.post("/api/v1/forms/", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Delivery Feedback"
        assert data["status"] == "draft"
        assert len(data["questions"]) == 2
        assert "id" in data

    def test_create_form_with_multiple_choice(self, client, db, org_id):
        payload = {
            "title": "Product Survey",
            "org_id": str(org_id),
            "questions": [
                {
                    "type": "multiple_choice",
                    "text": "Favorite product?",
                    "options": ["Product A", "Product B", "Product C"],
                    "required": True,
                },
            ],
        }
        resp = client.post("/api/v1/forms/", json=payload)
        assert resp.status_code == 201
        assert resp.json()["questions"][0]["options"] == [
            "Product A",
            "Product B",
            "Product C",
        ]

    def test_create_form_mc_too_few_options_rejected(self, client, db, org_id):
        payload = {
            "title": "Bad Form",
            "org_id": str(org_id),
            "questions": [
                {
                    "type": "multiple_choice",
                    "text": "Pick one",
                    "options": ["Only one"],
                    "required": True,
                },
            ],
        }
        resp = client.post("/api/v1/forms/", json=payload)
        assert resp.status_code == 422
        assert "at least 2 options" in resp.json()["detail"]

    def test_create_form_mc_too_many_options_rejected(self, client, db, org_id):
        payload = {
            "title": "Bad Form",
            "org_id": str(org_id),
            "questions": [
                {
                    "type": "multiple_choice",
                    "text": "Pick one",
                    "options": [f"Opt {i}" for i in range(10)],
                    "required": True,
                },
            ],
        }
        resp = client.post("/api/v1/forms/", json=payload)
        assert resp.status_code == 422
        assert "at most 9 options" in resp.json()["detail"]

    def test_create_form_empty_questions_rejected(self, client, db, org_id):
        payload = {
            "title": "Empty Form",
            "org_id": str(org_id),
            "questions": [],
        }
        resp = client.post("/api/v1/forms/", json=payload)
        assert resp.status_code == 422

    def test_create_form_no_title_rejected(self, client, db, org_id):
        payload = {
            "org_id": str(org_id),
            "questions": [
                {"type": "rating", "text": "Rate us", "required": True},
            ],
        }
        resp = client.post("/api/v1/forms/", json=payload)
        assert resp.status_code == 422

    def test_create_form_all_question_types(self, client, db, org_id):
        payload = {
            "title": "Full Survey",
            "org_id": str(org_id),
            "questions": [
                {
                    "type": "multiple_choice",
                    "text": "Pick one",
                    "options": ["A", "B"],
                    "required": True,
                },
                {"type": "text_input", "text": "Comments?", "required": False},
                {"type": "rating", "text": "Rate us", "required": True},
                {"type": "yes_no", "text": "Recommend?", "required": True},
                {"type": "numeric", "text": "Age?", "required": True},
            ],
        }
        resp = client.post("/api/v1/forms/", json=payload)
        assert resp.status_code == 201
        assert len(resp.json()["questions"]) == 5


# ---------------------------------------------------------------------------
# GET /forms — List Forms
# ---------------------------------------------------------------------------


class TestListForms:
    def test_list_empty(self, client, db, org_id):
        resp = client.get("/api/v1/forms/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_with_forms(self, client, db, org_id):
        _create_form(db, org_id, title="Form 1")
        _create_form(db, org_id, title="Form 2")
        resp = client.get("/api/v1/forms/")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_list_filter_by_status(self, client, db, org_id):
        _create_form(db, org_id, title="Draft", status="draft")
        _create_form(db, org_id, title="Active", status="active")
        resp = client.get("/api/v1/forms/?status=active")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "Active"

    def test_list_filter_by_org_id(self, client, db, org_id):
        _create_form(db, org_id, title="Our Form")
        resp = client.get(f"/api/v1/forms/?org_id={org_id}")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_list_pagination(self, client, db, org_id):
        for i in range(5):
            _create_form(db, org_id, title=f"Form {i}")
        resp = client.get("/api/v1/forms/?page=1&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 2


# ---------------------------------------------------------------------------
# GET /forms/{form_id} — Get Form Detail
# ---------------------------------------------------------------------------


class TestGetForm:
    def test_get_form_detail(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.get(f"/api/v1/forms/{form.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(form.id)
        assert data["title"] == "Customer Satisfaction Survey"
        assert data["response_count"] == 0
        assert len(data["questions"]) == 3

    def test_get_form_with_responses(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        contact = _create_contact(db, org_id)
        _create_form_response(db, form.id, contact.id)
        resp = client.get(f"/api/v1/forms/{form.id}")
        assert resp.status_code == 200
        assert resp.json()["response_count"] == 1

    def test_get_form_not_found(self, client):
        resp = client.get(f"/api/v1/forms/{NONEXISTENT_UUID}")
        assert resp.status_code == 404

    def test_get_form_invalid_uuid(self, client):
        resp = client.get("/api/v1/forms/not-a-uuid")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PUT /forms/{form_id} — Update Form
# ---------------------------------------------------------------------------


class TestUpdateForm:
    def test_update_title(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.put(
            f"/api/v1/forms/{form.id}",
            json={"title": "Updated Survey"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Survey"

    def test_update_status_to_active(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.put(
            f"/api/v1/forms/{form.id}",
            json={"status": "active"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_update_questions(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.put(
            f"/api/v1/forms/{form.id}",
            json={
                "questions": [
                    {"type": "rating", "text": "New question", "required": True},
                ]
            },
        )
        assert resp.status_code == 200
        assert len(resp.json()["questions"]) == 1

    def test_update_archived_form_rejected(self, client, db, org_id):
        form = _create_form(db, org_id, status="archived")
        resp = client.put(
            f"/api/v1/forms/{form.id}",
            json={"title": "Nope"},
        )
        assert resp.status_code == 409

    def test_update_empty_body_rejected(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.put(f"/api/v1/forms/{form.id}", json={})
        assert resp.status_code == 422

    def test_update_not_found(self, client):
        resp = client.put(
            f"/api/v1/forms/{NONEXISTENT_UUID}",
            json={"title": "Ghost"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /forms/{form_id} — Delete Form
# ---------------------------------------------------------------------------


class TestDeleteForm:
    def test_delete_form(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.delete(f"/api/v1/forms/{form.id}")
        assert resp.status_code == 204

        resp = client.get(f"/api/v1/forms/{form.id}")
        assert resp.status_code == 404

    def test_delete_form_with_campaign_rejected(self, client, db, org_id):
        form = _create_form(db, org_id)
        campaign = Campaign(
            name="Survey Campaign",
            type="form",
            org_id=org_id,
            form_id=form.id,
            status="draft",
        )
        db.add(campaign)
        db.commit()

        resp = client.delete(f"/api/v1/forms/{form.id}")
        assert resp.status_code == 409
        assert "associated campaigns" in resp.json()["detail"]

    def test_delete_form_not_found(self, client):
        resp = client.delete(f"/api/v1/forms/{NONEXISTENT_UUID}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /forms/{form_id}/responses — Submit Form Response
# ---------------------------------------------------------------------------


class TestSubmitFormResponse:
    def test_submit_response_success(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "TV", "1": 5, "2": True},
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["form_id"] == str(form.id)
        assert data["contact_id"] == str(contact.id)
        assert data["answers"]["0"] == "TV"
        assert data["completed_at"] is not None

    def test_submit_to_inactive_form_rejected(self, client, db, org_id):
        form = _create_form(db, org_id, status="draft")
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "TV", "1": 5, "2": True},
            },
        )
        assert resp.status_code == 409
        assert "not active" in resp.json()["detail"]

    def test_submit_missing_required_answer(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "TV"},  # missing q1 and q2
            },
        )
        assert resp.status_code == 422
        assert "required" in resp.json()["detail"]

    def test_submit_invalid_mc_option(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "Invalid Option", "1": 3, "2": True},
            },
        )
        assert resp.status_code == 422
        assert "not a valid option" in resp.json()["detail"]

    def test_submit_invalid_rating(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "TV", "1": 6, "2": True},
            },
        )
        assert resp.status_code == 422
        assert "between 1 and 5" in resp.json()["detail"]

    def test_submit_contact_not_found(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": NONEXISTENT_UUID,
                "answers": {"0": "TV", "1": 5, "2": True},
            },
        )
        assert resp.status_code == 404
        assert "Contact not found" in resp.json()["detail"]

    def test_submit_form_not_found(self, client, db, org_id):
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/forms/{NONEXISTENT_UUID}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "TV"},
            },
        )
        assert resp.status_code == 404

    def test_submit_optional_question_can_be_omitted(self, client, db, org_id):
        form = _create_form(
            db,
            org_id,
            status="active",
            questions=[
                {"type": "rating", "text": "Rate us", "options": None, "required": True},
                {
                    "type": "text_input",
                    "text": "Comments?",
                    "options": None,
                    "required": False,
                },
            ],
        )
        contact = _create_contact(db, org_id)
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": 4},  # q1 omitted (optional)
            },
        )
        assert resp.status_code == 201


# ---------------------------------------------------------------------------
# GET /forms/{form_id}/responses — List Responses
# ---------------------------------------------------------------------------


class TestListFormResponses:
    def test_list_responses_empty(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.get(f"/api/v1/forms/{form.id}/responses")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_responses_with_data(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        contact1 = _create_contact(db, org_id, phone="+9779801111111")
        contact2 = _create_contact(db, org_id, phone="+9779802222222")
        _create_form_response(db, form.id, contact1.id, {"0": "TV", "1": 5, "2": True})
        _create_form_response(
            db, form.id, contact2.id, {"0": "Radio", "1": 3, "2": False}
        )

        resp = client.get(f"/api/v1/forms/{form.id}/responses")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_list_responses_pagination(self, client, db, org_id):
        form = _create_form(db, org_id, status="active")
        for i in range(5):
            contact = _create_contact(
                db, org_id, phone=f"+977980000000{i}", name=f"User{i}"
            )
            _create_form_response(db, form.id, contact.id)

        resp = client.get(f"/api/v1/forms/{form.id}/responses?page=1&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

    def test_list_responses_form_not_found(self, client):
        resp = client.get(f"/api/v1/forms/{NONEXISTENT_UUID}/responses")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /forms/{form_id}/responses/download — CSV Export
# ---------------------------------------------------------------------------


class TestDownloadFormResponses:
    def test_download_csv(self, client, db, org_id):
        form = _create_form(
            db,
            org_id,
            status="active",
            questions=[
                {
                    "type": "rating",
                    "text": "Rate our service",
                    "options": None,
                    "required": True,
                },
                {
                    "type": "yes_no",
                    "text": "Recommend us?",
                    "options": None,
                    "required": True,
                },
            ],
        )
        contact = _create_contact(db, org_id)
        _create_form_response(db, form.id, contact.id, {"0": 4, "1": True})

        resp = client.get(f"/api/v1/forms/{form.id}/responses/download")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        assert "attachment" in resp.headers["content-disposition"]

        # Parse CSV
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2  # header + 1 data row

        header = rows[0]
        assert header[0] == "response_id"
        assert header[1] == "contact_id"
        assert "Rate our service" in header[2]
        assert "Recommend us?" in header[3]
        assert header[4] == "completed_at"

        data_row = rows[1]
        assert data_row[2] == "4"
        assert data_row[3] == "True"

    def test_download_csv_empty(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.get(f"/api/v1/forms/{form.id}/responses/download")
        assert resp.status_code == 200
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 1  # header only

    def test_download_csv_form_not_found(self, client):
        resp = client.get(f"/api/v1/forms/{NONEXISTENT_UUID}/responses/download")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Voice form TwiML generation
# ---------------------------------------------------------------------------


class TestFormTwimlGeneration:
    def test_generate_form_question_twiml_mc(self):
        from app.services.telephony.twilio import generate_form_question_twiml

        question = {
            "type": "multiple_choice",
            "text": "How did you find us?",
            "options": ["TV", "Radio", "Internet"],
            "required": True,
        }
        twiml = generate_form_question_twiml(
            question=question,
            question_index=0,
            total_questions=3,
            audio_url="https://example.com/audio/q1.mp3",
            answer_action_url="https://example.com/form-answer/abc/0",
        )
        assert "<Gather" in twiml
        assert "numDigits=\"1\"" in twiml
        assert "https://example.com/audio/q1.mp3" in twiml
        assert "https://example.com/form-answer/abc/0" in twiml

    def test_generate_form_question_twiml_rating(self):
        from app.services.telephony.twilio import generate_form_question_twiml

        question = {
            "type": "rating",
            "text": "Rate our service",
            "required": True,
        }
        twiml = generate_form_question_twiml(
            question=question,
            question_index=1,
            total_questions=3,
            audio_url=None,
            answer_action_url="https://example.com/form-answer/abc/1",
        )
        assert "<Gather" in twiml
        assert "<Say" in twiml

    def test_generate_form_question_twiml_yes_no(self):
        from app.services.telephony.twilio import generate_form_question_twiml

        question = {
            "type": "yes_no",
            "text": "Would you recommend?",
            "required": True,
        }
        twiml = generate_form_question_twiml(
            question=question,
            question_index=2,
            total_questions=3,
            audio_url=None,
            answer_action_url="https://example.com/form-answer/abc/2",
        )
        assert "<Gather" in twiml

    def test_generate_form_question_twiml_numeric(self):
        from app.services.telephony.twilio import generate_form_question_twiml

        question = {
            "type": "numeric",
            "text": "Enter your age",
            "required": True,
        }
        twiml = generate_form_question_twiml(
            question=question,
            question_index=0,
            total_questions=1,
            audio_url=None,
            answer_action_url="https://example.com/form-answer/abc/0",
        )
        assert "<Gather" in twiml
        assert "finishOnKey=\"#\"" in twiml

    def test_generate_form_completion_twiml(self):
        from app.services.telephony.twilio import generate_form_completion_twiml

        twiml = generate_form_completion_twiml()
        assert "<Say" in twiml
        assert "<Hangup" in twiml


# ---------------------------------------------------------------------------
# DTMF-to-answer mapping
# ---------------------------------------------------------------------------


class TestDtmfToAnswerMapping:
    def test_mc_digit_maps_to_option(self):
        from app.api.v1.endpoints.voice import _map_dtmf_to_answer

        question = {
            "type": "multiple_choice",
            "options": ["TV", "Radio", "Internet"],
        }
        assert _map_dtmf_to_answer(question, "1") == "TV"
        assert _map_dtmf_to_answer(question, "2") == "Radio"
        assert _map_dtmf_to_answer(question, "3") == "Internet"

    def test_mc_invalid_digit_returns_raw(self):
        from app.api.v1.endpoints.voice import _map_dtmf_to_answer

        question = {
            "type": "multiple_choice",
            "options": ["TV", "Radio"],
        }
        assert _map_dtmf_to_answer(question, "9") == "9"

    def test_rating_passes_digit_through(self):
        from app.api.v1.endpoints.voice import _map_dtmf_to_answer

        question = {"type": "rating"}
        assert _map_dtmf_to_answer(question, "3") == "3"

    def test_yes_no_mapping(self):
        from app.api.v1.endpoints.voice import _map_dtmf_to_answer

        question = {"type": "yes_no"}
        assert _map_dtmf_to_answer(question, "1") == "yes"
        assert _map_dtmf_to_answer(question, "2") == "no"
        assert _map_dtmf_to_answer(question, "9") == "9"

    def test_numeric_passes_through(self):
        from app.api.v1.endpoints.voice import _map_dtmf_to_answer

        question = {"type": "numeric"}
        assert _map_dtmf_to_answer(question, "42") == "42"


# ---------------------------------------------------------------------------
# FormCallContext model
# ---------------------------------------------------------------------------


class TestFormCallContext:
    def test_create_context(self):
        ctx = FormCallContext(
            call_id="test-call-123",
            form_id=uuid.uuid4(),
            contact_id=uuid.uuid4(),
            questions=[
                {"type": "rating", "text": "Rate us", "required": True},
            ],
            audio_ids={"0": "audio-abc"},
        )
        assert ctx.current_question == 0
        assert len(ctx.answers) == 0
        assert ctx.audio_ids["0"] == "audio-abc"

    def test_accumulate_answers(self):
        ctx = FormCallContext(
            call_id="test-call-123",
            form_id=uuid.uuid4(),
            contact_id=uuid.uuid4(),
            questions=[
                {"type": "rating", "text": "Q1"},
                {"type": "yes_no", "text": "Q2"},
            ],
        )
        ctx.answers["0"] = "5"
        ctx.answers["1"] = "yes"
        assert len(ctx.answers) == 2


# ---------------------------------------------------------------------------
# Campaign with form_id
# ---------------------------------------------------------------------------


class TestCampaignFormIntegration:
    def test_create_form_campaign(self, client, db, org_id):
        form = _create_form(db, org_id)
        resp = client.post(
            "/api/v1/campaigns/",
            json={
                "name": "Survey Campaign",
                "type": "form",
                "org_id": str(org_id),
                "form_id": str(form.id),
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "form"
        assert data["form_id"] == str(form.id)
        assert data["template_id"] is None

    def test_get_form_campaign_detail(self, client, db, org_id):
        form = _create_form(db, org_id)
        campaign = Campaign(
            name="Survey Campaign",
            type="form",
            org_id=org_id,
            form_id=form.id,
            status="draft",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        resp = client.get(f"/api/v1/campaigns/{campaign.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["form_id"] == str(form.id)


# ---------------------------------------------------------------------------
# Answer validation edge cases
# ---------------------------------------------------------------------------


class TestAnswerValidation:
    def test_validate_yes_no_string_values(self, client, db, org_id):
        form = _create_form(
            db,
            org_id,
            status="active",
            questions=[
                {"type": "yes_no", "text": "Confirm?", "options": None, "required": True},
            ],
        )
        contact = _create_contact(db, org_id)

        # "yes" and "no" strings should be accepted
        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "yes"},
            },
        )
        assert resp.status_code == 201

    def test_validate_numeric_float(self, client, db, org_id):
        form = _create_form(
            db,
            org_id,
            status="active",
            questions=[
                {"type": "numeric", "text": "Amount?", "options": None, "required": True},
            ],
        )
        contact = _create_contact(db, org_id)

        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": 99.5},
            },
        )
        assert resp.status_code == 201

    def test_validate_numeric_string_rejected(self, client, db, org_id):
        form = _create_form(
            db,
            org_id,
            status="active",
            questions=[
                {"type": "numeric", "text": "Amount?", "options": None, "required": True},
            ],
        )
        contact = _create_contact(db, org_id)

        resp = client.post(
            f"/api/v1/forms/{form.id}/responses",
            json={
                "contact_id": str(contact.id),
                "answers": {"0": "not a number"},
            },
        )
        assert resp.status_code == 422
        assert "must be a number" in resp.json()["detail"]
