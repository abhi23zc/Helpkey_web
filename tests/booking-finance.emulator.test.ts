import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Agreement } from "@/lib/booking-finance/domain";
const hooks = vi.hoisted(() => ({ failWrite: false, afterPrepare: null as null | (() => void), providerFetch: vi.fn() }));
vi.mock("@/lib/providers/http", () => ({ providerFetch: hooks.providerFetch }));
vi.mock("@/lib/booking-finance/service", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/booking-finance/service")>();
  return { ...actual, prepareBookingAgreement: async (...args: Parameters<typeof actual.prepareBookingAgreement>) => {
    const apply = await actual.prepareBookingAgreement(...args);
    hooks.afterPrepare?.();
    return () => { apply(); if (hooks.failWrite) throw Error("INJECTED_FINANCE_WRITE_FAILURE"); };
  } };
});
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "");
describe.skipIf(!safe)("booking finance isolated transaction and lifecycle integration", { timeout: 30000 }, () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let bookings: typeof import("@/lib/bookings");
  let finance: typeof import("@/lib/booking-finance/service");
  const prefix = `booking-finance-${crypto.randomUUID()}`, owner = `${prefix}-owner`, staff = `${prefix}-staff`, stranger = `${prefix}-stranger`, admin = `${prefix}-admin`;
  const hotels: string[] = [];
  let backup: FirebaseFirestore.DocumentData | undefined;
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-booking-finance";
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY; delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL; delete process.env.REDIS_URL;
    process.env.BACKGROUND_DELIVERY_MODE = "legacy";
    process.env.RAZORPAY_KEY_ID = "test"; process.env.RAZORPAY_KEY_SECRET = "test";
    db = (await import("@/lib/firebase/admin")).adminDb;
    bookings = await import("@/lib/bookings"); finance = await import("@/lib/booking-finance/service");
    backup = (await db.collection("hotelFinanceSettingsV1").doc("global").get()).data();
    for (const uid of [owner, staff, stranger, admin]) await db.collection("users").doc(uid).set({ roles: [uid === admin ? "admin" : "partner"], accountStatus: "active", isActive: true });
    await db.collection("hotelFinanceSettingsV1").doc("global").set({ revision: 1, settings: { marketplaceCommission: true, directCommission: true, walkInCommission: true, commissionBasis: "rooms", commissionBasisPoints: 1000 } });
  });
  afterAll(async () => {
    hooks.failWrite = false; hooks.afterPrepare = null;
    for (const hotel of hotels) {
      for (const name of ["bookings", "bookingFinanceAgreementsV1", "roomTypes", "ratePlans", "inventoryHolds", "inventoryCalendars", "roomNightInventory", "propertyPayments", "paymentAttempts", "refunds", "propertyMemberships", "bookingReferences", "bookingNotificationOutbox"] ) {
        const rows = await db.collection(name).where("propertyId", "==", hotel).get();
        await Promise.all(rows.docs.map(d => db.recursiveDelete(d.ref)));
      }
      await db.recursiveDelete(db.collection("properties").doc(hotel));
      await db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`).delete();
    }
    for (const uid of [owner, staff, stranger, admin]) await db.collection("users").doc(uid).delete();
    if (backup) await db.collection("hotelFinanceSettingsV1").doc("global").set(backup); else await db.collection("hotelFinanceSettingsV1").doc("global").delete();
  });
  async function fixture() {
    const hotel = `${prefix}-${hotels.length}`; hotels.push(hotel);
    await db.collection("properties").doc(hotel).set({ ownerId: owner, slug: hotel, name: "Finance fixture", status: "active", approvalStatus: "approved", isBookable: true, currency: "INR", timezone: "Asia/Kolkata", inventoryEngine: "interval_v1", bookingModes: ["overnight", "hourly"], checkInTime: "00:00", checkOutTime: "23:00" });
    for (const [uid, role] of [[owner, "owner"], [staff, "manager"]]) await db.collection("propertyMemberships").doc(`${hotel}_${uid}`).set({ propertyId: hotel, userId: uid, role, status: "active" });
    await db.collection("roomTypes").doc(`${hotel}-room`).set({ propertyId: hotel, status: "active", name: "Room", totalInventory: 5, maxAdults: 2, maxChildren: 0 });
    await db.collection("ratePlans").doc(`${hotel}-rate`).set({ propertyId: hotel, roomTypeId: `${hotel}-room`, status: "active", bookingMode: "overnight", pricingModel: "nightly", basePricePaise: 200000, taxBasisPoints: 500, customerFeePaise: 0, paymentMode: "pay_at_property" });
    const checkIn = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), checkOut = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const input = { propertySlug: hotel, roomTypeId: `${hotel}-room`, ratePlanId: `${hotel}-rate`, checkIn, checkOut, bookingMode: "overnight" as const, adults: 1, children: 0, infants: 0, paymentMethod: "pay_at_property", leadEmail: "guest@example.test", leadPhone: "+919876543210", adultGuestNames: ["Finance Guest"] };
    return { hotel, input, manual: { ...input, propertyId: hotel, guestName: "Finance Guest", guestEmail: "guest@example.test", guestPhone: "+919876543210" } };
  }
  async function agreement(id: string) { return (await finance.agreementRef(id).get()).data() as Agreement; }
  it("atomically captures marketplace agreement, retains it after policy edits and replays original creation", async () => {
    const { input } = await fixture();
    const key = crypto.randomUUID();
    const created = await bookings.createBooking("guest", input, key);
    const original = await agreement(created.bookingId);
    expect(original.commissionPaise).toBe(20000); expect(original.source).toBe("marketplace");
    await db.collection("hotelFinanceSettingsV1").doc("global").update({ revision: 2, "settings.commissionBasisPoints": 1500 });
    expect((await bookings.createBooking("guest", input, key)).bookingId).toBe(created.bookingId);
    expect(await agreement(created.bookingId)).toEqual(original);
    const model = await finance.readBookingFinance(owner, created.bookingId, "owner"); expect(model.status).toBe("ready");
    const saved = (await db.collection("bookings").doc(created.bookingId).get()).data()!;
    const publicBooking = JSON.stringify(bookings.serializeBooking(created.bookingId, saved));
    expect(publicBooking).not.toMatch(/commission|originalChargeState|globalRevision|hotelRevision|setupReasons/);
    expect(saved).not.toHaveProperty("finance"); expect(saved.quoteSnapshot).not.toHaveProperty("commissionPaise");
    await db.collection("hotelFinanceSettingsV1").doc("global").update({ revision: 1, "settings.commissionBasisPoints": 1000 });
  });
  it("captures original catalog categories only for accepted-price extras, retaining them after catalog edits", async () => {
    const { hotel, input } = await fixture();
    const catalog = db.collection("properties").doc(hotel).collection("stayCustomizations");
    const offering = { propertyId: hotel, version: 1, name: "Breakfast", description: "Original breakfast offering", kind: "service", category: "food_drinks", travelerCategories: [], roomTypeIds: [], bookingModes: ["overnight"], unitPricePaise: 100, maxQuantity: 3, advanceNoticeMinutes: 0, confirmation: "immediate", variants: [], status: "active" };
    await catalog.doc("breakfast").set(offering);
    await catalog.doc("pending").set({ ...offering, name: "Pending quote", confirmation: "approval", unitPricePaise: 500 });
    const created = await bookings.createBooking("guest", { ...input, customizationSelections: [{ offeringId: "breakfast", variantId: null, quantity: 1 }, { offeringId: "pending", variantId: null, quantity: 1 }] }, crypto.randomUUID());
    const original = await agreement(created.bookingId);
    expect(original.originalTotalPaise).toBe(210100);
    expect(original.charges.filter(c => c.kind === "extra")).toMatchObject([{ category: "food_drinks", amountPaise: 100, preTaxPaise: null }]);
    expect(original.setupReasons.join()).toMatch(/pre-tax amount unavailable/);
    await catalog.doc("breakfast").update({ category: "transport", version: 2 });
    const read = await finance.readBookingFinance(owner, created.bookingId, "owner");
    if (read.status === "historical") throw Error("Missing snapshot");
    expect(read.agreement).toEqual(original); expect(read.positionPaise).toBeNull();
  });
  it("captures direct and walk-in purpose and retries without replacing the agreement", async () => {
    const { manual } = await fixture(), key = crypto.randomUUID();
    const created = await bookings.createManualReservation(owner, manual, key), original = await agreement(created.id);
    expect(original.source).toBe("direct"); expect(original.expectedOnlinePaise).toBe(0); expect(original.expectedHotelPaise).toBe(210000);
    expect((await bookings.createManualReservation(owner, manual, key)).id).toBe(created.id); expect(await agreement(created.id)).toEqual(original);
    const walk = await fixture();
    const local = (await import("@/lib/booking/domain")).localParts(Date.now() - 60000, "Asia/Kolkata");
    const tomorrow = new Date(Date.parse(`${local.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const arrived = await bookings.createManualReservation(owner, { ...walk.manual, checkIn: local.date, checkOut: tomorrow, reservationPurpose: "walk_in", recordedArrivalTime: local.time }, crypto.randomUUID());
    expect((await agreement(arrived.id)).source).toBe("walk_in");
  });
  it("does not block creation with missing commercial configuration", async () => {
    const { hotel, input } = await fixture();
    const global = (await db.collection("hotelFinanceSettingsV1").doc("global").get()).data()!;
    await db.collection("hotelFinanceSettingsV1").doc("global").set({ revision: 3, settings: {} });
    try { const result = await bookings.createBooking("guest", input, crypto.randomUUID()); expect((await agreement(result.bookingId)).commissionPaise).toBeNull(); expect((await agreement(result.bookingId)).propertyId).toBe(hotel); }
    finally { await db.collection("hotelFinanceSettingsV1").doc("global").set(global); }
  });
  it("rolls back booking, inventory, receipts and agreement if a write fails", async () => {
    const { hotel, input } = await fixture(); hooks.failWrite = true;
    try { await expect(bookings.createBooking("guest", input, crypto.randomUUID())).rejects.toThrow("INJECTED_FINANCE_WRITE_FAILURE"); }
    finally { hooks.failWrite = false; }
    for (const name of ["bookings", "bookingFinanceAgreementsV1", "inventoryHolds", "inventoryCalendars", "bookingReferences"]) expect((await db.collection(name).where("propertyId", "==", hotel).get()).empty).toBe(true);
  });
  it("resolves concurrent policy writes against a coherent committed revision", async () => {
    const { hotel, input } = await fixture();
    await db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`).set({ revision: 1, settings: { commissionBasisPoints: 2000 } });
    let called = false;
    let update: Promise<unknown> | undefined;
    hooks.afterPrepare = () => { if (!called) { called = true; update = db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`).update({ revision: 2, "settings.commissionBasisPoints": 2500 }); } };
    try {
      const result = await bookings.createBooking("guest", input, crypto.randomUUID()); await update;
      const a = await agreement(result.bookingId);
      expect([1, 2]).toContain(a.hotelRevision); expect(a.commissionPaise).toBe(a.hotelRevision === 1 ? 40000 : 50000);
      expect(a.terms.provenance.commissionBasisPoints).toBe("overridden");
    } finally { hooks.afterPrepare = null; }
  });
  it("enforces active admin, owner/property isolation and staff denial", async () => {
    const { input } = await fixture(); const { bookingId } = await bookings.createBooking("guest", input, crypto.randomUUID());
    expect((await finance.readBookingFinance(admin, bookingId, "admin")).status).toBe("ready");
    for (const uid of [staff, stranger]) await expect(finance.readBookingFinance(uid, bookingId, "owner")).rejects.toMatchObject({ status: 403 });
    const { authorizePartnerRequest } = await import("@/lib/partner/pms/route-access");
    await expect(authorizePartnerRequest(staff, new Request(`http://localhost/api/partner/bookings/${bookingId}/finance`))).rejects.toMatchObject({ status: 403 });
    await db.collection("users").doc(admin).update({ isActive: false });
    await expect(finance.readBookingFinance(admin, bookingId, "admin")).rejects.toMatchObject({ status: 403 });
    await db.collection("users").doc(admin).update({ isActive: true });
    const { bookingId: historical } = await bookings.createBooking("guest", input, crypto.randomUUID()); await finance.agreementRef(historical).delete();
    expect(await finance.readBookingFinance(owner, historical, "owner")).toEqual({ status: "historical", message: "Historical finance agreement unavailable" }); expect((await finance.agreementRef(historical).get()).exists).toBe(false);
  });
  it("re-resolves the agreement when booking creation retries after a concurrent policy commit", async () => {
    const { hotel, input } = await fixture();
    const ref = db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`);
    await ref.set({ revision: 1, settings: { commissionBasisPoints: 1000 } });
    let attempts = 0;
    let update: Promise<unknown> | undefined;
    hooks.afterPrepare = () => {
      attempts++;
      if (attempts === 1) {
        update = ref.update({ revision: 2, "settings.commissionBasisPoints": 2500 });
        // Firestore's ABORTED response forces the real creation callback to retry.
        throw Object.assign(Error("Injected transaction contention"), { code: 10 });
      }
    };
    try {
      const result = await bookings.createBooking("guest", input, crypto.randomUUID()); await update;
      expect(attempts).toBeGreaterThanOrEqual(2);
      expect(await agreement(result.bookingId)).toMatchObject({ hotelRevision: 2, commissionPaise: 50000 });
    } finally { hooks.afterPrepare = null; }
  });
  it("writes checkout proof through the validated lifecycle handler, idempotently, without collecting", async () => {
    const { manual, hotel } = await fixture();
    // Create a valid current walk-in so both lifecycle transitions can run without editing charge facts.
    const local = (await import("@/lib/booking/domain")).localParts(Date.now() - 60000, "Asia/Kolkata");
    const tomorrow = new Date(Date.parse(`${local.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const result = await bookings.createManualReservation(owner, { ...manual, checkIn: local.date, checkOut: tomorrow, reservationPurpose: "walk_in", recordedArrivalTime: local.time }, crypto.randomUUID());
    await expect(bookings.transitionBooking(result.id, owner, "checked_out")).rejects.toThrow(); expect((await finance.checkoutProofRef(result.id).get()).exists).toBe(false);
    await bookings.transitionBooking(result.id, owner, "checked_in");
    await db.collection("properties").doc(hotel).update({ "pms.operationalPolicies.requireSettledBalance": true });
    await expect(bookings.transitionBooking(result.id, owner, "checked_out")).rejects.toThrow(); expect((await finance.checkoutProofRef(result.id).get()).exists).toBe(false);
    await db.collection("properties").doc(hotel).update({ "pms.operationalPolicies.requireSettledBalance": false });
    const key = crypto.randomUUID(); await bookings.transitionBooking(result.id, owner, "checked_out", { idempotencyKey: key });
    const first = (await finance.checkoutProofRef(result.id).get()).data(); expect(first?.validated).toBe(true);
    await bookings.transitionBooking(result.id, owner, "checked_out", { idempotencyKey: key });
    expect((await finance.checkoutProofRef(result.id).get()).data()).toEqual(first);
    const model = await finance.readBookingFinance(owner, result.id, "owner"); if (model.status === "historical") throw Error("snapshot missing"); expect(model.earning).toBe("earned"); expect(model.outstandingPaise).toBe(210000); expect(model.positionPaise).toBeNull();
  });
  it.each(["cancelled", "no_show"] as const)("does not earn after the actual %s lifecycle handler", async status => {
    const { manual } = await fixture();
    const local = (await import("@/lib/booking/domain")).localParts(Date.now() - 60000, "Asia/Kolkata");
    const tomorrow = new Date(Date.parse(`${local.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const result = await bookings.createManualReservation(owner, { ...manual, checkIn: local.date, checkOut: tomorrow, reservationPurpose: "walk_in", recordedArrivalTime: local.time }, crypto.randomUUID());
    const original = await agreement(result.id);
    await bookings.releaseBookingHold(result.id, owner, status, status === "cancelled" ? "PARTNER_CANCELLED" : "PARTNER_NO_SHOW");
    const model = await finance.readBookingFinance(owner, result.id, "owner");
    if (model.status === "historical") throw Error("Missing snapshot");
    expect(model.earning).toBe("not_earned"); expect(model.earnedCommissionPaise).toBeNull(); expect(model.positionPaise).toBeNull();
    expect(await agreement(result.id)).toEqual(original); expect((await finance.checkoutProofRef(result.id).get()).exists).toBe(false);
  });
});
