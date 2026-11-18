import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { todayQueues } from "@/lib/partner/today/domain";
vi.mock("@/lib/redis", () => {
  const values = new Map<string, string>();
  const redis = {
    mget: async (...keys: string[]) => keys.map((k) => values.get(k) ?? null),
    get: async (key: string) => values.get(key) ?? null,
    set: async (
      key: string,
      value: string,
      _unit: string,
      _ttl: number,
      nx?: string,
    ) => {
      if (nx && values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    eval: async (
      _script: string,
      _count: number,
      key: string,
      token: string,
    ) => {
      if (values.get(key) === token) values.delete(key);
      return 1;
    },
    multi: (commands: string[][]) => ({
      exec: async () => {
        for (const [, key] of commands)
          values.set(key, String(Number(values.get(key) || 0) + 1));
      },
    }),
  };
  return {
    cacheKey: (...parts: unknown[]) => parts.join(":"),
    withRedis: async (fn: (value: typeof redis) => unknown) => fn(redis),
  };
});
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)("Today bounded server evaluation", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let load: typeof import("@/lib/partner/today/service").loadToday;
  const hotel = `today-${crypto.randomUUID()}`,
    owner = `${hotel}-owner`,
    receptionist = `${hotel}-desk`,
    cashier = `${hotel}-cash`;
  const day = "2026-11-15";
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
    process.env.PUBLIC_RESPONSE_CACHE_DISABLED = "0";
    db = (await import("@/lib/firebase/admin")).adminDb;
    load = (await import("@/lib/partner/today/service")).loadToday;
    await db.collection("properties").doc(hotel).set({
      ownerId: owner,
      status: "active",
      approvalStatus: "approved",
      timezone: "Asia/Kolkata",
    });
    for (const [uid, role] of [
      [owner, "owner"],
      [receptionist, "receptionist"],
      [cashier, "cashier"],
    ]) {
      await db
        .collection("users")
        .doc(uid)
        .set({ roles: ["partner"], isActive: true });
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${uid}`)
        .set({ propertyId: hotel, userId: uid, status: "active", role });
    }
    for (let i = 0; i < 23; i++)
      await db
        .collection("bookings")
        .doc(`${hotel}-${i}`)
        .set({
          propertyId: hotel,
          bookingStatus: "confirmed",
          checkIn: day,
          checkOut: "2026-11-16",
          startAt: "2026-11-15T00:00:00Z",
          endAt: "2026-11-16T00:00:00Z",
          leadGuest: { name: `Guest ${i}`, phone: "private", email: "private" },
          invitationSecret: "private",
          totalPaise: 1000,
          paidPaise: 100,
          roomType: { id: "r" },
          customizations: i === 0 ? [{ status: "requested" }] : [],
        });
  });
  afterAll(async () => {
    if (!db) return;
    for (const name of [
      "bookings",
      "propertyMemberships",
      "propertyPayments",
      "physicalUnits",
    ]) {
      const docs = await db
        .collection(name)
        .where("propertyId", "==", hotel)
        .get();
      await Promise.all(docs.docs.map((d) => db.recursiveDelete(d.ref)));
    }
    await db.collection("properties").doc(hotel).delete();
    await Promise.all(
      [owner, receptionist, cashier].map((uid) =>
        db.collection("users").doc(uid).delete(),
      ),
    );
  });
  it("matches every count to its queue, paginates without duplicates and projects safe rows", async () => {
    const summary = await load(owner, { propertyId: hotel, date: day });
    for (const queue of Object.keys(todayQueues)) {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await load(
          owner,
          { propertyId: hotel, date: day, queue, cursor },
          true,
        );
        if (!("rows" in page)) throw new Error("Missing rows");
        ids.push(...page.rows.map((r) => r.id));
        cursor = page.nextCursor || undefined;
        expect(JSON.stringify(page.rows)).not.toContain("private");
      } while (cursor);
      expect(new Set(ids).size).toBe(summary.counts[queue]);
      expect(ids.length).toBe(new Set(ids).size);
    }
    const first = await load(owner, { propertyId: hotel, date: day }, true);
    expect("rows" in first && first.rows).toHaveLength(20);
  });
  it("binds cursors to account, hotel and queue and rechecks revoked membership", async () => {
    const first = await load(owner, { propertyId: hotel, date: day }, true);
    if (!("nextCursor" in first)) throw new Error("Missing cursor");
    await expect(
      load(
        owner,
        {
          propertyId: hotel,
          date: day,
          queue: "balances",
          cursor: first.nextCursor,
        },
        true,
      ),
    ).rejects.toMatchObject({ code: "CURSOR_EXPIRED" });
    // Owners in a second account cannot reuse the originating account's cursor.
    await db
      .collection("propertyMemberships")
      .doc(`${hotel}_${receptionist}`)
      .update({ role: "owner" });
    await expect(
      load(
        receptionist,
        { propertyId: hotel, date: day, cursor: first.nextCursor },
        true,
      ),
    ).rejects.toMatchObject({ code: "CURSOR_EXPIRED" });
    await db
      .collection("propertyMemberships")
      .doc(`${hotel}_${receptionist}`)
      .update({ status: "revoked" });
    await expect(
      load(receptionist, { propertyId: hotel, date: day }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      load(cashier, { propertyId: hotel, date: day }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("removes a settled balance immediately from a warm server cache", async () => {
    const first = await load(owner, { propertyId: hotel, date: day });
    expect(first.counts.balances).toBe(23);
    const { performOperation } =
      await import("@/lib/partner/reservations/operations");
    await db.collection("propertyPayments").doc(`${hotel}-initial`).set({ propertyId: hotel, bookingId: `${hotel}-0`, type: "collection", amountPaise: 100, method: "cash" });
    await performOperation(
      owner,
      `${hotel}-0`,
      { action: "collect", amountPaise: 900, method: "cash" },
      crypto.randomUUID(),
    );
    expect(
      (await db.collection("bookings").doc(`${hotel}-0`).get()).get(
        "paidPaise",
      ),
    ).toBe(1000);
    const second = await load(owner, { propertyId: hotel, date: day });
    expect(second.counts.balances).toBe(22);
    const queue = await load(
      owner,
      { propertyId: hotel, date: day, queue: "balances", limit: 50 },
      true,
    );
    expect(
      "rows" in queue && queue.rows.some((r) => r.id === `${hotel}-0`),
    ).toBe(false);
  });
  it("refreshes a warm room-attention queue after housekeeping", async () => {
    const unitId = `${hotel}-unit`;
    await db
      .collection("physicalUnits")
      .doc(unitId)
      .set({
        propertyId: hotel,
        roomTypeId: "r",
        label: "101",
        status: "active",
        housekeepingStatus: "dirty",
        revision: 0,
      });
    await db
      .collection("bookings")
      .doc(`${hotel}-1`)
      .update({ physicalUnitId: unitId, physicalUnitLabel: "101" });
    const { invalidateToday } = await import("@/lib/partner/today/cache");
    await invalidateToday(hotel);
    expect(
      (await load(owner, { propertyId: hotel, date: day })).counts
        .room_attention,
    ).toBe(1);
    const { housekeeping } = await import("@/lib/partner/rooms/service");
    await housekeeping(owner, hotel, { unitId, status: "clean", revision: 0 });
    expect(
      (await load(owner, { propertyId: hotel, date: day })).counts
        .room_attention,
    ).toBe(0);
  });
  it("refreshes warm in-house counts immediately after check-in and checkout", async () => {
    const currentDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const bookingId = `${hotel}-2`;
    await db
      .collection("bookings")
      .doc(bookingId)
      .update({
        checkIn: currentDate,
        checkOut: currentDate,
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
      });
    const { invalidateToday } = await import("@/lib/partner/today/cache");
    await invalidateToday(hotel);
    expect(
      (await load(owner, { propertyId: hotel, date: currentDate })).counts
        .in_house,
    ).toBe(0);
    const { transitionBooking } = await import("@/lib/bookings");
    await transitionBooking(bookingId, owner, "checked_in");
    expect(
      (await load(owner, { propertyId: hotel, date: currentDate })).counts
        .in_house,
    ).toBe(1);
    await transitionBooking(bookingId, owner, "checked_out");
    expect(
      (await load(owner, { propertyId: hotel, date: currentDate })).counts
        .in_house,
    ).toBe(0);
  });
  it("invalidates warm Today balance queues immediately after posting and voiding hotel charges", async () => {
    const before = await load(owner, { propertyId: hotel, date: day });
    const { commandFolio } = await import("@/lib/partner/billing/service");
    const posted = await commandFolio(owner, `${hotel}-0`, { action: "post", expectedRevision: 0, category: "laundry", description: "Laundry final charge", amountPaise: 500, details: { explanation: "Two garments cleaned" } }, "today-charge");
    const after = await load(owner, { propertyId: hotel, date: day });
    expect(after.counts.balances).toBe(before.counts.balances + 1);
    const queue = await load(owner, { propertyId: hotel, date: day, queue: "balances" }, true);
    expect("rows" in queue && queue.rows.some(r => r.id === `${hotel}-0` && r.balanceDuePaise === 500)).toBe(true);
    await commandFolio(owner, `${hotel}-0`, { action: "void", expectedRevision: 1, originalEntryId: posted.id, reason: "Neutralize charge" }, "today-void");
    expect((await load(owner, { propertyId: hotel, date: day })).counts.balances).toBe(before.counts.balances);
  });

});
