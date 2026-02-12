import { test, expect } from "@playwright/test";
import { loadState } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("Credit history — purchase & usage tracking", () => {
  let orgId: string;
  let campaignIds: string[];

  test.beforeAll(() => {
    const state = loadState();
    orgId = state.orgId;
    campaignIds = state.campaignIds;
    test.skip(!orgId, "No seeded organization — skipping credit tests");
  });

  test("credit purchase history", async ({ request, page }) => {
    const res = await request.get(
      `${API}/credits/history?org_id=${orgId}&page=1&page_size=20`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(Array.isArray(body.items)).toBeTruthy();

    // We purchased credits in global setup
    expect(body.total).toBeGreaterThanOrEqual(1);

    // Verify purchase transaction structure
    if (body.items.length > 0) {
      const tx = body.items[0];
      expect(tx).toHaveProperty("id");
      expect(tx).toHaveProperty("org_id");
      expect(tx).toHaveProperty("amount");
      expect(tx).toHaveProperty("type");
      expect(tx).toHaveProperty("created_at");
    }

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/credits/purchase-history.png",
      fullPage: true,
    });
  });

  test("credit balance reflects purchases", async ({ request, page }) => {
    const res = await request.get(
      `${API}/credits/balance?org_id=${orgId}`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("org_id");
    expect(body).toHaveProperty("balance");
    expect(body).toHaveProperty("total_purchased");
    expect(body).toHaveProperty("total_consumed");
    expect(body.org_id).toBe(orgId);
    expect(body.balance).toBeGreaterThan(0);
    expect(body.total_purchased).toBeGreaterThan(0);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/credits/usage-history.png",
      fullPage: true,
    });
  });

  test("purchase credits via API", async ({ request }) => {
    const res = await request.post(`${API}/credits/purchase`, {
      data: {
        org_id: orgId,
        amount: 500,
        description: "E2E additional purchase test",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body).toHaveProperty("id");
    expect(body.amount).toBe(500);
    expect(body.type).toBe("purchase");
    expect(body.org_id).toBe(orgId);
  });

  test("campaign cost estimation", async ({ request }) => {
    test.skip(campaignIds.length === 0, "No seeded campaigns");
    const campaignId = campaignIds[0];

    const res = await request.post(
      `${API}/credits/campaigns/${campaignId}/estimate`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("campaign_id");
    expect(body).toHaveProperty("campaign_name");
    expect(body).toHaveProperty("total_contacts");
    expect(body).toHaveProperty("cost_per_interaction");
    expect(body).toHaveProperty("estimated_total_cost");
    expect(body).toHaveProperty("current_balance");
    expect(body).toHaveProperty("sufficient_credits");
    expect(typeof body.sufficient_credits).toBe("boolean");
  });

  test("credit history pagination", async ({ request }) => {
    const res = await request.get(
      `${API}/credits/history?org_id=${orgId}&page=1&page_size=2`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(2);
    expect(body.items.length).toBeLessThanOrEqual(2);
  });
});
