import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { allocateIntervals, type Allocation } from "./domain";

export const calendarRef = (propertyId: string, roomTypeId: string, date: string) => adminDb.collection("inventoryCalendars").doc(`${propertyId}_${roomTypeId}_${date}`);
export type Calendar = { reserved?: Record<string, number>; blocked?: Record<string, number>; stopSell?: boolean };
export function hasCapacity(allocations: Allocation[], calendars: Calendar[], capacity: number) {
  return Number.isSafeInteger(capacity) && capacity > 0 && allocations.every((allocation, i) => !calendars[i]?.stopSell && allocation.intervals.every((key) => { const reserved = calendars[i]?.reserved?.[key] ?? 0, blocked = calendars[i]?.blocked?.[key] ?? 0; return Number.isSafeInteger(reserved) && reserved >= 0 && Number.isSafeInteger(blocked) && blocked >= 0 && reserved + blocked < capacity; }));
}
export async function readAvailability(propertyId: string, roomTypeId: string, stay: { startAt: string; inventoryEndAt: string; timezone: string }, capacity: number) {
  const allocations = allocateIntervals(stay.startAt, stay.inventoryEndAt, stay.timezone);
  const docs = await adminDb.getAll(...allocations.map((a) => calendarRef(propertyId, roomTypeId, a.date)));
  return hasCapacity(allocations, docs.map((doc) => doc.data() ?? {}), capacity);
}
/** Caller must finish all reads before calling writeAllocation. Exact allocation is persisted on the hold. */
export function writeAllocation(tx: FirebaseFirestore.Transaction, propertyId: string, roomTypeId: string, allocations: Allocation[], delta: 1 | -1) {
  for (const allocation of allocations) {
    tx.set(calendarRef(propertyId, roomTypeId, allocation.date), { propertyId, roomTypeId, date: allocation.date, reserved: Object.fromEntries(allocation.intervals.map((key) => [key, FieldValue.increment(delta)])), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}
