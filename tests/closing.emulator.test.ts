import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { localParts } from "@/lib/booking/domain";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)(
  "cashier shifts and immutable daily reports",
  { timeout: 30000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let shifts: typeof import("@/lib/partner/closing/shifts");
    let daily: typeof import("@/lib/partner/closing/daily");
    let ops: typeof import("@/lib/partner/reservations/operations");
    const hotel = `closing-${crypto.randomUUID()}`,
      owner = `${hotel}-owner`,
      cashier = `${hotel}-cashier`,
      other = `${hotel}-other`;
    let sequence = 0;
    const key = () => `key-${sequence++}`;
    const date = localParts(Date.now(), "Asia/Kolkata").date;
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
      delete process.env.PARTNER_CASHIER_SHIFTS;
      delete process.env.PARTNER_DAILY_CLOSING;
      process.env.PARTNER_RESERVATIONS_PAYMENTS = "true";
      process.env.BACKGROUND_MODE = "legacy";
      delete process.env.REDIS_URL;
      db = (await import("@/lib/firebase/admin")).adminDb;
      shifts = await import("@/lib/partner/closing/shifts");
      daily = await import("@/lib/partner/closing/daily");
      ops = await import("@/lib/partner/reservations/operations");
      for (const [uid, role] of [
        [owner, "owner"],
        [cashier, "cashier"],
        [other, "owner"],
      ]) {
        await db
          .collection("users")
          .doc(uid)
          .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
        await db
          .collection("propertyMemberships")
          .doc(`${uid === other ? hotel + "other" : hotel}_${uid}`)
          .set({
            propertyId: uid === other ? hotel + "other" : hotel,
            role,
            status: "active",
          });
      }
      await db.collection("properties").doc(hotel).set({
        ownerId: owner,
        timezone: "Asia/Kolkata",
        status: "active",
        approvalStatus: "approved",
        isBookable: true,
      });
    });
    afterAll(async () => {
      for (const c of [
        "bookings",
        "propertyPayments",
        "paymentAttempts",
        "refunds",
        "cashierShifts",
        "cashierActiveShifts",
        "cashierShiftRequests",
        "dailyClosings",
        "dailyClosingRequests",
        "propertyMemberships",
      ]) {
        const docs = await db
          .collection(c)
          .where("propertyId", "==", hotel)
          .get();
        for (const d of docs.docs) await db.recursiveDelete(d.ref);
      }
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}other_${other}`)
        .delete();
      await shifts.stateRef(hotel).delete();
      await db.collection("properties").doc(hotel).delete();
      for (const uid of [owner, cashier, other])
        await db.collection("users").doc(uid).delete();
      await db.terminate();
    });
    async function booking() {
      const id = `${hotel}-${sequence++}`;
      await db
        .collection("bookings")
        .doc(id)
        .set({
          propertyId: hotel,
          bookingStatus: "confirmed",
          totalPaise: 10000,
          paidPaise: 0,
          checkIn: date,
          checkOut: "2099-01-01",
          startAt: `${date}T12:00:00+05:30`,
          endAt: "2099-01-01T12:00:00+05:30",
          timezone: "Asia/Kolkata",
        });
      return id;
    }
    const collect = (amountPaise = 3000, method = "cash") => ({
      action: "collect",
      amountPaise,
      method,
      reference: method === "cash" ? "" : "terminal-1",
      reason: "Collected at desk",
    });
    async function close(
      uid: string,
      id: string,
      countedPaise?: number,
      reason = "",
    ) {
      const detail = await shifts.readShifts(uid, hotel, id);
      return shifts.commandShift(
        uid,
        hotel,
        {
          action: "close",
          shiftId: id,
          revision: detail.shift!.revision,
          countedPaise: countedPaise ?? detail.review!.expectedPaise,
          reason,
        },
        key(),
      );
    }
    it("requires a cash shift but leaves noncash independent; enforces hotel scope and one active shift", async () => {
      const b = await booking();
      await expect(
        ops.performOperation(owner, b, collect(), key()),
      ).rejects.toMatchObject({ code: "OPEN_SHIFT_REQUIRED" });
      await ops.performOperation(owner, b, collect(1000, "upi"), key());
      await expect(
        shifts.commandShift(
          other,
          hotel,
          { action: "open", openingPaise: 1000 },
          key(),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const results = await Promise.allSettled([
        shifts.commandShift(
          owner,
          hotel,
          { action: "open", openingPaise: 500 },
          key(),
        ),
        shifts.commandShift(
          owner,
          hotel,
          { action: "open", openingPaise: 500 },
          key(),
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const active = (await shifts.readShifts(owner, hotel)).activeId!;
      await close(owner, active);
    });
    it("keeps closed summaries immutable and historical reversals have zero cash effect; exact replay needs no new shift", async () => {
      const first = await shifts.commandShift(
        owner,
        hotel,
        { action: "open", openingPaise: 1000 },
        key(),
      );
      const b = await booking(),
        collectionKey = key(),
        receipt = await ops.performOperation(
          owner,
          b,
          collect(),
          collectionKey,
        );
      const stale = await shifts.readShifts(owner, hotel, first.id);
      const secondB = await booking();
      await ops.performOperation(owner, secondB, collect(1000), key());
      await expect(
        shifts.commandShift(
          owner,
          hotel,
          {
            action: "close",
            shiftId: first.id,
            revision: stale.shift!.revision,
            countedPaise: 4000,
            reason: "",
          },
          key(),
        ),
      ).rejects.toMatchObject({ code: "REVIEW_CHANGED" });
      await expect(close(owner, first.id, 4900)).rejects.toMatchObject({
        code: "REASON_REQUIRED",
      });
      await close(owner, first.id, 4900, "Counted shortage");
      const frozen = (await shifts.readShifts(owner, hotel, first.id)).review;
      expect(frozen!.differencePaise).toBe(-100);
      await expect(
        ops.performOperation(owner, b, collect(), collectionKey),
      ).resolves.toEqual(receipt);
      const second = await shifts.commandShift(
        owner,
        hotel,
        { action: "open", openingPaise: 500 },
        key(),
      );
      await ops.performOperation(
        owner,
        b,
        {
          action: "reverse",
          receiptId: receipt.id,
          reason: "Incorrect historical receipt",
        },
        key(),
      );
      const later = await shifts.readShifts(owner, hotel, second.id);
      expect(later.review!.expectedPaise).toBe(500);
      expect(later.review!.correctionsPaise).toBe(3000);
      expect((await shifts.readShifts(owner, hotel, first.id)).review).toEqual(
        frozen,
      );
      await close(owner, second.id);
    });
    it("same-open-shift reversals reduce cash once; physical refunds remain separate", async () => {
      const s = await shifts.commandShift(
          owner,
          hotel,
          { action: "open", openingPaise: 100 },
          key(),
        ),
        b = await booking();
      const r = await ops.performOperation(owner, b, collect(), key());
      const body = {
          action: "reverse",
          receiptId: r.id,
          reason: "Receipt entered incorrectly",
        },
        k = key();
      await ops.performOperation(owner, b, body, k);
      await ops.performOperation(owner, b, body, k);
      expect(
        (await shifts.readShifts(owner, hotel, s.id)).review!.expectedPaise,
      ).toBe(100);
      const r2 = await ops.performOperation(owner, b, collect(), key());
      await ops.performOperation(
        owner,
        b,
        {
          action: "refund",
          receiptId: r2.id,
          amountPaise: 500,
          reason: "Guest return",
          reference: "Cash handed back",
        },
        key(),
      );
      const review = (await shifts.readShifts(owner, hotel, s.id)).review!;
      expect(review.returnedPaise).toBe(500);
      expect(review.expectedPaise).toBe(2600);
      await close(owner, s.id);
    });
    it("allows only the opener to close and rejects projection corruption", async () => {
      const s = await shifts.commandShift(
        owner,
        hotel,
        { action: "open", openingPaise: 0 },
        key(),
      );
      await expect(
        shifts.commandShift(
          cashier,
          hotel,
          {
            action: "close",
            shiftId: s.id,
            revision: 0,
            countedPaise: 0,
            reason: "",
          },
          key(),
        ),
      ).rejects.toMatchObject({ code: "PMS_SETUP_REQUIRED" });
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${other}`)
        .set({ propertyId: hotel, role: "owner", status: "active" });
      await expect(
        shifts.commandShift(
          other,
          hotel,
          {
            action: "close",
            shiftId: s.id,
            revision: 0,
            countedPaise: 0,
            reason: "",
          },
          key(),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await db
        .collection("propertyMemberships")
        .doc(`${hotel}_${other}`)
        .delete();
      await db
        .collection("cashierShifts")
        .doc(s.id)
        .update({ collectedPaise: 1 });
      await expect(close(owner, s.id)).rejects.toMatchObject({
        code: "REVIEW_UNAVAILABLE",
      });
      await db
        .collection("cashierShifts")
        .doc(s.id)
        .update({ collectedPaise: 0 });
      await close(owner, s.id);
    });
    it("serializes payment/shift closure races", async () => {
      const s = await shifts.commandShift(
          owner,
          hotel,
          { action: "open", openingPaise: 0 },
          key(),
        ),
        b = await booking();
      const results = await Promise.allSettled([
        ops.performOperation(owner, b, collect(), key()),
        shifts.commandShift(
          owner,
          hotel,
          {
            action: "close",
            shiftId: s.id,
            revision: 0,
            countedPaise: 0,
            reason: "",
          },
          key(),
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      if (
        (await shifts.readShifts(owner, hotel, s.id)).shift!.status === "open"
      )
        await close(owner, s.id);
    });
    it("keeps a cross-midnight shift together while dating its receipts and difference separately", async () => {
      const yesterday = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000)
        .toISOString()
        .slice(0, 10);
      const s = await shifts.commandShift(
        owner,
        hotel,
        { action: "open", openingPaise: 500 },
        key(),
      );
      const { Timestamp } = await import("firebase-admin/firestore");
      await db
        .collection("cashierShifts")
        .doc(s.id)
        .update({
          openedDate: yesterday,
          openedAt: Timestamp.fromDate(new Date(`${yesterday}T23:55:00+05:30`)),
        });
      const b = await booking(),
        receipt = await ops.performOperation(owner, b, collect(1000), key());
      const before = await daily.readDaily(owner, hotel, date);
      expect(
        before.shiftSummaries.find((r: { id: string }) => r.id === s.id),
      ).toMatchObject({ openedDate: yesterday, closedDate: null });
      expect(
        before.activity.find((r: { id: string }) => r.id === receipt.id).date,
      ).toBe(date);
      await close(owner, s.id, 1490, "Midnight count shortage");
      const after = await daily.readDaily(owner, hotel, date);
      expect(
        after.shiftSummaries.find((r: { id: string }) => r.id === s.id),
      ).toMatchObject({
        openedDate: yesterday,
        closedDate: date,
        differencePaise: -10,
      });
    });
    it("covers late sources once without changing an earlier permanent report", async () => {
      const yesterday = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000)
        .toISOString()
        .slice(0, 10);
      await shifts.stateRef(hotel).update({ reportingStart: yesterday });
      const previous = await daily.readDaily(owner, hotel, yesterday);
      expect(previous.blockers).toEqual([]);
      const saved = await daily.commandDaily(
        owner,
        hotel,
        {
          date: yesterday,
          version: previous.version,
          note: "Earlier supported date",
          acknowledge: true,
        },
        key(),
      );
      const before = await daily.dailyHistory(owner, hotel, saved.id);
      const b = await booking(),
        ref = db.collection("bookings").doc(b);
      const { Timestamp } = await import("firebase-admin/firestore");
      const { todayTransaction } = await import("@/lib/partner/today/cache");
      await todayTransaction(async (tx, changed) => {
        await tx.get(ref);
        tx.update(ref, { paidPaise: 500, propertyLedgerPaise: 500 });
        tx.create(db.collection("propertyPayments").doc(`${b}-late`), {
          propertyId: hotel,
          bookingId: b,
          type: "collection",
          amountPaise: 500,
          method: "upi",
          createdAt: Timestamp.fromDate(
            new Date(`${yesterday}T12:00:00+05:30`),
          ),
        });
        changed(hotel);
      });
      const lateShift = await shifts.commandShift(
        owner,
        hotel,
        { action: "open", openingPaise: 0 },
        key(),
      );
      await close(owner, lateShift.id, 20, "Late drawer surplus counted");
      await db
        .collection("cashierShifts")
        .doc(lateShift.id)
        .update({
          openedDate: yesterday,
          closedDate: yesterday,
          openedAt: Timestamp.fromDate(new Date(`${yesterday}T23:30:00+05:30`)),
          closedAt: Timestamp.fromDate(new Date(`${yesterday}T23:45:00+05:30`)),
        });
      const current = await daily.readDaily(owner, hotel, date);
      expect(current.lateShiftSummaries).toHaveLength(2);
      expect(
        current.lateShiftSummaries.find(
          (r: { event: string }) => r.event === "closed",
        ).differencePaise,
      ).toBe(20);
      expect(
        current.late.filter((r: { id: string }) => r.id === `${b}-late`),
      ).toHaveLength(1);
      expect(current.late[0].date).toBe(yesterday);
      expect(await daily.dailyHistory(owner, hotel, saved.id)).toEqual(before);
    });
    it("blocks open shifts, stale reviews and missing acknowledgement; duplicate daily reports stay immutable", async () => {
      await expect(daily.readDaily(other, hotel, date)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      const s = await shifts.commandShift(
        owner,
        hotel,
        { action: "open", openingPaise: 0 },
        key(),
      );
      expect(
        (await daily.readDaily(owner, hotel, date)).blockers.some((s: string) =>
          s.includes("must be closed"),
        ),
      ).toBe(true);
      await close(owner, s.id);
      const model = await daily.readDaily(owner, hotel, date);
      expect(model.blockers).toEqual([]);
      const body = {
        date,
        version: model.version,
        note: "End of day",
        acknowledge: false,
      };
      await expect(
        daily.commandDaily(owner, hotel, body, key()),
      ).rejects.toMatchObject({ code: "ACKNOWLEDGEMENT_REQUIRED" });
      const b = await booking();
      await ops.performOperation(owner, b, collect(1000, "upi"), key());
      await expect(
        daily.commandDaily(owner, hotel, { ...body, acknowledge: true }, key()),
      ).rejects.toMatchObject({ code: "REVIEW_CHANGED" });
      const fresh = await daily.readDaily(owner, hotel, date),
        closingBody = { ...body, version: fresh.version, acknowledge: true },
        k = key();
      const reports = await Promise.allSettled([
        daily.commandDaily(owner, hotel, closingBody, k),
        daily.commandDaily(owner, hotel, closingBody, key()),
        ops.performOperation(owner, b, collect(1000, "upi"), key()),
      ]);
      expect(reports[2].status).toBe("fulfilled");
      const closingResults = reports.slice(0, 2);
      expect(
        closingResults.filter((r) => r.status === "fulfilled").length,
      ).toBeLessThanOrEqual(1);
      let replayBody = closingBody;
      let replayKey = k;
      if (!closingResults.some((r) => r.status === "fulfilled")) {
        for (const r of closingResults)
          if (r.status === "rejected")
            expect(r.reason).toMatchObject({ code: "REVIEW_CHANGED" });
        replayBody = {
          ...closingBody,
          version: (await daily.readDaily(owner, hotel, date)).version,
        };
        replayKey = key();
        await daily.commandDaily(owner, hotel, replayBody, replayKey);
      } else if (closingResults[0].status !== "fulfilled") {
        // The other close won; its immutable report is still unique.
        replayKey = "";
      }
      const reportId = shifts.digest([hotel, date]);
      const saved = await daily.dailyHistory(owner, hotel, reportId);
      expect(saved.report!.late).toHaveLength(1);
      expect(saved.report!.lateShiftSummaries).toHaveLength(2);
      expect(
        (await daily.readDaily(owner, hotel, date)).lateShiftSummaries,
      ).toHaveLength(0);
      expect((await daily.readDaily(owner, hotel, date)).late).toHaveLength(0);
      await ops.performOperation(owner, b, collect(1000, "upi"), key());
      expect(await daily.dailyHistory(owner, hotel, reportId)).toEqual(saved);
      const winning = !!replayKey;
      if (winning) {
        process.env.PARTNER_DAILY_CLOSING = "false";
        await expect(
          daily.commandDaily(owner, hotel, replayBody, replayKey),
        ).resolves.toEqual({ id: reportId });
      }
      await expect(shifts.readShifts(other, hotel)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  },
);
