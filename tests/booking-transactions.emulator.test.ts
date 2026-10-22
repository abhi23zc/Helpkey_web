import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const providerFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/http", () => ({ providerFetch }));

// Never run these against a production database. The host must be explicitly supplied.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("booking transactions (Firestore emulator)", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let bookings: typeof import("@/lib/bookings");
  const properties: string[] = [];
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
    process.env.RAZORPAY_KEY_ID = "test_key";
    process.env.RAZORPAY_KEY_SECRET = "test_secret";
    db = (await import("@/lib/firebase/admin")).adminDb;
    bookings = await import("@/lib/bookings");
  }, 30000);
  afterAll(async () => { await db?.terminate(); });
  afterEach(async () => {
    providerFetch.mockReset();
    for (const propertyId of properties.splice(0)) {
      const rows = await db.collection("bookings").where("propertyId", "==", propertyId).get();
      for (const row of rows.docs) {
        for (const collection of ["events"]) { const events = await row.ref.collection(collection).get(); for (const event of events.docs) await event.ref.delete(); }
        for (const collection of ["refunds", "paymentAttempts"]) { const related = await db.collection(collection).where("bookingId", "==", row.id).get(); for (const doc of related.docs) await doc.ref.delete(); }
        await row.ref.delete();
      }
      for (const collection of ["roomTypes", "ratePlans", "inventoryCalendars", "inventoryHolds", "bookingNotificationOutbox", "roomNightInventory", "propertyMemberships", "inventoryBlocks"]) {
        const rows = await db.collection(collection).where("propertyId", "==", propertyId).get();
        for (const row of rows.docs) await row.ref.delete();
      }
      const projections = await db.collection("projectionOutbox").where("entityId", "==", propertyId).get();
      for (const doc of projections.docs) await doc.ref.delete();
      await db.collection("properties").doc(propertyId).delete();
    }
  }, 30000);
  async function fixture(online = false) {
    const propertyId = `test_${crypto.randomUUID()}`;
    properties.push(propertyId);
    const roomTypeId = `${propertyId}_room`, ratePlanId = `${propertyId}_rate`;
    const checkIn = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await db.collection("properties").doc(propertyId).set({ slug: propertyId, name: "Test", status: "active", approvalStatus: "approved", isBookable: true, currency: "INR", timezone: "Asia/Kolkata", bookingModes: ["overnight", "hourly"], inventoryEngine: "interval_v1" });
    await db.collection("roomTypes").doc(roomTypeId).set({ propertyId, status: "active", name: "Test room", totalInventory: 1, maxAdults: 2, maxChildren: 0 });
    await db.collection("ratePlans").doc(ratePlanId).set({ propertyId, roomTypeId, status: "active", bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 2, pricePaise: 30000 }, { hours: 3, pricePaise: 120000 }], paymentMode: online ? "full" : "pay_at_property" });
    const input = { propertySlug: propertyId, roomTypeId, ratePlanId, checkIn, arrivalTime: "10:00", durationMinutes: 180, bookingMode: "hourly", adults: 1, children: 0, infants: 0, paymentMethod: online ? "online" : "pay_at_property", leadEmail: "guest@example.com", leadPhone: "+919876543210", adultGuestNames: ["Test Guest"] };
    return { propertyId, input };
  }
  it("permits exactly one concurrent reservation of the final room", async () => {
    const { input, propertyId } = await fixture();
    const results = await Promise.allSettled([bookings.createBooking("guest", input, "one"), bookings.createBooking("guest", input, "two")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const calendars = await db.collection("inventoryCalendars").where("propertyId", "==", propertyId).get();
    expect(calendars.docs.every((doc) => Object.values(doc.data().reserved).every((value) => value === 1))).toBe(true);
  }, 30000);
  it("preserves a pending payment's agreed price after its old source rate is archived", async () => {
    const { input, propertyId } = await fixture(true);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "order_original" }));
    const created = await bookings.createBooking("guest", input, "original");
    // Emulate a hold made before rollout, with a fractional-hour legacy snapshot.
    await db.collection("bookings").doc(created.bookingId).update({ pricingModel: "per_hour", durationMinutes: 135 });
    await db.collection("ratePlans").doc(input.ratePlanId).update({ pricingModel: "per_hour", hourlyPricePaise: 99999 });
    const before = (await db.collection("bookings").doc(created.bookingId).get()).data()!;
    const command = (...args: string[]) => promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/archive-legacy-hourly-rates.ts", "--property", propertyId, ...args], { env: process.env, timeout: 20000 });
    expect(JSON.parse((await command()).stdout).affectedRates).toHaveLength(1);
    expect((await db.collection("ratePlans").doc(input.ratePlanId).get()).get("status")).toBe("active");
    await command("--apply");
    expect(JSON.parse((await command()).stdout).affectedRates).toEqual([]);
    await command("--apply");
    expect((await db.collection("bookings").doc(created.bookingId).get()).data()).toEqual(before);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "pay_original", order_id: "order_original", amount: 120000, currency: "INR", status: "captured", captured: true }));
    await expect(bookings.confirmPaidBooking(created.bookingId, { actorId: "guest", orderId: "order_original", paymentId: "pay_original", source: "customer_verify" })).resolves.toBe(true);
    expect((await db.collection("bookings").doc(created.bookingId).get()).get("totalPaise")).toBe(120000);
    await expect(bookings.createBooking("guest", input, "new-after-archive")).rejects.toThrow("RATE_NOT_AVAILABLE");
  }, 60000);
  it("rejects legacy offers and unpriced durations without allocating inventory", async () => {
    const { input, propertyId } = await fixture();
    await expect(bookings.createBooking("guest", { ...input, durationMinutes: 240 }, "unpriced")).rejects.toThrow("DURATION_NOT_PRICED");
    await db.collection("ratePlans").doc(input.ratePlanId).update({ pricingModel: "package", durationMinutes: 180, basePricePaise: 50000 });
    await expect(bookings.createBooking("guest", input, "legacy")).rejects.toThrow("RATE_NOT_AVAILABLE");
    expect((await db.collection("inventoryHolds").where("propertyId", "==", propertyId).get()).empty).toBe(true);
  }, 30000);
  it("starts new properties with shared inventory and preserves an existing draft's engine", async () => {
    const uid = `test_partner_${crypto.randomUUID()}`;
    await db.collection("users").doc(uid).set({ roles: ["partner"], accountStatus: "active", isActive: true });
    try {
      const { startPropertyDraft, beginOnboarding } = await import("@/lib/partner/service");
      const draft = await startPropertyDraft(uid, "New hourly-ready hotel");
      properties.push(draft.propertyId);
      expect((await db.collection("properties").doc(draft.propertyId).get()).get("inventoryEngine")).toBe("interval_v1");
      await db.collection("properties").doc(draft.propertyId).update({ inventoryEngine: FieldValue.delete() });
      const address = { line1: "123 Test Road", city: "Test City", state: "Test State", postalCode: "123456", countryCode: "IN" };
      const input = { businessName: "Test Business", businessEmail: "test@example.com", businessPhone: "+919876543210", businessAddress: address, property: { name: "Legacy draft", propertyType: "hotel", roomCount: 1, address, latitude: 12, longitude: 77, googlePlaceId: "test_place", timezone: "Asia/Kolkata" } };
      await beginOnboarding(uid, input);
      expect((await db.collection("properties").doc(draft.propertyId).get()).get("inventoryEngine")).toBeUndefined();
      const fresh = await beginOnboarding(uid, { ...input, createNew: true });
      properties.push(fresh.propertyId);
      expect((await db.collection("properties").doc(fresh.propertyId).get()).get("inventoryEngine")).toBe("interval_v1");
    } finally {
      await db.collection("users").doc(uid).delete();
      await db.collection("partnerProfiles").doc(uid).delete();
    }
  }, 30000);
  it("replays the same identity, conflicts on changed input, and releases once", async () => {
    const { input, propertyId } = await fixture();
    const first = await bookings.createBooking("guest", input, "same");
    expect((await bookings.createBooking("guest", input, "same")).bookingId).toBe(first.bookingId);
    await expect(bookings.createBooking("guest", { ...input, durationMinutes: 120 }, "same")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await Promise.all([bookings.cancelBookingForUser("guest", first.bookingId), bookings.cancelBookingForUser("guest", first.bookingId)]);
    const calendars = await db.collection("inventoryCalendars").where("propertyId", "==", propertyId).get();
    expect(calendars.docs.every((doc) => Object.values(doc.data().reserved).every((value) => value === 0))).toBe(true);
  }, 30000);
  it("rejects unowned, authorized-only and mismatched payments", async () => {
    const { input } = await fixture(true);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "order_test" }));
    const booking = await bookings.createBooking("guest", input, "payment");
    const confirm = { actorId: "guest", orderId: "order_test", paymentId: "pay_test", source: "customer_verify" };
    await expect(bookings.confirmPaidBooking(booking.bookingId, { ...confirm, actorId: "intruder" })).rejects.toThrow("BOOKING_NOT_FOUND");
    providerFetch.mockResolvedValueOnce(Response.json({ id: "pay_test", order_id: "order_test", status: "authorized", captured: false }));
    await expect(bookings.confirmPaidBooking(booking.bookingId, confirm)).rejects.toThrow("PAYMENT_NOT_CAPTURED");
    providerFetch.mockResolvedValueOnce(Response.json({ id: "pay_test", order_id: "order_test", status: "captured", captured: true, amount: 1, currency: "USD" }));
    await expect(bookings.confirmPaidBooking(booking.bookingId, confirm)).rejects.toThrow("PAYMENT_MISMATCH");
  }, 30000);
  it.each([true, false])("refunds a capture after expiry without reviving inventory (already released: %s)", async (released) => {
    const { input } = await fixture(true);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "order_late" }));
    const booking = await bookings.createBooking("guest", input, "late");
    await db.collection("bookings").doc(booking.bookingId).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    if (released) await bookings.releaseBookingHold(booking.bookingId, "system", "expired", "PAYMENT_HOLD_EXPIRED");
    const payment = { id: "pay_late", order_id: "order_late", amount: 120000, currency: "INR", status: "captured", captured: true };
    providerFetch.mockImplementation(async () => Response.json(payment));
    const confirm = { actorId: "system", orderId: "order_late", paymentId: "pay_late", source: "reconciliation" };
    await Promise.all([bookings.confirmPaidBooking(booking.bookingId, confirm), bookings.confirmPaidBooking(booking.bookingId, confirm)]);
    const data = (await db.collection("bookings").doc(booking.bookingId).get()).data()!;
    expect(data.bookingStatus).toBe("expired");
    expect(data.inventoryReleased).toBe(true);
    expect(data.paidPaise).toBe(120000);
    expect((await db.collection("refunds").where("bookingId", "==", booking.bookingId).get()).size).toBe(1);
  }, 30000);
  it("shares capacity between hourly and overnight reservations", async () => {
    const { input, propertyId } = await fixture();
    const nightRate = `${propertyId}_night`;
    await db.collection("ratePlans").doc(nightRate).set({ propertyId, roomTypeId: input.roomTypeId, status: "active", bookingMode: "overnight", pricingModel: "nightly", basePricePaise: 200000, paymentMode: "pay_at_property" });
    const checkOut = new Date(Date.parse(`${input.checkIn}T00:00Z`) + 86400000).toISOString().slice(0, 10);
    const night = { ...input, bookingMode: "overnight", ratePlanId: nightRate, checkOut };
    await bookings.createBooking("guest", night, "night");
    await expect(bookings.createBooking("guest", night, "second-night")).rejects.toThrow("SOLD_OUT_FOR_DATES");
    await expect(bookings.createBooking("guest", { ...input, arrivalTime: "15:00" }, "overlap")).rejects.toThrow("SOLD_OUT_FOR_DATES");
    await expect(bookings.createBooking("guest", input, "morning-before-night")).resolves.toMatchObject({ requiresPayment: false });
  }, 30000);
  it("confirms a quoted hourly stay that crosses midnight and releases its exact allocation", async () => {
    const { input, propertyId } = await fixture();
    await db.collection("ratePlans").doc(input.ratePlanId).update({ pricingModel: "duration", durationPrices: [{ hours: 3, pricePaise: 50000 }], basePricePaise: 50000, allowMidnightCrossing: true, operatingWindow: { start: "22:00", end: "06:00" } });
    const stay = { ...input, bookingMode: "hourly" as const, arrivalTime: "23:00", durationMinutes: 180 };
    const quoted = await bookings.quote(stay);
    expect(quoted.nights).toBe(0);
    expect(quoted.departureTime).toBe("02:00");
    const created = await bookings.createBooking("guest", { ...stay, expectedTotalPaise: quoted.totalPaise }, "midnight");
    expect((await db.collection("bookings").doc(created.bookingId).get()).data()?.bookingStatus).toBe("confirmed");
    await bookings.cancelBookingForUser("guest", created.bookingId);
    const calendars = await db.collection("inventoryCalendars").where("propertyId", "==", propertyId).get();
    expect(calendars.size).toBe(2);
    expect(calendars.docs.every((doc) => Object.values(doc.data().reserved).every((value) => value === 0))).toBe(true);
  }, 30000);
  it("retries refunds with the same provider key and applies completion once", async () => {
    const { input } = await fixture(true);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "order_refund" }));
    const booking = await bookings.createBooking("guest", input, "refund");
    providerFetch.mockResolvedValueOnce(Response.json({ id: "pay_refund", order_id: "order_refund", amount: 120000, currency: "INR", status: "captured", captured: true }));
    await bookings.confirmPaidBooking(booking.bookingId, { actorId: "system", orderId: "order_refund", paymentId: "pay_refund", source: "reconciliation" });
    const refundId = `${booking.bookingId}_test_refund`;
    await db.collection("refunds").doc(refundId).set({ bookingId: booking.bookingId, paymentId: "pay_refund", amountPaise: 60000, status: "pending", updatedAt: Timestamp.now() });
    await db.collection("bookings").doc(booking.bookingId).update({ refundDuePaise: 60000 });
    const { processRefund } = await import("@/lib/booking/processing");
    providerFetch.mockRejectedValueOnce(new Error("NETWORK_INTERRUPTED"));
    await expect(processRefund(refundId)).rejects.toThrow("NETWORK_INTERRUPTED");
    const firstRequest = providerFetch.mock.calls.at(-1)!;
    providerFetch.mockResolvedValueOnce(Response.json({ id: "rfnd_test", payment_id: "pay_refund", amount: 60000, currency: "INR", status: "processed" }));
    await processRefund(refundId);
    expect(providerFetch.mock.calls.at(-1)![2].headers["X-Refund-Idempotency"]).toBe(firstRequest[2].headers["X-Refund-Idempotency"]);
    const calls = providerFetch.mock.calls.length;
    await processRefund(refundId);
    expect(providerFetch.mock.calls).toHaveLength(calls);
    expect((await db.collection("bookings").doc(booking.bookingId).get()).data()!.refundedPaise).toBe(60000);
    const racedId = `${booking.bookingId}_refund_race`;
    const raced = db.collection("refunds").doc(racedId);
    await raced.set({ bookingId: booking.bookingId, paymentId: "pay_refund", amountPaise: 10000, status: "pending", updatedAt: Timestamp.now() });
    providerFetch.mockImplementationOnce(async () => {
      // Another worker finishes while this worker's HTTP request eventually fails.
      await raced.update({ status: "processed" });
      await db.collection("bookings").doc(booking.bookingId).update({ refundedPaise: 70000 });
      throw new Error("LATE_NETWORK_FAILURE");
    });
    await expect(processRefund(racedId)).rejects.toThrow("LATE_NETWORK_FAILURE");
    expect((await raced.get()).data()!.status).toBe("processed");
    await processRefund(racedId);
    expect((await db.collection("bookings").doc(booking.bookingId).get()).data()!.refundedPaise).toBe(70000);
  }, 30000);

  it("rejects maintenance conflicts and cross-property writes, then releases blocks once", async () => {
    const { input, propertyId } = await fixture();
    await db.collection("propertyMemberships").doc(`${propertyId}_partner`).set({ propertyId, userId: "partner", status: "active" });
    const { createCapacityBlock, releaseCapacityBlock } = await import("@/lib/booking/blocks");
    const { resolveLocal } = await import("@/lib/booking/domain");
    const start = resolveLocal(input.checkIn, "10:00", "Asia/Kolkata");
    const block = { roomTypeId: input.roomTypeId, startAt: new Date(start).toISOString(), endAt: new Date(start + 3600000).toISOString(), quantity: 1, reason: "Maintenance" };
    await expect(createCapacityBlock("intruder", propertyId, block)).rejects.toThrow("FORBIDDEN");
    const held = await createCapacityBlock("partner", propertyId, block);
    await expect(bookings.createBooking("guest", input, "blocked")).rejects.toThrow("SOLD_OUT_FOR_DATES");
    await Promise.all([releaseCapacityBlock("partner", propertyId, held.blockId), releaseCapacityBlock("partner", propertyId, held.blockId)]);
    await bookings.createBooking("guest", input, "after-block");
    await expect(createCapacityBlock("partner", propertyId, block)).rejects.toThrow("CAPACITY_BELOW_COMMITMENTS");
  }, 30000);
  it("dry-runs legacy conversion, blocks unresolved manual rooms and reconciles an atomic cutover", async () => {
    const { input, propertyId } = await fixture();
    await db.collection("properties").doc(propertyId).update({ inventoryEngine: FieldValue.delete(), isBookable: false });
    const bookingRef = db.collection("bookings").doc();
    const checkOut = new Date(Date.parse(`${input.checkIn}T00:00Z`) + 86400000).toISOString().slice(0, 10);
    await bookingRef.set({ propertyId, checkIn: input.checkIn, checkOut, bookingStatus: "confirmed", roomType: { id: "manual", name: "Old free text" }, legacyNote: "Preserve this history" });
    const pendingRef = db.collection("bookings").doc();
    await pendingRef.set({ propertyId, checkIn: input.checkIn, checkOut, bookingStatus: "pending_payment", paymentMethod: "online", expiresAt: Timestamp.fromMillis(Date.now() + 600000), roomType: { id: input.roomTypeId, name: "Test room" } });
    await db.collection("roomTypes").doc(input.roomTypeId).update({ totalInventory: 2 });
    const directory = await mkdtemp(join(tmpdir(), "helpkey-cutover-"));
    try {
      const execute = promisify(execFile);
      const command = (script: string, flags: string[] = []) => execute(process.execPath, ["node_modules/tsx/dist/cli.mjs", `scripts/${script}.ts`, "--property", propertyId, ...flags], { env: process.env, timeout: 20000 });
      const dry = JSON.parse((await command("booking-inventory-cutover")).stdout);
      expect(dry.safe).toBe(false);
      expect(dry.unresolved).toContain(bookingRef.id);
      expect((await bookingRef.get()).data()!.roomType.id).toBe("manual");
      const mapping = join(directory, "mapping.json");
      await writeFile(mapping, JSON.stringify({ [bookingRef.id]: input.roomTypeId }));
      const applied = JSON.parse((await command("booking-inventory-cutover", ["--mapping", mapping, "--apply"])).stdout);
      expect(applied.safe).toBe(true);
      expect((await bookingRef.get()).data()!.legacyNote).toBe("Preserve this history");
      expect((await pendingRef.get()).get("paymentReconciliationPending")).toBe(true);
      expect((await pendingRef.get()).get("nextReconcileAt")).toBeInstanceOf(Timestamp);
      const reconciled = JSON.parse((await command("booking-inventory-reconcile")).stdout);
      expect(reconciled.drift).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 60000);

  it("recovers interrupted order creation without creating another booking or order", async () => {
    const { input, propertyId } = await fixture(true);
    providerFetch.mockRejectedValueOnce(new Error("NETWORK_INTERRUPTED"));
    await expect(bookings.createBooking("guest", input, "order-crash")).rejects.toThrow("NETWORK_INTERRUPTED");
    await expect(bookings.createBooking("guest", input, "order-crash")).rejects.toThrow("PAYMENT_ORDER_RECONCILIATION_REQUIRED");
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const rows = await db.collection("bookings").where("propertyId", "==", propertyId).get();
    expect(rows.size).toBe(1);
    const row = rows.docs[0];
    providerFetch.mockResolvedValueOnce(Response.json({ items: [{ id: "order_recovered", receipt: row.data().confirmationCode, notes: { bookingId: row.id }, amount: 120000, currency: "INR" }] }));
    providerFetch.mockResolvedValueOnce(Response.json({ items: [] }));
    const { reconcileBookingPayment } = await import("@/lib/booking/processing");
    await reconcileBookingPayment(row.id);
    const replay = await bookings.createBooking("guest", input, "order-crash");
    expect(replay.bookingId).toBe(row.id);
    expect(replay.razorpay?.orderId).toBe("order_recovered");
    expect(providerFetch.mock.calls.filter((call) => call[2]?.method === "POST")).toHaveLength(1);
  }, 30000);
  it("reserves manual bookings with audited negotiated prices and server-calculated tax", async () => {
    const { input, propertyId } = await fixture();
    await db.collection("propertyMemberships").doc(`${propertyId}_partner`).set({ propertyId, userId: "partner", status: "active" });
    await db.collection("ratePlans").doc(input.ratePlanId).update({ taxBasisPoints: 1800 });
    const manual = { ...input, propertyId, guestName: "Manual Guest", negotiatedSubtotalPaise: 80000, negotiatedPriceReason: "Agreed corporate price", paymentMethod: "paid" };
    await expect(bookings.createManualReservation("intruder", manual, "manual")).rejects.toThrow("FORBIDDEN");
    const created = await bookings.createManualReservation("partner", manual, "manual");
    expect((await bookings.createManualReservation("partner", manual, "manual")).id).toBe(created.id);
    const data = (await db.collection("bookings").doc(created.id).get()).data()!;
    expect(data.totalPaise).toBe(94400);
    expect(data.taxPaise).toBe(14400);
    expect(data.paidPaise).toBe(94400);
    expect(data.negotiatedPriceReason).toBe("Agreed corporate price");
    await expect(bookings.createBooking("guest", input, "manual-overlap")).rejects.toThrow("SOLD_OUT_FOR_DATES");
  }, 30000);

  it("reconciles pending refunds by provider ID and accepts provider responses without redundant currency", async () => {
    const { input } = await fixture(true);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "order_pending_refund" }));
    const booking = await bookings.createBooking("guest", input, "pending-refund");
    providerFetch.mockResolvedValueOnce(Response.json({ id: "pay_pending_refund", order_id: "order_pending_refund", amount: 120000, currency: "INR", status: "captured", captured: true }));
    await bookings.confirmPaidBooking(booking.bookingId, { actorId: "system", orderId: "order_pending_refund", paymentId: "pay_pending_refund", source: "reconciliation" });
    const refund = db.collection("refunds").doc(`${booking.bookingId}_pending`);
    await refund.set({ bookingId: booking.bookingId, paymentId: "pay_pending_refund", amountPaise: 60000, status: "pending" });
    await db.collection("bookings").doc(booking.bookingId).update({ refundDuePaise: 60000 });
    const { processRefund } = await import("@/lib/booking/processing");
    providerFetch.mockResolvedValueOnce(Response.json({ id: "rfnd_pending", payment_id: "pay_pending_refund", amount: 60000, status: "pending" }));
    await processRefund(refund.id);
    expect((await refund.get()).get("providerRefundId")).toBe("rfnd_pending");
    providerFetch.mockResolvedValueOnce(Response.json({ id: "rfnd_pending", payment_id: "pay_pending_refund", amount: 60000, status: "processed" }));
    await Promise.all([processRefund(refund.id), processRefund(refund.id)]);
    expect(providerFetch.mock.calls.at(-1)![1]).toContain("refunds/rfnd_pending");
    expect((await db.collection("bookings").doc(booking.bookingId).get()).get("refundedPaise")).toBe(60000);
  }, 30000);

  it("does not let a replaced refund lease owner apply stale provider results", async () => {
    const { input } = await fixture(true);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "order_lease" }));
    const booking = await bookings.createBooking("guest", input, "lease-refund");
    providerFetch.mockResolvedValueOnce(Response.json({ id: "pay_lease", order_id: "order_lease", amount: 120000, currency: "INR", status: "captured", captured: true }));
    await bookings.confirmPaidBooking(booking.bookingId, { actorId: "system", orderId: "order_lease", paymentId: "pay_lease", source: "reconciliation" });
    const refund = db.collection("refunds").doc(`${booking.bookingId}_lease`);
    await refund.set({ bookingId: booking.bookingId, paymentId: "pay_lease", amountPaise: 60000, status: "pending" });
    await db.collection("bookings").doc(booking.bookingId).update({ refundDuePaise: 60000 });
    providerFetch.mockImplementationOnce(async () => {
      await refund.update({ leaseOwner: "replacement", leaseExpiresAt: Timestamp.fromMillis(Date.now() + 90000) });
      return Response.json({ id: "rfnd_lease", payment_id: "pay_lease", amount: 60000, status: "processed" });
    });
    await (await import("@/lib/booking/processing")).processRefund(refund.id);
    expect((await db.collection("bookings").doc(booking.bookingId).get()).get("refundedPaise") ?? 0).toBe(0);
    expect((await refund.get()).get("leaseOwner")).toBe("replacement");
  }, 30000);

  it("replays booking notifications without replacing an already read recipient record", async () => {
    const { propertyId } = await fixture();
    const ref = db.collection("bookingNotificationOutbox").doc(`${propertyId}_notification`);
    await ref.set({ propertyId, bookingId: "test", guestId: "guest", bookingStatus: "confirmed", status: "pending", nextAttemptAt: Timestamp.now() });
    await db.collection("propertyMemberships").doc(`${propertyId}_owner`).set({ propertyId, userId: "owner", status: "active" });
    const notification = db.collection("notifications").doc(`${ref.id}_guest`);
    await notification.set({ userId: "guest", status: "read", readAt: Timestamp.now() });
    const { processBookingNotifications } = await import("@/lib/booking/notifications");
    await processBookingNotifications();
    expect((await ref.get()).get("status")).toBe("completed");
    expect((await notification.get()).get("status")).toBe("read");
    expect((await db.collection("notifications").doc(`${ref.id}_owner`).get()).exists).toBe(true);
    await notification.delete(); await db.collection("notifications").doc(`${ref.id}_owner`).delete();
  }, 30000);

  it("handles duplicate and reordered signed payment webhooks without releasing a paid room", async () => {
    const { input } = await fixture(true);
    providerFetch.mockResolvedValueOnce(Response.json({ id: "order_webhook" }));
    const booking = await bookings.createBooking("guest", input, "webhook");
    const paymentId = `pay_${crypto.randomUUID()}`;
    process.env.RAZORPAY_WEBHOOK_SECRET = "local_webhook_secret";
    const { createHmac } = await import("node:crypto");
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const request = (event: string) => {
      const body = JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: "order_webhook", notes: { bookingId: booking.bookingId } } } } });
      return new Request("http://localhost/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": createHmac("sha256", "local_webhook_secret").update(body).digest("hex") } });
    };
    try {
      expect((await POST(request("payment.failed"), undefined)).status).toBe(200);
      expect((await db.collection("bookings").doc(booking.bookingId).get()).get("inventoryReleased")).toBe(false);
      providerFetch.mockResolvedValue(Response.json({ id: paymentId, order_id: "order_webhook", amount: 120000, currency: "INR", status: "captured", captured: true }));
      const responses = await Promise.all([POST(request("payment.captured"), undefined), POST(request("payment.captured"), undefined)]);
      expect(responses.map(response => response.status)).toContain(200);
      expect(responses.every(response => [200, 409].includes(response.status))).toBe(true);
      expect((await POST(request("payment.captured"), undefined)).status).toBe(200);
      expect((await POST(request("payment.failed"), undefined)).status).toBe(200);
      const final = (await db.collection("bookings").doc(booking.bookingId).get()).data()!;
      expect(final.bookingStatus).toBe("confirmed"); expect(final.inventoryReleased).toBe(false); expect(final.paidPaise).toBe(120000);
      expect((await db.collection("paymentAttempts").where("bookingId", "==", booking.bookingId).get()).size).toBe(1);
    } finally { delete process.env.RAZORPAY_WEBHOOK_SECRET; }
  }, 30000);

});
