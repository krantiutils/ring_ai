import { test, expect } from "./fixtures/auth";

const SS = "feature_parity_validation/dashboard";

test.describe("Dashboard", () => {
  test("overview loads with all widgets", async ({ authedPage: page, screenshot }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Main dashboard container should be present
    await expect(page.locator('[data-testid="dashboard"], main, [role="main"]').first()).toBeVisible();
    await screenshot(page, "dashboard/overview.png");
  });

  test("campaign types chart renders", async ({ authedPage: page, screenshot }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const chart = page.locator(
      '[data-testid="campaign-types-chart"], canvas, svg, [class*="chart"], [class*="Chart"]'
    ).first();
    await expect(chart).toBeVisible({ timeout: 10_000 });
    await screenshot(page, "dashboard/campaign-types-chart.png");
  });

  test("call outcomes chart renders", async ({ authedPage: page, screenshot }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Look for call outcomes visualization
    const section = page.locator(
      '[data-testid="call-outcomes-chart"], [data-testid="call-outcomes"], :text("Call Outcomes"), :text("call outcomes")'
    ).first();
    await expect(section).toBeVisible({ timeout: 10_000 });
    await screenshot(page, "dashboard/call-outcomes-chart.png");
  });

  test("credit usage over time chart", async ({ authedPage: page, screenshot }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const chart = page.locator(
      '[data-testid="credit-usage-chart"], :text("Credit Usage"), :text("credit usage")'
    ).first();
    await expect(chart).toBeVisible({ timeout: 10_000 });
    await screenshot(page, "dashboard/credit-usage-chart.png");
  });

  test("playback distribution chart", async ({ authedPage: page, screenshot }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const chart = page.locator(
      '[data-testid="playback-distribution"], :text("Playback"), :text("playback")'
    ).first();
    await expect(chart).toBeVisible({ timeout: 10_000 });
    await screenshot(page, "dashboard/playback-distribution.png");
  });

  test("stats cards: total campaigns, credits, calls, SMS, duration, owned numbers", async ({
    authedPage: page,
    screenshot,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Verify stat cards are present
    const statsContainer = page.locator(
      '[data-testid="stats-cards"], [class*="stats"], [class*="Stats"], [role="region"]'
    ).first();
    await expect(statsContainer).toBeVisible({ timeout: 10_000 });

    // Check for individual stat labels
    const expectedStats = [
      "campaign",
      "credit",
      "call",
      "sms",
      "duration",
      "number",
    ];
    for (const stat of expectedStats) {
      const card = page.locator(`text=/${stat}/i`).first();
      await expect(card).toBeVisible({ timeout: 5_000 });
    }

    await screenshot(page, "dashboard/stats-cards.png");
  });
});
