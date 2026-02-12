const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function setToken(token: string): void {
  localStorage.setItem("access_token", token);
}

function clearToken(): void {
  localStorage.removeItem("access_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    // Try refresh
    const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setToken(data.access_token);
      headers["Authorization"] = `Bearer ${data.access_token}`;
      const retry = await fetch(`${API_BASE}/api/v1${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
      if (!retry.ok) {
        throw new ApiError(await retry.text(), retry.status);
      }
      return retry.json();
    }

    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError("Session expired", 401);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(text, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone: string | null;
  address: string | null;
  profile_picture: string | null;
  is_verified: boolean;
  is_kyc_verified: boolean;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const data = await request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data;
}

export async function getUserProfile(): Promise<UserProfile> {
  return request<UserProfile>("/auth/user-profile");
}

export async function generateApiKey(): Promise<{ api_key: string; message: string }> {
  return request("/auth/api-keys/generate", { method: "POST" });
}

export async function getApiKey(): Promise<{ key_prefix: string; last_used: string | null; created_at: string } | null> {
  return request("/auth/api-keys");
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  type: "voice" | "text" | "form";
  status: "draft" | "scheduled" | "active" | "paused" | "completed";
  category: "text" | "voice" | "survey" | "combined" | null;
  template_id: string | null;
  voice_model_id: string | null;
  form_id: string | null;
  schedule_config: Record<string, unknown> | null;
  scheduled_at: string | null;
  retry_count: number;
  retry_config: Record<string, unknown> | null;
  source_campaign_id: string | null;
  audio_file: string | null;
  bulk_file: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total_contacts: number;
  completed: number;
  failed: number;
  pending: number;
  in_progress: number;
  avg_duration_seconds: number | null;
  delivery_rate: number | null;
  cost_estimate: number | null;
  avg_playback_percentage: number | null;
  avg_playback_duration_seconds: number | null;
}

export interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export async function listCampaigns(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  type?: string;
  category?: string;
}): Promise<PaginatedResponse<Campaign>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.status) qs.set("status", params.status);
  if (params?.type) qs.set("type", params.type);
  if (params?.category) qs.set("category", params.category);
  const query = qs.toString();
  return request(`/campaigns${query ? `?${query}` : ""}`);
}

export async function getCampaign(id: string): Promise<CampaignWithStats> {
  return request(`/campaigns/${id}`);
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface OverviewAnalytics {
  campaigns_by_status: Record<string, number>;
  total_contacts_reached: number;
  total_calls: number;
  total_sms: number;
  avg_call_duration_seconds: number | null;
  overall_delivery_rate: number | null;
  credits_consumed: number;
  credits_by_period: { period: string; credits: number }[];
  start_date: string | null;
  end_date: string | null;
}

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  campaign_status: string;
  status_breakdown: Record<string, number>;
  completion_rate: number | null;
  avg_duration_seconds: number | null;
  credit_consumption: number;
  hourly_distribution: { hour: number; count: number }[];
  daily_distribution: { date: string; count: number }[];
  carrier_breakdown: Record<string, number>;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface CarrierBreakdown {
  carrier: string;
  total: number;
  success: number;
  fail: number;
  pickup_pct: number;
}

export interface PlaybackBucket {
  bucket: string;
  count: number;
}

export interface DashboardPlaybackWidget {
  avg_playback_percentage: number | null;
  total_completed_calls: number;
  distribution: PlaybackBucket[];
}

export async function getOverviewAnalytics(orgId: string): Promise<OverviewAnalytics> {
  return request(`/analytics/overview?org_id=${orgId}`);
}

export async function getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  return request(`/analytics/campaigns/${campaignId}`);
}

export async function getCampaignsByCategory(): Promise<CategoryCount[]> {
  return request("/analytics/campaigns/by-category");
}

export async function getCarrierBreakdown(campaignId?: string): Promise<CarrierBreakdown[]> {
  const qs = campaignId ? `?campaign_id=${campaignId}` : "";
  return request(`/analytics/carrier-breakdown${qs}`);
}

export async function getDashboardPlayback(orgId: string): Promise<DashboardPlaybackWidget> {
  return request(`/analytics/dashboard/playback?org_id=${orgId}`);
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export interface CreditBalance {
  org_id: string;
  balance: number;
  total_purchased: number;
  total_consumed: number;
}

export interface CreditTransaction {
  id: string;
  org_id: string;
  amount: number;
  type: "purchase" | "consume" | "refund";
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export async function getCreditBalance(orgId: string): Promise<CreditBalance> {
  return request(`/credits/balance?org_id=${orgId}`);
}

export async function getCreditHistory(orgId: string, page = 1, pageSize = 20): Promise<PaginatedResponse<CreditTransaction>> {
  return request(`/credits/history?org_id=${orgId}&page=${page}&page_size=${pageSize}`);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface Template {
  id: string;
  name: string;
  content: string;
  type: string;
  org_id: string;
  language: string | null;
  variables: string[];
  voice_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function listTemplates(page = 1, pageSize = 20): Promise<PaginatedResponse<Template>> {
  return request(`/templates?page=${page}&page_size=${pageSize}`);
}

export async function createTemplate(data: { name: string; content: string; type: string; org_id: string }): Promise<Template> {
  return request("/templates", { method: "POST", body: JSON.stringify(data) });
}

export async function updateTemplate(id: string, data: { name?: string; content?: string }): Promise<Template> {
  return request(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteTemplate(id: string): Promise<void> {
  return request(`/templates/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export async function listNotifications(page = 1, pageSize = 20): Promise<PaginatedResponse<Notification>> {
  return request(`/notifications?page=${page}&page_size=${pageSize}`);
}

export async function getUnreadCount(): Promise<{ unread_count: number }> {
  return request("/notifications/unread-count");
}

// ---------------------------------------------------------------------------
// Phone Numbers
// ---------------------------------------------------------------------------

export async function listActivePhones(orgId: string): Promise<{ id: string; phone_number: string; is_broker: boolean }[]> {
  return request(`/phone-numbers/active?org_id=${orgId}`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export { getToken, setToken, clearToken, ApiError };
