import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { TEST_USER } from "../fixtures/seed";

const STORAGE_STATE_FILE = path.resolve(
  __dirname,
  "..",
  ".auth",
  "storageState.json"
);

test.describe("Authentication Flows", () => {
  test("login page renders with form elements", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" })
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/auth/login-page.png",
      fullPage: true,
    });
  });

  test("login with invalid credentials stays on login page", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@company.com").fill("wrong@example.com");
    await page.getByPlaceholder("Enter your password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Should stay on login page (not redirect to dashboard)
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/login/);

    // Login form should still be visible
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("login with valid credentials redirects to dashboard and save auth state", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@company.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter your password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Assert dashboard elements are visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Sidebar should be visible with Ring AI branding
    await expect(page.getByText("Ring AI").first()).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/auth/dashboard-after-login.png",
      fullPage: true,
    });

    // Save storageState for other test projects that depend on auth
    await page.context().storageState({ path: STORAGE_STATE_FILE });
  });
});
