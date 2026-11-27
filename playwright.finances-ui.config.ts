import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "finances-ui.spec.ts",
  outputDir: "test-results/finances-ui",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3016",
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
    command: "node --import tsx scripts/test-finances-ui-server.tsx",
    url: "http://127.0.0.1:3016",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
