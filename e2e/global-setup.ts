import { chromium, request } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const API = `${BACKEND_URL}/api/v1`;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://ring_ai:ring_ai@localhost:5433/ring_ai";

const AUTH_DIR = path.join(__dirname, ".auth");
const STATE_FILE = path.join(AUTH_DIR, "state.json");
const STORAGE_STATE_FILE = path.join(AUTH_DIR, "storageState.json");

const TEST_USER = {
  first_name: "E2E",
  last_name: "Tester",
  username: "e2e_tester",
  email: "e2e@ringai.test",
  phone: "+9779800000001",
  password: "TestPassword123!",
};

export interface TestState {
  accessToken: string;
  orgId: string;
  userId: string;
  campaignIds: string[];
  templateIds: string[];
}

/**
 * Ensure the campaigns table has all columns the ORM expects.
 *
 * The DB seed migration may be behind the ORM model — missing columns
 * cause 500 errors on every campaign endpoint.  We idempotently add
 * any that are absent so the E2E suite can actually exercise campaigns.
 */
function ensureCampaignColumns() {
  const migrations = [
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'category'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN category campaign_category;
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'voice_model_id'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN voice_model_id uuid REFERENCES voice_models(id);
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'form_id'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN form_id uuid REFERENCES forms(id);
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'scheduled_at'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN scheduled_at timestamp;
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'audio_file'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN audio_file varchar(500);
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'bulk_file'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN bulk_file varchar(500);
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'retry_count'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN retry_count integer NOT NULL DEFAULT 0;
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'retry_config'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN retry_config jsonb;
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'campaigns' AND column_name = 'source_campaign_id'
       ) THEN
         ALTER TABLE campaigns ADD COLUMN source_campaign_id uuid REFERENCES campaigns(id);
       END IF;
     END $$;`,
    // Also add the ix_campaigns_category index if missing
    `CREATE INDEX IF NOT EXISTS ix_campaigns_category ON campaigns(category);`,
  ];

  for (const sql of migrations) {
    try {
      execSync(`psql "${DATABASE_URL}" -c ${JSON.stringify(sql)}`, {
        stdio: "pipe",
        timeout: 10_000,
      });
    } catch (err) {
      console.warn(`⚠  Campaign column migration warning: ${(err as Error).message}`);
    }
  }
  console.log("✓ Campaign table columns verified/migrated");
}

async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.mkdirSync(path.join(__dirname, "feature_parity_validation"), {
    recursive: true,
  });

  // Ensure the campaigns table schema matches what the backend ORM expects
  ensureCampaignColumns();

  const api = await request.newContext({ baseURL: BACKEND_URL });

  // ── Register test user (idempotent — 409 if already exists) ──
  const registerRes = await api.post(`${API}/auth/register`, {
    data: TEST_USER,
  });
  let userId = "";
  if (registerRes.ok()) {
    userId = (await registerRes.json()).id;
  }

  // ── Login via API ──
  const loginRes = await api.post(`${API}/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `Global setup: login failed (${loginRes.status()}): ${await loginRes.text()}`
    );
  }
  const accessToken: string = (await loginRes.json()).access_token;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // ── Resolve userId from profile if registration returned 409 ──
  if (!userId) {
    const profileRes = await api.get(`${API}/auth/user-profile`, {
      headers: authHeaders,
    });
    if (profileRes.ok()) {
      userId = (await profileRes.json()).id;
    }
  }

  // ── Discover org_id from seeded templates (make db-seed) ──
  // NOTE: trailing slash before query params is required — FastAPI redirects
  // /templates?… to /templates/?… with 307 and Playwright does not follow it.
  let orgId = "";
  const templatesRes = await api.get(`${API}/templates/?page=1&page_size=1`);
  if (templatesRes.ok()) {
    const body = await templatesRes.json();
    if (body.items && body.items.length > 0) {
      orgId = body.items[0].org_id;
    }
  }

  if (!orgId) {
    console.warn(
      "⚠  No seeded organization found. Run `make db-seed` first. " +
        "Tests requiring org_id will be skipped."
    );
  }

  // ── Seed additional test data via API ──
  const campaignIds: string[] = [];
  const templateIds: string[] = [];

  if (orgId) {
    // Purchase credits
    await api.post(`${API}/credits/purchase`, {
      data: {
        org_id: orgId,
        amount: 10000,
        description: "E2E test credit purchase",
      },
    });

    // Create sample campaigns
    const campaignDefs = [
      { name: "Voice Campaign E2E", type: "voice", category: "voice" },
      { name: "SMS Campaign E2E", type: "text", category: "text" },
      { name: "Survey Campaign E2E", type: "form", category: "survey" },
      { name: "Combined Campaign E2E", type: "voice", category: "combined" },
    ] as const;

    for (const def of campaignDefs) {
      const res = await api.post(`${API}/campaigns/`, {
        data: { ...def, org_id: orgId },
      });
      if (res.ok()) {
        campaignIds.push((await res.json()).id);
      } else {
        console.warn(
          `⚠  Failed to create campaign "${def.name}" (${res.status()}): ${await res.text()}`
        );
      }
    }

    // Create a Nepali voice template
    const voiceTemplateRes = await api.post(`${API}/templates/`, {
      data: {
        name: "E2E नेपाली भ्वाइस टेम्प्लेट",
        content:
          "नमस्ते {customer_name} जी। तपाईंको अर्डर #{order_id} को स्थिति: {status}।",
        type: "voice",
        org_id: orgId,
        language: "ne",
        voice_config: {
          language: "ne-NP",
          speed: 0.9,
          voice_name: "ne-NP-SagarNeural",
        },
      },
    });
    if (voiceTemplateRes.ok()) {
      templateIds.push((await voiceTemplateRes.json()).id);
    }

    // Create a text template
    const textTemplateRes = await api.post(`${API}/templates/`, {
      data: {
        name: "E2E OTP Text Template",
        content:
          "तपाईंको कोड {otp_code} हो। {expiry_minutes|५} मिनेटमा समाप्त हुनेछ।",
        type: "text",
        org_id: orgId,
        language: "ne",
      },
    });
    if (textTemplateRes.ok()) {
      templateIds.push((await textTemplateRes.json()).id);
    }

    // Upload contacts CSV to the first campaign
    if (campaignIds.length > 0) {
      const csvContent = [
        "phone,name,carrier",
        "+9779841000001,Ram Bahadur,NTC",
        "+9779801000002,Sita Sharma,Ncell",
        "+9779861000003,Hari Prasad,NTC",
        "+9779821000004,Gita Devi,Ncell",
        "+9779881000005,Krishna KC,Smart Cell",
      ].join("\n");

      await api.post(`${API}/campaigns/${campaignIds[0]}/contacts`, {
        multipart: {
          file: {
            name: "contacts.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(csvContent),
          },
        },
      });
    }
  }

  // ── Persist API state ──
  const state: TestState = {
    accessToken,
    orgId,
    userId,
    campaignIds,
    templateIds,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  // ── Browser-based auth: save storageState for Playwright ──
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: FRONTEND_URL });
  const page = await context.newPage();

  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill(TEST_USER.email);
  await page.getByPlaceholder("Enter your password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });

  // Inject the access token into localStorage (matches the app's auth mechanism)
  await page.evaluate((token: string) => {
    localStorage.setItem("access_token", token);
  }, accessToken);

  await context.storageState({ path: STORAGE_STATE_FILE });
  await browser.close();
  await api.dispose();

  console.log(
    `✓ Global setup complete — user=${userId}, org=${orgId}, ` +
      `campaigns=${campaignIds.length}, templates=${templateIds.length}`
  );
}

export default globalSetup;
