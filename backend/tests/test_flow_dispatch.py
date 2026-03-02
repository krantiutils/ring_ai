"""Tests for flow action dispatch — SMS, Voice, WhatsApp via Twilio."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.flow_dispatch import (
    DispatchResult,
    dispatch_action,
    dispatch_sms,
    dispatch_voice,
    dispatch_voice_interactive,
    pop_interactive_session_config,
    render_template,
)


# ---------------------------------------------------------------------------
# render_template
# ---------------------------------------------------------------------------

class TestRenderTemplate:
    def test_replaces_single_variable(self):
        assert render_template("Hi {{name}}", {"name": "Ram"}) == "Hi Ram"

    def test_replaces_multiple_variables(self):
        result = render_template("{{name}} phone {{phone}}", {"name": "Sita", "phone": "+977"})
        assert result == "Sita phone +977"

    def test_missing_variable_left_blank(self):
        assert render_template("Hi {{name}}", {}) == "Hi "

    def test_no_variables(self):
        assert render_template("plain text", {"name": "Ram"}) == "plain text"

    def test_curly_brace_variants(self):
        # Frontend uses {{ name }} with spaces sometimes
        assert render_template("Hi {{ name }}", {"name": "Ram"}) == "Hi Ram"

    def test_preserves_non_template_curlies(self):
        assert render_template("json {key}", {"key": "val"}) == "json {key}"


# ---------------------------------------------------------------------------
# dispatch_sms
# ---------------------------------------------------------------------------

class TestDispatchSms:
    @pytest.fixture
    def mock_provider(self):
        provider = MagicMock()
        provider.default_from_number = "+14155238886"
        provider.send_sms = AsyncMock(
            return_value=MagicMock(message_id="SM123", status="queued")
        )
        return provider

    def test_sends_sms_with_rendered_message(self, mock_provider):
        row = {"name": "Ram", "phone": "+9779800000000"}
        config = {"message": "Hi {{name}}"}
        result = asyncio.get_event_loop().run_until_complete(
            dispatch_sms(mock_provider, row, config)
        )
        mock_provider.send_sms.assert_called_once_with(
            to="+9779800000000",
            from_number="+14155238886",
            body="Hi Ram",
        )
        assert result.status == "queued"
        assert result.provider_id == "SM123"

    def test_uses_phone_column(self, mock_provider):
        row = {"phone": "+1234"}
        config = {"message": "Hello"}
        asyncio.get_event_loop().run_until_complete(
            dispatch_sms(mock_provider, row, config)
        )
        mock_provider.send_sms.assert_called_once()
        call_kwargs = mock_provider.send_sms.call_args
        assert call_kwargs.kwargs["to"] == "+1234"

    def test_missing_phone_returns_failed(self, mock_provider):
        row = {"name": "Ram"}
        config = {"message": "Hi"}
        result = asyncio.get_event_loop().run_until_complete(
            dispatch_sms(mock_provider, row, config)
        )
        assert result.status == "failed"
        assert "phone" in result.error.lower()
        mock_provider.send_sms.assert_not_called()

    def test_provider_error_returns_failed(self, mock_provider):
        mock_provider.send_sms = AsyncMock(side_effect=Exception("Twilio down"))
        row = {"phone": "+1234"}
        config = {"message": "Hi"}
        result = asyncio.get_event_loop().run_until_complete(
            dispatch_sms(mock_provider, row, config)
        )
        assert result.status == "failed"
        assert "Twilio down" in result.error

    def test_uses_configured_from_number_when_row_override_missing(self, mock_provider):
        row = {"phone": "+1234"}
        config = {"message": "Hi", "from_number": "+15550001111"}
        asyncio.get_event_loop().run_until_complete(
            dispatch_sms(mock_provider, row, config)
        )
        call_kwargs = mock_provider.send_sms.call_args
        assert call_kwargs.kwargs["from_number"] == "+15550001111"


# ---------------------------------------------------------------------------
# dispatch_voice
# ---------------------------------------------------------------------------

class TestDispatchVoice:
    @pytest.fixture
    def mock_provider(self):
        provider = MagicMock()
        provider.default_from_number = "+14155238886"
        provider.initiate_call = AsyncMock(
            return_value=MagicMock(call_id="CA123", status="initiated")
        )
        return provider

    def test_initiates_call(self, mock_provider):
        row = {"phone": "+9779800000000", "name": "Ram"}
        config = {"script": "Hello {{name}}"}
        result = asyncio.get_event_loop().run_until_complete(
            dispatch_voice(mock_provider, row, config, base_url="https://example.com")
        )
        mock_provider.initiate_call.assert_called_once()
        assert result.status == "initiated"
        assert result.provider_id == "CA123"

    def test_missing_phone_returns_failed(self, mock_provider):
        row = {"name": "Ram"}
        config = {"script": "Hello"}
        result = asyncio.get_event_loop().run_until_complete(
            dispatch_voice(mock_provider, row, config, base_url="https://example.com")
        )
        assert result.status == "failed"
        mock_provider.initiate_call.assert_not_called()

    def test_uses_configured_from_number_when_row_override_missing(self, mock_provider):
        row = {"phone": "+9779800000000", "name": "Ram"}
        config = {"script": "Hello {{name}}", "from_number": "+15550002222"}
        asyncio.get_event_loop().run_until_complete(
            dispatch_voice(mock_provider, row, config, base_url="https://example.com")
        )
        call_kwargs = mock_provider.initiate_call.call_args
        assert call_kwargs.kwargs["from_number"] == "+15550002222"


class TestDispatchVoiceInteractive:
    @pytest.fixture
    def mock_provider(self):
        provider = MagicMock()
        provider.default_from_number = "+14155238886"
        provider.initiate_call = AsyncMock(
            return_value=MagicMock(call_id="CA123", status="initiated")
        )
        return provider

    def test_stores_and_pops_interactive_session_config(self, mock_provider):
        row = {"phone": "+9779800000000", "name": "Ram"}
        config = {
            "system_prompt": "Talk to {{name}}",
            "capture_columns": "intent,budget",
            "capture_instructions": "Capture key outcomes",
        }
        result = asyncio.get_event_loop().run_until_complete(
            dispatch_voice_interactive(mock_provider, row, config, base_url="https://example.com")
        )
        assert result.status == "initiated"
        # session_id is embedded in twiml URL passed to provider
        twiml_url = mock_provider.initiate_call.call_args.kwargs["twiml_url"]
        session_id = twiml_url.rsplit("/", 1)[-1]
        saved = pop_interactive_session_config(session_id)
        assert saved is not None
        assert saved["capture_columns"] == ["intent", "budget"]
        assert saved["capture_instructions"] == "Capture key outcomes"


# ---------------------------------------------------------------------------
# dispatch_action (routing)
# ---------------------------------------------------------------------------

class TestDispatchAction:
    def test_routes_sms(self):
        with patch("app.services.flow_dispatch.get_twilio_provider") as mock_get:
            provider = MagicMock()
            provider.default_from_number = "+1"
            provider.send_sms = AsyncMock(
                return_value=MagicMock(message_id="SM1", status="queued")
            )
            mock_get.return_value = provider

            row = {"phone": "+1234"}
            config = {"message": "Hi"}
            result = dispatch_action("agent_sms", row, config)
            assert result.status == "queued"

    def test_routes_voice(self):
        with patch("app.services.flow_dispatch.get_twilio_provider") as mock_get, \
             patch("app.services.flow_dispatch.settings") as mock_settings:
            provider = MagicMock()
            provider.default_from_number = "+1"
            provider.initiate_call = AsyncMock(
                return_value=MagicMock(call_id="CA1", status="initiated")
            )
            mock_get.return_value = provider
            mock_settings.TWILIO_BASE_URL = "https://example.com"

            row = {"phone": "+1234"}
            config = {"script": "Hello"}
            result = dispatch_action("agent_voice", row, config)
            assert result.status == "initiated"

    def test_unknown_kind_returns_skipped(self):
        result = dispatch_action("unknown_action", {"phone": "+1"}, {})
        assert result.status == "skipped"

    def test_provider_not_configured_returns_failed(self):
        with patch("app.services.flow_dispatch.get_twilio_provider") as mock_get:
            from app.services.telephony.exceptions import TelephonyConfigurationError
            mock_get.side_effect = TelephonyConfigurationError("not configured")

            result = dispatch_action("agent_sms", {"phone": "+1"}, {"message": "Hi"})
            assert result.status == "failed"
            assert "not configured" in result.error.lower()


# ---------------------------------------------------------------------------
# dispatch_action_task (Celery task)
# ---------------------------------------------------------------------------

class TestDispatchActionTask:
    def test_task_calls_dispatch(self, db):
        from contextlib import contextmanager

        from app.models.flow_definition import FlowDefinition
        from app.models.flow_run import FlowRun

        flow = FlowDefinition(
            user_id=uuid.uuid4(),
            name="Test",
            nodes=[
                {"id": "t1", "data": {"kind": "trigger_manual", "config": {}}},
                {"id": "sms1", "data": {"kind": "agent_sms", "config": {"message": "Hi {{name}}"}}},
                {"id": "e1", "data": {"kind": "end_success", "config": {}}},
            ],
            edges=[
                {"id": "e1", "source": "t1", "target": "sms1"},
                {"id": "e2", "source": "sms1", "target": "e1"},
            ],
            status="active",
        )
        db.add(flow)
        db.commit()

        run = FlowRun(flow_id=flow.id, status="running", contact_rows=[])
        db.add(run)
        db.commit()

        @contextmanager
        def fake_session():
            yield db

        with patch("app.services.flow_tasks.dispatch_action") as mock_dispatch, \
             patch("app.services.flow_tasks.SessionLocal", fake_session):
            mock_dispatch.return_value = DispatchResult(status="queued", provider_id="SM1")

            from app.services.flow_tasks import dispatch_action_task
            dispatch_action_task(
                str(run.id), "sms1", {"name": "Ram", "phone": "+977"}
            )
            mock_dispatch.assert_called_once_with(
                "agent_sms",
                {"name": "Ram", "phone": "+977"},
                {"message": "Hi {{name}}"},
            )
