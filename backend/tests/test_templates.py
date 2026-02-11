"""Tests for the template engine service and API endpoints."""

import uuid

import pytest

from app.services.templates import (
    UndefinedVariableError,
    extract_variables,
    get_conditional_variables,
    get_required_variables,
    get_variables_with_defaults,
    render,
    validate_template,
)


# ---------------------------------------------------------------------------
# Template engine unit tests
# ---------------------------------------------------------------------------


class TestExtractVariables:
    def test_simple_variables(self):
        assert extract_variables("{name} {age}") == ["age", "name"]

    def test_variables_with_defaults(self):
        assert extract_variables("{name|default}") == ["name"]

    def test_conditional_variables(self):
        result = extract_variables("{?show_extra}extra content{/show_extra}")
        assert "show_extra" in result

    def test_variables_inside_conditionals(self):
        result = extract_variables("{?active}{inner_var}{/active}")
        assert sorted(result) == ["active", "inner_var"]

    def test_no_variables(self):
        assert extract_variables("plain text no vars") == []

    def test_nepali_content_with_variables(self):
        template = "नमस्ते {customer_name} जी। तपाईंको बिल रु. {amount} छ।"
        result = extract_variables(template)
        assert result == ["amount", "customer_name"]

    def test_duplicate_variables(self):
        result = extract_variables("{name} and {name}")
        assert result == ["name"]


class TestGetVariablesWithDefaults:
    def test_finds_defaults(self):
        result = get_variables_with_defaults("{a|default} {b} {c|other}")
        assert result == ["a", "c"]

    def test_empty_default(self):
        result = get_variables_with_defaults("{a|}")
        assert result == ["a"]

    def test_no_defaults(self):
        result = get_variables_with_defaults("{a} {b}")
        assert result == []


class TestGetConditionalVariables:
    def test_finds_conditionals(self):
        result = get_conditional_variables("{?x}block{/x} {?y}other{/y}")
        assert result == ["x", "y"]

    def test_no_conditionals(self):
        assert get_conditional_variables("{var} text") == []


class TestGetRequiredVariables:
    def test_simple_required(self):
        assert get_required_variables("{name} {age}") == ["age", "name"]

    def test_excludes_defaults(self):
        result = get_required_variables("{name} {age|25}")
        assert result == ["name"]

    def test_conditional_guard_not_required_if_only_guard(self):
        # {?show} is only used as a guard, not as a substitution variable
        template = "{?show}extra text{/show}"
        result = get_required_variables(template)
        assert "show" not in result

    def test_conditional_guard_required_if_also_substituted(self):
        template = "{show} {?show}extra{/show}"
        result = get_required_variables(template)
        assert "show" in result


class TestValidateTemplate:
    def test_valid_template(self):
        is_valid, errors = validate_template("Hello {name}, your code is {code}.")
        assert is_valid is True
        assert errors == []

    def test_unclosed_conditional(self):
        is_valid, errors = validate_template("{?block}content but no closing")
        assert is_valid is False
        assert any("Unclosed" in e for e in errors)

    def test_unmatched_closing_tag(self):
        is_valid, errors = validate_template("no opening{/block}")
        assert is_valid is False
        assert any("Unmatched" in e for e in errors)

    def test_empty_template(self):
        is_valid, errors = validate_template("   ")
        assert is_valid is False
        assert any("empty" in e.lower() for e in errors)

    def test_valid_nepali_template(self):
        template = "नमस्ते {customer_name} जी। बिल रु. {amount} छ।"
        is_valid, errors = validate_template(template)
        assert is_valid is True


