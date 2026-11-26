import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "finance-settings.spec.ts",
  outputDir: "test-results/finance-settings", workers: 1, timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3014", trace: "retain-on-failure", ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) },
  webServer: { command: "node scripts/test-finance-settings-server.mjs", url: "http://127.0.0.1:3014", reuseExistingServer: false, timeout: 120000 },
});
