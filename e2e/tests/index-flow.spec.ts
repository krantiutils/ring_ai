import { test, expect } from "@playwright/test";

test.describe("Index User Flow", () => {
  test("authenticated users landing on homepage are routed to dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard(\/.*)?$/);
    await expect(page.locator("h1", { hasText: "Dashboard" })).toBeVisible();
    await page.screenshot({
      path: "feature_parity_validation/index/authenticated-home-redirect-dashboard.png",
      fullPage: true,
    });
  });
});
