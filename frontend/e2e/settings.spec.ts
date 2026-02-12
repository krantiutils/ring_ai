import { test, expect } from "./fixtures/auth";

const SS = "feature_parity_validation/settings";

test.describe("Settings", () => {
  test("settings page with profile", async ({ authedPage: page, screenshot }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Profile section should be visible
    await expect(
      page.locator(
        '[data-testid="settings-page"], [data-testid="profile-section"], h1:has-text("Settings"), h1:has-text("Profile")'
      ).first()
    ).toBeVisible({ timeout: 10_000 });

    // User info should be displayed
    await expect(
      page.locator('text=/E2E Tester|e2e@ringai.test|e2e_tester/').first()
    ).toBeVisible({ timeout: 5_000 });

    await screenshot(page, "settings/profile-page.png");
  });

  test("KYC section", async ({ authedPage: page, screenshot }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const kycSection = page.locator(
      '[data-testid="kyc-section"], :text("KYC"), :text("Verification"), :text("Identity")'
    ).first();
    await expect(kycSection).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "settings/kyc-section.png");
  });

  test("API token section", async ({ authedPage: page, screenshot }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const tokenSection = page.locator(
      '[data-testid="token-section"], [data-testid="api-keys"], :text("API"), :text("Token")'
    ).first();
    await expect(tokenSection).toBeVisible({ timeout: 10_000 });

    // Should show generate button or existing token info
    const tokenUI = page.locator(
      'button:has-text("Generate"), [data-testid="api-key-prefix"], :text("rai_")'
    ).first();
    await expect(tokenUI).toBeVisible({ timeout: 5_000 });

    await screenshot(page, "settings/token-section.png");
  });

  test("notifications panel", async ({ authedPage: page, screenshot }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const notifSection = page.locator(
      '[data-testid="notifications"], :text("Notification"), :text("notification"), :text("Alert")'
    ).first();
    await expect(notifSection).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "settings/notifications.png");
  });
});
