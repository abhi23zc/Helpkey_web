import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "hotel-detail.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:3001", trace: "retain-on-failure" },
  webServer: { command: "node tests/e2e/fixtures/hotel-server.mjs", url: "http://127.0.0.1:3001", reuseExistingServer: false },
});
