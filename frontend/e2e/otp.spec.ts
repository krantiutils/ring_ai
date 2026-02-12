import { test, expect } from "./fixtures/auth";

const SS = "feature_parity_validation/otp";

test.describe("OTP", () => {
  test("OTP sending form", async ({ authedPage: page, screenshot }) => {
    await page.goto("/otp");
    await page.waitForLoadState("networkidle");

    // OTP form should be visible
    const form = page.locator('form, [data-testid="otp-form"], [role="form"]').first();
    await expect(form).toBeVisible({ timeout: 10_000 });

    // Phone number input
    await expect(
      page.locator(
        '[name="number"], [data-testid="phone-input"], input[type="tel"], [placeholder*="phone" i]'
      ).first()
    ).toBeVisible();

    // Message input
    await expect(
      page.locator(
        '[name="message"], textarea, [data-testid="message-input"], [placeholder*="message" i]'
      ).first()
    ).toBeVisible();

    // Delivery method selector (text/voice)
    await expect(
      page.locator(
        '[name="sms_send_options"], [data-testid="delivery-method"], :text("SMS"), :text("Voice")'
      ).first()
    ).toBeVisible();

    // OTP options (personnel/generated)
    await expect(
      page.locator(
        '[name="otp_options"], [data-testid="otp-options"], :text("Auto"), :text("Custom"), :text("Generated")'
      ).first()
    ).toBeVisible();

    // Submit button
    await expect(
      page.locator('button[type="submit"], button:has-text("Send")').first()
    ).toBeVisible();

    await screenshot(page, "otp/send-form.png");
  });

  test("sent OTP list", async ({ authedPage: page, screenshot }) => {
    await page.goto("/otp");
    await page.waitForLoadState("networkidle");

    // OTP history/list section
    const list = page.locator(
      '[data-testid="otp-list"], table, [role="table"], [class*="otp-history"]'
    ).first();
    await expect(list).toBeVisible({ timeout: 10_000 });

    // Should show table headers for OTP records
    const headers = page.locator(
      'th, [role="columnheader"], [data-testid="otp-header"]'
    );
    await expect(headers.first()).toBeVisible({ timeout: 5_000 });

    await screenshot(page, "otp/list-page.png");
  });
});
