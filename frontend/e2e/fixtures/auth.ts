import { test as base, type Page } from "@playwright/test";
import { TEST_USER } from "./seed";

const SCREENSHOT_DIR = "feature_parity_validation";

/**
 * Extended test fixture that provides authenticated page access
 * and a helper for saving screenshots to the validation folder.
 */
export const test = base.extend<{
  authedPage: Page;
  screenshot: (page: Page, path: string) => Promise<void>;
}>({
  authedPage: async ({ page }, use) => {
    // Navigate to login and authenticate
    await page.goto("/login");
    await page.fill('[name="email"], [data-testid="email-input"], input[type="email"]', TEST_USER.email);
    await page.fill('[name="password"], [data-testid="password-input"], input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    // Wait for navigation away from login
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });
    await use(page);
  },
  screenshot: async ({}, use) => {
    const fn = async (page: Page, relativePath: string) => {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${relativePath}`, fullPage: true });
    };
    await use(fn);
  },
});

export { expect } from "@playwright/test";
