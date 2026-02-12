import { defineConfig, devices } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],

  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Wait for both services to be ready before running tests
  webServer: process.env.CI
    ? undefined
    : [
        {
          command: "make dev-backend",
          cwd: "..",
          url: `${BACKEND_URL}/health`,
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          command: "make dev-frontend",
          cwd: "..",
          url: FRONTEND_URL,
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ],
});
