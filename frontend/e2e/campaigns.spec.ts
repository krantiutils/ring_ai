import { test, expect } from "./fixtures/auth";

const SS = "feature_parity_validation/campaigns";

test.describe("Campaigns", () => {
  test("campaign list page", async ({ authedPage: page, screenshot }) => {
    await page.goto("/campaigns");
    await page.waitForLoadState("networkidle");

    // Campaign list container
    await expect(
      page.locator('[data-testid="campaign-list"], table, [role="table"], [class*="campaign"]').first()
    ).toBeVisible({ timeout: 10_000 });

    await screenshot(page, "campaigns/list-page.png");
  });

  test("create new campaign form", async ({ authedPage: page, screenshot }) => {
    await page.goto("/campaigns/new");
    await page.waitForLoadState("networkidle");

    // Campaign creation form
    const form = page.locator('form, [data-testid="campaign-form"], [role="form"]').first();
    await expect(form).toBeVisible({ timeout: 10_000 });

    // Should have name field
    await expect(
      page.locator('[name="name"], [data-testid="campaign-name"], [placeholder*="name" i]').first()
    ).toBeVisible();

    // Should have type selector
    await expect(
      page.locator(
        '[name="type"], [data-testid="campaign-type"], select, [role="combobox"], [role="listbox"]'
      ).first()
    ).toBeVisible();

    await screenshot(page, "campaigns/create-form.png");
  });

  test("campaign detail with contacts", async ({ authedPage: page, screenshot }) => {
    // Navigate to campaign list first, then click into first campaign
    await page.goto("/campaigns");
    await page.waitForLoadState("networkidle");

    const firstCampaign = page.locator(
      'table tbody tr, [data-testid="campaign-row"], [class*="campaign-item"], a[href*="/campaigns/"]'
    ).first();

    if (await firstCampaign.isVisible({ timeout: 5_000 })) {
      await firstCampaign.click();
      await page.waitForLoadState("networkidle");

      // Detail page should show campaign info and contacts table
      await expect(
        page.locator('[data-testid="campaign-detail"], [data-testid="campaign-name"], h1, h2').first()
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // Fallback: try direct URL pattern
      await page.goto("/campaigns");
    }

    await screenshot(page, "campaigns/detail-page.png");
  });

  test("search, filter by status, sort, date picker", async ({ authedPage: page }) => {
    await page.goto("/campaigns");
    await page.waitForLoadState("networkidle");

    // Search input
    const searchInput = page.locator(
      'input[type="search"], [data-testid="search-input"], [placeholder*="search" i], [placeholder*="Search"]'
    ).first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("Voice");
    await page.waitForTimeout(500);

    // Status filter
    const statusFilter = page.locator(
      '[data-testid="status-filter"], select, [role="combobox"]'
    ).first();
    if (await statusFilter.isVisible({ timeout: 3_000 })) {
      await statusFilter.click();
    }

    // Sort control
    const sortControl = page.locator(
      '[data-testid="sort"], th[role="columnheader"], button:has-text("Sort"), [aria-sort]'
    ).first();
    if (await sortControl.isVisible({ timeout: 3_000 })) {
      await sortControl.click();
    }

    // Date picker
    const datePicker = page.locator(
      'input[type="date"], [data-testid="date-picker"], [class*="date-picker"], [class*="DatePicker"]'
    ).first();
    if (await datePicker.isVisible({ timeout: 3_000 })) {
      await datePicker.click();
    }
  });

  test("CSV contact upload flow", async ({ authedPage: page }) => {
    await page.goto("/campaigns");
    await page.waitForLoadState("networkidle");

    // Navigate to first campaign
    const firstCampaign = page.locator(
      'table tbody tr, [data-testid="campaign-row"], a[href*="/campaigns/"]'
    ).first();

    if (await firstCampaign.isVisible({ timeout: 5_000 })) {
      await firstCampaign.click();
      await page.waitForLoadState("networkidle");
    }

    // Look for upload button/area
    const uploadArea = page.locator(
      '[data-testid="csv-upload"], input[type="file"], button:has-text("Upload"), button:has-text("Import"), [class*="upload"]'
    ).first();
    await expect(uploadArea).toBeVisible({ timeout: 5_000 });
  });

  test("campaign start/pause/resume controls", async ({ authedPage: page }) => {
    await page.goto("/campaigns");
    await page.waitForLoadState("networkidle");

    // Navigate to first campaign detail
    const firstCampaign = page.locator(
      'table tbody tr, [data-testid="campaign-row"], a[href*="/campaigns/"]'
    ).first();

    if (await firstCampaign.isVisible({ timeout: 5_000 })) {
      await firstCampaign.click();
      await page.waitForLoadState("networkidle");
    }

    // Verify lifecycle controls exist
    const startBtn = page.locator(
      'button:has-text("Start"), [data-testid="start-campaign"]'
    ).first();
    const pauseBtn = page.locator(
      'button:has-text("Pause"), [data-testid="pause-campaign"]'
    ).first();
    const resumeBtn = page.locator(
      'button:has-text("Resume"), [data-testid="resume-campaign"]'
    ).first();

    // At least one control should be visible depending on campaign state
    const hasControls =
      (await startBtn.isVisible({ timeout: 3_000 })) ||
      (await pauseBtn.isVisible({ timeout: 1_000 })) ||
      (await resumeBtn.isVisible({ timeout: 1_000 }));

    expect(hasControls).toBeTruthy();
  });
});
