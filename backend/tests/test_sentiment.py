"""Tests for sentiment analysis service and analytics integration."""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.services.analytics import (
    get_campaign_analytics,
    get_campaign_sentiment_summary,
    get_overview_analytics,
)
from app.services.sentiment import (
    SentimentError,
    SentimentResult,
    analyze_interaction_sentiment,
    analyze_sentiment,
    backfill_sentiment,
)

# ---------------------------------------------------------------------------
# SentimentResult unit tests
# ---------------------------------------------------------------------------


class TestSentimentResult:
    def test_valid_result(self):
        r = SentimentResult(score=0.5, confidence=0.9)
        assert r.score == 0.5
        assert r.confidence == 0.9

    def test_boundary_values(self):
        r = SentimentResult(score=-1.0, confidence=0.0)
        assert r.score == -1.0
        assert r.confidence == 0.0

        r = SentimentResult(score=1.0, confidence=1.0)
        assert r.score == 1.0
        assert r.confidence == 1.0

    def test_score_out_of_range(self):
        with pytest.raises(ValueError, match="score must be between"):
            SentimentResult(score=1.5, confidence=0.9)
        with pytest.raises(ValueError, match="score must be between"):
            SentimentResult(score=-1.5, confidence=0.9)

    def test_confidence_out_of_range(self):
        with pytest.raises(ValueError, match="confidence must be between"):
            SentimentResult(score=0.5, confidence=1.5)
        with pytest.raises(ValueError, match="confidence must be between"):
            SentimentResult(score=0.5, confidence=-0.1)


# ---------------------------------------------------------------------------
# analyze_sentiment tests
# ---------------------------------------------------------------------------


