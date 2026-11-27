import { test, expect } from "@playwright/test";

test("unified owner finances desktop/mobile UI, drawers, filters, hotel switching, error retry, permission gate, and report verification", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/partner/finances?propertyId=hotel-1");

  // 1. Sidebar has unified Finances entry and not the old 3 entries
  await expect(page.getByRole("link", { name: "Finances" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Accounting" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Payouts" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Hotel Dues" })).toHaveCount(0);

  // 2. Overview cards, unassessed deductions explicit label, prepared payout separation, and freshness banner
  await expect(page.getByRole("heading", { name: "Finances", exact: true })).toBeVisible();
  await expect(page.getByText(/below the hotel's ₹1,500\.00 minimum payout/i)).toBeVisible();
  await expect(page.getByText(/Includes amounts before unassessed deductions/i)).toBeVisible();
  await expect(page.getByText("Prepared · payment not yet recorded")).toBeVisible();
  await expect(page.getByText(/HKP-PREP001/)).toBeVisible();
  await expect(page.getByText(/1 booking update is still processing/i)).toBeVisible();

  // 3. Booking settlement detail drawer & Escape keyboard close
  await page.getByRole("button", { name: "Inspect HK-UNASSESSED-2" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Not reviewed yet")).toBeVisible();
  await expect(dialog.getByText("Pending deduction review")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 4. Filter & clear reset + empty state
  await page.getByPlaceholder(/Search booking, payout/i).fill("NONEXISTENT-REF");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("No matching bookings")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByText("HK-READY-1")).toBeVisible();

  // 5. Payments tab shows multi-booking payout once with statement link
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  await expect(page.getByText("Hotel payout recorded")).toBeVisible();
  await expect(page.getByText("₹3,000.00").first()).toBeVisible();
  await page.getByRole("button", { name: /Inspect payment/i }).click();
  await expect(page.getByRole("dialog").getByText("HK-OLD-01")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("HK-OLD-02")).toBeVisible();
  await page.keyboard.press("Escape");

  // 6. Mobile viewport (390px) has zero horizontal overflow & submits report
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Report payment" }).first().click();
  await page.getByLabel("Amount paid (₹)").fill("200");
  await page.getByLabel("Payment date").fill("2026-11-25");
  await page.getByLabel("Transaction reference").fill("UI-UTR-200");
  await page.getByRole("button", { name: "Review details" }).click();
  await page.getByRole("button", { name: "Submit payment report" }).click();
  await expect(page.getByText(/awaiting Helpkey verification/i)).toBeVisible();
  await expect(page.getByText("Pending verification (1)")).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Reported payment/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 7. Admin verifies & records reported payment
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Open Admin Dues" }).click();
  await page.getByRole("tab", { name: /Reported payments \(1\)/i }).click();
  await expect(page.getByText("UI-UTR-200")).toBeVisible();
  await page.getByRole("button", { name: "Record reported payment" }).click();
  await page.getByRole("button", { name: "Review report allocation" }).click();
  await page.getByRole("button", { name: "Confirm payment received" }).click();
  await expect(page.getByText(/Payment received recorded/i)).toBeVisible();

  // 8. Owner sees recorded report & confirmed dues receipt
  await page.getByRole("button", { name: "Switch to Owner" }).click();
  await page.getByRole("tab", { name: "Reported payments" }).click();
  await expect(page.getByText("Recorded").first()).toBeVisible();
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  await expect(page.getByText("UI-UTR-200")).toBeVisible();

  // 9. Error recovery & hotel switching & permission-denied state
  await page.request.get("/api/test/trigger-fail-once");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("alert").getByText("Unable to load hotel finances")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByLabel("Hotel finances").getByText("Cosmozin Hotel")).toBeVisible();

  await page.getByLabel("Switch hotel").selectOption("hotel-2");
  await expect(page.getByLabel("Hotel finances").getByText("Sunrise Resort")).toBeVisible();
  await expect(page.getByText("All settlement balances are up to date")).toBeVisible();

  await page.getByRole("button", { name: /Role:/ }).click();
  await expect(page.getByRole("heading", { name: "Owner permission required" })).toBeVisible();
});