class TestRender:
    def test_simple_substitution(self):
        result = render("Hello {name}!", {"name": "World"})
        assert result == "Hello World!"

    def test_nepali_substitution(self):
        template = "नमस्ते {customer_name} जी। बिल रु. {amount} छ।"
        result = render(template, {"customer_name": "राम", "amount": "५००"})
        assert result == "नमस्ते राम जी। बिल रु. ५०० छ।"

    def test_default_value_used(self):
        result = render("Hello {name|विश्व}!", {})
        assert result == "Hello विश्व!"

    def test_default_value_overridden(self):
        result = render("Hello {name|विश्व}!", {"name": "राम"})
        assert result == "Hello राम!"

    def test_empty_default(self):
        result = render("Hello{suffix|}!", {})
        assert result == "Hello!"

    def test_missing_variable_raises(self):
        with pytest.raises(UndefinedVariableError) as exc_info:
            render("Hello {name}!", {})
        assert exc_info.value.variable_name == "name"

    def test_conditional_block_included(self):
        template = "Start{?show} visible{/show} end"
        result = render(template, {"show": "yes"})
        assert result == "Start visible end"

    def test_conditional_block_excluded(self):
        template = "Start{?show} visible{/show} end"
        result = render(template, {})
        assert result == "Start end"

    def test_conditional_with_inner_variables(self):
        template = "{?extra}Fee: {fee}{/extra}"
        result = render(template, {"extra": "yes", "fee": "100"})
        assert result == "Fee: 100"

    def test_conditional_excluded_skips_inner_variables(self):
        # If conditional is excluded, inner variables are removed entirely
        template = "Text{?extra} Fee: {fee}{/extra}"
        result = render(template, {})
        assert result == "Text"

    def test_multiple_variables_nepali(self):
        template = (
            "नमस्ते {customer_name} जी। "
            "तपाईंको {service_name|सेवा} को बिल रु. {amount} बाँकी छ। "
            "भुक्तानीको अन्तिम मिति {due_date} हो।"
        )
        result = render(
            template,
            {
                "customer_name": "सीता",
                "amount": "१,५००",
                "due_date": "२०८२/०३/१५",
            },
        )
        assert "सीता" in result
        assert "सेवा" in result  # default used
        assert "१,५००" in result
        assert "२०८२/०३/१५" in result

    def test_full_bill_reminder_template(self):
        template = (
            "नमस्ते {customer_name} जी। "
            "तपाईंको {service_name|सेवा} को बिल रु. {amount} बाँकी छ। "
            "भुक्तानीको अन्तिम मिति {due_date} हो। "
            "{?late_fee}ढिलो भुक्तानीमा रु. {late_fee} थप शुल्क लाग्नेछ। {/late_fee}"
            "कृपया समयमै भुक्तानी गर्नुहोस्। धन्यवाद।"
        )
        # With late fee
        result = render(
            template,
            {
                "customer_name": "राम",
                "amount": "२,०००",
                "due_date": "२०८२/०२/३०",
                "late_fee": "१००",
            },
        )
        assert "ढिलो भुक्तानीमा रु. १०० थप शुल्क" in result

        # Without late fee
        result = render(
            template,
            {
                "customer_name": "राम",
                "amount": "२,०००",
                "due_date": "२०८२/०२/३०",
            },
        )
        assert "ढिलो" not in result


# ---------------------------------------------------------------------------
# API endpoint integration tests
# ---------------------------------------------------------------------------

NONEXISTENT_UUID = str(uuid.uuid4())


def _sample_template(org_id: uuid.UUID) -> dict:
    return {
        "name": "Test Template",
        "content": "नमस्ते {customer_name} जी। बिल रु. {amount} छ।",
        "type": "voice",
        "org_id": str(org_id),
        "voice_config": {"language": "ne-NP", "speed": 0.9},
    }


