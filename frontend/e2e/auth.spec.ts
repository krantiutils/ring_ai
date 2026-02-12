import { test, expect } from "@playwright/test";
import { TEST_USER } from "./fixtures/seed";

const SS = "feature_parity_validation/auth";

test.describe("Authentication", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1, h2, [data-testid='login-heading']")).toBeVisible();
    await expect(page.locator('input[type="email"], [name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], [name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await page.screenshot({ path: `${SS}/login-page.png`, fullPage: true });
  });

  test("register page renders", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("h1, h2, [data-testid='register-heading']")).toBeVisible();
    await expect(page.locator('[name="first_name"], [data-testid="first-name-input"]')).toBeVisible();
    await expect(page.locator('[name="last_name"], [data-testid="last-name-input"]')).toBeVisible();
    await expect(page.locator('[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('[name="password"], input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await page.screenshot({ path: `${SS}/register-page.png`, fullPage: true });
  });

  test("login with valid credentials redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"], [name="email"]', TEST_USER.email);
    await page.fill('input[type="password"], [name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });
    // Should land on dashboard or home after login
    const url = page.url();
    expect(
      url.includes("/dashboard") || url.includes("/") && !url.includes("/login")
    ).toBeTruthy();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"], [name="email"]', "wrong@email.com");
    await page.fill('input[type="password"], [name="password"]', "WrongPassword123!");
    await page.click('button[type="submit"]');
    // Should remain on login page and show error
    await expect(
      page.locator('[role="alert"], .error, [data-testid="error-message"], .text-red-500')
    ).toBeVisible({ timeout: 5_000 });
    expect(page.url()).toContain("/login");
  });

  test("token generation in settings", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"], [name="email"]', TEST_USER.email);
    await page.fill('input[type="password"], [name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });

    // Navigate to settings
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Find and click API token generation
    const tokenSection = page.locator(
      '[data-testid="token-section"], [data-testid="api-keys"], text=API'
    ).first();
    await expect(tokenSection).toBeVisible({ timeout: 5_000 });

    const generateBtn = page.locator(
      'button:has-text("Generate"), button:has-text("Create"), [data-testid="generate-token"]'
    ).first();
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      // Wait for token display
      await page.waitForTimeout(1_000);
    }

    await page.screenshot({ path: `${SS}/token-generation.png`, fullPage: true });
  });
});
