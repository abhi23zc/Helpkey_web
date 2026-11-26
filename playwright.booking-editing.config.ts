import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "booking-editing.spec.ts",
  outputDir: "test-results/booking-editing",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3019",
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
    command: "node --import tsx scripts/test-booking-editing-server.tsx",
    url: "http://127.0.0.1:3019",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
