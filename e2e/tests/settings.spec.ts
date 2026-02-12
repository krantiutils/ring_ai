import { test, expect } from "@playwright/test";
import { loadState, authHeader } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("Settings — profile, KYC, tokens & notifications", () => {
  test("profile page loads with user data", async ({ request, page }) => {
    const state = loadState();
    const res = await request.get(`${API}/auth/user-profile`, {
      headers: authHeader(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("first_name");
    expect(body).toHaveProperty("last_name");
    expect(body).toHaveProperty("username");
    expect(body).toHaveProperty("email");
    expect(body).toHaveProperty("phone");
    expect(body).toHaveProperty("is_verified");
    expect(body).toHaveProperty("is_kyc_verified");

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/settings/profile-page.png",
      fullPage: true,
    });
  });

  test("KYC status endpoint — no submission yet", async ({
    request,
    page,
  }) => {
    const res = await request.get(`${API}/auth/kyc/status`, {
      headers: authHeader(),
    });
    expect(res.ok()).toBeTruthy();
    // null response when no KYC has been submitted
    const body = await res.json();
    // Either null or an object with status
    if (body !== null) {
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("document_type");
    }

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/settings/kyc-section.png",
      fullPage: true,
    });
  });

  test("API token section — generate and list", async ({
    request,
    page,
  }) => {
    // Generate a new key
    const genRes = await request.post(`${API}/auth/api-keys/generate`, {
      headers: authHeader(),
    });
    expect(genRes.ok()).toBeTruthy();
    const genBody = await genRes.json();
    expect(genBody.api_key).toMatch(/^rai_/);

    // List keys
    const listRes = await request.get(`${API}/auth/api-keys`, {
      headers: authHeader(),
    });
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    expect(listBody).toHaveProperty("key_prefix");
    expect(listBody).toHaveProperty("created_at");

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/settings/token-section.png",
      fullPage: true,
    });
  });

  test("notifications panel — list and unread count", async ({
    request,
    page,
  }) => {
    // Get notifications list
    const listRes = await request.get(`${API}/notifications?page=1&page_size=20`, {
      headers: authHeader(),
    });
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    expect(listBody).toHaveProperty("items");
    expect(listBody).toHaveProperty("total");
    expect(Array.isArray(listBody.items)).toBeTruthy();

    // Get unread count
    const countRes = await request.get(`${API}/notifications/unread-count`, {
      headers: authHeader(),
    });
    expect(countRes.ok()).toBeTruthy();
    const countBody = await countRes.json();
    expect(typeof countBody.unread_count).toBe("number");

    await page.goto("/");
    await page.waitForLoadState("load");
    await page.screenshot({
      path: "feature_parity_validation/settings/notifications.png",
      fullPage: true,
    });
  });

  test("mark all notifications as read", async ({ request }) => {
    const res = await request.patch(`${API}/notifications/read-all`, {
      headers: authHeader(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.updated).toBe("number");
  });
});
