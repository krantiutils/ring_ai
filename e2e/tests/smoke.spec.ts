import { test, expect } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

test.describe("Smoke Tests", () => {
  test("backend health endpoint returns healthy", async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("healthy");
  });

  test("frontend loads successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Ring AI/i);
  });

  test("frontend renders without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("load");

    await page.screenshot({
      path: "feature_parity_validation/homepage.png",
      fullPage: true,
    });

    expect(errors).toEqual([]);
  });

  test("API v1 OpenAPI spec is accessible", async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/v1/openapi.json`);
    expect(response.ok()).toBeTruthy();
    const spec = await response.json();
    expect(spec.openapi).toBeDefined();
    expect(spec.info.title).toBe("Ring AI");
  });

  test("dashboard loads when authenticated", async ({ page }) => {
    await page.goto("/dashboard");

    // Should render dashboard (not redirect to login)
    await expect(page.getByText("Ring AI")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("h1", { hasText: "Dashboard" })
    ).toBeVisible();
  });
});
