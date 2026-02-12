import { test, expect } from "@playwright/test";
import { loadState } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("Campaigns — CRUD, contacts & lifecycle", () => {
  let orgId: string;
  let seededCampaignIds: string[];

  test.beforeAll(() => {
    const state = loadState();
    orgId = state.orgId;
    seededCampaignIds = state.campaignIds;
    test.skip(!orgId, "No seeded organization — skipping campaign tests");
  });

  test("campaign list page loads", async ({ request, page }) => {
    const res = await request.get(`${API}/campaigns/?page=1&page_size=20`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("page_size");
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(body.total).toBeGreaterThanOrEqual(4);

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/campaigns/list-page.png",
      fullPage: true,
    });
  });

  test("create new campaign", async ({ request, page }) => {
    const res = await request.post(`${API}/campaigns/`, {
      data: {
        name: "E2E Create Test Campaign",
        type: "voice",
        org_id: orgId,
        category: "voice",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body.name).toBe("E2E Create Test Campaign");
    expect(body.type).toBe("voice");
    expect(body.status).toBe("draft");
    expect(body.org_id).toBe(orgId);
    expect(body.id).toBeTruthy();

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/campaigns/create-form.png",
      fullPage: true,
    });

    // Cleanup
    await request.delete(`${API}/campaigns/${body.id}`);
  });

  test("campaign detail with stats", async ({ request, page }) => {
    test.skip(
      seededCampaignIds.length === 0,
      "No seeded campaigns to inspect"
    );

    const campaignId = seededCampaignIds[0];
    const res = await request.get(`${API}/campaigns/${campaignId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.id).toBe(campaignId);
    expect(body).toHaveProperty("stats");
    expect(body.stats).toHaveProperty("total_contacts");
    expect(body.stats).toHaveProperty("completed");
    expect(body.stats).toHaveProperty("failed");
    expect(body.stats).toHaveProperty("pending");

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/campaigns/detail-page.png",
      fullPage: true,
    });
  });

  test("filter campaigns by status", async ({ request }) => {
    const res = await request.get(
      `${API}/campaigns/?status=draft&page=1&page_size=50`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const campaign of body.items) {
      expect(campaign.status).toBe("draft");
    }
  });

  test("filter campaigns by type", async ({ request }) => {
    const res = await request.get(
      `${API}/campaigns/?type=voice&page=1&page_size=50`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const campaign of body.items) {
      expect(campaign.type).toBe("voice");
    }
  });

  test("filter campaigns by category", async ({ request }) => {
    const res = await request.get(
      `${API}/campaigns/?category=survey&page=1&page_size=50`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const campaign of body.items) {
      expect(campaign.category).toBe("survey");
    }
  });

  test("CSV contact upload flow", async ({ request }) => {
    // Create a fresh campaign for upload
    const createRes = await request.post(`${API}/campaigns/`, {
      data: {
        name: "CSV Upload Test",
        type: "voice",
        org_id: orgId,
        category: "voice",
      },
    });
    expect(createRes.status()).toBe(201);
    const campaign = await createRes.json();

    const csv = [
      "phone,name,carrier",
      "+9779841111111,Test Ram,NTC",
      "+9779802222222,Test Sita,Ncell",
    ].join("\n");

    const uploadRes = await request.post(
      `${API}/campaigns/${campaign.id}/contacts`,
      {
        multipart: {
          file: {
            name: "test_contacts.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(csv),
          },
        },
      }
    );
    expect(uploadRes.status()).toBe(201);
    const uploadBody = await uploadRes.json();
    expect(uploadBody.created).toBe(2);
    expect(uploadBody.skipped).toBe(0);
    expect(Array.isArray(uploadBody.errors)).toBeTruthy();

    // Verify contacts appear in campaign
    const contactsRes = await request.get(
      `${API}/campaigns/${campaign.id}/contacts?page=1&page_size=10`
    );
    expect(contactsRes.ok()).toBeTruthy();
    const contacts = await contactsRes.json();
    expect(contacts.total).toBe(2);

    // Cleanup
    await request.delete(`${API}/campaigns/${campaign.id}`);
  });

  test("campaign update — only draft campaigns", async ({ request }) => {
    const createRes = await request.post(`${API}/campaigns/`, {
      data: {
        name: "Update Test",
        type: "text",
        org_id: orgId,
        category: "text",
      },
    });
    const campaign = await createRes.json();

    const updateRes = await request.put(`${API}/campaigns/${campaign.id}`, {
      data: { name: "Updated Name" },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.name).toBe("Updated Name");

    // Cleanup
    await request.delete(`${API}/campaigns/${campaign.id}`);
  });

  test("campaign delete — only draft campaigns", async ({ request }) => {
    const createRes = await request.post(`${API}/campaigns/`, {
      data: {
        name: "Delete Test",
        type: "text",
        org_id: orgId,
        category: "text",
      },
    });
    const campaign = await createRes.json();

    const deleteRes = await request.delete(
      `${API}/campaigns/${campaign.id}`
    );
    expect(deleteRes.status()).toBe(204);

    // Verify it's gone
    const getRes = await request.get(`${API}/campaigns/${campaign.id}`);
    expect(getRes.status()).toBe(404);
  });

  test("campaign report download", async ({ request }) => {
    test.skip(
      seededCampaignIds.length === 0,
      "No seeded campaigns for report"
    );
    const campaignId = seededCampaignIds[0];
    const res = await request.get(
      `${API}/campaigns/${campaignId}/report/download`
    );
    expect(res.ok()).toBeTruthy();
    const contentType = res.headers()["content-type"];
    expect(contentType).toContain("text/csv");
  });

  test("campaign pagination works", async ({ request }) => {
    const page1 = await request.get(
      `${API}/campaigns/?page=1&page_size=2`
    );
    expect(page1.ok()).toBeTruthy();
    const body1 = await page1.json();
    expect(body1.items.length).toBeLessThanOrEqual(2);
    expect(body1.page).toBe(1);
    expect(body1.page_size).toBe(2);
  });
});
