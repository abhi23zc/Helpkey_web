import { defineConfig } from "@playwright/test";
import base from "./playwright.pms-walk-in.config";
export default defineConfig({
  ...base,
  testMatch: "pms-billing.spec.ts",
  outputDir: "test-results/pms-billing",
});
