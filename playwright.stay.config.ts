import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/stay",
  testDir: "./tests/e2e",
  testMatch: "stay-personalization.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3003", trace: "retain-on-failure" },
  webServer: {
    command: "node tests/e2e/fixtures/stay-server.mjs",
    url: "http://127.0.0.1:3003",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
