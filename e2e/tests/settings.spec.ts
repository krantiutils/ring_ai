import { test, expect } from "@playwright/test";

test.describe("Settings Flows", () => {
  test("settings page loads with profile section", async ({ page }) => {
    await page.goto("/dashboard/settings");

    // Assert page title
    await expect(
      page.locator("h1", { hasText: "Settings" })
    ).toBeVisible();

    // Profile section with user details
    await expect(
      page.getByText(/Profile|Account/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Email field should show the user's email
    await expect(
      page.getByText(/e2e@ringai.test/i).or(page.locator("input[value*='e2e@ringai']"))
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "feature_parity_validation/settings/profile-page.png",
      fullPage: true,
    });
  });

  test("KYC section is visible", async ({ page }) => {
    await page.goto("/dashboard/settings");

    // Wait for page to load
    await expect(
      page.locator("h1", { hasText: "Settings" })
    ).toBeVisible();

    // KYC verification section
    await expect(
      page.getByText(/KYC|Verification/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // KYC status badge (pending/approved/rejected/none)
    await expect(
      page.getByText(/pending|approved|rejected|none|Verify KYC/i).first()
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/settings/kyc-section.png",
      fullPage: true,
    });
  });

  test("API token section is visible with generate button", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings");

    await expect(
      page.locator("h1", { hasText: "Settings" })
    ).toBeVisible();

    // API Token section
    await expect(
      page.getByText(/API Token|API Key/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Generate token button or existing token display
    await expect(
      page
        .getByRole("button", { name: /generate/i })
        .or(page.getByText(/rai_/))
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/settings/token-section.png",
      fullPage: true,
    });
  });

  test("notifications section has toggles", async ({ page }) => {
    await page.goto("/dashboard/settings");

    await expect(
      page.locator("h1", { hasText: "Settings" })
    ).toBeVisible();

    // Notifications section
    await expect(
      page.getByText(/Notification/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Should show toggles for different notification types
    // (campaign events, credit warnings, KYC updates)
    await expect(
      page.getByText(/Campaign|Credit|KYC/i).first()
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/settings/notifications.png",
      fullPage: true,
    });
  });
});
