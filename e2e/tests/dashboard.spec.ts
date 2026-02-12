import { test, expect } from "@playwright/test";

test.describe("Dashboard Overview", () => {
  test("dashboard loads with stat widgets and charts", async ({ page }) => {
    await page.goto("/dashboard");

    // Assert sidebar navigation is visible
    await expect(page.getByText("Ring AI")).toBeVisible();
    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(page.getByText("Campaigns")).toBeVisible();
    await expect(page.getByText("Analytics")).toBeVisible();

    // Assert topbar title
    await expect(
      page.locator("h1", { hasText: "Dashboard" })
    ).toBeVisible();

    // Assert credit display in topbar
    await expect(page.getByText(/Credits/)).toBeVisible();

    // Wait for dashboard content to load (stat widgets)
    await expect(
      page.getByText(/Total Campaigns/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "feature_parity_validation/dashboard/overview.png",
      fullPage: true,
    });
  });

  test("stat widgets show campaign type breakdown", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for stat widgets to render
    await expect(page.getByText(/Total Campaigns/i)).toBeVisible({
      timeout: 10_000,
    });

    // Campaign type breakdown should include SMS, Phone, Survey, Combined
    // (the dashboard shows these as part of "Total Campaigns" widget)
    await expect(page.getByText(/SMS|Phone|Survey|Combined/i).first()).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/dashboard/campaign-types-chart.png",
      fullPage: true,
    });
  });

  test("charts render with SVG or canvas elements", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for dashboard data to load
    await expect(page.getByText(/Total Campaigns/i)).toBeVisible({
      timeout: 10_000,
    });

    // Recharts renders SVG-based charts — verify chart containers exist
    // The dashboard uses recharts which renders <svg> elements
    const svgCharts = page.locator(".recharts-wrapper");
    await expect(svgCharts.first()).toBeVisible({ timeout: 10_000 });

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
      timeout: 10_000,
    });

    await page.screenshot({
      path: "feature_parity_validation/dashboard/playback-distribution.png",
      fullPage: true,
    });
  });

  test("sidebar navigation works — click through pages", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Ring AI")).toBeVisible();

    // Click "Campaigns" in sidebar
    await page.getByRole("link", { name: "Campaigns" }).click();
    await expect(page).toHaveURL(/\/dashboard\/campaigns/);
    await expect(
      page.locator("h1", { hasText: "Campaigns" })
    ).toBeVisible();

    // Click "Analytics" in sidebar
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/dashboard\/analytics/);
    await expect(
      page.locator("h1", { hasText: "Analytics" })
    ).toBeVisible();

    // Click "Dashboard" to go back
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.screenshot({
      path: "feature_parity_validation/dashboard/sidebar-navigation.png",
      fullPage: true,
    });
  });
});
