import { test, expect } from "./fixtures/auth";

const SS = "feature_parity_validation/credits";

test.describe("Credit History", () => {
  test("credit purchase history page", async ({ authedPage: page, screenshot }) => {
    await page.goto("/credits");
    await page.waitForLoadState("networkidle");

    // Credit history container
    await expect(
      page.locator(
        '[data-testid="credit-history"], main, h1:has-text("Credit"), h1:has-text("credit"), :text("Purchase History")'
      ).first()
    ).toBeVisible({ timeout: 10_000 });

    // Purchase history table/list
    const purchaseSection = page.locator(
      '[data-testid="purchase-history"], table, [role="table"], :text("Purchase")'
    ).first();
    await expect(purchaseSection).toBeVisible({ timeout: 5_000 });

    await screenshot(page, "credits/purchase-history.png");
  });

  test("credit usage history page", async ({ authedPage: page, screenshot }) => {
    // Navigate to usage tab/section
    await page.goto("/credits");
    await page.waitForLoadState("networkidle");

    // Click usage tab if present
    const usageTab = page.locator(
      '[data-testid="usage-tab"], button:has-text("Usage"), a:has-text("Usage"), [role="tab"]:has-text("Usage")'
    ).first();
    if (await usageTab.isVisible({ timeout: 3_000 })) {
      await usageTab.click();
      await page.waitForLoadState("networkidle");
    } else {
      // Try direct URL
      await page.goto("/credits/usage");
      await page.waitForLoadState("networkidle");
    }

    // Usage history section
    const usageSection = page.locator(
      '[data-testid="usage-history"], table, [role="table"], :text("Usage")'
    ).first();
    await expect(usageSection).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "credits/usage-history.png");
  });
});
