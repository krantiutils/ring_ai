import { test, expect } from "@playwright/test";
import { loadState, TEST_USER, authHeader } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("Auth — registration, login & token management", () => {
  test("login page renders on frontend", async ({ page }) => {
    // Navigate to root — the frontend is currently a landing page
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/auth/login-page.png",
      fullPage: true,
    });
    // Verify the page loaded without error
    await expect(page).toHaveTitle(/Ring AI/i);
  });

  test("register page renders on frontend", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/auth/register-page.png",
      fullPage: true,
    });
    await expect(page).toHaveTitle(/Ring AI/i);
  });

  test("register new user via API", async ({ request }) => {
    const unique = Date.now();
    const res = await request.post(`${API}/auth/register`, {
      data: {
        first_name: "Reg",
        last_name: "Test",
        username: `regtest_${unique}`,
        email: `regtest_${unique}@ringai.test`,
        phone: "+9779800099999",
        password: "SecurePass123!",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.username).toBe(`regtest_${unique}`);
    expect(body.message).toBe("Registration successful");
  });

  test("register rejects duplicate email", async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        first_name: "Dup",
        last_name: "User",
        username: "dup_username_unique",
        email: TEST_USER.email,
        phone: null,
        password: "SomePass123!",
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain("already");
  });

  test("login with valid credentials returns access token", async ({
    request,
  }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.token_type).toBe("bearer");
  });

  test("login with invalid credentials returns 401", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: TEST_USER.email, password: "WrongPassword!" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.detail).toBe("Invalid email or password");
  });

  test("generate API key for authenticated user", async ({ request, page }) => {
    const state = loadState();

    // Generate API key
    const genRes = await request.post(`${API}/auth/api-keys/generate`, {
      headers: authHeader(),
    });
    expect(genRes.ok()).toBeTruthy();
    const genBody = await genRes.json();
    expect(genBody.api_key).toMatch(/^rai_/);
    expect(genBody.message).toContain("Store it securely");

    // Verify key shows up in listing
    const listRes = await request.get(`${API}/auth/api-keys`, {
      headers: authHeader(),
    });
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    expect(listBody.key_prefix).toBeTruthy();

    // Screenshot
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/auth/token-generation.png",
      fullPage: true,
    });
  });

  test("user profile returns correct data", async ({ request }) => {
    const state = loadState();
    const res = await request.get(`${API}/auth/user-profile`, {
      headers: authHeader(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.email).toBe(TEST_USER.email);
    expect(body.first_name).toBe(TEST_USER.first_name);
    expect(body.last_name).toBe(TEST_USER.last_name);
    expect(typeof body.is_verified).toBe("boolean");
    expect(typeof body.is_kyc_verified).toBe("boolean");
  });

  test("unauthenticated request returns 401", async ({ request }) => {
    const res = await request.get(`${API}/auth/user-profile`);
    expect(res.status()).toBe(401);
  });
});
