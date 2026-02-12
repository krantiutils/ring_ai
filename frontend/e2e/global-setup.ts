import { seedAll } from "./fixtures/seed";

async function globalSetup() {
  console.log("\n[global-setup] Seeding test data via API...");
  const result = await seedAll();
  if (result) {
    console.log("[global-setup] Seed complete.");
    // Store tokens in environment for tests to use
    process.env.E2E_ACCESS_TOKEN = result.tokens.access_token;
    process.env.E2E_ORG_ID = result.org_id;
  } else {
    console.warn(
      "[global-setup] Seed returned null — tests will run against existing app state."
    );
  }
}

export default globalSetup;
