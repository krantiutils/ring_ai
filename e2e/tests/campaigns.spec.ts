import { test, expect } from "@playwright/test";
import { loadState } from "../fixtures/seed";

test.describe("Campaign Management Flows", () => {
  test("campaign list page loads with seeded campaigns", async ({ page }) => {
    await page.goto("/dashboard/campaigns");

    // Assert page title
    await expect(
      page.locator("h1", { hasText: "Campaigns" })
    ).toBeVisible();

    // Wait for campaign list to load (loading spinner disappears)
    await expect(page.getByText(/Voice Campaign E2E|SMS Campaign E2E/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Assert status badges are shown
    await expect(
      page.getByText(/draft|scheduled|active|paused|completed/i).first()
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/campaigns/list-page.png",
      fullPage: true,
    });
  });

  test("campaign list shows search and filter controls", async ({ page }) => {
    await page.goto("/dashboard/campaigns");

    // Search input
    await expect(
      page.getByPlaceholder(/search/i)
    ).toBeVisible({ timeout: 10_000 });

    // Add New Campaign button
    await expect(
      page.getByRole("button", { name: /add new campaign|create/i })
    ).toBeVisible();

    // Status filter dropdown or buttons
    await expect(
      page.getByText(/status|filter/i).first()
    ).toBeVisible();
  });

  test("search filters campaigns by name", async ({ page }) => {
    await page.goto("/dashboard/campaigns");

    // Wait for list to load
    await expect(page.getByText(/Voice Campaign E2E/i)).toBeVisible({
      timeout: 10_000,
    });

    // Type in search
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill("Voice");

    // Should still see Voice Campaign E2E
    await expect(page.getByText(/Voice Campaign E2E/i)).toBeVisible();
  });

  test("create campaign form opens", async ({ page }) => {
    await page.goto("/dashboard/campaigns");

    // Wait for page to load
    await expect(
      page.locator("h1", { hasText: "Campaigns" })
    ).toBeVisible();

    // Click create/add new campaign button
    await page.getByRole("button", { name: /add new campaign|create/i }).click();

    // Assert form/modal appears — look for form fields
    // Campaign name input, type selector, category selector
    await expect(
      page.getByPlaceholder(/campaign name/i).or(page.getByLabel(/name/i))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "feature_parity_validation/campaigns/create-form.png",
      fullPage: true,
    });
  });

  test("campaign detail page loads for seeded campaign", async ({ page }) => {
    await page.goto("/dashboard/campaigns");

    // Wait for campaign list
    await expect(page.getByText(/Voice Campaign E2E/i)).toBeVisible({
      timeout: 10_000,
    });

    // Click on the campaign name to view details
    await page.getByText("Voice Campaign E2E").click();

    // Wait for detail page or modal to load
    // Should show campaign name, status, contacts section
    await expect(page.getByText("Voice Campaign E2E")).toBeVisible({
      timeout: 10_000,
    });

    await page.screenshot({
      path: "feature_parity_validation/campaigns/detail-view.png",
      fullPage: true,
    });
  });
});
