import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { allocateIntervals, validDate } from "@/lib/booking/domain";

/** Explicit setup verification, never invoked by polling or routine commands.
 * Pages share the caller's transaction snapshot. No history-size readiness limit.
 */
export async function verifyPmsInventory(
  propertyId: string,
  tx: FirebaseFirestore.Transaction,
) {
  async function read(name: string, activeBookings = false) {
    let query: FirebaseFirestore.Query = adminDb
      .collection(name)
      .where("propertyId", "==", propertyId);
    if (name === "inventoryHolds")
      query = query.where("status", "in", ["held", "committed"]);
    if (name === "inventoryBlocks")
      query = query.where("status", "==", "active");
    if (activeBookings)
      query = query.where("bookingStatus", "in", [
        "pending_payment",
        "confirmed",
        "checked_in",
      ]);
    query = query.orderBy(FieldPath.documentId()).limit(250);
    const rows: FirebaseFirestore.DocumentData[] = [];
    while (true) {
      const page = await tx.get(query);
      rows.push(...page.docs.map((d) => ({ ...d.data(), id: d.id })));
      if (page.size < 250) return rows;
      query = query.startAfter(page.docs[page.size - 1]);
    }
  }
  const property = await tx.get(
    adminDb.collection("properties").doc(propertyId),
  );
  const p = property.data() || {};
  if (p.inventoryEngine !== "interval_v1") return false;
  const [rooms, units, holds, calendars, blocks, activeBookings] =
    await Promise.all([
      read("roomTypes"),
      read("physicalUnits"),
      read("inventoryHolds"),
      read("inventoryCalendars"),
      read("inventoryBlocks"),
      read("bookings", true),
    ]);
  // Committed historical holds still contribute saved calendar counters. Read only
  // their corresponding bookings, rather than the complete booking history.
  const bookings = [...activeBookings];
  const known = new Set(bookings.map((b) => b.id));
  const missing = holds.filter(
    (h) => ["held", "committed"].includes(h.status) && !known.has(h.id),
  );
  for (let offset = 0; offset < missing.length; offset += 250) {
    const docs = await tx.getAll(
      ...missing
        .slice(offset, offset + 250)
        .map((h) => adminDb.collection("bookings").doc(h.id)),
    );
    bookings.push(
      ...docs.filter((d) => d.exists).map((d) => ({ ...d.data(), id: d.id })),
    );
  }
  const bookingsById = new Map(bookings.map((b) => [b.id, b]));
  const holdsById = new Map(holds.map((h) => [h.id, h]));
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const expected = new Map<string, number>();
  let integrity = p.inventoryEngine === "interval_v1";
  const add = (row: FirebaseFirestore.DocumentData, field: string) => {
    if (
      !Array.isArray(row.allocations) ||
      !row.allocations.length ||
      !Number.isSafeInteger(row.quantity) ||
      row.quantity < 1
    ) {
      integrity = false;
      return;
    }
    for (const a of row.allocations) {
      if (
        !a ||
        !validDate(a.date) ||
        !Array.isArray(a.intervals) ||
        !a.intervals.length ||
        new Set(a.intervals).size !== a.intervals.length
      ) {
        integrity = false;
        continue;
      }
      for (const slot of a.intervals) {
        const key = `${propertyId}_${row.roomTypeId}_${a.date}/${field}/${slot}`;
        expected.set(key, (expected.get(key) || 0) + row.quantity);
      }
    }
  };
  holds
    .filter((h) => ["held", "committed"].includes(h.status))
    .forEach((h) => add(h, "reserved"));
  blocks.filter((b) => b.status === "active").forEach((b) => add(b, "blocked"));
  for (const calendar of calendars)
    for (const field of ["reserved", "blocked"])
      for (const [slot, value] of Object.entries(calendar[field] || {})) {
        const key = `${calendar.id}/${field}/${slot}`;
        if (
          !Number.isSafeInteger(value) ||
          Number(value) < 0 ||
          value !== (expected.get(key) || 0)
        )
          integrity = false;
        expected.delete(key);
      }
  if ([...expected.values()].some((n) => n !== 0)) integrity = false;
  for (const calendar of calendars) {
    const room = roomsById.get(calendar.roomTypeId);
    const keys = new Set([
      ...Object.keys(calendar.reserved || {}),
      ...Object.keys(calendar.blocked || {}),
    ]);
    if (keys.size && !room) integrity = false;
    for (const key of keys)
      if (
        (calendar.reserved?.[key] || 0) + (calendar.blocked?.[key] || 0) >
        (room?.totalInventory || 0)
      )
        integrity = false;
  }
  for (const hold of holds.filter((h) =>
    ["held", "committed"].includes(h.status),
  )) {
    const b = bookingsById.get(hold.id);
    if (
      !b ||
      b.propertyId !== propertyId ||
      b.inventoryReleased ||
      ["cancelled", "no_show", "expired", "payment_failed"].includes(
        b.bookingStatus,
      )
    )
      integrity = false;
  }
  for (const b of bookings.filter(
    (b) =>
      ["pending_payment", "confirmed", "checked_in"].includes(
        b.bookingStatus,
      ) && !b.inventoryReleased,
  )) {
    const hold = holdsById.get(b.id);
    if (
      b.inventoryEngine !== "interval_v1" ||
      !hold ||
      !["held", "committed"].includes(hold.status) ||
      hold.roomTypeId !== b.roomType?.id
    )
      integrity = false;
    if (hold) {
      try {
        const canonical = (
          allocations: { date: string; intervals: string[] }[],
        ) =>
          JSON.stringify(
            allocations
              .map((a) => [a.date, [...a.intervals].sort()])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          );
        if (
          canonical(hold.allocations) !==
            canonical(
              allocateIntervals(
                b.startAt,
                b.inventoryEndAt || b.endAt,
                b.timezone || p.timezone,
              ),
            ) ||
          hold.quantity !== (b.quantity || 1)
        )
          integrity = false;
      } catch {
        integrity = false;
      }
    }
    const unit = unitsById.get(b.physicalUnitId);
    if (
      b.physicalUnitId &&
      (!unit || unit.status !== "active" || unit.roomTypeId !== b.roomType?.id)
    )
      integrity = false;
  }
  return integrity;
}
