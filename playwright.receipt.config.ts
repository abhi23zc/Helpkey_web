import { defineConfig } from "@playwright/test";
const port = process.env.RECEIPT_TEST_PORT || "3005";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "booking-receipt.spec.ts",
  outputDir: "test-results/receipt",
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: "node tests/e2e/fixtures/receipt-server.mjs",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
