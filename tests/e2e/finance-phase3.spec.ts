import { expect, test } from "@playwright/test";
import { emptyAccount } from "./fixtures/finance-account";
test("owner statement explains pending deductions and keeps payout execution disabled", async ({ page }) => {
  const a = emptyAccount(); a.assessmentCompleteness = { complete: false, pending: 1, provisional: true };
  await page.route("**/api/**", route => route.fulfill({ json: route.request().url().includes("transactions") ? { transactions: [], nextCursor: null } : a }));
  await page.goto("/partner/phase3");
  await expect(page.getByRole("heading", { name: "Hotel account", exact: true })).toBeVisible();
  await expect(page.getByText("Provisional balance", { exact: false })).toBeVisible();
  await expect(page.getByText("Reserved for customer refunds", { exact: true })).toBeVisible();
  await expect(page.getByText("Payout execution is disabled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record verified hotel receipt" })).toHaveCount(0);
  await expect(page.getByText("Older bookings without", { exact: false })).toBeVisible();
});
test("founder receipt form retains drafts on conflict and uses explicit revision refresh", async ({ page }) => {
  const a = emptyAccount(); let calls = 0; let received: Record<string, unknown> | null = null;
  await page.route("**/api/**", async route => {
    const url = route.request().url();
    if (route.request().method() === "POST") { calls++; received = route.request().postDataJSON(); if (calls === 1) { a.accountRevision = 2; return route.fulfill({ status: 409, json: { error: { code: "FINANCE_CONFLICT", message: "Account changed. Your draft is retained." } } }); } a.accountRevision++; return route.fulfill({ json: { revision: a.accountRevision } }); }
    if (url.includes("transactions")) return route.fulfill({ json: { transactions: [], nextCursor: null } });
    if (url.includes("deductions")) return route.fulfill({ json: { revision: 0, rules: [], active: [], accountingEnabled: false } });
    return route.fulfill({ json: a });
  });
  await page.goto("/admin/phase3");
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Record verified hotel receipt" }) });
  await form.getByLabel("Received amount").fill("500.25");
  await form.getByLabel("Bank / receipt reference").fill("BANK-EXAMPLE");
  await form.getByLabel("Evidence reference").fill("Reviewed bank statement");
  await form.getByLabel("Received at").fill("2026-11-22T10:00");
  await form.getByLabel("Reason / supporting explanation").fill("Verified against bank records");
  await form.getByRole("button", { name: "Record verified hotel receipt" }).click();
  await expect(form.getByRole("status")).toContainText("draft is retained");
  await expect(form.getByLabel("Bank / receipt reference")).toHaveValue("BANK-EXAMPLE");
  expect(received).toMatchObject({ amountPaise: 50025, expectedRevision: 1 });
  await page.evaluate(() => { window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); });
  // The reload action fetches the live revision without clearing independent drafts.
  await form.getByRole("button", { name: "Reload current account" }).click();
  await form.getByRole("button", { name: "Use current revision" }).click();
  await form.getByRole("button", { name: "Record verified hotel receipt" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved. Account refreshed.");
  expect(received).toMatchObject({ expectedRevision: 2, amountPaise: 50025 });
});
test("accounting activation is a standard audited form", async ({ page }) => {
  let c: unknown;
  await page.route("**/api/**", route => { if (route.request().method() === "POST") { c = route.request().postDataJSON(); return route.fulfill({ json: { revision: 3 } }); } return route.fulfill({ json: { revision: 2, rules: [], active: [], accountingEnabled: false } }); });
  await page.goto("/admin/phase3-rules");
  await page.getByLabel("Include all newly created bookings across all hotels").check();
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Save accounting activation" }) });
  await form.getByLabel("Reason / supporting explanation").fill("Reviewed rollout activation");
  await form.getByRole("button", { name: "Save accounting activation" }).click();
  expect(c).toMatchObject({ action: "accounting_activation", enabled: true, expectedRevision: 2, reason: "Reviewed rollout activation" });
});
