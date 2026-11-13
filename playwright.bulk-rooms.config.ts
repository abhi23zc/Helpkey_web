import { defineConfig } from "@playwright/test";
import pms from "./playwright.pms.config";
export default defineConfig({
  ...pms,
  testMatch: "bulk-room-numbers.spec.ts",
  outputDir: "test-results/bulk-rooms",
});
