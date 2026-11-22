import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/finance",
  testDir: "./tests/e2e",
  testMatch: ["finance.spec.ts", "finance-phase3.spec.ts"],
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3017", trace: "retain-on-failure" },
  webServer: {
    command: "node tests/e2e/fixtures/finance-server.mjs",
    url: "http://127.0.0.1:3017",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
