import { defineConfig } from "@playwright/test";
import payouts from "./playwright.payouts.config";
export default defineConfig({
  ...payouts,
  testMatch: ["payouts.spec.ts", "accounting.spec.ts", "finance-settings.spec.ts"],
  outputDir: "test-results/payout-readiness",
});
