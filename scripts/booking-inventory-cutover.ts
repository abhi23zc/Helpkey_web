/** Dry-run by default. Applying requires the property to be closed to new bookings. */
import { readFileSync } from "node:fs";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../workers/media/firebase";
import { allocateIntervals, resolveLocal, type Allocation } from "../lib/booking/domain";

const args = process.argv.slice(2);
const value = (flag: string) => args[args.indexOf(flag) + 1];
const propertyId = args.includes("--property") ? value("--property") : "";
const apply = args.includes("--apply");
const mapping: Record<string, string> = args.includes("--mapping") ? JSON.parse(readFileSync(value("--mapping"), "utf8")) : {};
if (!propertyId) throw new Error("Usage: --property PROPERTY_ID [--mapping booking-room-mapping.json] [--apply]");

async function run() {
  const report = await db.runTransaction(async (tx) => {
    const propertyRef = db.collection("properties").doc(propertyId);
    const property = (await tx.get(propertyRef)).data();
    if (!property) throw new Error("PROPERTY_NOT_FOUND");
    if (property.inventoryEngine === "interval_v1") throw new Error("ALREADY_CONVERTED_USE_RECONCILIATION");
    if (apply && property.isBookable !== false) throw new Error("CLOSE_PROPERTY_TO_NEW_BOOKINGS_BEFORE_CUTOVER");
    const [rooms, bookings, existingCalendars, existingHolds] = await Promise.all([
      tx.get(db.collection("roomTypes").where("propertyId", "==", propertyId)),
      tx.get(db.collection("bookings").where("propertyId", "==", propertyId)),
      tx.get(db.collection("inventoryCalendars").where("propertyId", "==", propertyId)),
      tx.get(db.collection("inventoryHolds").where("propertyId", "==", propertyId)),
    ]);
    if (!existingCalendars.empty || !existingHolds.empty) throw new Error("EXISTING_INTERVAL_DATA_REQUIRES_RECONCILIATION");
    const roomById = new Map(rooms.docs.map((room) => [room.id, room.data()]));
    const timezone = property.timezone ?? "Asia/Kolkata";
    const calendars = new Map<string, { propertyId: string; roomTypeId: string; date: string; reserved: Record<string, number> }>();
    const converted: { ref: FirebaseFirestore.DocumentReference; roomTypeId: string; startAt: string; endAt: string; inventoryEndAt: string; allocations: Allocation[]; data: FirebaseFirestore.DocumentData }[] = [];
    const unresolved: string[] = [];
    for (const booking of bookings.docs) {
      const data = booking.data();
      if (!["pending_payment", "confirmed", "checked_in", "completed", "checked_out"].includes(data.bookingStatus) || data.inventoryReleased) continue;
      const roomTypeId = mapping[booking.id] ?? data.roomType?.id;
      const room = roomById.get(roomTypeId);
      if (!room || roomTypeId === "manual") { unresolved.push(booking.id); continue; }
      const startAt = data.startAt ?? new Date(resolveLocal(data.checkIn, property.checkInTime ?? "14:00", timezone)).toISOString();
      const endAt = data.endAt ?? new Date(resolveLocal(data.checkOut, property.checkOutTime ?? "11:00", timezone)).toISOString();
      const cleaning = room.cleaningBufferMinutes ?? property.cleaningBufferMinutes ?? 30;
      const inventoryEndAt = data.inventoryEndAt ?? new Date(Date.parse(endAt) + cleaning * 60000).toISOString();
      if (["completed", "checked_out"].includes(data.bookingStatus) && Date.parse(inventoryEndAt) <= Date.now()) continue;
      const allocations = allocateIntervals(startAt, inventoryEndAt, timezone);
      for (const allocation of allocations) {
        const id = `${propertyId}_${roomTypeId}_${allocation.date}`;
        const calendar = calendars.get(id) ?? { propertyId, roomTypeId, date: allocation.date, reserved: {} };
        for (const interval of allocation.intervals) calendar.reserved[interval] = (calendar.reserved[interval] ?? 0) + 1;
        calendars.set(id, calendar);
      }
      converted.push({ ref: booking.ref, roomTypeId, startAt, endAt, inventoryEndAt, allocations, data });
    }
    const overCapacity = [...calendars].filter(([, calendar]) => Object.values(calendar.reserved).some((n) => n > roomById.get(calendar.roomTypeId)!.totalInventory)).map(([id]) => id);
    const writes = calendars.size + converted.length * 2 + 1;
    const safe = unresolved.length === 0 && overCapacity.length === 0 && writes <= 450;
    if (apply && !safe) throw new Error(`CUTOVER_BLOCKED: ${JSON.stringify({ unresolved, overCapacity, writes })}`);
    if (apply) {
      for (const [id, calendar] of calendars) tx.create(db.collection("inventoryCalendars").doc(id), { ...calendar, blocked: {}, updatedAt: FieldValue.serverTimestamp() });
      for (const item of converted) {
        tx.create(db.collection("inventoryHolds").doc(item.ref.id), { bookingId: item.ref.id, propertyId, roomTypeId: item.roomTypeId, allocations: item.allocations, quantity: 1, status: item.data.bookingStatus === "pending_payment" ? "held" : "committed", expiresAt: item.data.expiresAt ?? null, createdAt: FieldValue.serverTimestamp() });
        tx.update(item.ref, { inventoryEngine: "interval_v1", bookingMode: item.data.bookingMode ?? "overnight", pricingModel: item.data.pricingModel ?? "nightly", timezone, startAt: item.startAt, endAt: item.endAt, inventoryEndAt: item.inventoryEndAt, durationMinutes: (Date.parse(item.endAt) - Date.parse(item.startAt)) / 60000, roomType: { ...item.data.roomType, id: item.roomTypeId, name: roomById.get(item.roomTypeId)!.name }, inventoryReleased: false, ...(item.data.bookingStatus === "pending_payment" && item.data.paymentMethod === "online" ? { paymentReconciliationPending: true, nextReconcileAt: Timestamp.now() } : {}), updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(propertyRef, { inventoryEngine: "interval_v1", inventoryCutoverAt: FieldValue.serverTimestamp() });
    }
    return { propertyId, dryRun: !apply, safe, activeBookings: converted.length, calendars: calendars.size, unresolved, overCapacity, writes };
  });
  console.log(JSON.stringify(report, null, 2));
}
void run().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.terminate());
