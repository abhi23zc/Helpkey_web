import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { accountingFixture } from "./helpers/accounting";
import { hash } from "@/lib/accounting/domain";
import { processAccounting, journalCollection, stateCollection, summary } from "@/lib/accounting/posting";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "");
describe.skipIf(!safe)("isolated hotel accounting transactions", { timeout: 30000 }, () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let service: typeof import("@/lib/accounting/service");
  const prefix = `accounting-${crypto.randomUUID()}`, hotel = `${prefix}-hotel`, owner = `${prefix}-owner`, admin = `${prefix}-admin`, staff = `${prefix}-staff`, stranger = `${prefix}-stranger`;
  const ids: string[] = [];
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-accounting";
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY; delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    process.env.HOTEL_ACCOUNTING_START_AT = "2026-11-24T00:00:00Z"; process.env.BACKGROUND_MODE = "legacy";
    db = (await import("@/lib/firebase/admin")).adminDb; service = await import("@/lib/accounting/service");
    for (const uid of [owner, admin, staff, stranger]) await db.collection("users").doc(uid).set({ roles: [uid === admin ? "admin" : "partner"], accountStatus: "active", isActive: true });
    await db.collection("properties").doc(hotel).set({ ownerId: owner, name: "Accounting hotel", status: "active", approvalStatus: "approved", isBookable: true });
    for (const [uid, role] of [[owner, "owner"], [staff, "manager"]]) await db.collection("propertyMemberships").doc(`${hotel}_${uid}`).set({ propertyId: hotel, userId: uid, role, status: "active" });
  });
  afterAll(async () => {
    delete process.env.HOTEL_ACCOUNTING_START_AT;
    for (const bookingId of ids) {
      for (const name of [journalCollection, "paymentAttempts", "propertyPayments", "refunds"]) {
        const rows = await db.collection(name).where("bookingId", "==", bookingId).get(); await Promise.all(rows.docs.map(d => db.recursiveDelete(d.ref)));
      }
      const outbox = await db.collection("projectionOutbox").where("entityId", "==", bookingId).get(); await Promise.all(outbox.docs.map(d => db.recursiveDelete(d.ref)));
      for (const name of ["bookings", "bookingFinanceAgreementsV1", stateCollection]) await db.recursiveDelete(db.collection(name).doc(bookingId));
    }
    const requests = await db.collection("hotelAccountingRequestsV1").where("actorId", "==", admin).get(); await Promise.all(requests.docs.map(d => d.ref.delete()));
    for (const uid of [owner, admin, staff, stranger]) await db.collection("users").doc(uid).delete();
    for (const uid of [owner, staff]) await db.collection("propertyMemberships").doc(`${hotel}_${uid}`).delete();
    await db.collection("properties").doc(hotel).delete();
  });
  async function fixture(online = 210000, cash = 0, complete = true, historical = false, agreement = true) {
    const bookingId = `${prefix}-${ids.length}`; ids.push(bookingId);
    const f = accountingFixture(online, cash, complete, 1000, bookingId, hotel);
    f.agreement.ownerId = owner;
    f.b.createdAt = Timestamp.fromDate(new Date(historical ? "2026-11-01T00:00:00Z" : f.b.createdAt));
    const batch = db.batch(); batch.create(db.collection("bookings").doc(bookingId), f.b);
    if (agreement) batch.create(db.collection("bookingFinanceAgreementsV1").doc(bookingId), f.agreement);
    if (f.proof) batch.create(db.collection("bookingFinanceAgreementsV1").doc(bookingId).collection("proofs").doc("checkout"), f.proof);
    for (const r of f.sources.online) batch.create(db.collection("paymentAttempts").doc(r.id), r);
    for (const r of f.sources.property) batch.create(db.collection("propertyPayments").doc(r.id), r);
    await batch.commit(); return { ...f, bookingId };
  }
  const state = async (id: string) => (await db.collection(stateCollection).doc(id).get()).data()!;
  const entries = async (id: string) => (await db.collection(journalCollection).where("bookingId", "==", id).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  it.each([[210000, 0, 190000, 0], [0, 210000, 0, 20000], [40000, 170000, 20000, 0], [40000, 0, 0, 0]])("posts the worked examples %s/%s", async (online, cash, payable, dues) => {
    const f = await fixture(online, cash); await processAccounting(db, f.bookingId);
    expect((await state(f.bookingId)).summary).toMatchObject({ payablePaise: payable, duesPaise: dues, earnedCommissionPaise: 20000 });
    expect((await state(f.bookingId)).guestOutstandingPaise).toBe(210000 - online - cash);
  });
  it("does not earn before checkout and converges with a later validated checkout", async () => {
    const f = await fixture(210000, 0, false); await processAccounting(db, f.bookingId);
    expect((await state(f.bookingId)).summary).toMatchObject({ payablePaise: 0, earnedCommissionPaise: 0, pendingOnlinePaise: 210000 });
    const checked = accountingFixture(210000, 0, true, 1000, f.bookingId, hotel);
    const batch = db.batch(); batch.update(db.collection("bookings").doc(f.bookingId), { bookingStatus: "checked_out" }); batch.create(db.collection("bookingFinanceAgreementsV1").doc(f.bookingId).collection("proofs").doc("checkout"), checked.proof!); await batch.commit();
    await processAccounting(db, f.bookingId); expect((await state(f.bookingId)).summary.payablePaise).toBe(190000);
    expect((await entries(f.bookingId)).some(e => "type" in e && e.type === "recognition_reversal")).toBe(false); // The previous assessment had zero monetary lines.
  });
  it("commits once under duplicate and concurrent processing and after a lost response", async () => {
    const f = await fixture(40000, 170000);
    await Promise.all([processAccounting(db, f.bookingId), processAccounting(db, f.bookingId), processAccounting(db, f.bookingId)]);
    const first = await entries(f.bookingId);
    await processAccounting(db, f.bookingId); await processAccounting(db, f.bookingId);
    expect(await entries(f.bookingId)).toEqual(first); expect((await state(f.bookingId)).summary.payablePaise).toBe(20000);
  });
  it("rolls back every journal line on failed posting and safely retries", async () => {
    const f = await fixture(); await expect(processAccounting(db, f.bookingId, () => { throw Error("INJECTED_POST_FAILURE"); })).rejects.toThrow("INJECTED");
    expect(await entries(f.bookingId)).toHaveLength(0); expect((await state(f.bookingId)).dirty).toBe(true);
    await processAccounting(db, f.bookingId); expect((await state(f.bookingId)).summary.payablePaise).toBe(190000);
  });
  it("converges when payment evidence arrives after checkout", async () => {
    const delayed = await fixture(0, 0), control = await fixture(210000, 0);
    await processAccounting(db, delayed.bookingId); expect((await state(delayed.bookingId)).summary.unallocatedCommissionPaise).toBe(20000);
    const r = accountingFixture(210000, 0, true, 1000, delayed.bookingId, hotel).sources.online[0];
    const batch = db.batch(); batch.create(db.collection("paymentAttempts").doc(r.id), r); batch.update(db.collection("bookings").doc(delayed.bookingId), { paidPaise: 210000 }); await batch.commit();
    await Promise.all([processAccounting(db, delayed.bookingId), processAccounting(db, control.bookingId)]);
    expect((await state(delayed.bookingId)).summary).toEqual((await state(control.bookingId)).summary);
  });
  it("keeps historical agreements out until explicit, idempotent reconciliation", async () => {
    const old = await fixture(210000, 0, true, true), missing = await fixture(210000, 0, true, true, false);
    const initial = await service.readAccount(admin, hotel);
    expect(initial.positions.find(p => p.bookingId === missing.bookingId)).toMatchObject({ historicalAgreementAvailable: false, reasons: ["Historical agreement unavailable; excluded from balances."] });
    expect(initial.positions.find(p => p.bookingId === old.bookingId)?.historicalAgreementAvailable).toBe(true);
    await processAccounting(db, old.bookingId); await processAccounting(db, missing.bookingId);
    expect(await entries(old.bookingId)).toHaveLength(0); expect(await entries(missing.bookingId)).toHaveLength(0);
    const command = { action: "reconcile_booking", bookingId: old.bookingId, requestId: crypto.randomUUID() };
    await service.accountingCommand(admin, hotel, command); await service.accountingCommand(admin, hotel, command); await processAccounting(db, old.bookingId);
    expect((await state(old.bookingId)).summary.payablePaise).toBe(190000);
    await expect(service.accountingCommand(admin, hotel, { ...command, bookingId: missing.bookingId, requestId: crypto.randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect((await db.collection("bookingFinanceAgreementsV1").doc(missing.bookingId).get()).exists).toBe(false);
  });
  it("reviews missing new agreements while preserving online collection evidence", async () => {
    const f = await fixture(210000, 0, true, false, false); await processAccounting(db, f.bookingId);
    expect((await state(f.bookingId)).summary).toMatchObject({ payablePaise: 0, earnedCommissionPaise: 0, reviewOnlinePaise: 210000 });
  });
  it("reverses recognition for refunds and retains original entries and review evidence", async () => {
    const f = await fixture(); await processAccounting(db, f.bookingId); const originals = await entries(f.bookingId);
    const batch = db.batch(); batch.create(db.collection("refunds").doc(`${f.bookingId}-refund`), { bookingId: f.bookingId, propertyId: hotel, paymentId: `${f.bookingId}-pay`, amountPaise: 10000, status: "processed", createdAt: Timestamp.now(), processedAt: Timestamp.now() }); batch.update(db.collection("bookings").doc(f.bookingId), { refundedPaise: 10000 }); await batch.commit();
    // Old recognized balances disappear from the current view immediately on source commit.
    const pending = await service.readAccount(admin, hotel); expect(pending.positions.find(p => p.bookingId === f.bookingId)?.summary).toBeNull();
    await processAccounting(db, f.bookingId);
    expect((await state(f.bookingId)).summary).toMatchObject({ payablePaise: 0, earnedCommissionPaise: 0, reviewOnlinePaise: 200000 });
    const all = await entries(f.bookingId); for (const e of originals) expect(all).toContainEqual(e);
  });
  it("reverses hotel collection evidence without pretending the unpaid balance was collected", async () => {
    const f = await fixture(40000, 170000); await processAccounting(db, f.bookingId);
    const batch = db.batch(); batch.create(db.collection("propertyPayments").doc(`${f.bookingId}-reverse`), { bookingId: f.bookingId, propertyId: hotel, type: "reversal", receiptId: `${f.bookingId}-cash`, amountPaise: 170000, createdAt: Timestamp.now() }); batch.update(db.collection("bookings").doc(f.bookingId), { paidPaise: 40000 }); await batch.commit();
    await processAccounting(db, f.bookingId); expect((await state(f.bookingId)).summary).toMatchObject({ payablePaise: 0, duesPaise: 0, pendingOnlinePaise: 40000, pendingHotelPaise: 0, unallocatedCommissionPaise: 20000 });
  });
  it("quarantines altered source amounts using original journal amounts", async () => {
    const f = await fixture(); await processAccounting(db, f.bookingId);
    const batch = db.batch(); batch.update(db.collection("paymentAttempts").doc(`${f.bookingId}-pay`), { amountPaise: 200000, bookingId: f.bookingId }); batch.update(db.collection("bookings").doc(f.bookingId), { paidPaise: 200000 }); await batch.commit();
    await processAccounting(db, f.bookingId); expect((await state(f.bookingId)).summary).toMatchObject({ payablePaise: 0, reviewOnlinePaise: 210000 });
    expect((await state(f.bookingId)).reasons.join()).toMatch(/Source changed/);
  });
  it("detects summary differences, rebuilds from journal and exposes reconciliation findings", async () => {
    const f = await fixture(); await processAccounting(db, f.bookingId);
    const original = (await state(f.bookingId)).summary;
    await db.collection(stateCollection).doc(f.bookingId).update({ "summary.payablePaise": 42 });
    const check = await service.reconcileAccount(admin, hotel); expect(check.findings.some(finding => finding.bookingId === f.bookingId && /Cached summary/.test(finding.message))).toBe(true);
    await service.accountingCommand(admin, hotel, { action: "rebuild_summary", bookingId: f.bookingId, requestId: crypto.randomUUID() });
    expect((await state(f.bookingId)).summary).toEqual(original);
    const rows = await db.collection(journalCollection).where("bookingId", "==", f.bookingId).get(); expect(summary(rows.docs.map(d => d.data() as { lines: import("@/lib/accounting/domain").Line[] }))).toEqual(original);
  });
  it("flags missing, duplicate, unbalanced and incorrectly owned journal evidence", async () => {
    const f = await fixture(); await processAccounting(db, f.bookingId);
    const rows = await db.collection(journalCollection).where("bookingId", "==", f.bookingId).get(), capture = rows.docs.find(d => d.get("type") === "capture")!, saved = capture.data();
    const messages = async () => (await service.reconcileAccount(admin, hotel)).findings.filter(r => r.bookingId === f.bookingId).map(r => r.message).join(" ");
    await capture.ref.delete(); expect(await messages()).toMatch(/Missing entry/); await capture.ref.set(saved);
    const duplicate = db.collection(journalCollection).doc(`${capture.id}-duplicate`); await duplicate.set(saved); expect(await messages()).toMatch(/Duplicate source/); await duplicate.delete();
    await capture.ref.update({ lines: [{ account: "online_clearing", debitPaise: 1, creditPaise: 0 }, { account: "pending_online", debitPaise: 0, creditPaise: 2 }] }); expect(await messages()).toMatch(/Unbalanced/); await capture.ref.set(saved);
    await capture.ref.update({ propertyId: "other-hotel" }); expect(await messages()).toMatch(/ownership mismatch/); await capture.ref.set(saved);
  });
  it("keeps a hotel's payables and dues separate across bookings", async () => {
    const view = await service.readAccount(admin, hotel);
    expect(view.summary.payablePaise).toBeGreaterThan(0); expect(view.summary.duesPaise).toBeGreaterThan(0);
    const current = view.positions.flatMap(p => p.summary ? [p.summary] : []);
    expect(view.summary.payablePaise).toBe(current.reduce((n, p) => n + p.payablePaise, 0));
    expect(view.summary.duesPaise).toBe(current.reduce((n, p) => n + p.duesPaise, 0));
  });
  it("enforces active admin, owner-only reads, hotel isolation and command restrictions", async () => {
    expect((await service.readAccount(owner, hotel, true)).hotel.id).toBe(hotel);
    for (const uid of [staff, stranger]) await expect(service.readAccount(uid, hotel, true)).rejects.toMatchObject({ status: 403 });
    await expect(service.accountingCommand(owner, hotel, { action: "retry", bookingId: ids[0], requestId: crypto.randomUUID() })).rejects.toMatchObject({ status: 403 });
    const { authorizePartnerRequest } = await import("@/lib/partner/pms/route-access");
    await expect(authorizePartnerRequest(staff, new Request(`http://localhost/api/partner/properties/${hotel}/accounting`))).rejects.toMatchObject({ status: 403 });
    await db.collection("users").doc(admin).update({ isActive: false }); await expect(service.readAccount(admin, hotel)).rejects.toMatchObject({ status: 403 }); await db.collection("users").doc(admin).update({ isActive: true });
    const { serializeBooking } = await import("@/lib/bookings"); const b = (await db.collection("bookings").doc(ids[0]).get()).data()!;
    expect(JSON.stringify(serializeBooking(ids[0], b))).not.toMatch(/"(?:commission\w*|hotel_payable|hotel_dues|accounting|recognitionId)":/);
  });
  it("records durable outbox failure and replays the committed journal without another effect", async () => {
    const f = await fixture();
    const outboxes = await db.collection("projectionOutbox").where("entityId", "==", f.bookingId).get(), outbox = outboxes.docs[0];
    expect(outbox.get("kind")).toBe("booking_accounting");
    const { executeOutbox } = await import("../workers/shared/outbox");
    const fake = { id: hash(f.bookingId), data: { eventId: outbox.id, entityId: f.bookingId, kind: "booking_accounting" } } as import("bullmq").Job;
    await expect(executeOutbox(db, fake, "projectionOutbox", "projectionJobs", async () => { await processAccounting(db, f.bookingId); throw Error("LOST_RESPONSE"); })).rejects.toThrow("LOST_RESPONSE");
    const posted = await entries(f.bookingId); expect((await outbox.ref.get()).get("status")).toBe("retryable");
    await executeOutbox(db, fake, "projectionOutbox", "projectionJobs", () => processAccounting(db, f.bookingId));
    expect(await entries(f.bookingId)).toEqual(posted); expect((await outbox.ref.get()).get("status")).toBe("completed");
    await db.collection("projectionJobs").doc(fake.id!).delete();
  });
  it.skipIf(!/^redis:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.REDIS_URL ?? ""))("runs accounting through the real projection queue worker", async () => {
    const f = await fixture(40000, 170000);
    const { Queue, Worker } = await import("bullmq"), { default: Redis } = await import("ioredis");
    const { processProjection, closeProjectionProcessor } = await import("../workers/projections/processor");
    const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }), name = `${prefix}-queue`;
    const queue = new Queue(name, { connection: redis });
    const worker = new Worker(name, processProjection, { connection: redis, concurrency: 2 });
    try {
      const outboxes = await db.collection("projectionOutbox").where("entityId", "==", f.bookingId).get(), outbox = outboxes.docs[0];
      const complete = new Promise<void>((resolve, reject) => { worker.once("completed", () => resolve()); worker.once("failed", (_job, error) => reject(error)); });
      await queue.add("booking_accounting", { ...outbox.data(), outboxId: outbox.id }); await complete;
      expect((await state(f.bookingId)).summary.payablePaise).toBe(20000); expect((await outbox.ref.get()).get("status")).toBe("completed");
      const mirrors = await db.collection("projectionJobs").where("entityId", "==", f.bookingId).get(); await Promise.all(mirrors.docs.map(d => d.ref.delete()));
    } finally { await worker.close(); await queue.obliterate({ force: true }); await queue.close(); await redis.quit(); await closeProjectionProcessor(); }
  });
});
