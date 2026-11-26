import { expect, test } from "@playwright/test";
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`financial breakdown and worked examples at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto("/");
    await expect(page.getByRole("status")).toContainText("Loading booking finance");
    await expect(page.getByText("HelpKey owes hotel ₹200.00", { exact: true })).toBeVisible();
    await expect(page.getByText("provisional", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "online", exact: true }).click();
    await expect(page.getByText("HelpKey owes hotel ₹1,900.00", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "hotel", exact: true }).click();
    await expect(page.getByText("Hotel owes HelpKey ₹200.00", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "outstanding", exact: true }).click();
    await expect(page.getByText("Withheld pending collection or review")).toBeVisible();
    await expect(page.locator("div").filter({ has: page.locator("dt", { hasText: "Current reservation outstanding" }) }).last()).toContainText("₹1,700.00");
    await page.getByRole("button", { name: "earned", exact: true }).click();
    await expect(page.getByText("earned · ₹200.00", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "review", exact: true }).click();
    await expect(page.getByText("Charge ownership unresolved: Customer fee.")).toBeVisible();
    await page.getByText("Original charges and policy evidence").click();
    await expect(page.getByText(/Global revision 3/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/booking-finance/finance-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "historical", exact: true }).click();
    await expect(page.getByText("Historical finance agreement unavailable")).toBeVisible();
    await page.getByRole("button", { name: "staff", exact: true }).click();
    await expect(page.getByRole("region", { name: "Booking financial breakdown" })).toHaveCount(0);
  });
}
test("allows retry after a failed separate finance read", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "retry", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to load booking finance");
  await page.getByRole("button", { name: "Retry booking finance" }).click();
  await expect(page.getByText("HelpKey owes hotel ₹200.00", { exact: true })).toBeVisible();
});
test("flags missing setup and withholds settlement for failed or unknown booking states", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "setup", exact: true }).click();
  await expect(page.getByText(/Finance setup required · marketplace/)).toBeVisible();
  await expect(page.getByText("Withheld pending collection or review")).toBeVisible();
  await page.getByRole("button", { name: "payment_failed", exact: true }).click();
  await expect(page.getByText("not earned", { exact: true })).toBeVisible();
  await expect(page.getByText("Withheld pending collection or review")).toBeVisible();
  await page.getByRole("button", { name: "unknown", exact: true }).click();
  await expect(page.getByText(/Review required · marketplace/)).toBeVisible();
  await expect(page.getByText("Withheld pending collection or review")).toBeVisible();
});
