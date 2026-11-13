import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "pms-foundation.spec.ts",
  outputDir: "test-results/pms",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3014",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          },
        }
      : {}),
  },
  webServer: {
    command: "node scripts/test-pms-server.mjs",
    url: "http://127.0.0.1:3014",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
