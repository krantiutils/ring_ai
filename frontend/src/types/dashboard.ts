export interface Campaign {
  id: string;
  name: string;
  type: "voice" | "text" | "form";
  status: "draft" | "scheduled" | "active" | "paused" | "completed";
  category: "text" | "voice" | "survey" | "combined";
  created_at: string;
  updated_at: string;
  total_contacts?: number;
  completed_interactions?: number;
  failed_interactions?: number;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
  total: number;
  page: number;
  per_page: number;
}

export interface OverviewAnalytics {
  total_campaigns: number;
  campaigns_by_status: Record<string, number>;
  campaigns_by_category: Record<string, number>;
  total_reach: number;
  delivery_rate: number;
  total_credits_consumed: number;
}

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  total_interactions: number;
  status_breakdown: Record<string, number>;
  completion_rate: number;
  carrier_breakdown: CarrierStat[];
  total_duration_seconds: number;
  total_credits_consumed: number;
  total_sms_sent: number;
  average_playback_percentage: number;
}

export interface CarrierStat {
  carrier: string;
  total: number;
  successful: number;
  failed: number;
  pickup_rate: number;
}

export interface PlaybackDistribution {
  bucket_0_25: number;
  bucket_26_50: number;
  bucket_51_75: number;
  bucket_76_100: number;
}

export interface DashboardPlaybackWidget {
  average_playback_percentage: number;
  distribution: PlaybackDistribution;
}

export interface CreditBalance {
  balance: number;
  total_purchased: number;
  total_consumed: number;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: "purchase" | "consume" | "refund";
  reference_id: string | null;
  description: string;
  created_at: string;
  org_id: string;
}

export interface CreditHistoryResponse {
  transactions: CreditTransaction[];
  total: number;
  page: number;
  per_page: number;
}

export interface Template {
  id: string;
  name: string;
  type: "voice" | "text";
  language: string;
  content: string;
  variables: Record<string, string>[];
  created_at: string;
}

export interface TemplateListResponse {
  templates: Template[];
  total: number;
  page: number;
  per_page: number;
}

export interface PhoneNumber {
  id: string;
  phone_number: string;
  is_active: boolean;
  is_broker: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  username: string;
  profile_picture: string | null;
  is_verified: boolean;
  is_kyc_verified: boolean;
}

export interface APIKeyInfo {
  key_prefix: string;
  last_used: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  is_read: boolean;
  created_at: string;
}

export interface KYCStatus {
  status: "pending" | "approved" | "rejected" | "none";
  document_type?: string;
  submitted_at?: string;
  rejection_reason?: string;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
}

export interface CreditUsagePoint {
  period: string;
  message_credits: number;
  call_credits: number;
}

export interface IntentBucket {
  intent: string;
  count: number;
}

export interface IntentDistribution {
  campaign_id: string | null;
  buckets: IntentBucket[];
  total_classified: number;
}

export interface CampaignIntentSummary {
  campaign_id: string;
  top_intent: string | null;
  buckets: IntentBucket[];
  total_classified: number;
}

// ---------------------------------------------------------------------------
// ROI Analytics
// ---------------------------------------------------------------------------

export interface CostBreakdown {
  tts_cost: number;
  telephony_cost: number;
  gemini_cost: number;
  total_cost: number;
}

export interface CampaignROI {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_status: string;
  cost_breakdown: CostBreakdown;
  total_cost: number;
  total_interactions: number;
  completed_interactions: number;
  failed_interactions: number;
  conversion_rate: number | null;
  cost_per_interaction: number | null;
  cost_per_conversion: number | null;
  avg_duration_seconds: number | null;
  total_duration_seconds: number | null;
  avg_sentiment_score: number | null;
}

export interface CampaignComparisonEntry {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_status: string;
  total_interactions: number;
  completed: number;
  failed: number;
  conversion_rate: number | null;
  total_cost: number;
  cost_per_conversion: number | null;
  avg_duration_seconds: number | null;
  avg_sentiment_score: number | null;
}

export interface CampaignComparison {
  campaigns: CampaignComparisonEntry[];
}

export interface ABTestVariantResult {
  variant_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  tts_provider: string | null;
  tts_voice: string | null;
  total_interactions: number;
  completed: number;
  failed: number;
  conversion_rate: number | null;
  total_cost: number;
  cost_per_conversion: number | null;
  avg_duration_seconds: number | null;
  avg_sentiment_score: number | null;
}

export interface ABTestResult {
  ab_test_id: string;
  name: string;
  status: string;
  variants: ABTestVariantResult[];
  chi_squared: number | null;
  p_value: number | null;
  is_significant: boolean;
  winner: string | null;
}

export interface ABTestResponse {
  id: string;
  name: string;
  description: string | null;
  status: string;
  variants: Array<{ name: string; campaign_id: string; campaign_name: string }>;
  created_at: string;
}

export interface ROICalculatorResult {
  total_automated_cost: number;
  total_manual_cost_estimate: number;
  cost_savings: number;
  cost_savings_percentage: number | null;
  total_interactions: number;
  total_completed: number;
  overall_conversion_rate: number | null;
  cost_per_conversion: number | null;
  campaigns_analyzed: number;
}

// TTS types

export interface VoiceInfo {
  voice_id: string;
  name: string;
  gender: string;
  locale: string;
  provider: string;
}

export interface ProviderPricing {
  cost_per_million_chars: number;
  free_tier_chars: number | null;
  currency: string;
  notes: string;
}

export interface ProviderInfo {
  provider: string;
  display_name: string;
  description: string;
  pricing: ProviderPricing;
  requires_api_key: boolean;
  supported_formats: string[];
}

// ---------------------------------------------------------------------------
// Conversation Insights
// ---------------------------------------------------------------------------

export interface ConversationHighlight {
  interaction_id: string;
  contact_phone: string;
  reason: string;
  sentiment_score: number | null;
  duration_seconds: number | null;
  transcript_preview: string | null;
}

export interface TopicCluster {
  topic: string;
  count: number;
  avg_sentiment: number | null;
  sample_transcripts: string[];
}

export interface SentimentTrendPoint {
  date: string;
  avg_sentiment: number;
  count: number;
}

export interface IntentTrendPoint {
  date: string;
  intents: Record<string, number>;
}

export interface InteractionExport {
  interaction_id: string;
  contact_phone: string;
  contact_name: string | null;
  status: string;
  started_at: string | null;
  duration_seconds: number | null;
  sentiment_score: number | null;
  detected_intent: string | null;
  transcript: string | null;
}

export interface InsightsResponse {
  campaign_id: string;
  campaign_name: string;
  summary: string;
  common_themes: string[];
  highlights: ConversationHighlight[];
  topic_clusters: TopicCluster[];
  sentiment_trend: SentimentTrendPoint[];
  intent_trend: IntentTrendPoint[];
  interactions: InteractionExport[];
}