class TestCreateTemplate:
    def test_create_success(self, client, org_id):
        payload = _sample_template(org_id)
        resp = client.post("/api/v1/templates/", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == payload["name"]
        assert data["type"] == "voice"
        assert sorted(data["variables"]) == ["amount", "customer_name"]
        assert data["id"] is not None
        assert data["org_id"] == str(org_id)

    def test_create_invalid_template(self, client, org_id):
        payload = {**_sample_template(org_id), "content": "{?broken}no closing tag"}
        resp = client.post("/api/v1/templates/", json=payload)
        assert resp.status_code == 422

    def test_create_empty_name(self, client, org_id):
        payload = {**_sample_template(org_id), "name": ""}
        resp = client.post("/api/v1/templates/", json=payload)
        assert resp.status_code == 422


class TestListTemplates:
    def test_list_empty(self, client):
        resp = client.get("/api/v1/templates/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_with_pagination(self, client, org_id):
        sample = _sample_template(org_id)
        for i in range(3):
            client.post(
                "/api/v1/templates/",
                json={**sample, "name": f"Template {i}"},
            )

        resp = client.get("/api/v1/templates/?page=1&page_size=2")
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["total"] == 3
        assert data["page"] == 1

        resp = client.get("/api/v1/templates/?page=2&page_size=2")
        data = resp.json()
        assert len(data["items"]) == 1

    def test_list_filter_by_type(self, client, org_id):
        sample = _sample_template(org_id)
        client.post("/api/v1/templates/", json=sample)
        text_tmpl = {**sample, "name": "Text Msg", "type": "text"}
        client.post("/api/v1/templates/", json=text_tmpl)

        resp = client.get("/api/v1/templates/?type=text")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["type"] == "text"


class TestGetTemplate:
    def test_get_existing(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.get(f"/api/v1/templates/{tid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == tid

    def test_get_not_found(self, client):
        resp = client.get(f"/api/v1/templates/{NONEXISTENT_UUID}")
        assert resp.status_code == 404


class TestUpdateTemplate:
    def test_update_name(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.put(f"/api/v1/templates/{tid}", json={"name": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"

    def test_update_content_recomputes_variables(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.put(
            f"/api/v1/templates/{tid}",
            json={"content": "Hello {new_var}!"},
        )
        assert resp.status_code == 200
        assert resp.json()["variables"] == ["new_var"]

    def test_update_not_found(self, client):
        resp = client.put(
            f"/api/v1/templates/{NONEXISTENT_UUID}", json={"name": "X"}
        )
        assert resp.status_code == 404

    def test_update_invalid_content(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.put(
            f"/api/v1/templates/{tid}",
            json={"content": "{?broken}no close"},
        )
        assert resp.status_code == 422


class TestDeleteTemplate:
    def test_delete_success(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.delete(f"/api/v1/templates/{tid}")
        assert resp.status_code == 204

        resp = client.get(f"/api/v1/templates/{tid}")
        assert resp.status_code == 404

    def test_delete_not_found(self, client):
        resp = client.delete(f"/api/v1/templates/{NONEXISTENT_UUID}")
        assert resp.status_code == 404


class TestRenderEndpoint:
    def test_render_success(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.post(
            f"/api/v1/templates/{tid}/render",
            json={"variables": {"customer_name": "राम", "amount": "५००"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "राम" in data["rendered_text"]
        assert "५००" in data["rendered_text"]
        assert data["type"] == "voice"

    def test_render_missing_variable(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.post(
            f"/api/v1/templates/{tid}/render",
            json={"variables": {"customer_name": "राम"}},
        )
        assert resp.status_code == 422
        assert "amount" in resp.json()["detail"]

    def test_render_not_found(self, client):
        resp = client.post(
            f"/api/v1/templates/{NONEXISTENT_UUID}/render",
            json={"variables": {}},
        )
        assert resp.status_code == 404


class TestValidateEndpoint:
    def test_validate_success(self, client, org_id):
        create_resp = client.post(
            "/api/v1/templates/", json=_sample_template(org_id)
        )
        tid = create_resp.json()["id"]

        resp = client.post(f"/api/v1/templates/{tid}/validate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_valid"] is True
        assert sorted(data["required_variables"]) == ["amount", "customer_name"]

    def test_validate_with_defaults_and_conditionals(self, client, org_id):
        sample = _sample_template(org_id)
        payload = {
            **sample,
            "content": "{name} {opt|default} {?cond}block{/cond}",
        }
        create_resp = client.post("/api/v1/templates/", json=payload)
        tid = create_resp.json()["id"]

        resp = client.post(f"/api/v1/templates/{tid}/validate")
        data = resp.json()
        assert data["is_valid"] is True
        assert "name" in data["required_variables"]
        assert "opt" in data["variables_with_defaults"]
        assert "cond" in data["conditional_variables"]

    def test_validate_not_found(self, client):
        resp = client.post(f"/api/v1/templates/{NONEXISTENT_UUID}/validate")
        assert resp.status_code == 404
