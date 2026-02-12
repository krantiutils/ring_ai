import { test, expect } from "./fixtures/auth";

const SS = "feature_parity_validation/templates";

test.describe("Templates", () => {
  test("message templates list", async ({ authedPage: page, screenshot }) => {
    await page.goto("/templates");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator(
        '[data-testid="template-list"], table, [role="table"], [class*="template"]'
      ).first()
    ).toBeVisible({ timeout: 10_000 });

    // Should show seeded templates
    await expect(
      page.locator('text=/बिल भुक्तानी|OTP|सर्वेक्षण|KYC|डेलिभरी/').first()
    ).toBeVisible({ timeout: 5_000 });

    await screenshot(page, "templates/list-page.png");
  });

  test("create new template", async ({ authedPage: page, screenshot }) => {
    await page.goto("/templates/new");
    await page.waitForLoadState("networkidle");

    const form = page.locator('form, [data-testid="template-form"], [role="form"]').first();
    await expect(form).toBeVisible({ timeout: 10_000 });

    // Name field
    await expect(
      page.locator('[name="name"], [data-testid="template-name"], [placeholder*="name" i]').first()
    ).toBeVisible();

    // Content/body field
    await expect(
      page.locator(
        '[name="content"], textarea, [data-testid="template-content"], [contenteditable="true"]'
      ).first()
    ).toBeVisible();

    // Type selector
    await expect(
      page.locator(
        '[name="type"], [data-testid="template-type"], select, [role="combobox"]'
      ).first()
    ).toBeVisible();

    await screenshot(page, "templates/create-form.png");
  });

  test("template with Nepali variables renders correctly", async ({ authedPage: page }) => {
    await page.goto("/templates");
    await page.waitForLoadState("networkidle");

    // Click into first template
    const firstTemplate = page.locator(
      'table tbody tr, [data-testid="template-row"], a[href*="/templates/"]'
    ).first();

    if (await firstTemplate.isVisible({ timeout: 5_000 })) {
      await firstTemplate.click();
      await page.waitForLoadState("networkidle");
    }

    // Verify Nepali text is rendered (not garbled)
    const nepaliText = page.locator(
      'text=/नमस्कार|तपाईं|कोड|सेवा|ग्राहक/'
    ).first();
    await expect(nepaliText).toBeVisible({ timeout: 5_000 });

    // Verify variable placeholders are displayed
    const variableDisplay = page.locator(
      'text=/{\\w+}/, [data-testid="variables"], [class*="variable"]'
    ).first();
    await expect(variableDisplay).toBeVisible({ timeout: 5_000 });
  });
});
