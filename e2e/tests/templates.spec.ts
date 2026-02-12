import { test, expect } from "@playwright/test";
import { loadState } from "../fixtures/seed";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API = `${BACKEND_URL}/api/v1`;

test.describe("Templates — CRUD & Nepali variable rendering", () => {
  let orgId: string;
  let seededTemplateIds: string[];

  test.beforeAll(() => {
    const state = loadState();
    orgId = state.orgId;
    seededTemplateIds = state.templateIds;
    test.skip(!orgId, "No seeded organization — skipping template tests");
  });

  test("template list page", async ({ request, page }) => {
    const res = await request.get(`${API}/templates?page=1&page_size=20`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(body.total).toBeGreaterThanOrEqual(1);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/templates/list-page.png",
      fullPage: true,
    });
  });

  test("create new Nepali template", async ({ request, page }) => {
    const res = await request.post(`${API}/templates/`, {
      data: {
        name: "E2E बिल सम्झाउने",
        content:
          "नमस्ते {customer_name} जी। तपाईंको बिल रु. {amount} बाँकी छ। " +
          "{?late_fee}ढिलो शुल्क: रु. {late_fee}। {/late_fee}" +
          "कृपया भुक्तानी गर्नुहोस्।",
        type: "voice",
        org_id: orgId,
        language: "ne",
        voice_config: {
          language: "ne-NP",
          speed: 0.9,
          voice_name: "ne-NP-HemkalaNeural",
        },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body.name).toBe("E2E बिल सम्झाउने");
    expect(body.type).toBe("voice");
    expect(body.language).toBe("ne");
    expect(body.variables).toContain("customer_name");
    expect(body.variables).toContain("amount");
    expect(body.voice_config).toBeTruthy();

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "feature_parity_validation/templates/create-form.png",
      fullPage: true,
    });

    // Cleanup
    await request.delete(`${API}/templates/${body.id}`);
  });

  test("template with Nepali variables renders correctly", async ({
    request,
  }) => {
    test.skip(
      seededTemplateIds.length === 0,
      "No seeded templates to render"
    );
    const templateId = seededTemplateIds[0];

    // Get the template to see its variables
    const getRes = await request.get(`${API}/templates/${templateId}`);
    expect(getRes.ok()).toBeTruthy();
    const template = await getRes.json();
    expect(template.variables).toBeTruthy();

    // Render with Nepali variable values
    const renderRes = await request.post(
      `${API}/templates/${templateId}/render`,
      {
        data: {
          variables: {
            customer_name: "राम बहादुर",
            order_id: "12345",
            status: "डेलिभर भइसक्यो",
          },
        },
      }
    );
    expect(renderRes.ok()).toBeTruthy();
    const rendered = await renderRes.json();
    expect(rendered.rendered_text).toContain("राम बहादुर");
    expect(rendered.rendered_text).toContain("12345");
    expect(rendered.type).toBe(template.type);
  });

  test("template validation endpoint", async ({ request }) => {
    test.skip(
      seededTemplateIds.length === 0,
      "No seeded templates to validate"
    );
    const templateId = seededTemplateIds[0];

    const res = await request.post(
      `${API}/templates/${templateId}/validate`
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.is_valid).toBe("boolean");
    expect(Array.isArray(body.required_variables)).toBeTruthy();
    expect(Array.isArray(body.variables_with_defaults)).toBeTruthy();
    expect(Array.isArray(body.conditional_variables)).toBeTruthy();
  });

  test("filter templates by type", async ({ request }) => {
    const res = await request.get(`${API}/templates?type=voice`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const t of body.items) {
      expect(t.type).toBe("voice");
    }
  });

  test("update template", async ({ request }) => {
    // Create a throwaway template
    const createRes = await request.post(`${API}/templates/`, {
      data: {
        name: "Update Target",
        content: "Hello {name}",
        type: "text",
        org_id: orgId,
        language: "en",
      },
    });
    const created = await createRes.json();

    const updateRes = await request.put(
      `${API}/templates/${created.id}`,
      { data: { name: "Updated Target" } }
    );
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.name).toBe("Updated Target");

    await request.delete(`${API}/templates/${created.id}`);
  });

  test("delete template", async ({ request }) => {
    const createRes = await request.post(`${API}/templates/`, {
      data: {
        name: "Delete Me",
        content: "Bye {name}",
        type: "text",
        org_id: orgId,
        language: "en",
      },
    });
    const created = await createRes.json();

    const deleteRes = await request.delete(
      `${API}/templates/${created.id}`
    );
    expect(deleteRes.status()).toBe(204);

    const getRes = await request.get(`${API}/templates/${created.id}`);
    expect(getRes.status()).toBe(404);
  });
});
