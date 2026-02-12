import { test, expect } from "@playwright/test";

test.describe("Analytics Page", () => {
  test("analytics page loads with stat cards", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    // Assert page title
    await expect(
      page.locator("h1", { hasText: "Analytics" })
    ).toBeVisible();

    // Wait for analytics data to render
    // Analytics page shows stat cards: Total Credits Used, Attempted Calls, etc.
    await expect(
      page.getByText(/Total Credits|Attempted Calls|SMS Sent|Pickup Rate/i).first()
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "feature_parity_validation/analytics/overview.png",
      fullPage: true,
    });
  });

  test("call status breakdown chart renders", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    // Wait for content
    await expect(
      page.getByText(/Total Credits|Attempted Calls/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // The analytics page has a call status breakdown section
    // with a bar chart (recharts SVG)
    await expect(
      page.getByText(/Call Status|Status Breakdown/i).first()
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/analytics/call-status-chart.png",
      fullPage: true,
    });
  });

  test("carrier summary table renders", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    // Wait for content to load
    await expect(
      page.getByText(/Total Credits|Attempted Calls/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Carrier summary table headers
    await expect(
      page.getByText(/Carrier/i).first()
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/analytics/carrier-summary.png",
      fullPage: true,
    });
  });

  test("analytics has search by campaign name", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    // Assert search inputs exist
    await expect(
      page.getByPlaceholder(/campaign|search/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("export as PDF button is present", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    await expect(
      page.getByText(/Total Credits|Attempted Calls/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Export as PDF button
    await expect(
      page.getByRole("button", { name: /export|pdf/i })
    ).toBeVisible();
  });
});
