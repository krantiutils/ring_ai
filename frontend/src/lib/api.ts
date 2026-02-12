const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone: string | null;
  profile_picture: string | null;
  is_verified: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  type: "voice" | "text" | "form";
  status: "draft" | "active" | "paused" | "completed";
  template_id: string | null;
  schedule_config: Record<string, unknown> | null;
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
}

export interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
}

export interface Contact {
  id: string;
  org_id: string;
  phone: string;
  name: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface Template {
  id: string;
  org_id: string;
  name: string;
  type: "voice" | "text";
  language: string;
  content: string;
  variables: string[] | null;
  voice_config: Record<string, unknown> | null;
  created_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiKeyInfo {
  id: string;
  key_prefix: string;
  is_active: boolean;
  last_used: string | null;
  created_at: string;
}

export interface ApiKeyGenerated {
  api_key: string;
  key_prefix: string;
  message: string;
}

// Analytics types
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

// Dashboard summary types
export interface DashboardSummary {
  campaigns_by_type: Record<string, number>;
  call_outcomes: Record<string, number>;
  credits_purchased: number;
  credits_topup: number;
  top_performing_campaign: { name: string; success_rate: number } | null;
  total_credits_used: number;
  remaining_credits: number;
  total_campaigns: number;
  campaigns_breakdown: Record<string, number>;
  total_outbound_calls: number;
  successful_calls: number;
  failed_calls: number;
  total_outbound_sms: number;
  total_call_duration_seconds: number;
  total_owned_numbers: number;
  avg_playback_percent: number;
  avg_credit_spent: Record<string, number>;
  playback_distribution: { range: string; count: number }[];
  credit_usage_over_time: { week: string; message: number; call: number }[];
}

export interface CreditTransaction {
  id: string;
  org_id: string;
  type: "purchase" | "topup" | "usage";
  credit_type: string;
  credit_rate: number;
  amount: number;
  from_source: string;
  campaign_id: string | null;
  campaign_name: string | null;
  description: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ring_ai_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(data: {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function refreshToken(): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/v1/auth/refresh", { method: "POST" });
}

export async function getUserProfile(): Promise<User> {
  return apiFetch<User>("/api/v1/auth/user-profile");
}

export async function generateApiKey(): Promise<ApiKeyGenerated> {
  return apiFetch<ApiKeyGenerated>("/api/v1/auth/api-keys/generate", { method: "POST" });
}

export async function getApiKeyInfo(): Promise<ApiKeyInfo | null> {
  try {
    return await apiFetch<ApiKeyInfo>("/api/v1/auth/api-keys");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function listCampaigns(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  type?: string;
}): Promise<Paginated<Campaign>> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  if (params?.status) sp.set("status", params.status);
  if (params?.type) sp.set("type", params.type);
  return apiFetch<Paginated<Campaign>>(`/api/v1/campaigns/?${sp}`);
}

export async function getCampaign(id: string): Promise<CampaignWithStats> {
  return apiFetch<CampaignWithStats>(`/api/v1/campaigns/${id}`);
}

export async function createCampaign(data: {
  name: string;
  type: string;
  org_id: string;
  template_id?: string;
  schedule_config?: Record<string, unknown>;
}): Promise<Campaign> {
  return apiFetch<Campaign>("/api/v1/campaigns/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCampaign(id: string, data: {
  name?: string;
  template_id?: string;
  schedule_config?: Record<string, unknown>;
}): Promise<Campaign> {
  return apiFetch<Campaign>(`/api/v1/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/campaigns/${id}`, { method: "DELETE" });
}

export async function startCampaign(id: string): Promise<Campaign> {
  return apiFetch<Campaign>(`/api/v1/campaigns/${id}/start`, { method: "POST" });
}

export async function pauseCampaign(id: string): Promise<Campaign> {
  return apiFetch<Campaign>(`/api/v1/campaigns/${id}/pause`, { method: "POST" });
}

export async function resumeCampaign(id: string): Promise<Campaign> {
  return apiFetch<Campaign>(`/api/v1/campaigns/${id}/resume`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function uploadContacts(campaignId: string, file: File): Promise<{ contacts_added: number }> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{ contacts_added: number }>(`/api/v1/campaigns/${campaignId}/contacts`, {
    method: "POST",
    body: form,
  });
}

export async function listCampaignContacts(campaignId: string, params?: {
  page?: number;
  page_size?: number;
}): Promise<Paginated<Contact>> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  return apiFetch<Paginated<Contact>>(`/api/v1/campaigns/${campaignId}/contacts?${sp}`);
}

export async function removeContact(campaignId: string, contactId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/campaigns/${campaignId}/contacts/${contactId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates(params?: {
  page?: number;
  page_size?: number;
}): Promise<Paginated<Template>> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  return apiFetch<Paginated<Template>>(`/api/v1/templates/?${sp}`);
}

export async function getTemplate(id: string): Promise<Template> {
  return apiFetch<Template>(`/api/v1/templates/${id}`);
}

export async function createTemplate(data: {
  org_id: string;
  name: string;
  type: string;
  content: string;
  language?: string;
}): Promise<Template> {
  return apiFetch<Template>("/api/v1/templates/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTemplate(id: string, data: {
  name?: string;
  content?: string;
}): Promise<Template> {
  return apiFetch<Template>(`/api/v1/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/templates/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function getOverviewAnalytics(orgId: string, params?: {
  start_date?: string;
  end_date?: string;
}): Promise<OverviewAnalytics> {
  const sp = new URLSearchParams({ org_id: orgId });
  if (params?.start_date) sp.set("start_date", params.start_date);
  if (params?.end_date) sp.set("end_date", params.end_date);
  return apiFetch<OverviewAnalytics>(`/api/v1/analytics/overview?${sp}`);
}

export async function getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  return apiFetch<CampaignAnalytics>(`/api/v1/analytics/campaigns/${campaignId}`);
}

// ---------------------------------------------------------------------------
// Dashboard Summary
// ---------------------------------------------------------------------------

export async function getDashboardSummary(orgId: string): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>(`/api/v1/analytics/dashboard?org_id=${orgId}`);
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export async function listCreditTransactions(params?: {
  org_id?: string;
  type?: string;
  page?: number;
  page_size?: number;
  start_date?: string;
  end_date?: string;
}): Promise<Paginated<CreditTransaction>> {
  const sp = new URLSearchParams();
  if (params?.org_id) sp.set("org_id", params.org_id);
  if (params?.type) sp.set("type", params.type);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  if (params?.start_date) sp.set("start_date", params.start_date);
  if (params?.end_date) sp.set("end_date", params.end_date);
  return apiFetch<Paginated<CreditTransaction>>(`/api/v1/analytics/credits?${sp}`);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function healthCheck(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}
