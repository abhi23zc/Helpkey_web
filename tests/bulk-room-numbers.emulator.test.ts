import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BulkUnitPreview } from "@/lib/partner/reservations/bulk-unit-domain";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)("isolated bulk room-number transactions", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let bulk: typeof import("@/lib/partner/reservations/bulk-units").bulkUnits;
  let single: typeof import("@/lib/partner/reservations/operations").saveUnit;
  const prefix = `bulk-${crypto.randomUUID()}`,
    owner = `${prefix}-owner`,
    hotels: string[] = [];
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
    process.env.PARTNER_RESERVATIONS_ALLOCATION = "true";
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    db = (await import("@/lib/firebase/admin")).adminDb;
    bulk = (await import("@/lib/partner/reservations/bulk-units")).bulkUnits;
    single = (await import("@/lib/partner/reservations/operations")).saveUnit;
    await db
      .collection("users")
      .doc(owner)
      .set({ roles: ["partner"], isActive: true, fullName: "Bulk owner" });
  });
  afterAll(async () => {
    for (const propertyId of hotels) {
      for (const collection of [
        "physicalUnits",
        "physicalUnitLabels",
        "physicalUnitBulkOperations",
        "roomTypes",
        "propertyMemberships",
      ]) {
        const docs = await db
          .collection(collection)
          .where("propertyId", "==", propertyId)
          .get();
        await Promise.all(docs.docs.map((d) => db.recursiveDelete(d.ref)));
      }
      await db.recursiveDelete(db.collection("properties").doc(propertyId));
    }
    await db.collection("users").doc(owner).delete();
  });
  async function hotel(capacity = 3) {
    const propertyId = `${prefix}-${hotels.length}`,
      roomTypeId = `${propertyId}-room`;
    hotels.push(propertyId);
    await db
      .collection("properties")
      .doc(propertyId)
      .set({ ownerId: owner, status: "active", approvalStatus: "approved" });
    await db
      .collection("propertyMemberships")
      .doc(`${propertyId}_${owner}`)
      .set({ propertyId, userId: owner, role: "owner", status: "active" });
    await db
      .collection("roomTypes")
      .doc(roomTypeId)
      .set({ propertyId, status: "active", totalInventory: capacity });
    return { propertyId, roomTypeId };
  }
  async function preview(
    h: { propertyId: string; roomTypeId: string },
    text: string,
  ) {
    return (await bulk(owner, {
      action: "preview",
      ...h,
      source: { mode: "list", text },
    })) as BulkUnitPreview;
  }
  const create = (propertyId: string, previewId: string) =>
    bulk(owner, { action: "create", propertyId, previewId });
  it("creates exactly to capacity atomically, retries once, audits, and preserves inventory", async () => {
    const h = await hotel(50);
    const p = (await bulk(owner, {
      action: "preview",
      ...h,
      source: { mode: "range", start: "001", end: "050" },
    })) as BulkUnitPreview;
    expect(p.newLabels).toHaveLength(50);
    const [a, b] = await Promise.all([
      create(h.propertyId, p.previewId),
      create(h.propertyId, p.previewId),
    ]);
    expect(a).toEqual(b);
    expect(
      (
        await db
          .collection("physicalUnits")
          .where("propertyId", "==", h.propertyId)
          .get()
      ).size,
    ).toBe(50);
    expect(
      (await db.collection("roomTypes").doc(h.roomTypeId).get()).get(
        "totalInventory",
      ),
    ).toBe(50);
    expect(
      (
        await db
          .collection("properties")
          .doc(h.propertyId)
          .collection("pmsEvents")
          .get()
      ).size,
    ).toBe(1);
    const over = await preview(h, "999");
    expect(over.canSave).toBe(false);
    await expect(create(h.propertyId, over.previewId)).rejects.toMatchObject({
      code: "ROOM_REGISTER_EXCEEDS_CAPACITY",
    });
  });
  it("skips existing inactive numbers and repeated case variants without mutating them", async () => {
    const h = await hotel();
    const other = `${h.propertyId}-other`;
    await db
      .collection("roomTypes")
      .doc(other)
      .set({ propertyId: h.propertyId, status: "active", totalInventory: 1 });
    const old = await single(owner, {
      propertyId: h.propertyId,
      roomTypeId: other,
      label: "A101",
      status: "inactive",
    });
    const before = (
      await db.collection("physicalUnits").doc(old.id).get()
    ).data();
    const p = await preview(h, "a101, B1, b1, B2");
    expect(p.existing[0].status).toBe("inactive");
    expect(p.duplicates).toEqual(["b1"]);
    await create(h.propertyId, p.previewId);
    expect(
      (await db.collection("physicalUnits").doc(old.id).get()).data(),
    ).toEqual(before);
    await expect(single(owner, { ...h, label: "b1" })).rejects.toMatchObject({
      code: "DUPLICATE_ROOM_LABEL",
    });
  });
  it("rejects stale previews from concurrent submissions and capacity or single-entry changes", async () => {
    const h = await hotel(2);
    const a = await preview(h, "101"),
      b = await preview(h, "102");
    const results = await Promise.allSettled([
      create(h.propertyId, a.previewId),
      create(h.propertyId, b.previewId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ROOM_REGISTER_CHANGED" },
    });
    const c = await preview(h, "103");
    await db
      .collection("roomTypes")
      .doc(h.roomTypeId)
      .update({ totalInventory: 3 });
    await expect(create(h.propertyId, c.previewId)).rejects.toMatchObject({
      code: "ROOM_REGISTER_CHANGED",
    });
    const d = await preview(h, "104");
    await single(owner, { ...h, label: "105" });
    await expect(create(h.propertyId, d.previewId)).rejects.toMatchObject({
      code: "ROOM_REGISTER_CHANGED",
    });
  });
  it("checks hotel scope, permission revocation, expiry and forged preview IDs", async () => {
    const h = await hotel(),
      other = await hotel();
    const p = await preview(h, "1");
    await expect(
      bulk("outsider", {
        action: "create",
        propertyId: h.propertyId,
        previewId: p.previewId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(create(other.propertyId, p.previewId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      preview({ ...h, roomTypeId: other.roomTypeId }, "2"),
    ).rejects.toMatchObject({ code: "INVALID_ROOM_TYPE" });
    await expect(
      create(h.propertyId, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db
      .collection("propertyMemberships")
      .doc(`${h.propertyId}_${owner}`)
      .update({ role: "receptionist" });
    await expect(create(h.propertyId, p.previewId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await db
      .collection("propertyMemberships")
      .doc(`${h.propertyId}_${owner}`)
      .update({ role: "owner" });
    const { Timestamp } = await import("firebase-admin/firestore");
    await db
      .collection("physicalUnitBulkOperations")
      .doc(p.previewId)
      .update({ expiresAt: Timestamp.fromMillis(0) });
    await expect(create(h.propertyId, p.previewId)).rejects.toMatchObject({
      code: "ROOM_REGISTER_CHANGED",
    });
  });
});
