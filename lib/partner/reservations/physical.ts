import "server-only";
import { physicalAllocationGroups } from "@/lib/booking/assignment-segments";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { allocateIntervals, type Allocation } from "@/lib/booking/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
export const unitCalendar = (unitId: string, date: string) =>
  adminDb.collection("physicalUnitCalendars").doc(`${unitId}_${date}`);
export async function readPhysicalRelease(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  b: RecordData,
) {
  const groups = physicalAllocationGroups(b);
  const rows = new Map<string, { unitId: string; date: string; intervals: Set<string> }>();
  for (const group of groups) for (const a of group.allocations) {
    const path = unitCalendar(group.unitId!, a.date).path;
    const row = rows.get(path) ?? { unitId: group.unitId!, date: a.date, intervals: new Set<string>() };
    a.intervals.forEach(k => row.intervals.add(k)); rows.set(path, row);
  }
  const entries = [...rows.values()];
  const docs = await Promise.all(entries.map(r => tx.get(unitCalendar(r.unitId, r.date))));
  return () => {
    docs.forEach((doc, i) => {
      const slots = { ...(doc.data()?.slots ?? {}) }, row = entries[i];
      for (const key of row.intervals) if (slots[key] === bookingId) delete slots[key];
      tx.set(doc.ref, { propertyId: b.propertyId, unitId: row.unitId, date: row.date, slots });
    });
  };
}
export async function assignPhysical(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  b: RecordData,
  unitId: string | null,
) {
  if (b.bookingStatus === "checked_in" || b.assignmentSegments) throw new Error("USE_STAY_CHANGE");
  const unit = unitId
    ? (await tx.get(adminDb.collection("physicalUnits").doc(unitId))).data()
    : null;
  if (
    unitId &&
    (!unit ||
      unit.propertyId !== b.propertyId ||
      unit.roomTypeId !== b.roomType?.id ||
      unit.status !== "active")
  )
    throw new Error("ROOM_NOT_AVAILABLE");
  const release = await readPhysicalRelease(tx, bookingId, b);
  const allocations = unitId
    ? allocateIntervals(
        b.startAt,
        b.inventoryEndAt || b.endAt,
        b.timezone || "Asia/Kolkata",
      )
    : [];
  const calendars = unitId
    ? await Promise.all(
        allocations.map((a) => tx.get(unitCalendar(unitId, a.date))),
      )
    : [];
  if (
    calendars.some((d, i) =>
      allocations[i].intervals.some(
        (key) => d.data()?.slots?.[key] && d.data()?.slots?.[key] !== bookingId,
      ),
    )
  )
    throw new Error("ROOM_ALREADY_ASSIGNED");
  return () => {
    if (unitId)
      tx.update(adminDb.collection("physicalUnits").doc(unitId), {
        assignmentRevision: FieldValue.increment(1),
      });
    release();
    calendars.forEach((d, i) => {
      const slots = { ...(d.data()?.slots ?? {}) };
      if (b.physicalUnitId === unitId)
        for (const a of b.physicalAllocations ?? [])
          if (a.date === allocations[i].date)
            for (const key of a.intervals)
              if (slots[key] === bookingId) delete slots[key];
      allocations[i].intervals.forEach((key) => {
        slots[key] = bookingId;
      });
      tx.set(d.ref, {
        propertyId: b.propertyId,
        unitId,
        date: allocations[i].date,
        slots,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return {
      physicalUnitId: unitId,
      physicalUnitLabel: unit?.label ?? null,
      physicalAllocations: allocations,
    };
  };
}
