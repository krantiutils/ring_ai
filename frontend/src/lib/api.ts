import { clearAccessToken, getAccessToken } from "@/lib/auth";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const ORG_STORAGE_KEY = "org_id";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return getAccessToken();
}

function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ORG_STORAGE_KEY);
}

function storeOrgId(orgId?: string | null): void {
  if (typeof window === "undefined" || !orgId) return;
  localStorage.setItem(ORG_STORAGE_KEY, orgId);
}

function withOrgId(path: string, orgId?: string | null): string {
  const resolvedOrgId = orgId || getStoredOrgId();
  if (!resolvedOrgId) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}org_id=${encodeURIComponent(resolvedOrgId)}`;
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

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      clearAccessToken();
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }

  return res.json();
}

export const api = {
  // Auth
  register: (data: {
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    phone?: string;
    password: string;
  }) =>
    request<{ id: string; username: string; email: string; message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  googleLogin: (idToken: string) =>
    request<{ access_token: string; token_type: string }>("/auth/google-login", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken }),
    }),
  mobileSignupSendOtp: (phone: string) =>
    request<{ request_id: string; status: string; expires_in_seconds: number }>("/auth/mobile/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  mobileSignupVerifyOtp: (requestId: string, otp: string) =>
    request<{ request_id: string; status: string }>("/auth/mobile/verify-otp", {
      method: "POST",
      body: JSON.stringify({ request_id: requestId, otp }),
    }),
  mobileSignupComplete: (data: {
    request_id: string;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    password: string;
  }) =>
    request<{ access_token: string; token_type: string }>("/auth/mobile/complete", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getProfile: () => request<import("@/types/dashboard").UserProfile>("/auth/user-profile"),
  getApiKeys: () => request<import("@/types/dashboard").APIKeyInfo>("/auth/api-keys"),
  generateApiKey: () => request<{ api_key: string }>("/auth/api-keys/generate", { method: "POST" }),

  // KYC
  getKycStatus: () => request<import("@/types/dashboard").KYCStatus>("/auth/kyc/status"),

  // Campaigns
  getCampaigns: async (params?: string) => {
    const raw = await request<{
      items?: import("@/types/dashboard").Campaign[];
      campaigns?: import("@/types/dashboard").Campaign[];
      total?: number;
      page?: number;
      page_size?: number;
      per_page?: number;
    }>(`/campaigns/${params ? `?${params}` : ""}`);
    const campaigns = raw.campaigns ?? raw.items ?? [];
    const inferredOrgId = (campaigns[0] as { org_id?: string } | undefined)?.org_id;
    storeOrgId(inferredOrgId);
    return {
      campaigns,
      total: raw.total ?? campaigns.length,
      page: raw.page ?? 1,
      per_page: raw.per_page ?? raw.page_size ?? campaigns.length,
    } as import("@/types/dashboard").CampaignListResponse;
  },
  getCampaign: (id: string) => request<import("@/types/dashboard").Campaign>(`/campaigns/${id}`),
  createCampaign: async (data: {
    name: string;
    type: "voice" | "text";
    category?: "voice" | "text" | "survey" | "combined";
    template_id?: string | null;
    schedule_config?: Record<string, unknown> | null;
  }) => {
    const orgId = getStoredOrgId();
    if (!orgId) {
      throw new ApiError(422, "Missing org_id. Open Campaigns once so organization context can be loaded.");
    }
    return request<import("@/types/dashboard").Campaign>("/campaigns/", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        type: data.type,
        category: data.category ?? (data.type === "voice" ? "voice" : "text"),
        org_id: orgId,
        template_id: data.template_id ?? null,
        schedule_config: data.schedule_config ?? null,
      }),
    });
  },
  uploadCampaignContacts: async (campaignId: string, file: File) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/campaigns/${campaignId}/contacts`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body);
    }
    return res.json() as Promise<{ created: number; skipped: number; errors: string[] }>;
  },
  startCampaign: (campaignId: string, schedule?: string) =>
    request<import("@/types/dashboard").Campaign>(`/campaigns/${campaignId}/start`, {
      method: "POST",
      body: JSON.stringify(schedule ? { schedule } : {}),
    }),

  // Analytics
  getOverview: async () => {
    const orgId = getStoredOrgId();
    if (!orgId) {
      return {
        total_campaigns: 0,
        campaigns_by_status: {},
        campaigns_by_category: {},
        total_reach: 0,
        delivery_rate: 0,
        total_credits_consumed: 0,
      } as import("@/types/dashboard").OverviewAnalytics;
    }
    try {
      const raw = await request<{
        campaigns_by_status?: Record<string, number>;
        campaigns_by_category?: Record<string, number>;
        total_campaigns?: number;
        total_reach?: number;
        total_contacts_reached?: number;
        delivery_rate?: number | null;
        overall_delivery_rate?: number | null;
        total_credits_consumed?: number;
        credits_consumed?: number;
      }>(withOrgId("/analytics/overview", orgId));
      return {
        total_campaigns: raw.total_campaigns ?? 0,
        campaigns_by_status: raw.campaigns_by_status ?? {},
        campaigns_by_category: raw.campaigns_by_category ?? {},
        total_reach: raw.total_reach ?? raw.total_contacts_reached ?? 0,
        delivery_rate: raw.delivery_rate ?? raw.overall_delivery_rate ?? 0,
        total_credits_consumed: raw.total_credits_consumed ?? raw.credits_consumed ?? 0,
      } as import("@/types/dashboard").OverviewAnalytics;
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        return {
          total_campaigns: 0,
          campaigns_by_status: {},
          campaigns_by_category: {},
          total_reach: 0,
          delivery_rate: 0,
          total_credits_consumed: 0,
        } as import("@/types/dashboard").OverviewAnalytics;
      }
      throw error;
    }
  },
  getCampaignAnalytics: (id: string) =>
    request<import("@/types/dashboard").CampaignAnalytics>(`/analytics/campaigns/${id}`),
  getCarrierBreakdown: async () => {
    const raw = await request<Array<{
      carrier: string;
      total: number;
      success?: number;
      successful?: number;
      fail?: number;
      failed?: number;
      pickup_pct?: number;
      pickup_rate?: number;
    }>>("/analytics/carrier-breakdown");
    return raw.map((item) => ({
      carrier: item.carrier,
      total: item.total,
      successful: item.successful ?? item.success ?? 0,
      failed: item.failed ?? item.fail ?? 0,
      pickup_rate: item.pickup_rate ?? item.pickup_pct ?? 0,
    })) as import("@/types/dashboard").CarrierStat[];
  },
  getCategoryBreakdown: () =>
    request<import("@/types/dashboard").CategoryBreakdown[]>("/analytics/campaigns/by-category"),
  getDashboardPlayback: async () => {
    const orgId = getStoredOrgId();
    if (!orgId) {
      return {
        average_playback_percentage: 0,
        distribution: {
          bucket_0_25: 0,
          bucket_26_50: 0,
          bucket_51_75: 0,
          bucket_76_100: 0,
        },
      } as import("@/types/dashboard").DashboardPlaybackWidget;
    }
    try {
      const raw = await request<{
        average_playback_percentage?: number | null;
        avg_playback_percentage?: number | null;
        distribution?: Record<string, number> | Array<{ bucket: string; count: number }>;
      }>(withOrgId("/analytics/dashboard/playback", orgId));
      const distribution = raw.distribution;
      const normalized = {
        bucket_0_25: 0,
        bucket_26_50: 0,
        bucket_51_75: 0,
        bucket_76_100: 0,
      };
      if (Array.isArray(distribution)) {
        for (const entry of distribution) {
          if (entry.bucket === "0-25") normalized.bucket_0_25 = entry.count;
          if (entry.bucket === "26-50") normalized.bucket_26_50 = entry.count;
          if (entry.bucket === "51-75") normalized.bucket_51_75 = entry.count;
          if (entry.bucket === "76-100") normalized.bucket_76_100 = entry.count;
        }
      } else if (distribution && typeof distribution === "object") {
        normalized.bucket_0_25 = distribution.bucket_0_25 ?? 0;
        normalized.bucket_26_50 = distribution.bucket_26_50 ?? 0;
        normalized.bucket_51_75 = distribution.bucket_51_75 ?? 0;
        normalized.bucket_76_100 = distribution.bucket_76_100 ?? 0;
      }
      return {
        average_playback_percentage: raw.average_playback_percentage ?? raw.avg_playback_percentage ?? 0,
        distribution: normalized,
      } as import("@/types/dashboard").DashboardPlaybackWidget;
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        return {
          average_playback_percentage: 0,
          distribution: {
            bucket_0_25: 0,
            bucket_26_50: 0,
            bucket_51_75: 0,
            bucket_76_100: 0,
          },
        } as import("@/types/dashboard").DashboardPlaybackWidget;
      }
      throw error;
    }
  },
  getIntentDistribution: (campaignId?: string) =>
    request<import("@/types/dashboard").IntentDistribution>(
      `/analytics/intents${campaignId ? `?campaign_id=${campaignId}` : ""}`,
    ),
  getCampaignIntents: (id: string) =>
    request<import("@/types/dashboard").CampaignIntentSummary>(`/analytics/campaigns/${id}/intents`),

  // Credits
  getCreditBalance: async () => {
    const orgId = getStoredOrgId();
    if (!orgId) {
      return { balance: 0, total_purchased: 0, total_consumed: 0 } as import("@/types/dashboard").CreditBalance;
    }
    try {
      const raw = await request<import("@/types/dashboard").CreditBalance & { org_id?: string }>(
        withOrgId("/credits/balance", orgId),
      );
      storeOrgId(raw.org_id || orgId);
      return raw;
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        return { balance: 0, total_purchased: 0, total_consumed: 0 } as import("@/types/dashboard").CreditBalance;
      }
      throw error;
    }
  },
  getCreditHistory: async (params?: string) => {
    const orgId = getStoredOrgId();
    if (!orgId) {
      return {
        transactions: [],
        total: 0,
        page: 1,
        per_page: 20,
      } as import("@/types/dashboard").CreditHistoryResponse;
    }
    const raw = await request<{
      transactions?: import("@/types/dashboard").CreditTransaction[];
      items?: import("@/types/dashboard").CreditTransaction[];
      total?: number;
      page?: number;
      per_page?: number;
      page_size?: number;
    }>(withOrgId(`/credits/history${params ? `?${params}` : ""}`, orgId));
    const transactions = raw.transactions ?? raw.items ?? [];
    return {
      transactions,
      total: raw.total ?? transactions.length,
      page: raw.page ?? 1,
      per_page: raw.per_page ?? raw.page_size ?? transactions.length,
    } as import("@/types/dashboard").CreditHistoryResponse;
  },

  // Templates
  getTemplates: async (params?: string) => {
    const raw = await request<{
      templates?: import("@/types/dashboard").Template[];
      items?: import("@/types/dashboard").Template[];
      total?: number;
      page?: number;
      per_page?: number;
      page_size?: number;
    }>(`/templates/${params ? `?${params}` : ""}`);
    const templates = raw.templates ?? raw.items ?? [];
    const inferredOrgId = (templates[0] as { org_id?: string } | undefined)?.org_id;
    storeOrgId(inferredOrgId);
    return {
      templates,
      total: raw.total ?? templates.length,
      page: raw.page ?? 1,
      per_page: raw.per_page ?? raw.page_size ?? templates.length,
    } as import("@/types/dashboard").TemplateListResponse;
  },
  createTemplate: (data: { name: string; type: string; content: string }) =>
    request<import("@/types/dashboard").Template>("/templates/", { method: "POST", body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: { name?: string; content?: string }) =>
    request<import("@/types/dashboard").Template>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTemplate: (id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE" }),

  // Flow sources
  previewFlowUrlSource: (data: {
    url: string;
    source_kind: "source_url_json" | "source_url_csv";
    max_preview_rows?: number;
    max_rows?: number;
  }) =>
    request<{
      headers: string[];
      preview_rows: string[][];
      total_rows: number;
      mapping: string;
      sample_csv: string;
    }>("/flows/sources/url-preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  async uploadSourceFile(file: File): Promise<{
    file_id: string;
    headers: string[];
    preview_rows: string[][];
    total_rows: number;
  }> {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/flows/sources/file-upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new ApiError(res.status, body.detail || "Upload failed");
    }
    return res.json();
  },
  createManualTableSource: (data: { name: string; headers: string[]; rows: string[][] }) =>
    request<{
      id: string;
      user_id: string;
      name: string;
      headers: string[];
      rows: string[][];
      row_count: number;
      created_at: string;
      updated_at: string;
    }>("/flows/sources/manual-table", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getManualTableSource: (id: string) =>
    request<{
      id: string;
      user_id: string;
      name: string;
      headers: string[];
      rows: string[][];
      row_count: number;
      created_at: string;
      updated_at: string;
    }>(`/flows/sources/manual-table/${id}`),
  updateManualTableSource: (id: string, data: { name: string; headers: string[]; rows: string[][] }) =>
    request<{
      id: string;
      user_id: string;
      name: string;
      headers: string[];
      rows: string[][];
      row_count: number;
      created_at: string;
      updated_at: string;
    }>(`/flows/sources/manual-table/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Flow Definitions
  createFlowDefinition: (payload: { name: string; nodes: unknown[]; edges: unknown[]; trigger_config?: unknown; status?: string }) =>
    request<{ id: string; name: string; nodes: unknown[]; edges: unknown[]; status: string; created_at: string; updated_at: string }>(
      "/flows/definitions",
      { method: "POST", body: JSON.stringify(payload) },
    ),

  listFlowDefinitions: () =>
    request<Array<{ id: string; name: string; status: string; updated_at: string }>>(
      "/flows/definitions",
    ),

  getFlowDefinition: (flowId: string) =>
    request<{ id: string; name: string; nodes: unknown[]; edges: unknown[]; trigger_config: unknown; status: string }>(
      `/flows/definitions/${flowId}`,
    ),

  updateFlowDefinition: (flowId: string, payload: { name: string; nodes: unknown[]; edges: unknown[]; trigger_config?: unknown; status?: string }) =>
    request<{ id: string; name: string; nodes: unknown[]; edges: unknown[]; status: string }>(
      `/flows/definitions/${flowId}`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),

  deleteFlowDefinition: (flowId: string) =>
    request<void>(`/flows/definitions/${flowId}`, { method: "DELETE" }),

  triggerFlowRun: (flowId: string, mode: "live" | "dry_run" = "live") =>
    request<{ id: string; flow_id: string; status: string; mode: string }>(
      `/flows/definitions/${flowId}/run`,
      { method: "POST", body: JSON.stringify({ mode }) },
    ),

  cancelFlowRun: (runId: string) =>
    request<{ id: string; status: string }>(
      `/flows/runs/${runId}/cancel`,
      { method: "POST" },
    ),

  getFlowRun: (runId: string) =>
    request<{
      id: string;
      flow_id: string;
      status: string;
      mode: string;
      started_at: string | null;
      completed_at: string | null;
      current_node_id: string | null;
      error: string | null;
      contact_count: number;
      flow_name: string;
      steps: {
        id: string;
        node_id: string;
        node_kind: string;
        status: string;
        input_row_count: number;
        output_row_count: number;
        error: string | null;
        started_at: string | null;
        completed_at: string | null;
        metadata: Record<string, unknown> | null;
      }[];
    }>(`/flows/runs/${runId}`),

  listFlowRuns: (params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return request<{
      id: string;
      flow_id: string;
      status: string;
      mode: string;
      started_at: string | null;
      completed_at: string | null;
      contact_count: number;
      error: string | null;
    }[]>(`/flows/runs${q ? `?${q}` : ""}`);
  },

  getFlowPhoneNumbers: () =>
    request<{ sid: string; number: string; friendly_name: string; capabilities: { sms: boolean; voice: boolean } }[]>(
      "/flows/phone-numbers",
    ),

  // Phone Numbers
  getActivePhoneNumbers: () => request<import("@/types/dashboard").PhoneNumber[]>("/phone-numbers/active"),
  getBrokerPhoneNumbers: () => request<import("@/types/dashboard").PhoneNumber[]>("/phone-numbers/broker"),

  // Notifications
  getNotifications: (params?: string) =>
    request<{ notifications: import("@/types/dashboard").Notification[]; total: number }>(
      `/notifications/${params ? `?${params}` : ""}`,
    ),
  getUnreadCount: () => request<{ count: number }>("/notifications/unread-count"),

  // ROI Analytics
  getCampaignROI: (id: string) =>
    request<import("@/types/dashboard").CampaignROI>(`/roi/campaigns/${id}`),
  compareCampaigns: (ids: string[]) =>
    request<import("@/types/dashboard").CampaignComparison>(
      `/roi/compare?${ids.map((id) => `campaign_ids=${id}`).join("&")}`,
    ),
  listABTests: (orgId: string) =>
    request<import("@/types/dashboard").ABTestResponse[]>(`/roi/ab-tests?org_id=${orgId}`),
  getABTestResults: (id: string) =>
    request<import("@/types/dashboard").ABTestResult>(`/roi/ab-tests/${id}/results`),
  createABTest: (data: { name: string; description?: string; campaign_ids: string[]; variant_names?: string[] }, orgId: string) =>
    request<import("@/types/dashboard").ABTestResponse>(`/roi/ab-tests?org_id=${orgId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  calculateROI: (data: { campaign_ids: string[]; manual_cost_per_call?: number }) =>
    request<import("@/types/dashboard").ROICalculatorResult>("/roi/calculator", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Insights
  getCampaignInsights: (campaignId: string) =>
    request<import("@/types/dashboard").InsightsResponse>("/analytics/insights", {
      method: "POST",
      body: JSON.stringify({ campaign_id: campaignId }),
    }),

  // Knowledge Bases
  getKnowledgeBases: (orgId: string, params?: string) =>
    request<import("@/types/dashboard").KnowledgeBaseListResponse>(
      `/knowledge-bases/?org_id=${orgId}${params ? `&${params}` : ""}`,
    ),
  getKnowledgeBase: (id: string, orgId: string) =>
    request<import("@/types/dashboard").KnowledgeBase>(`/knowledge-bases/${id}?org_id=${orgId}`),
  createKnowledgeBase: (data: { name: string; description?: string; org_id: string }) =>
    request<import("@/types/dashboard").KnowledgeBase>("/knowledge-bases/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateKnowledgeBase: (id: string, orgId: string, data: { name?: string; description?: string }) =>
    request<import("@/types/dashboard").KnowledgeBase>(`/knowledge-bases/${id}?org_id=${orgId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteKnowledgeBase: (id: string, orgId: string) =>
    request<void>(`/knowledge-bases/${id}?org_id=${orgId}`, { method: "DELETE" }),

  // Knowledge Base Documents
  getKBDocuments: (kbId: string, orgId: string) =>
    request<import("@/types/dashboard").KnowledgeDocumentListResponse>(
      `/knowledge-bases/${kbId}/documents?org_id=${orgId}`,
    ),
  uploadKBDocument: async (kbId: string, orgId: string, file: File): Promise<import("@/types/dashboard").KnowledgeDocument> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/knowledge-bases/${kbId}/documents?org_id=${orgId}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body);
    }

    return res.json();
  },
  deleteKBDocument: (kbId: string, docId: string, orgId: string) =>
    request<void>(`/knowledge-bases/${kbId}/documents/${docId}?org_id=${orgId}`, { method: "DELETE" }),

  // Knowledge Base Search
  searchKnowledgeBase: (kbId: string, orgId: string, query: string, topK?: number) =>
    request<import("@/types/dashboard").KnowledgeSearchResponse>(
      `/knowledge-bases/${kbId}/search?org_id=${orgId}`,
      {
        method: "POST",
        body: JSON.stringify({ query, top_k: topK || 5 }),
      },
    ),

  // TTS
  getTTSProviders: () => request<{ providers: string[] }>("/tts/providers"),
  getTTSProviderDetails: () => request<import("@/types/dashboard").ProviderInfo[]>("/tts/providers/details"),
  getTTSVoices: (provider: string, locale?: string) =>
    request<import("@/types/dashboard").VoiceInfo[]>("/tts/voices", {
      method: "POST",
      body: JSON.stringify({ provider, locale: locale || null }),
    }),
  synthesizeTTS: async (params: {
    text: string;
    provider: string;
    voice: string;
    rate?: string;
    pitch?: string;
    volume?: string;
    output_format?: string;
  }): Promise<{ audioBlob: Blob; durationMs: number; providerUsed: string; charsConsumed: number }> => {
    const token = getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/tts/synthesize`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: params.text,
        provider: params.provider,
        voice: params.voice,
        rate: params.rate || "+0%",
        pitch: params.pitch || "+0Hz",
        volume: params.volume || "+0%",
        output_format: params.output_format || "mp3",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body);
    }

    const audioBlob = await res.blob();
    return {
      audioBlob,
      durationMs: parseInt(res.headers.get("X-TTS-Duration-Ms") || "0", 10),
      providerUsed: res.headers.get("X-TTS-Provider") || params.provider,
      charsConsumed: parseInt(res.headers.get("X-TTS-Chars-Consumed") || "0", 10),
    };
  },

  // Flow credit estimate
  estimateFlowCredits: (params: { kind: string; tts_provider?: string; contact_count: number }) =>
    request<{
      credits_per_action: number;
      contact_count: number;
      estimated_total: number;
      current_balance: number;
      sufficient: boolean;
    }>("/flows/estimate-credits", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  // Landing demo voice call
  sendDemoCallOtp: (data: {
    name: string;
    phone: string;
    message: string;
    otp_channel?: "auto" | "sms" | "whatsapp";
    whatsapp_from_number?: string;
    from_number?: string;
    tts_config?: {
      provider?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
      fallback_provider?: string;
    };
  }) =>
    request<{ request_id: string; status: string; expires_in_seconds: number }>("/voice/demo-call/otp/send", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  verifyDemoCallOtp: (data: { request_id: string; otp: string }) =>
    request<{ call_id: string; status: string }>("/voice/demo-call/otp/verify", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  initiateMasterOtpDemoCall: (data: {
    name: string;
    phone: string;
    message?: string;
    master_otp: string;
    from_number?: string;
    tts_config?: {
      provider?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
      fallback_provider?: string;
    };
  }) =>
    request<{ call_id: string; status: string }>("/voice/demo-call/master-otp", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  initiateDemoCall: (data: {
    name: string;
    phone: string;
    message: string;
    from_number?: string;
    tts_config?: {
      provider?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
      fallback_provider?: string;
    };
  }) =>
    request<{ call_id: string; status: string }>("/voice/demo-call", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  startInteractiveDemoSession: (data?: { language?: string; voice_name?: string }) =>
    request<{ session_id: string; status: string }>("/voice/interactive-demo/start", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  sendInteractiveDemoMessage: (sessionId: string, message: string) =>
    request<{ session_id: string; assistant_message: string }>(`/voice/interactive-demo/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  handoffInteractiveDemoCall: (
    sessionId: string,
    data: {
      name: string;
      phone: string;
      message?: string;
      from_number?: string;
      tts_config?: {
        provider?: string;
        voice?: string;
        rate?: string;
        pitch?: string;
        fallback_provider?: string;
      };
    },
  ) =>
    request<{ call_id: string; status: string }>(`/voice/interactive-demo/${sessionId}/handoff-call`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  endInteractiveDemoSession: async (sessionId: string): Promise<void> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/voice/interactive-demo/${sessionId}`, {
      method: "DELETE",
      headers,
    });
    if (res.status !== 204) {
      const body = await res.text();
      throw new ApiError(res.status, body || "Failed to end interactive session");
    }
  },
  createWhatsAppDemoSession: (data?: {
    language?: string;
    voice_name?: string;
    from_number?: string;
    to_number?: string;
  }) =>
    request<{ session_id: string; provider: string; status: string; created_at: string }>("/whatsapp/demo/session", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  sendWhatsAppDemoMessage: (
    sessionId: string,
    data: {
      message: string;
      from_number?: string;
      to_number?: string;
    },
  ) =>
    request<{
      session_id: string;
      assistant_message: string;
      provider: string;
      delivery_status: string;
      delivery_id?: string | null;
    }>(`/whatsapp/demo/session/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  endWhatsAppDemoSession: async (sessionId: string): Promise<void> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/whatsapp/demo/session/${sessionId}`, {
      method: "DELETE",
      headers,
    });
    if (res.status !== 204) {
      const body = await res.text();
      throw new ApiError(res.status, body || "Failed to end WhatsApp session");
    }
  },
  startWhatsAppSurvey: (data: {
    from_number: string;
    to_numbers: string[];
    question: string;
    options: string[];
  }) =>
    request<{ survey_id: string; status: string; recipients: number }>("/whatsapp/demo/survey/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getWhatsAppSurveyResults: (surveyId: string) =>
    request<{
      survey_id: string;
      question: string;
      options: string[];
      counts: Record<string, number>;
      responses: Record<string, string>;
    }>(`/whatsapp/demo/survey/${surveyId}/results`),
  getLinkedWhatsAppStatus: () =>
    request<{ state: string; ready_at?: string | null; has_qr?: boolean; last_error?: string | null }>(
      "/whatsapp/linked/status",
    ),
  getLinkedWhatsAppQr: () =>
    request<{ qr: string; qr_data_url: string }>("/whatsapp/linked/qr"),
};

export { ApiError };
