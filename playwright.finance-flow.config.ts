import { defineConfig } from "@playwright/test";
import base from "./playwright.dues.config";

// Run the actual admin/owner finance screens sequentially on one isolated server.
export default defineConfig({
  ...base,
  testMatch: [
    "booking-finance-app.spec.ts",
    "accounting.spec.ts",
    "payouts.spec.ts",
    "dues.spec.ts",
  ],
  outputDir: "test-results/finance-flow",
});
