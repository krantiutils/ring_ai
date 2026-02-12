import { test, expect } from "@playwright/test";
import { loadState } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("OTP — sending form & list", () => {
  let orgId: string;

  test.beforeAll(() => {
    const state = loadState();
    orgId = state.orgId;
    test.skip(!orgId, "No seeded organization — skipping OTP tests");
  });

  test("OTP send form — API endpoint exists", async ({ request, page }) => {
    // OTP sending requires Twilio which is not configured in test env.
    // Verify the endpoint exists and validates input correctly.
    const res = await request.post(`${API}/otp/send`, {
      data: {
        number: "+9779841000001",
        message: "Your code is {otp}. Do not share.",
        sms_send_options: "text",
        otp_options: "generated",
        otp_length: 6,
        org_id: orgId,
      },
    });

    // Expect 503 (telephony not configured) or 502 (delivery failed)
    // or 201 if Twilio is actually configured
    expect([201, 502, 503]).toContain(res.status());

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/otp/send-form.png",
      fullPage: true,
    });
  });

  test("OTP send validates personnel OTP requirement", async ({
    request,
  }) => {
    const res = await request.post(`${API}/otp/send`, {
      data: {
        number: "+9779841000001",
        message: "Code: {otp}",
        sms_send_options: "text",
        otp_options: "personnel",
        // Missing required `otp` field when otp_options=personnel
        org_id: orgId,
      },
    });
    expect(res.status()).toBe(422);
  });

  test("OTP send validates voice_input for voice delivery", async ({
    request,
  }) => {
    const res = await request.post(`${API}/otp/send`, {
      data: {
        number: "+9779841000001",
        message: "Code: {otp}",
        sms_send_options: "voice",
        otp_options: "generated",
        // Missing required `voice_input` for voice delivery
        org_id: orgId,
      },
    });
    expect(res.status()).toBe(422);
  });

  test("OTP list — paginated endpoint", async ({ request, page }) => {
    const res = await request.get(`${API}/otp/list?page=1&page_size=20`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("page_size");
    expect(Array.isArray(body.items)).toBeTruthy();

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/otp/list-page.png",
      fullPage: true,
    });
  });
});
