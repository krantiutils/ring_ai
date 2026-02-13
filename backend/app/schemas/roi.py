"""Pydantic schemas for ROI analytics and A/B testing endpoints."""

import uuid

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Cost breakdown
# ---------------------------------------------------------------------------


class CostBreakdown(BaseModel):
    """Itemised cost breakdown for a single campaign."""

    tts_cost: float = Field(description="Text-to-speech synthesis cost (NPR)")
    telephony_cost: float = Field(description="Twilio/telephony cost (NPR)")
    total_cost: float = Field(description="Total campaign cost (NPR)")


# ---------------------------------------------------------------------------
# Per-campaign ROI
# ---------------------------------------------------------------------------


class CampaignROI(BaseModel):
    """ROI metrics for a single campaign."""

    campaign_id: uuid.UUID
    campaign_name: str
    campaign_type: str
    campaign_status: str

    # Costs
    cost_breakdown: CostBreakdown
    total_cost: float

    # Conversion
    total_interactions: int
    completed_interactions: int
    failed_interactions: int
    conversion_rate: float | None = Field(description="Completed / total as a ratio")

    # ROI metrics
    cost_per_interaction: float | None = Field(description="Total cost / total interactions")
    cost_per_conversion: float | None = Field(description="Total cost / completed interactions")

    # Duration
    avg_duration_seconds: float | None
    total_duration_seconds: float | None

    # Sentiment (if available)
    avg_sentiment_score: float | None


# ---------------------------------------------------------------------------
# Campaign comparison
# ---------------------------------------------------------------------------


class CampaignComparisonEntry(BaseModel):
    """One row in a campaign-comparison table."""

    campaign_id: uuid.UUID
    campaign_name: str
    campaign_type: str
    campaign_status: str
    total_interactions: int
    completed: int
    failed: int
    conversion_rate: float | None
    total_cost: float
    cost_per_conversion: float | None
    avg_duration_seconds: float | None
    avg_sentiment_score: float | None


class CampaignComparison(BaseModel):
    """Side-by-side comparison of multiple campaigns."""

    campaigns: list[CampaignComparisonEntry]


# ---------------------------------------------------------------------------
# A/B testing
# ---------------------------------------------------------------------------


class ABTestCreate(BaseModel):
    """Request body for creating a new A/B test."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    campaign_ids: list[uuid.UUID] = Field(
        min_length=2,
        description="Campaign IDs to include as variants (min 2).",
    )
    variant_names: list[str] | None = Field(
        default=None,
        description="Optional variant labels (e.g. ['control', 'variant_b']). "
        "If omitted, defaults to 'variant_a', 'variant_b', etc.",
    )


class ABTestVariantResult(BaseModel):
    """Results for one variant in an A/B test."""

    variant_name: str
    campaign_id: uuid.UUID
    campaign_name: str
    total_interactions: int
    completed: int
    failed: int
    conversion_rate: float | None
    total_cost: float
    cost_per_conversion: float | None
    avg_duration_seconds: float | None
    avg_sentiment_score: float | None


class ABTestResult(BaseModel):
    """Full A/B test results with statistical significance."""

    ab_test_id: uuid.UUID
    name: str
    status: str
    variants: list[ABTestVariantResult]

    # Statistical significance
    chi_squared: float | None = Field(description="Chi-squared statistic for conversion rates")
    p_value: float | None = Field(description="p-value from chi-squared test")
    is_significant: bool = Field(
        description="Whether the result is statistically significant (p < 0.05)"
    )
    winner: str | None = Field(
        description="Variant name with highest conversion rate (if significant)"
    )


class ABTestResponse(BaseModel):
    """Response after creating an A/B test."""

    id: uuid.UUID
    name: str
    description: str | None
    status: str
    variants: list[dict]
    created_at: str


# ---------------------------------------------------------------------------
# ROI calculator
# ---------------------------------------------------------------------------


class ROICalculatorRequest(BaseModel):
    """Input for the ROI calculator."""

    campaign_ids: list[uuid.UUID] = Field(
        min_length=1,
        description="Campaign IDs to calculate ROI for",
    )
    manual_cost_per_call: float = Field(
        default=15.0,
        ge=0,
        description="Estimated cost of a manual call (NPR) for comparison",
    )


class ROICalculatorResult(BaseModel):
    """ROI calculator output — automated vs manual cost comparison."""

    total_automated_cost: float
    total_manual_cost_estimate: float
    cost_savings: float
    cost_savings_percentage: float | None
    total_interactions: int
    total_completed: int
    overall_conversion_rate: float | None
    cost_per_conversion: float | None
    campaigns_analyzed: int
