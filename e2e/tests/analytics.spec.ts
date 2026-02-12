import { test, expect } from "@playwright/test";
import { loadState } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("Analytics — campaign analytics, carriers & events", () => {
  let orgId: string;
  let campaignIds: string[];

  test.beforeAll(() => {
    const state = loadState();
    orgId = state.orgId;
    campaignIds = state.campaignIds;
    test.skip(!orgId, "No seeded organization — skipping analytics tests");
  });

  test("analytics overview loads", async ({ request, page }) => {
    const res = await request.get(
      `${API}/analytics/overview?org_id=${orgId}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("campaigns_by_status");
    expect(body).toHaveProperty("total_contacts_reached");
    expect(body).toHaveProperty("overall_delivery_rate");
    expect(body).toHaveProperty("credits_consumed");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/analytics/overview.png",
      fullPage: true,
    });
  });

  test("campaign-level analytics", async ({ request, page }) => {
    test.skip(campaignIds.length === 0, "No seeded campaigns");
    const campaignId = campaignIds[0];

    const res = await request.get(
      `${API}/analytics/campaigns/${campaignId}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.campaign_id).toBe(campaignId);
    expect(body).toHaveProperty("status_breakdown");
    expect(body).toHaveProperty("completion_rate");
    expect(body).toHaveProperty("hourly_distribution");
    expect(body).toHaveProperty("daily_distribution");
    expect(body).toHaveProperty("carrier_breakdown");
    expect(body).toHaveProperty("credit_consumption");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/analytics/call-status-chart.png",
      fullPage: true,
    });
  });

  test("carrier breakdown summary", async ({ request, page }) => {
    const res = await request.get(`${API}/analytics/carrier-breakdown`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(Array.isArray(body)).toBeTruthy();
    for (const row of body) {
      expect(row).toHaveProperty("carrier");
      expect(row).toHaveProperty("total");
      expect(row).toHaveProperty("success");
      expect(row).toHaveProperty("fail");
      expect(row).toHaveProperty("pickup_pct");
    }

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/analytics/carrier-summary.png",
      fullPage: true,
    });
  });

  test("carrier breakdown scoped to a campaign", async ({ request }) => {
    test.skip(campaignIds.length === 0, "No seeded campaigns");
    const res = await request.get(
      `${API}/analytics/carrier-breakdown?campaign_id=${campaignIds[0]}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("analytics events endpoint", async ({ request }) => {
    const res = await request.get(
      `${API}/analytics/events?page=1&page_size=10`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.items)).toBeTruthy();
  });

  test("campaign playback data", async ({ request }) => {
    test.skip(campaignIds.length === 0, "No seeded campaigns");
    const res = await request.get(
      `${API}/analytics/campaigns/${campaignIds[0]}/playback`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("campaign_id");
    expect(body).toHaveProperty("avg_playback_percentage");
    expect(body).toHaveProperty("contacts");
    expect(Array.isArray(body.contacts)).toBeTruthy();
  });

  test("campaign playback distribution", async ({ request }) => {
    test.skip(campaignIds.length === 0, "No seeded campaigns");
    const res = await request.get(
      `${API}/analytics/campaigns/${campaignIds[0]}/playback/distribution`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("campaign_id");
    expect(body).toHaveProperty("buckets");
    expect(body.buckets.length).toBe(4);
  });

  test("export report as CSV", async ({ request }) => {
    test.skip(campaignIds.length === 0, "No seeded campaigns");
    const res = await request.get(
      `${API}/campaigns/${campaignIds[0]}/report/download`
    );
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("text/csv");
  });
});
