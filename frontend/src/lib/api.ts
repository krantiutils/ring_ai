const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
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
      localStorage.removeItem("access_token");
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
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  getProfile: () => request<import("@/types/dashboard").UserProfile>("/auth/user-profile"),
  getApiKeys: () => request<import("@/types/dashboard").APIKeyInfo>("/auth/api-keys"),
  generateApiKey: () => request<{ api_key: string }>("/auth/api-keys/generate", { method: "POST" }),

  // KYC
  getKycStatus: () => request<import("@/types/dashboard").KYCStatus>("/auth/kyc/status"),

  // Campaigns
  getCampaigns: (params?: string) =>
    request<import("@/types/dashboard").CampaignListResponse>(`/campaigns/${params ? `?${params}` : ""}`),
  getCampaign: (id: string) => request<import("@/types/dashboard").Campaign>(`/campaigns/${id}`),

  // Analytics
  getOverview: () => request<import("@/types/dashboard").OverviewAnalytics>("/analytics/overview"),
  getCampaignAnalytics: (id: string) =>
    request<import("@/types/dashboard").CampaignAnalytics>(`/analytics/campaigns/${id}`),
  getCarrierBreakdown: () => request<import("@/types/dashboard").CarrierStat[]>("/analytics/carrier-breakdown"),
  getCategoryBreakdown: () =>
    request<import("@/types/dashboard").CategoryBreakdown[]>("/analytics/campaigns/by-category"),
  getDashboardPlayback: () =>
    request<import("@/types/dashboard").DashboardPlaybackWidget>("/analytics/dashboard/playback"),

  // Credits
  getCreditBalance: () => request<import("@/types/dashboard").CreditBalance>("/credits/balance"),
  getCreditHistory: (params?: string) =>
    request<import("@/types/dashboard").CreditHistoryResponse>(`/credits/history${params ? `?${params}` : ""}`),

  // Templates
  getTemplates: (params?: string) =>
    request<import("@/types/dashboard").TemplateListResponse>(`/templates/${params ? `?${params}` : ""}`),
  createTemplate: (data: { name: string; type: string; content: string }) =>
    request<import("@/types/dashboard").Template>("/templates/", { method: "POST", body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: { name?: string; content?: string }) =>
    request<import("@/types/dashboard").Template>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTemplate: (id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE" }),

  // Phone Numbers
  getActivePhoneNumbers: () => request<import("@/types/dashboard").PhoneNumber[]>("/phone-numbers/active"),
  getBrokerPhoneNumbers: () => request<import("@/types/dashboard").PhoneNumber[]>("/phone-numbers/broker"),

  // Notifications
  getNotifications: (params?: string) =>
    request<{ notifications: import("@/types/dashboard").Notification[]; total: number }>(
      `/notifications/${params ? `?${params}` : ""}`,
    ),
  getUnreadCount: () => request<{ count: number }>("/notifications/unread-count"),

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
};

export { ApiError };
