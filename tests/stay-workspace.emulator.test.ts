import { beforeAll, afterAll, describe, it, expect } from "vitest";
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "stay request queue (isolated emulator)",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let queue: typeof import("@/lib/stay/partner-queue").partnerRequestQueue;
    const id = `queue-${crypto.randomUUID()}`,
      uid = `owner-${id}`;
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
      db = (await import("@/lib/firebase/admin")).adminDb;
      queue = (await import("@/lib/stay/partner-queue")).partnerRequestQueue;
      await db
        .collection("users")
        .doc(uid)
        .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
      await db
        .collection("properties")
        .doc(id)
        .set({ timezone: "Asia/Kolkata" });
      await db
        .collection("propertyMemberships")
        .doc(`${id}_${uid}`)
        .set({ propertyId: id, status: "active", role: "staff" });
      const batch = db.batch();
      for (let i = 0; i < 203; i++)
        batch.set(
          db.collection("bookings").doc(`${id}-${String(i).padStart(3, "0")}`),
          {
            propertyId: id,
            bookingStatus: "confirmed",
            confirmationCode: `HK${i}`,
            checkIn: "2026-10-31",
            checkOut: "2026-11-02",
            stayRevision: 2,
            leadGuest: { name: "Test Guest" },
            customizations: [
              {
                id: "request",
                name: "Cake",
                status: i === 0 ? "fulfilled" : "requested",
                settlement: "pending_hotel",
              },
            ],
          },
        );
      batch.set(db.collection("bookings").doc(`${id}-foreign`), {
        propertyId: "foreign",
        bookingStatus: "confirmed",
        checkIn: "2026-10-31",
        checkOut: "2026-11-02",
        customizations: [{ id: "foreign", status: "requested" }],
      });
      await batch.commit();
    }, 30000);
    afterAll(async () => {
      if (!db) return;
      const rows = await db
        .collection("bookings")
        .where("propertyId", "==", id)
        .get();
      for (const d of rows.docs) await d.ref.delete();
      await db.collection("bookings").doc(`${id}-foreign`).delete();
      await db.collection("propertyMemberships").doc(`${id}_${uid}`).delete();
      await db.collection("properties").doc(id).delete();
      await db.collection("users").doc(uid).delete();
      await db.terminate();
    });
    it("paginates bounded scans without leaking foreign bookings or dropping rows", async () => {
      const f = { from: "2026-11-01", to: "2026-11-01", status: "open" };
      const first = await queue(uid, id, f);
      expect(first.scanned).toBe(200);
      expect(first.rows).toHaveLength(200);
      expect(first.nextCursor).toBeTruthy();
      const second = await queue(uid, id, { ...f, cursor: first.nextCursor });
      expect(second.rows).toHaveLength(2);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.rows, ...second.rows].map((r) => r.bookingId)).size,
      ).toBe(202);
      expect(first.rows[0]).toMatchObject({
        revision: 2,
        enabled: true,
        guestName: "Test Guest",
      });
      await expect(
        queue(uid, id, { ...f, status: "all", cursor: first.nextCursor }),
      ).rejects.toThrow("Filters changed");
    });
    it("includes terminal snapshots only in completed/all views", async () => {
      const r = await queue(uid, id, {
        from: "2026-10-31",
        to: "2026-11-02",
        status: "completed",
      });
      expect(r.rows).toHaveLength(0);
      expect(r.nextCursor).toBeTruthy();
      const next = await queue(uid, id, {
        from: "2026-10-31",
        to: "2026-11-02",
        status: "completed",
        cursor: r.nextCursor,
      });
      expect(next.rows[0].request.status).toBe("fulfilled");
    });
    it("keeps unfinished closed stays out of open work and exposes read-only history", async () => {
      await db
        .collection("bookings")
        .doc(`${id}-closed`)
        .set({
          propertyId: id,
          bookingStatus: "checked_out",
          checkIn: "2026-12-01",
          checkOut: "2026-12-02",
          customizations: [{ id: "closed", name: "Cake", status: "confirmed" }],
        });
      expect(
        (
          await queue(uid, id, {
            from: "2026-12-01",
            to: "2026-12-02",
            status: "open",
          })
        ).rows,
      ).toHaveLength(0);
      const all = await queue(uid, id, {
        from: "2026-12-01",
        to: "2026-12-02",
        status: "all",
      });
      expect(all.rows).toHaveLength(1);
      expect(all.rows[0].enabled).toBe(false);
    });
    it("rejects cross-property access, invalid ranges and tampered cursors", async () => {
      await expect(
        queue(uid, "foreign", { from: "2026-10-31", to: "2026-11-01" }),
      ).rejects.toThrow("Property access required");
      await expect(
        queue(uid, id, { from: "2026-10-31", to: "2027-01-01" }),
      ).rejects.toThrow();
      await expect(
        queue(uid, id, { from: "2026-10-31", to: "2026-11-01", cursor: "bad" }),
      ).rejects.toThrow("Refresh requests");
    });
  },
);
