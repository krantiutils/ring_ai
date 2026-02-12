import { test, expect } from "@playwright/test";
import { loadState, authHeader } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("Dashboard — overview analytics & widgets", () => {
  let orgId: string;

  test.beforeAll(() => {
    const state = loadState();
    orgId = state.orgId;
    test.skip(!orgId, "No seeded organization — skipping dashboard tests");
  });

  test("dashboard overview loads on frontend", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/dashboard/overview.png",
      fullPage: true,
    });
    await expect(page).toHaveTitle(/Ring AI/i);
  });

  test("analytics overview API returns org-level stats", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/analytics/overview?org_id=${orgId}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("campaigns_by_status");
    expect(body).toHaveProperty("total_contacts_reached");
    expect(body).toHaveProperty("total_calls");
    expect(body).toHaveProperty("total_sms");
    expect(body).toHaveProperty("credits_consumed");
    expect(body).toHaveProperty("credits_by_period");
    expect(typeof body.total_calls).toBe("number");
    expect(typeof body.total_sms).toBe("number");
  });

  test("campaign types chart — campaigns by category", async ({
    request,
    page,
  }) => {
    const res = await request.get(`${API}/analytics/campaigns/by-category`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();

    // We seeded 4 campaigns across different categories
    for (const item of body) {
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("count");
      expect(typeof item.count).toBe("number");
    }

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/dashboard/campaign-types-chart.png",
      fullPage: true,
    });
  });

  test("credit usage over time from overview analytics", async ({
    request,
    page,
  }) => {
    const res = await request.get(
      `${API}/analytics/overview?org_id=${orgId}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(Array.isArray(body.credits_by_period)).toBeTruthy();
    for (const entry of body.credits_by_period) {
      expect(entry).toHaveProperty("period");
      expect(entry).toHaveProperty("credits");
    }

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/dashboard/credit-usage-chart.png",
      fullPage: true,
    });
  });

  test("playback distribution dashboard widget", async ({ request, page }) => {
    const res = await request.get(
      `${API}/analytics/dashboard/playback?org_id=${orgId}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("avg_playback_percentage");
    expect(body).toHaveProperty("total_completed_calls");
    expect(body).toHaveProperty("distribution");
    expect(Array.isArray(body.distribution)).toBeTruthy();

    // All 4 buckets should be present
    const bucketLabels = body.distribution.map(
      (b: { bucket: string }) => b.bucket
    );
    expect(bucketLabels).toContain("0-25%");
    expect(bucketLabels).toContain("76-100%");

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/dashboard/playback-distribution.png",
      fullPage: true,
    });
  });

  test("stats cards — campaign list totals", async ({ request }) => {
    // Campaign list gives total count
    const campRes = await request.get(`${API}/campaigns/?page=1&page_size=1`);
    expect(campRes.ok()).toBeTruthy();
    const campBody = await campRes.json();
    expect(typeof campBody.total).toBe("number");
    expect(campBody.total).toBeGreaterThanOrEqual(4); // seeded 4

    // Credit balance
    const creditRes = await request.get(
      `${API}/credits/balance?org_id=${orgId}`
    );
    expect(creditRes.ok()).toBeTruthy();
    const creditBody = await creditRes.json();
    expect(typeof creditBody.balance).toBe("number");
    expect(creditBody.balance).toBeGreaterThan(0);

    // Overview analytics for calls/sms/duration stats
    const overviewRes = await request.get(
      `${API}/analytics/overview?org_id=${orgId}`
    );
    expect(overviewRes.ok()).toBeTruthy();
    const overview = await overviewRes.json();
    expect(typeof overview.total_calls).toBe("number");
    expect(typeof overview.total_sms).toBe("number");
  });

  test("call outcomes chart via overview analytics", async ({
    request,
    page,
  }) => {
    const res = await request.get(
      `${API}/analytics/overview?org_id=${orgId}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("overall_delivery_rate");
    expect(body).toHaveProperty("avg_call_duration_seconds");

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/dashboard/call-outcomes-chart.png",
      fullPage: true,
    });
  });
});
