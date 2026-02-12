/**
 * Seed helpers for E2E tests.
 *
 * Provides typed access to the shared test state written by global-setup.ts
 * and convenience wrappers for seeding additional data via the backend API.
 */

import fs from "fs";
import path from "path";
import type { APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

// ── Shared state persisted by global-setup.ts ──────────────────────────

export interface TestState {
  accessToken: string;
  orgId: string;
  userId: string;
  campaignIds: string[];
  templateIds: string[];
}

let _cached: TestState | null = null;

export function loadState(): TestState {
  if (_cached) return _cached;
  const file = path.join(__dirname, "..", ".auth", "state.json");
  _cached = JSON.parse(fs.readFileSync(file, "utf-8")) as TestState;
  return _cached;
}

// ── Auth header helper ─────────────────────────────────────────────────

export function authHeader(token?: string): Record<string, string> {
  const t = token ?? loadState().accessToken;
  return { Authorization: `Bearer ${t}` };
}

// ── Known test credentials ─────────────────────────────────────────────

export const TEST_USER = {
  first_name: "E2E",
  last_name: "Tester",
  username: "e2e_tester",
  email: "e2e@ringai.test",
  phone: "+9779800000001",
  password: "TestPassword123!",
} as const;

// ── API seed helpers ───────────────────────────────────────────────────

export async function createCampaign(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const state = loadState();
  const res = await request.post(`${API}/campaigns/`, {
    data: {
      name: "Seeded Campaign",
      type: "voice",
      org_id: state.orgId,
      category: "voice",
      ...overrides,
    },
  });
  return { response: res, body: res.ok() ? await res.json() : null };
}

export async function createTemplate(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const state = loadState();
  const res = await request.post(`${API}/templates/`, {
    data: {
      name: "Seeded Template",
      content: "नमस्ते {name} जी।",
      type: "voice",
      org_id: state.orgId,
      language: "ne",
      ...overrides,
    },
  });
  return { response: res, body: res.ok() ? await res.json() : null };
}

export async function purchaseCredits(
  request: APIRequestContext,
  amount: number,
  description = "E2E seed credits"
) {
  const state = loadState();
  const res = await request.post(`${API}/credits/purchase`, {
    data: { org_id: state.orgId, amount, description },
  });
  return { response: res, body: res.ok() ? await res.json() : null };
}

export async function uploadContacts(
  request: APIRequestContext,
  campaignId: string,
  rows: string[][]
) {
  const header = "phone,name,carrier";
  const csv = [header, ...rows.map((r) => r.join(","))].join("\n");

  const res = await request.post(
    `${API}/campaigns/${campaignId}/contacts`,
    {
      multipart: {
        file: {
          name: "contacts.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csv),
        },
      },
    }
  );
  return { response: res, body: res.ok() ? await res.json() : null };
}
