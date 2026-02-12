import { test, expect } from "@playwright/test";
import { patchListApiResponses } from "../fixtures/seed";

test.describe("Dashboard Overview", () => {
  test("dashboard loads with stat widgets and charts", async ({ page }) => {
    await page.goto("/dashboard");

    // Assert sidebar navigation is visible
    await expect(page.getByText("Ring AI").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Campaigns" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();

    // Assert topbar title
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();

    // Assert credit display in topbar
    await expect(page.getByText(/Credits/).first()).toBeVisible();

    // Wait for dashboard content to load (stat widgets)
    // The actual text is "Total Campaign(s)" — match flexibly
    await expect(
      page.getByText(/Total Campaign/i)
    ).toBeVisible({ timeout: 30_000 });

    await page.screenshot({
      path: "feature_parity_validation/dashboard/overview.png",
      fullPage: true,
    });
  });

  test("stat widgets show campaign type breakdown", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for stat widgets to render
    await expect(page.getByText(/Total Campaign/i)).toBeVisible({
      timeout: 30_000,
    });

    // Campaign type breakdown is shown as subtitle: "SMS: 0, Phone: 0, Survey: 0, Combined: 0"
    await expect(
      page.getByText(/SMS.*Phone.*Survey.*Combined/i)
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/dashboard/campaign-types-chart.png",
      fullPage: true,
    });
  });

  test("charts render with SVG or canvas elements", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for dashboard data to load
    await expect(page.getByText(/Total Campaign/i)).toBeVisible({
      timeout: 30_000,
    });

    // Recharts renders SVG-based charts. The Call Outcomes bar chart and
    // Credit Usage line chart both render even with zero data because
    // they always receive data arrays (even if values are 0).
    // Check for recharts wrapper or SVG elements within chart containers.
    const rechartsOrSvg = page.locator(".recharts-wrapper, svg.recharts-surface").first();
    await expect(rechartsOrSvg).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "feature_parity_validation/dashboard/call-outcomes-chart.png",
      fullPage: true,
    });
  });

  test("credit usage section renders", async ({ page }) => {
    await page.goto("/dashboard");

    // Credit stats should be visible
    await expect(page.getByText(/Credits/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Credit-related labels: Purchased, Top-up, Used, Remaining
    await expect(
      page.getByText(/Purchased|Remaining|Used|Top-up/i).first()
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/dashboard/credit-usage-chart.png",
      fullPage: true,
    });
  });

  test("playback distribution section renders", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for playback widget to load
    await expect(page.getByText(/Playback/i).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({
      path: "feature_parity_validation/dashboard/playback-distribution.png",
      fullPage: true,
    });
  });

  test("sidebar navigation works — click through pages", async ({ page }) => {
    // Patch API responses so campaigns/templates pages don't crash
    await patchListApiResponses(page);

    await page.goto("/dashboard");
    await expect(page.getByText("Ring AI").first()).toBeVisible();

    // Click "Campaigns" in sidebar
    await page.getByRole("link", { name: "Campaigns" }).click();
    await expect(page).toHaveURL(/\/dashboard\/campaigns/);
    // Wait for the page to render (either h1 or campaign list content)
    await expect(
      page.getByText(/Campaigns|Campaign Name/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Click "Analytics" in sidebar
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/dashboard\/analytics/);
    await expect(
      page.getByText(/Analytics/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Click "Dashboard" to go back
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.screenshot({
      path: "feature_parity_validation/dashboard/sidebar-navigation.png",
      fullPage: true,
    });
  });
});
