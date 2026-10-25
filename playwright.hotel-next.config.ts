import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/hotel-next",
  testDir: "./tests/e2e", testMatch: "hotel-next.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:3002", trace: "retain-on-failure" },
  webServer: { command: "node tests/e2e/fixtures/next-hotel-server.mjs", url: "http://127.0.0.1:3002", reuseExistingServer: false, timeout: 180_000 },
});
