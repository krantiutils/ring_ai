const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types — mirroring backend Pydantic schemas
// ---------------------------------------------------------------------------

export type CampaignType = "voice" | "text" | "form";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface ScheduleConfig {
  mode: "immediate" | "scheduled" | "recurring";
  scheduled_at?: string | null;
  cron_expression?: string | null;
  timezone: string;
}

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  template_id: string | null;
  schedule_config: ScheduleConfig | null;
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
  phone: string;
  name: string | null;
  metadata_: Record<string, unknown> | null;
  created_at: string;
}

export interface Template {
  id: string;
  org_id: string;
  name: string;
  type: "voice" | "text";
  language: string;
  content: string;
  variables: Record<string, unknown> | null;
  voice_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ContactUploadResponse {
  created: number;
  skipped: number;
  errors: string[];
}

export interface CampaignCreate {
  name: string;
  type: CampaignType;
  org_id: string;
  template_id?: string | null;
  schedule_config?: Record<string, unknown> | null;
}

export interface CampaignUpdate {
  name?: string;
  template_id?: string | null;
  schedule_config?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// API error
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

async function request<T>(
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
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      // response body wasn't JSON
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Campaign API
// ---------------------------------------------------------------------------

export const campaigns = {
  list(params?: {
    page?: number;
    page_size?: number;
    status?: CampaignStatus;
    type?: CampaignType;
  }): Promise<PaginatedResponse<Campaign>> {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.page_size) sp.set("page_size", String(params.page_size));
    if (params?.status) sp.set("status", params.status);
    if (params?.type) sp.set("type", params.type);
    const qs = sp.toString();
    return request(`/api/v1/campaigns/${qs ? `?${qs}` : ""}`);
  },

  get(id: string): Promise<CampaignWithStats> {
    return request(`/api/v1/campaigns/${id}`);
  },

  create(data: CampaignCreate): Promise<Campaign> {
    return request("/api/v1/campaigns/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(id: string, data: CampaignUpdate): Promise<Campaign> {
    return request(`/api/v1/campaigns/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(id: string): Promise<void> {
    return request(`/api/v1/campaigns/${id}`, { method: "DELETE" });
  },

  start(id: string): Promise<Campaign> {
    return request(`/api/v1/campaigns/${id}/start`, { method: "POST" });
  },

  pause(id: string): Promise<Campaign> {
    return request(`/api/v1/campaigns/${id}/pause`, { method: "POST" });
  },

  resume(id: string): Promise<Campaign> {
    return request(`/api/v1/campaigns/${id}/resume`, { method: "POST" });
  },

  uploadContacts(id: string, file: File): Promise<ContactUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return request(`/api/v1/campaigns/${id}/contacts`, {
      method: "POST",
      body: form,
    });
  },

  listContacts(
    id: string,
    params?: { page?: number; page_size?: number },
  ): Promise<PaginatedResponse<Contact>> {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.page_size) sp.set("page_size", String(params.page_size));
    const qs = sp.toString();
    return request(`/api/v1/campaigns/${id}/contacts${qs ? `?${qs}` : ""}`);
  },

  removeContact(campaignId: string, contactId: string): Promise<void> {
    return request(`/api/v1/campaigns/${campaignId}/contacts/${contactId}`, {
      method: "DELETE",
    });
  },
};

// ---------------------------------------------------------------------------
// Template API
// ---------------------------------------------------------------------------

export const templates = {
  list(params?: {
    page?: number;
    page_size?: number;
    type?: "voice" | "text";
  }): Promise<PaginatedResponse<Template>> {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.page_size) sp.set("page_size", String(params.page_size));
    if (params?.type) sp.set("type", params.type);
    const qs = sp.toString();
    return request(`/api/v1/templates/${qs ? `?${qs}` : ""}`);
  },

  get(id: string): Promise<Template> {
    return request(`/api/v1/templates/${id}`);
  },

  create(data: {
    name: string;
    type: "voice" | "text";
    org_id: string;
    language?: string;
    content: string;
    variables?: Record<string, unknown>;
    voice_config?: Record<string, unknown>;
  }): Promise<Template> {
    return request("/api/v1/templates/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function healthCheck(): Promise<{ status: string }> {
  return request("/health");
}
