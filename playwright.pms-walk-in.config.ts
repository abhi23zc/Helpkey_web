import { defineConfig } from "@playwright/test";
import base from "./playwright.pms.config";
export default defineConfig({
  ...base,
  testMatch: "pms-walk-in.spec.ts",
  outputDir: "test-results/pms-walk-in",
  use: { ...base.use, timezoneId: "America/Los_Angeles" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
