/** Read-only drift audit. Never repairs counters without understanding their source. */
import { db } from "../workers/media/firebase";
import type { Allocation } from "../lib/booking/domain";
const flag = process.argv.indexOf("--property");
const propertyId = flag >= 0 ? process.argv[flag + 1] : "";
if (!propertyId) throw new Error("Usage: --property PROPERTY_ID");
async function run() {
  const result = await db.runTransaction(async (tx) => {
    const [calendars, holds, blocks] = await Promise.all([tx.get(db.collection("inventoryCalendars").where("propertyId", "==", propertyId)), tx.get(db.collection("inventoryHolds").where("propertyId", "==", propertyId)), tx.get(db.collection("inventoryBlocks").where("propertyId", "==", propertyId))]);
    const expected = new Map<string, number>();
    const add = (roomTypeId: string, allocations: Allocation[], quantity: number, field: string) => {
      for (const allocation of allocations) for (const interval of allocation.intervals) { const key = `${propertyId}_${roomTypeId}_${allocation.date}/${field}/${interval}`; expected.set(key, (expected.get(key) ?? 0) + quantity); }
    };
    for (const hold of holds.docs) { const data = hold.data(); if (["held", "committed"].includes(data.status)) add(data.roomTypeId, data.allocations, data.quantity, "reserved"); }
    for (const block of blocks.docs) { const data = block.data(); if (data.status === "active") add(data.roomTypeId, data.allocations, data.quantity, "blocked"); }
    const drift: { key: string; expected: number; actual: number }[] = [];
    for (const doc of calendars.docs) for (const field of ["reserved", "blocked"]) for (const [interval, raw] of Object.entries(doc.data()[field] ?? {})) {
      const key = `${doc.id}/${field}/${interval}`, actual = Number(raw), quantity = expected.get(key) ?? 0;
      if (!Number.isSafeInteger(actual) || actual < 0 || actual !== quantity) drift.push({ key, expected: quantity, actual });
      expected.delete(key);
    }
    for (const [key, quantity] of expected) if (quantity !== 0) drift.push({ key, expected: quantity, actual: 0 });
    return { propertyId, calendars: calendars.size, holds: holds.size, blocks: blocks.size, drift };
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.drift.length) process.exitCode = 1;
}
void run().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.terminate());
