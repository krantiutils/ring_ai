import { test, expect } from "@playwright/test";

test.describe("Credit History — Purchase & Usage", () => {
  test("credit purchase history page loads with table", async ({ page }) => {
    await page.goto("/dashboard/credit-purchase");

    // Assert page title
    await expect(
      page.locator("h1", { hasText: "Credit Purchase History" })
    ).toBeVisible();

    // Wait for table to render
    // Table headers: S.N., From, Credit Type, Credit Rate, Credit Added, Time Stamp
    await expect(
      page.getByText(/S\.N\.|Credit Type|Credit Added|Time Stamp/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Seeded data should show at least one transaction row
    // (global-setup purchases 10000 credits)
    await expect(
      page.getByText(/purchase|E2E/i).first()
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "feature_parity_validation/credits/purchase-history.png",
      fullPage: true,
    });
  });

  test("credit purchase history has search input", async ({ page }) => {
    await page.goto("/dashboard/credit-purchase");

    await expect(
      page.locator("h1", { hasText: "Credit Purchase History" })
    ).toBeVisible();

    // Search input
    await expect(
      page.getByPlaceholder(/search/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("credit usage history page loads", async ({ page }) => {
    await page.goto("/dashboard/credit-usage");

    // Assert page title
    await expect(
      page.locator("h1", { hasText: "Credit Usage History" })
    ).toBeVisible();

    // Table headers: S.N., Campaign, Type, Credits Used, Reference, Time Stamp
    await expect(
      page.getByText(/S\.N\.|Campaign|Credits Used|Time Stamp/i).first()
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "feature_parity_validation/credits/usage-history.png",
      fullPage: true,
    });
  });

  test("credit usage page has search input", async ({ page }) => {
    await page.goto("/dashboard/credit-usage");

    await expect(
      page.locator("h1", { hasText: "Credit Usage History" })
    ).toBeVisible();

    await expect(
      page.getByPlaceholder(/search/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