class TestAnalyzeSentiment:
    @pytest.mark.asyncio
    async def test_empty_transcript_raises(self):
        with pytest.raises(SentimentError, match="Empty transcript"):
            await analyze_sentiment("")

        with pytest.raises(SentimentError, match="Empty transcript"):
            await analyze_sentiment("   ")

    @pytest.mark.asyncio
    async def test_no_api_key_raises(self):
        original = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = ""
        try:
            with pytest.raises(SentimentError, match="OPENAI_API_KEY not configured"):
                await analyze_sentiment("Hello, how are you?")
        finally:
            settings.OPENAI_API_KEY = original

    @pytest.mark.asyncio
    async def test_successful_analysis(self):
        api_response = {"choices": [{"message": {"content": json.dumps({"score": 0.7, "confidence": 0.95})}}]}

        original = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = "test-key"
        try:
            with patch("app.services.sentiment.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

                mock_resp = MagicMock()
                mock_resp.json.return_value = api_response
                mock_resp.raise_for_status = MagicMock()
                mock_client.post.return_value = mock_resp

                result = await analyze_sentiment("The customer was very happy with the service.")
                assert result.score == 0.7
                assert result.confidence == 0.95
        finally:
            settings.OPENAI_API_KEY = original

    @pytest.mark.asyncio
    async def test_clamping_out_of_range_values(self):
        api_response = {"choices": [{"message": {"content": json.dumps({"score": 1.5, "confidence": 2.0})}}]}

        original = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = "test-key"
        try:
            with patch("app.services.sentiment.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

                mock_resp = MagicMock()
                mock_resp.json.return_value = api_response
                mock_resp.raise_for_status = MagicMock()
                mock_client.post.return_value = mock_resp

                result = await analyze_sentiment("Test transcript")
                assert result.score == 1.0
                assert result.confidence == 1.0
        finally:
            settings.OPENAI_API_KEY = original

    @pytest.mark.asyncio
    async def test_malformed_response_raises(self):
        api_response = {"choices": [{"message": {"content": "This is not JSON"}}]}

        original = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = "test-key"
        try:
            with patch("app.services.sentiment.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

                mock_resp = MagicMock()
                mock_resp.json.return_value = api_response
                mock_resp.raise_for_status = MagicMock()
                mock_client.post.return_value = mock_resp

                with pytest.raises(SentimentError, match="Failed to parse"):
                    await analyze_sentiment("Test transcript")
        finally:
            settings.OPENAI_API_KEY = original


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_campaign_with_sentiment(db, org, *, sentiment_scores=None):
    """Create a campaign with interactions that have sentiment scores."""
    campaign = Campaign(name="Sentiment Test", type="voice", org_id=org.id, status="active")
    db.add(campaign)
    db.flush()

    if sentiment_scores is None:
        sentiment_scores = [0.8, -0.2, 0.5, None]

    interactions = []
    for i, score in enumerate(sentiment_scores):
        contact = Contact(phone=f"+977984123456{i}", name=f"Contact {i}", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="completed",
            duration_seconds=45,
            transcript=f"Test transcript {i}" if score is not None else None,
            sentiment_score=score,
            started_at=datetime(2026, 2, 10, 10, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 2, 10, 10, 0, 45, tzinfo=timezone.utc),
        )
        db.add(interaction)
        interactions.append(interaction)

    db.commit()
    return campaign, interactions


# ---------------------------------------------------------------------------
# analyze_interaction_sentiment tests
# ---------------------------------------------------------------------------


class TestAnalyzeInteractionSentiment:
    @pytest.mark.asyncio
    async def test_disabled_returns_none(self, db, org):
        campaign, interactions = _create_campaign_with_sentiment(db, org, sentiment_scores=[None])
        original = settings.SENTIMENT_ANALYSIS_ENABLED
        settings.SENTIMENT_ANALYSIS_ENABLED = False
        try:
            result = await analyze_interaction_sentiment(db, interactions[0].id)
            assert result is None
        finally:
            settings.SENTIMENT_ANALYSIS_ENABLED = original

    @pytest.mark.asyncio
    async def test_nonexistent_interaction(self, db):
        result = await analyze_interaction_sentiment(db, uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_no_transcript_returns_none(self, db, org):
        campaign, interactions = _create_campaign_with_sentiment(db, org, sentiment_scores=[None])
        # This interaction has no transcript (None sentiment_score means None transcript in our helper)
        result = await analyze_interaction_sentiment(db, interactions[0].id)
        assert result is None

    @pytest.mark.asyncio
    async def test_successful_updates_db(self, db, org):
        # Create interaction with transcript but no sentiment
        campaign = Campaign(name="Test", type="voice", org_id=org.id, status="active")
        db.add(campaign)
        db.flush()
        contact = Contact(phone="+9779841234567", name="Test", org_id=org.id)
        db.add(contact)
        db.flush()
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="completed",
            transcript="The customer was very satisfied with the service.",
        )
        db.add(interaction)
        db.commit()

        with patch("app.services.sentiment.analyze_sentiment") as mock_analyze:
            mock_analyze.return_value = SentimentResult(score=0.8, confidence=0.95)
            result = await analyze_interaction_sentiment(db, interaction.id)

        assert result is not None
        assert result.score == 0.8
        assert result.confidence == 0.95

        db.refresh(interaction)
        assert interaction.sentiment_score == 0.8
        assert interaction.metadata_["sentiment_confidence"] == 0.95


# ---------------------------------------------------------------------------
# backfill_sentiment tests
# ---------------------------------------------------------------------------


class TestBackfillSentiment:
    @pytest.mark.asyncio
    async def test_disabled_raises(self, db):
        original = settings.SENTIMENT_ANALYSIS_ENABLED
        settings.SENTIMENT_ANALYSIS_ENABLED = False
        try:
            with pytest.raises(SentimentError, match="disabled"):
                await backfill_sentiment(db)
        finally:
            settings.SENTIMENT_ANALYSIS_ENABLED = original

    @pytest.mark.asyncio
    async def test_no_api_key_raises(self, db):
        original_key = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = ""
        try:
            with pytest.raises(SentimentError, match="OPENAI_API_KEY"):
                await backfill_sentiment(db)
        finally:
            settings.OPENAI_API_KEY = original_key

    @pytest.mark.asyncio
    async def test_backfill_skips_already_scored(self, db, org):
        campaign, interactions = _create_campaign_with_sentiment(db, org, sentiment_scores=[0.5])
        # interaction already has score, should be skipped (no force)
        original_key = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = "test-key"
        try:
            with patch("app.services.sentiment.analyze_sentiment") as mock_analyze:
                mock_analyze.return_value = SentimentResult(score=0.9, confidence=0.95)
                summary = await backfill_sentiment(db, campaign_id=campaign.id)

            # Already scored, so filtered out by the query
            assert summary["total"] == 0
            assert summary["analyzed"] == 0
        finally:
            settings.OPENAI_API_KEY = original_key

    @pytest.mark.asyncio
    async def test_backfill_with_force(self, db, org):
        # Create interaction with existing score and transcript
        campaign = Campaign(name="Force Test", type="voice", org_id=org.id, status="active")
        db.add(campaign)
        db.flush()
        contact = Contact(phone="+9779841234567", name="Test", org_id=org.id)
        db.add(contact)
        db.flush()
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="completed",
            transcript="Test transcript for force backfill",
            sentiment_score=0.3,
        )
        db.add(interaction)
        db.commit()

        original_key = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = "test-key"
        try:
            with patch("app.services.sentiment.analyze_sentiment") as mock_analyze:
                mock_analyze.return_value = SentimentResult(score=0.9, confidence=0.99)
                summary = await backfill_sentiment(db, campaign_id=campaign.id, force=True)

            assert summary["analyzed"] == 1
            db.refresh(interaction)
            assert interaction.sentiment_score == 0.9
        finally:
            settings.OPENAI_API_KEY = original_key

    @pytest.mark.asyncio
    async def test_backfill_handles_failures(self, db, org):
        # Create interaction with transcript but no score
        campaign = Campaign(name="Fail Test", type="voice", org_id=org.id, status="active")
        db.add(campaign)
        db.flush()
        contact = Contact(phone="+9779841234567", name="Test", org_id=org.id)
        db.add(contact)
        db.flush()
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="completed",
            transcript="Test transcript for failure",
        )
        db.add(interaction)
        db.commit()

        original_key = settings.OPENAI_API_KEY
        settings.OPENAI_API_KEY = "test-key"
        try:
            with patch("app.services.sentiment.analyze_sentiment") as mock_analyze:
                mock_analyze.side_effect = SentimentError("API error")
                summary = await backfill_sentiment(db, campaign_id=campaign.id)

            assert summary["failed"] == 1
            assert summary["analyzed"] == 0
        finally:
            settings.OPENAI_API_KEY = original_key


# ---------------------------------------------------------------------------
# Analytics integration tests
# ---------------------------------------------------------------------------


class TestSentimentAnalytics:
    def test_campaign_analytics_includes_sentiment(self, db, org):
        _create_campaign_with_sentiment(db, org, sentiment_scores=[0.8, -0.2, 0.5, None])

        campaign = db.query(Campaign).filter(Campaign.org_id == org.id).first()
        result = get_campaign_analytics(db, campaign.id)

        # avg of 0.8, -0.2, 0.5 = 1.1 / 3 = 0.37
        assert result.avg_sentiment_score is not None
        assert abs(result.avg_sentiment_score - 0.37) < 0.01

    def test_campaign_analytics_no_sentiment(self, db, org):
        _create_campaign_with_sentiment(db, org, sentiment_scores=[None])

        campaign = db.query(Campaign).filter(Campaign.org_id == org.id).first()
        result = get_campaign_analytics(db, campaign.id)

        assert result.avg_sentiment_score is None

    def test_overview_analytics_includes_sentiment(self, db, org):
        _create_campaign_with_sentiment(db, org, sentiment_scores=[0.8, -0.2, 0.5, None])

        result = get_overview_analytics(db, org.id)
        assert result.avg_sentiment_score is not None
        assert abs(result.avg_sentiment_score - 0.37) < 0.01

    def test_campaign_sentiment_summary(self, db, org):
        _create_campaign_with_sentiment(db, org, sentiment_scores=[0.8, -0.5, 0.1, 0.0, None])

        campaign = db.query(Campaign).filter(Campaign.org_id == org.id).first()
        result = get_campaign_sentiment_summary(db, campaign.id)

        assert result.campaign_id == campaign.id
        assert result.positive_count == 1  # 0.8
        assert result.negative_count == 1  # -0.5
        assert result.neutral_count == 2  # 0.1, 0.0
        assert result.analyzed_count == 4
        assert result.avg_sentiment_score is not None

    def test_campaign_sentiment_summary_not_found(self, db):
        with pytest.raises(ValueError, match="not found"):
            get_campaign_sentiment_summary(db, uuid.uuid4())


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


class TestSentimentEndpoints:
    def test_campaign_sentiment_endpoint(self, client, org, db):
        _create_campaign_with_sentiment(db, org, sentiment_scores=[0.8, -0.5, 0.1])
        campaign = db.query(Campaign).filter(Campaign.org_id == org.id).first()

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}/sentiment")
        assert resp.status_code == 200

        data = resp.json()
        assert data["campaign_id"] == str(campaign.id)
        assert data["positive_count"] == 1
        assert data["negative_count"] == 1
        assert data["neutral_count"] == 1
        assert data["analyzed_count"] == 3

    def test_campaign_sentiment_not_found(self, client):
        resp = client.get(f"/api/v1/analytics/campaigns/{uuid.uuid4()}/sentiment")
        assert resp.status_code == 404

    def test_overview_includes_avg_sentiment(self, client, org, db):
        _create_campaign_with_sentiment(db, org, sentiment_scores=[0.6, 0.4])

        resp = client.get(f"/api/v1/analytics/overview?org_id={org.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "avg_sentiment_score" in data
        assert data["avg_sentiment_score"] is not None

    def test_campaign_analytics_includes_avg_sentiment(self, client, org, db):
        _create_campaign_with_sentiment(db, org, sentiment_scores=[0.6, 0.4])
        campaign = db.query(Campaign).filter(Campaign.org_id == org.id).first()

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "avg_sentiment_score" in data
        assert data["avg_sentiment_score"] is not None
