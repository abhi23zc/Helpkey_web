import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { makePlan } from "../scripts/booking-cleanup/plan.mjs";
import { applyFirestore } from "../scripts/booking-cleanup/apply.mjs";
if (
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  )
)
  throw Error("Local emulator required");
const app = initializeApp({ projectId: "demo-helpkey-cleanup" }),
  db = getFirestore(app);
const encode = (v) => JSON.parse(JSON.stringify(v)),
  same = (a, b) => JSON.stringify(encode(a)) === JSON.stringify(encode(b));
test("atomic cleanup rejects stale snapshots and unexpected bookings; preserves configuration and recovers lost response", async () => {
  const id = "a".repeat(64),
    other = "b".repeat(64);
  const seed = [
    ["bookings/" + id, { propertyId: "hotel" }],
    ["bookings/" + id + "/events/e", { type: "created" }],
    [
      "inventoryCalendars/day",
      {
        propertyId: "hotel",
        reserved: { x: 1 },
        blocked: { x: 1 },
        stopSell: true,
      },
    ],
    ["properties/hotel", { name: "Preserved Hotel" }],
    ["hotelPrivateBanksV1/hotel", { encryptedAccount: "preserve" }],
  ];
  try {
    for (const [p, d] of seed) await db.doc(p).set(d);
    const snapshot = async () => {
      const docs = await db.getAll(...seed.map(([p]) => db.doc(p)));
      const rows = docs.map((d) => ({
        path: d.ref.path,
        data: d.data(),
        version: encode(d.updateTime),
      }));
      const plan = makePlan(rows, [id]);
      return {
        plan,
        documents: rows.filter(
          (d) =>
            plan.deletes.includes(d.path) ||
            plan.repairs.some((p) => p.path === d.path),
        ),
      };
    };
    const stale = await snapshot();
    await db.doc("bookings/" + id).update({ revision: 1 });
    await assert.rejects(
      () => applyFirestore(db, stale, [id], encode, same),
      /changed after backup/,
    );
    assert.equal((await db.doc("bookings/" + id).get()).exists, true);
    assert.equal(
      (await db.doc("inventoryCalendars/day").get()).get("reserved.x"),
      1,
    );
    const before = await snapshot();
    await db.doc("bookings/" + other).set({ propertyId: "hotel" });
    await assert.rejects(
      () => applyFirestore(db, before, [id], encode, same),
      /Unexpected new booking/,
    );
    await db.doc("bookings/" + other).delete();
    await applyFirestore(db, before, [id], encode, same);
    await applyFirestore(db, before, [id], encode, same); // Lost response: reuse exact original backup.
    assert.equal((await db.doc("bookings/" + id).get()).exists, false);
    assert.equal(
      (await db.doc("bookings/" + id + "/events/e").get()).exists,
      false,
    );
    const calendar = (await db.doc("inventoryCalendars/day").get()).data();
    assert.deepEqual(calendar.reserved, {});
    assert.deepEqual(calendar.blocked, { x: 1 });
    assert.equal(calendar.stopSell, true);
    assert.equal(
      (await db.doc("properties/hotel").get()).get("name"),
      "Preserved Hotel",
    );
    assert.equal(
      (await db.doc("hotelPrivateBanksV1/hotel").get()).get("encryptedAccount"),
      "preserve",
    );
  } finally {
    for (const [p] of seed) await db.recursiveDelete(db.doc(p));
    await db.doc("bookings/" + other).delete();
    await db.terminate();
    await deleteApp(app);
  }
});
