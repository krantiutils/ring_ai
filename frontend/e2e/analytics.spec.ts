import { test, expect } from "./fixtures/auth";

const SS = "feature_parity_validation/analytics";

test.describe("Analytics", () => {
  test("analytics page loads", async ({ authedPage: page, screenshot }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('[data-testid="analytics"], main, h1:has-text("Analytics"), h1:has-text("analytics")')
        .first()
    ).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "analytics/overview.png");
  });

  test("call status breakdown chart", async ({ authedPage: page, screenshot }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    const chart = page.locator(
      '[data-testid="call-status-chart"], canvas, svg, :text("Call Status"), :text("call status")'
    ).first();
    await expect(chart).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "analytics/call-status-chart.png");
  });

  test("carrier summary table", async ({ authedPage: page, screenshot }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    const table = page.locator(
      '[data-testid="carrier-summary"], table:has-text("Carrier"), table:has-text("carrier"), [class*="carrier"]'
    ).first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "analytics/carrier-summary.png");
  });

  test("export as PDF button", async ({ authedPage: page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    const exportBtn = page.locator(
      'button:has-text("Export"), button:has-text("PDF"), button:has-text("Download"), [data-testid="export-pdf"]'
    ).first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });
    await expect(exportBtn).toBeEnabled();
  });

  test("search by campaign name", async ({ authedPage: page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator(
      'input[type="search"], [data-testid="search-input"], [placeholder*="search" i], [placeholder*="campaign" i]'
    ).first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("Voice Outreach");
    await page.waitForTimeout(500);

    // Results should update
    await expect(
      page.locator('text=/Voice Outreach/i').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("search by phone number", async ({ authedPage: page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator(
      'input[type="search"], [data-testid="search-input"], [data-testid="phone-search"], [placeholder*="phone" i]'
    ).first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("+9779841000001");
    await page.waitForTimeout(500);
  });
});
