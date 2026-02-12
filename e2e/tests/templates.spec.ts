import { test, expect } from "@playwright/test";

test.describe("Template Management Flows", () => {
  test("template list page loads with seeded templates", async ({ page }) => {
    await page.goto("/dashboard/templates");

    // Assert page title
    await expect(
      page.locator("h1", { hasText: "Message Templates" })
    ).toBeVisible();

    // Wait for templates to load
    await expect(
      page.getByText(/E2E नेपाली|E2E OTP Text/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Assert table structure — title, content, type columns
    await expect(page.getByText(/Title|Name/i).first()).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/templates/list-page.png",
      fullPage: true,
    });
  });

  test("template list shows search functionality", async ({ page }) => {
    await page.goto("/dashboard/templates");

    // Search input should be visible
    await expect(
      page.getByPlaceholder(/search/i)
    ).toBeVisible({ timeout: 10_000 });

    // Create button should be visible
    await expect(
      page.getByRole("button", { name: /create|new/i })
    ).toBeVisible();
  });

  test("template list shows type badges", async ({ page }) => {
    await page.goto("/dashboard/templates");

    // Wait for data
    await expect(
      page.getByText(/E2E नेपाली|E2E OTP Text/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Type badges (voice/text)
    await expect(
      page.getByText(/voice|text/i).first()
    ).toBeVisible();
  });

  test("template create form opens", async ({ page }) => {
    await page.goto("/dashboard/templates");

    // Wait for page
    await expect(
      page.locator("h1", { hasText: "Message Templates" })
    ).toBeVisible();

    // Click create button
    await page.getByRole("button", { name: /create|new/i }).click();

    // Assert form appears
    await expect(
      page.getByPlaceholder(/template name|name/i).or(page.getByLabel(/name/i))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "feature_parity_validation/templates/create-form.png",
      fullPage: true,
    });
  });

  test("template list shows edit and delete actions", async ({ page }) => {
    await page.goto("/dashboard/templates");

    // Wait for data
    await expect(
      page.getByText(/E2E नेपाली|E2E OTP Text/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Edit and Delete buttons should exist for each row
    await expect(
      page.getByRole("button", { name: /edit/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /delete/i }).first()
    ).toBeVisible();
  });
});
