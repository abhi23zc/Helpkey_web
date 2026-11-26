import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Policy, SaveInput } from "@/lib/finance-settings/domain";

const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "");
describe.skipIf(!safe)("finance settings isolated Firestore transactions", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let service: typeof import("@/lib/finance-settings/service");
  const prefix = `finance-settings-${crypto.randomUUID()}`;
  const admin = `${prefix}-admin`, secondAdmin = `${prefix}-admin2`, owner = `${prefix}-owner`, staff = `${prefix}-staff`, stranger = `${prefix}-stranger`;
  const hotel = `${prefix}-hotel`, other = `${prefix}-other`;
  let globalBackup: FirebaseFirestore.DocumentData | undefined;
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance";
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY; delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL; delete process.env.REDIS_URL;
    db = (await import("@/lib/firebase/admin")).adminDb;
    service = await import("@/lib/finance-settings/service");
    globalBackup = (await db.collection("hotelFinanceSettingsV1").doc("global").get()).data();
    for (const uid of [admin, secondAdmin, owner, staff, stranger]) await db.collection("users").doc(uid).set({ fullName: uid, roles: [uid === admin || uid === secondAdmin ? "admin" : "partner"], isActive: true, accountStatus: "active" });
    for (const id of [hotel, other]) await db.collection("properties").doc(id).set({ name: id, ownerId: id === hotel ? owner : stranger });
    for (const [id, uid, role] of [[hotel, owner, "owner"], [hotel, staff, "manager"], [other, stranger, "owner"]]) await db.collection("propertyMemberships").doc(`${id}_${uid}`).set({ propertyId: id, userId: uid, role, status: "active" });
  });
  afterAll(async () => {
    for (const id of ["global", `hotel_${hotel}`, `hotel_${other}`]) await db.recursiveDelete(db.collection("hotelFinanceSettingsV1").doc(id));
    if (globalBackup) await db.collection("hotelFinanceSettingsV1").doc("global").set(globalBackup);
    for (const uid of [admin, secondAdmin, owner, staff, stranger]) await db.collection("users").doc(uid).delete();
    for (const id of [hotel, other]) await db.collection("properties").doc(id).delete();
    for (const [id, uid] of [[hotel, owner], [hotel, staff], [other, stranger]]) await db.collection("propertyMemberships").doc(`${id}_${uid}`).delete();
  });
  async function input(id: string | null, changes: Policy, remove: SaveInput["remove"] = []): Promise<SaveInput> {
    const current = await service.readFinance(admin, id);
    return { changes, remove, expectedRevision: current.revision, expectedGlobalRevision: current.globalRevision, requestId: crypto.randomUUID(), reason: "Test commercial agreement" };
  }
  it("creates defaults and retains missing settings without writes on reads", async () => {
    const before = await service.readFinance(admin, hotel);
    expect(before.effective).toEqual({});
    expect((await db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`).get()).exists).toBe(false);
    await service.saveFinance(admin, null, await input(null, { commissionBasisPoints: 1000, payoutDelayDays: 2 }));
    expect(await service.readFinance(owner, hotel, true)).toMatchObject({ effective: { commissionBasisPoints: 1000, payoutDelayDays: 2 }, provenance: { commissionBasisPoints: "inherited", payoutCycle: "unconfigured" } });
  });
  it("stores one override, preserves it across global changes, and restores inheritance", async () => {
    await service.saveFinance(admin, hotel, await input(hotel, { commissionBasisPoints: 1200 }));
    expect((await service.readFinance(admin, hotel)).stored).toEqual({ commissionBasisPoints: 1200 });
    await service.saveFinance(admin, null, await input(null, { commissionBasisPoints: 1100 }));
    expect((await service.readFinance(owner, hotel, true)).effective).toEqual({ commissionBasisPoints: 1200, payoutDelayDays: 2 });
    expect((await service.readFinance(admin, other)).effective.commissionBasisPoints).toBe(1100);
    await service.saveFinance(admin, hotel, await input(hotel, {}, ["commissionBasisPoints"]));
    expect((await service.readFinance(owner, hotel, true)).effective.commissionBasisPoints).toBe(1100);
  });
  it("rejects invalid raw and combined policies server-side without revision changes", async () => {
    const request = await input(hotel, {});
    await expect(service.saveFinance(admin, hotel, { ...request, changes: { commissionBasisPoints: 10001 } })).rejects.toThrow();
    await expect(service.saveFinance(admin, hotel, { ...request, changes: { payoutCycle: "weekly" } })).rejects.toMatchObject({ status: 422 });
    await expect(service.saveFinance(admin, hotel, { ...request, reason: " " })).rejects.toThrow();
    expect((await service.readFinance(admin, hotel)).revision).toBe(request.expectedRevision);
  });
  it("rejects global changes that would invalidate dependent hotel overrides", async () => {
    await service.saveFinance(admin, null, await input(null, { duesLimit: { type: "limited", amountPaise: 10000 } }));
    await service.saveFinance(admin, hotel, await input(hotel, { duesWarningPaise: 9000 }));
    await expect(service.saveFinance(admin, null, await input(null, { duesLimit: { type: "limited", amountPaise: 8000 } }))).rejects.toMatchObject({ status: 422 });
    await service.saveFinance(admin, hotel, await input(hotel, {}, ["duesWarningPaise"]));
  });
  it("denies owner edits, staff reads, other hotels, and revoked administrator access", async () => {
    await expect(service.saveFinance(owner, hotel, await input(hotel, {}))).rejects.toMatchObject({ status: 403 });
    await expect(service.readFinance(staff, hotel, true)).rejects.toMatchObject({ status: 403 });
    await expect(service.readFinance(owner, other, true)).rejects.toMatchObject({ status: 403 });
    await expect(service.readFinance(stranger, hotel, true)).rejects.toMatchObject({ status: 403 });
    await db.collection("users").doc(secondAdmin).update({ accountStatus: "suspended" });
    await expect(service.saveFinance(secondAdmin, hotel, await input(hotel, {}))).rejects.toMatchObject({ status: 403 });
    await db.collection("users").doc(secondAdmin).update({ accountStatus: "active" });
  });
  it("serializes concurrent administrators; one succeeds and one receives a conflict", async () => {
    const request = await input(hotel, { payoutDelayDays: 4 });
    const outcomes = await Promise.allSettled([service.saveFinance(admin, hotel, request), service.saveFinance(secondAdmin, hotel, { ...request, changes: { payoutDelayDays: 5 }, requestId: crypto.randomUUID() })]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    const failure = outcomes.find(o => o.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409, code: "FINANCE_REVISION_CONFLICT" });
  });
  it("also detects changed inherited defaults while a hotel edit is open", async () => {
    const request = await input(hotel, { minimumPayoutPaise: 100 });
    await service.saveFinance(admin, null, await input(null, { payoutDelayDays: 6 }));
    await expect(service.saveFinance(admin, hotel, request)).rejects.toMatchObject({ status: 409 });
  });
  it("deduplicates parallel retries and records accurate immutable history atomically", async () => {
    const before = await service.readFinance(admin, hotel);
    const request = await input(hotel, { commissionBasisPoints: 0 });
    const results = await Promise.all([service.saveFinance(admin, hotel, request), service.saveFinance(admin, hotel, request)]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].revision).toBe(before.revision + 1);
    await expect(service.saveFinance(admin, hotel, { ...request, reason: "Changed payload" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const events = await service.financeHistory(admin, hotel);
    expect(events.events[0]).toMatchObject({ actorId: admin, scope: "hotel", propertyId: hotel, reason: request.reason, before: before.stored, after: { ...before.stored, commissionBasisPoints: 0 } });
    expect(events.events[0].createdAt).toMatch(/^\d{4}-/);
    expect(events.events).toHaveLength(results[0].revision);
    const noChange = await service.saveFinance(admin, hotel, await input(hotel, { commissionBasisPoints: 0 }));
    expect(noChange).toEqual({ revision: results[0].revision, changed: false });
    await expect(service.financeHistory(owner, hotel)).rejects.toMatchObject({ status: 403 });
  });
  it("does not modify bookings, rate plans, invoices or payment records", async () => {
    const names = ["bookings", "ratePlans", "propertyPayments", "invoices"];
    const refs = names.map(name => db.collection(name).doc(prefix));
    try {
      for (const ref of refs) await ref.set({ propertyId: hotel, totalPaise: 98765, marker: prefix });
      await service.saveFinance(admin, hotel, await input(hotel, { guestPaymentOptions: ["at_hotel"], minimumPayoutPaise: 1000 }));
      for (const ref of refs) expect((await ref.get()).data()).toEqual({ propertyId: hotel, totalPaise: 98765, marker: prefix });
    } finally { for (const ref of refs) await ref.delete(); }
  });
  it("rolls back settings and the receipt if the audit write cannot commit", async () => {
    const before = await service.readFinance(admin, hotel);
    const request = await input(hotel, { duesGraceDays: 7 });
    const ref = db.collection("hotelFinanceSettingsV1").doc(`hotel_${hotel}`);
    const blockedAudit = ref.collection("history").doc(String(before.revision + 1));
    await blockedAudit.create({ testCollision: true });
    try {
      await expect(service.saveFinance(admin, hotel, request)).rejects.toThrow();
      expect(await service.readFinance(admin, hotel)).toEqual(before);
      expect((await ref.collection("requests").doc(`${admin}_${request.requestId}`).get()).exists).toBe(false);
    } finally { await blockedAudit.delete(); }
  });
});
