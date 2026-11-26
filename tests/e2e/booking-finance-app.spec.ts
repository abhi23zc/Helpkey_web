import { test, expect, type BrowserContext } from "@playwright/test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || "")) throw Error("Local emulators required");
const app = initializeApp({ projectId: "demo-helpkey-finance" }, "booking-finance-browser");
const db = getFirestore(app), auth = getAuth(app);
const prefix = `booking-finance-ui-${crypto.randomUUID()}`, hotel = `${prefix}-hotel`;
const cookies = new Map<string, string>(); const uid = (role: string) => `${prefix}-${role}`;
let globalBackup: FirebaseFirestore.DocumentData | undefined;
async function login(context: BrowserContext, role: string) {
  await context.clearCookies(); await context.addCookies([{ name: "helpkey_session", value: cookies.get(role)!, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
}
test.beforeAll(async () => {
  globalBackup = (await db.collection("hotelFinanceSettingsV1").doc("global").get()).data();
  await db.collection("hotelFinanceSettingsV1").doc("global").set({ revision: 1, settings: { directCommission: true, commissionBasis: "rooms", commissionBasisPoints: 1000 } });
  for (const role of ["admin", "owner", "staff", "stranger"]) {
    const email = `${uid(role)}@example.test`;
    await auth.createUser({ uid: uid(role), email, password: "LocalFixture123!", emailVerified: true });
    await db.collection("users").doc(uid(role)).set({ fullName: role, email, emailVerified: true, roles: [role === "admin" ? "admin" : "partner"], accountStatus: "active", isActive: true });
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "LocalFixture123!", returnSecureToken: true }) });
    cookies.set(role, await auth.createSessionCookie((await response.json()).idToken, { expiresIn: 86400000 }));
  }
  await db.collection("properties").doc(hotel).set({ ownerId: uid("owner"), partnerId: uid("owner"), name: "Finance Browser Hotel", slug: hotel, status: "active", approvalStatus: "approved", isBookable: true, inventoryEngine: "interval_v1", timezone: "Asia/Kolkata", currency: "INR", bookingModes: ["overnight"], address: { city: "Test City" } });
  for (const [role, membership] of [["owner", "owner"], ["staff", "manager"]]) await db.collection("propertyMemberships").doc(`${hotel}_${uid(role)}`).set({ propertyId: hotel, userId: uid(role), role: membership, status: "active" });
  await db.collection("roomTypes").doc(`${hotel}-room`).set({ propertyId: hotel, status: "active", name: "Finance Room", totalInventory: 5, maxAdults: 2, maxChildren: 0 });
  await db.collection("ratePlans").doc(`${hotel}-rate`).set({ propertyId: hotel, roomTypeId: `${hotel}-room`, name: "Standard", status: "active", bookingMode: "overnight", pricingModel: "nightly", basePricePaise: 200000, taxBasisPoints: 500, customerFeePaise: 0, paymentMode: "pay_at_property" });
  await db.collection("properties").doc(hotel).update({ "address.line1": "Local fixture street", publicPhone: "+919876543210", checkInTime: "14:00", checkOutTime: "11:00", pms: { activatedAt: new Date(), teamReviewed: true, openingData: "none", inventoryVerification: { passed: true } } });
  await db.collection("cancellationPolicies").doc(`${hotel}-policy`).set({ propertyId: hotel, name: "Fixture policy", status: "active", description: "Local cancellation policy", cancellationFeePercent: 0, refundableUntilHours: 0 });
  await db.collection("ratePlans").doc(`${hotel}-rate`).update({ cancellationPolicyId: `${hotel}-policy` });
  for (let i = 0; i < 5; i++) await db.collection("physicalUnits").doc(`${hotel}-unit-${i}`).set({ propertyId: hotel, roomTypeId: `${hotel}-room`, status: "active", label: String(100 + i), housekeepingStatus: "clean" });
});
test.afterAll(async () => {
  for (const name of ["bookings", "bookingFinanceAgreementsV1", "roomTypes", "ratePlans", "cancellationPolicies", "physicalUnits", "inventoryHolds", "inventoryCalendars", "bookingReferences", "bookingNotificationOutbox", "propertyMemberships", "propertyPayments"]) {
    const rows = await db.collection(name).where("propertyId", "==", hotel).get(); await Promise.all(rows.docs.map(d => db.recursiveDelete(d.ref)));
  }
  await db.recursiveDelete(db.collection("properties").doc(hotel));
  for (const role of ["admin", "owner", "staff", "stranger"]) { await db.collection("users").doc(uid(role)).delete(); await auth.deleteUser(uid(role)); }
  if (globalBackup) await db.collection("hotelFinanceSettingsV1").doc("global").set(globalBackup); else await db.collection("hotelFinanceSettingsV1").doc("global").delete();
});
test("real booking creation, separate GET authorization, and admin/owner screen mounts", async ({ page, context }) => {
  await login(context, "owner");
  const checkIn = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), checkOut = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const response = await page.request.post("/api/partner/bookings", { headers: { "idempotency-key": crypto.randomUUID() }, data: { propertyId: hotel, roomTypeId: `${hotel}-room`, ratePlanId: `${hotel}-rate`, checkIn, checkOut, bookingMode: "overnight", adults: 1, children: 0, infants: 0, guestName: "Browser Finance Guest", guestEmail: "guest@example.test", guestPhone: "+919876543210", initialCollectionPaise: 0, paymentMethod: "pay_at_property" } });
  expect(response.status(), await response.text()).toBe(201);
  const raw = await response.json(), bookingId = (raw.data ?? raw).bookingId;
  const url = `/api/partner/bookings/${bookingId}/finance`;
  expect((await page.request.get(url)).status()).toBe(200);
  expect((await page.request.post(url, { data: {} })).status()).toBe(405);
  await page.goto(`/partner/reservations?propertyId=${hotel}&bookingId=${bookingId}&section=billing`);
  await expect(page.getByRole("region", { name: "Booking financial breakdown" })).toBeVisible();
  await expect(page.getByText("Original commission", { exact: true })).toBeVisible();
  await expect(page.getByText("₹200.00", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/booking-finance-app/owner-mobile.png", fullPage: true });
  await login(context, "staff");
  expect((await page.request.get(url)).status()).toBe(403);
  const staffBooking = await page.request.get(`/api/partner/bookings/${bookingId}?propertyId=${hotel}`);
  expect(staffBooking.status()).toBe(200); expect(await staffBooking.text()).not.toMatch(/commissionPaise|originalChargeState|globalRevision|setupReasons/);
  await login(context, "stranger"); expect((await page.request.get(url)).status()).toBe(403);
  await login(context, "admin");
  const adminUrl = `/api/admin/bookings/${bookingId}/finance`;
  expect((await page.request.get(adminUrl)).status()).toBe(200); expect((await page.request.post(adminUrl, { data: {} })).status()).toBe(405);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/admin/bookings");
  await page.getByRole("button", { name: "View timeline" }).first().click();
  await expect(page.getByRole("region", { name: "Booking financial breakdown" })).toBeVisible();
  await expect(page.getByText("Original commission", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/booking-finance-app/admin-desktop.png", fullPage: true });
  await db.collection("users").doc(uid("admin")).update({ isActive: false }); expect((await page.request.get(adminUrl)).status()).toBe(401);
});
