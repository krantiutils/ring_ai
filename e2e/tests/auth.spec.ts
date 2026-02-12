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
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" })
    ).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/auth/login-page.png",
      fullPage: true,
    });
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByText(/invalid email or password|login failed/i)
    ).toBeVisible();

    // Still on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with valid credentials redirects to dashboard and save auth state", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Assert dashboard elements are visible
    await expect(page.getByText("Dashboard")).toBeVisible();
    // Sidebar should be visible with Ring AI branding
    await expect(page.getByText("Ring AI")).toBeVisible();

    await page.screenshot({
      path: "feature_parity_validation/auth/dashboard-after-login.png",
      fullPage: true,
    });

    // Save storageState for other test projects that depend on auth
    await page.context().storageState({ path: STORAGE_STATE_FILE });
  });
});
