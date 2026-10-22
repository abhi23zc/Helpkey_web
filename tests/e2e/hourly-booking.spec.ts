import { expect, test } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

test.skip(!process.env.FIRESTORE_EMULATOR_HOST, "Requires an isolated Firestore emulator and a server pointed to the same demo project.");
test("hourly arrival and duration persist from search to authoritative checkout", async ({ page }) => {
  test.setTimeout(120000);
  const app = initializeApp({ projectId: "demo-helpkey-bookings" }, `browser-${crypto.randomUUID()}`);
  const db = getFirestore(app);
  const id = `e2e_${crypto.randomUUID()}`;
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await db.collection("properties").doc(id).set({ slug: id, name: "Hourly Browser Test", status: "active", approvalStatus: "approved", isBookable: true, propertyType: "hotel", address: { city: "Test City" }, normalizedCity: "test city", currency: "INR", timezone: "Asia/Kolkata", bookingModes: ["hourly", "overnight"], inventoryEngine: "interval_v1", ratingAverage: 0, ratingCount: 0 });
  await db.collection("roomTypes").doc(id).set({ propertyId: id, status: "active", name: "Browser Room", totalInventory: 1, maxAdults: 2, maxChildren: 0, maxInfants: 0 });
  await db.collection("ratePlans").doc(id).set({ propertyId: id, roomTypeId: id, status: "active", name: "Hourly stay", bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 1, pricePaise: 20000 }, { hours: 2, pricePaise: 30000 }], basePricePaise: 20000, paymentMode: "pay_at_property" });
  try {
    page.setDefaultTimeout(20000);
    await page.route("**/*", (route) => { const target = new URL(route.request().url()); return target.origin === new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").origin ? route.continue() : route.abort(); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Hourly Stays" }).click();
    // Pick the arrival date via the styled single-date calendar popover.
    await page.getByRole("button", { name: /ARRIVAL DATE/ }).click();
    const [, , dayStr] = date.split("-");
    await page.getByRole("dialog", { name: "Choose arrival date" }).getByRole("button", { name: String(Number(dayStr)), exact: true }).click();
    // Pick arrival time (10:00 AM) and duration (2h) via the time & duration popover.
    await page.getByRole("button", { name: /TIME & DURATION/ }).click();
    await page.getByRole("button", { name: "10:00 AM", exact: true }).click();
    await page.getByRole("button", { name: "2h", exact: true }).click();
    await page.getByRole("dialog", { name: "Choose arrival time and duration" }).getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Search hotels", exact: true }).click();
    await expect(page).toHaveURL(/bookingMode=hourly/);
    await expect(page).toHaveURL(/durationMinutes=120/);
    await page.locator("article").filter({ hasText: "Hourly Browser Test" }).first().getByRole("link", { name: "View details", exact: true }).click();
    await expect(page.getByText(/Hourly stay · arrival 10:00/)).toBeVisible();
    const quoteResponse = page.waitForResponse(response => response.url().includes("/api/bookings/quote") && response.request().method() === "POST");
    await page.getByRole("link", { name: "Reserve this room", exact: true }).click();
    const quoted = await (await quoteResponse).json();
    expect(quoted.quote.subtotalPaise).toBe(30000);
    expect(quoted.quote.totalPaise).toBe(30000);
    await expect(page).toHaveURL(/bookingMode=hourly/);
    await expect(page.getByText("2 hours", { exact: true })).toBeVisible();
    await expect(page.getByText("Until 12:00", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Back to property listing" }).click();
    await expect(page).toHaveURL(/bookingMode=hourly/);
    await expect(page.getByLabel("Local arrival time", { exact: true })).toHaveValue("10:00");
    await expect(page.getByLabel("Guest duration", { exact: true })).toHaveValue("120");
    await page.getByLabel("Local arrival time", { exact: true }).selectOption("23:00");
    await expect(page).toHaveURL(/arrivalTime=23%3A00/);
    await page.getByRole("button", { name: "Overnight stay", exact: true }).click();
    await expect(page).toHaveURL(/bookingMode=overnight/);
    await page.getByRole("button", { name: "Hourly stay", exact: true }).click();
    await expect(page).toHaveURL(/bookingMode=hourly/);
    await expect(page.getByLabel("Guest duration", { exact: true })).toHaveValue("180");
  } finally {
    for (const collection of ["properties", "roomTypes", "ratePlans"]) await db.collection(collection).doc(id).delete();
    await db.terminate();
    await deleteApp(app);
  }
});
