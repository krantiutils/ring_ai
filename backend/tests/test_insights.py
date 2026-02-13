"""Tests for conversation insights endpoint — POST /analytics/insights."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction

NONEXISTENT_UUID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_campaign_with_insights_data(db, org):
    """Create a campaign with interactions that have transcripts, sentiment, and intent data."""
    campaign = Campaign(name="Insights Test Campaign", type="voice", org_id=org.id, status="completed")
    db.add(campaign)
    db.flush()

    phones = [
        "+9779841111111",
        "+9779802222222",
        "+9779853333333",
        "+9779824444444",
        "+9779845555555",
    ]

    interactions_data = [
        {
            "status": "completed",
            "duration_seconds": 45,
            "transcript": "Hello, I want to pay my bill. Can you help me with that?",
            "sentiment_score": 0.5,
            "metadata": {"detected_intent": "payment", "intent_confidence": 0.9},
        },
        {
            "status": "completed",
            "duration_seconds": 120,
            "transcript": "This is terrible service! I have been waiting forever.",
            "sentiment_score": -0.8,
            "metadata": {"detected_intent": "complaint", "intent_confidence": 0.95},
        },
        {
            "status": "completed",
            "duration_seconds": 30,
            "transcript": "Can you tell me about your products?",
            "sentiment_score": 0.2,
            "metadata": {"detected_intent": "inquiry", "intent_confidence": 0.85},
        },
        {
            "status": "completed",
            "duration_seconds": 5,
            "transcript": "Hello? Hello?",
            "sentiment_score": -0.1,
            "metadata": {"detected_intent": "greeting", "intent_confidence": 0.6},
        },
        {
            "status": "failed",
            "duration_seconds": None,
            "transcript": None,
            "sentiment_score": None,
            "metadata": None,
        },
    ]

    for i, data in enumerate(interactions_data):
        contact = Contact(phone=phones[i], name=f"Contact {i}", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status=data["status"],
            duration_seconds=data["duration_seconds"],
            transcript=data["transcript"],
            sentiment_score=data["sentiment_score"],
            metadata_=data["metadata"],
            started_at=datetime(2026, 2, 10, 10, i, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 2, 10, 10, i, 0, tzinfo=timezone.utc),
        )
        db.add(interaction)

    db.commit()
    return campaign


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestInsightsEndpoint:
    """Tests for POST /api/v1/analytics/insights."""

    def test_insights_campaign_not_found(self, client):
        """Returns 404 for a nonexistent campaign."""
        response = client.post(
            "/api/v1/analytics/insights",
            json={"campaign_id": NONEXISTENT_UUID},
        )
        assert response.status_code == 404

    def test_insights_success_without_gemini_key(self, client, db, org):
        """Returns insights with fallback summary when GEMINI_API_KEY is not set."""
        campaign = _create_campaign_with_insights_data(db, org)

        response = client.post(
            "/api/v1/analytics/insights",
            json={"campaign_id": str(campaign.id)},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["campaign_id"] == str(campaign.id)
        assert data["campaign_name"] == "Insights Test Campaign"

        # Summary should be a fallback (no API key)
        assert "summary" in data
        assert isinstance(data["summary"], str)
        assert len(data["summary"]) > 0

        # Common themes
        assert "common_themes" in data
        assert isinstance(data["common_themes"], list)

        # Highlights
        assert "highlights" in data
        highlights = data["highlights"]
        assert isinstance(highlights, list)
        # Should find the negative sentiment interaction
        negative_highlights = [h for h in highlights if h["reason"] == "extremely_negative_sentiment"]
        assert len(negative_highlights) >= 1
        # Should find short duration interaction (5s)
        short_highlights = [h for h in highlights if h["reason"] == "very_short_duration"]
        assert len(short_highlights) >= 1

        # Topic clusters
        assert "topic_clusters" in data
        clusters = data["topic_clusters"]
        assert isinstance(clusters, list)
        assert len(clusters) > 0
        topics = {c["topic"] for c in clusters}
        assert "payment" in topics
        assert "complaint" in topics

        # Sentiment trend
        assert "sentiment_trend" in data
        assert isinstance(data["sentiment_trend"], list)

        # Intent trend
        assert "intent_trend" in data
        assert isinstance(data["intent_trend"], list)

        # Export interactions
        assert "interactions" in data
        assert len(data["interactions"]) == 5  # all 5 interactions

    def test_insights_empty_campaign(self, client, db, org):
        """Returns insights for a campaign with no interactions."""
        campaign = Campaign(name="Empty Campaign", type="voice", org_id=org.id, status="draft")
        db.add(campaign)
        db.commit()

        response = client.post(
            "/api/v1/analytics/insights",
            json={"campaign_id": str(campaign.id)},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["campaign_name"] == "Empty Campaign"
        assert data["highlights"] == []
        assert data["topic_clusters"] == []
        assert data["interactions"] == []

    def test_insights_interaction_export_fields(self, client, db, org):
        """Verify export data contains expected fields for each interaction."""
        campaign = _create_campaign_with_insights_data(db, org)

        response = client.post(
            "/api/v1/analytics/insights",
            json={"campaign_id": str(campaign.id)},
        )
        assert response.status_code == 200

        interactions = response.json()["interactions"]
        for ix in interactions:
            assert "interaction_id" in ix
            assert "contact_phone" in ix
            assert "status" in ix
            assert "sentiment_score" in ix
            assert "detected_intent" in ix
            assert "transcript" in ix

    def test_insights_topic_cluster_structure(self, client, db, org):
        """Verify topic cluster structure: topic, count, avg_sentiment, samples."""
        campaign = _create_campaign_with_insights_data(db, org)

        response = client.post(
            "/api/v1/analytics/insights",
            json={"campaign_id": str(campaign.id)},
        )
        clusters = response.json()["topic_clusters"]

        for cluster in clusters:
            assert "topic" in cluster
            assert "count" in cluster
            assert cluster["count"] >= 1
            assert "avg_sentiment" in cluster
            assert "sample_transcripts" in cluster
            assert isinstance(cluster["sample_transcripts"], list)

    @patch("app.services.insights._generate_llm_summary", new_callable=AsyncMock)
    def test_insights_with_mocked_llm(self, mock_llm, client, db, org):
        """Verify LLM summary is used when available."""
        mock_llm.return_value = (
            "This campaign showed strong engagement with 80% completion.",
            ["payment processing", "customer satisfaction", "product inquiries"],
        )

        campaign = _create_campaign_with_insights_data(db, org)

        response = client.post(
            "/api/v1/analytics/insights",
            json={"campaign_id": str(campaign.id)},
        )
        assert response.status_code == 200

        data = response.json()
        assert "80% completion" in data["summary"]
        assert "payment processing" in data["common_themes"]
        assert len(data["common_themes"]) == 3

    def test_insights_highlight_reasons(self, client, db, org):
        """Verify that different highlight reasons are detected correctly."""
        campaign = _create_campaign_with_insights_data(db, org)

        response = client.post(
            "/api/v1/analytics/insights",
            json={"campaign_id": str(campaign.id)},
        )
        highlights = response.json()["highlights"]
        reasons = {h["reason"] for h in highlights}

        # The test data should trigger these specific reasons
        assert "extremely_negative_sentiment" in reasons  # -0.8 sentiment
        assert "very_short_duration" in reasons  # 5s call
