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
