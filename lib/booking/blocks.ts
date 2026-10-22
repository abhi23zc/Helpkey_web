import "server-only";
import { invalidatePublic } from "@/lib/api/cache";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { allocateIntervals, validDate, type Allocation } from "./domain";
import { calendarRef } from "./inventory";

export const capacityBlockInput = z.object({ roomTypeId: z.string().min(1), startAt: z.iso.datetime(), endAt: z.iso.datetime(), quantity: z.number().int().min(1).max(500), reason: z.string().trim().min(3).max(500) }).strict();
export async function createCapacityBlock(actorId: string, propertyId: string, raw: unknown) {
  const input = capacityBlockInput.parse(raw);
  const ref = adminDb.collection("inventoryBlocks").doc();
  await adminDb.runTransaction(async (tx) => {
    const [member, property, room] = await Promise.all([
      tx.get(adminDb.collection("propertyMemberships").doc(`${propertyId}_${actorId}`)),
      tx.get(adminDb.collection("properties").doc(propertyId)),
      tx.get(adminDb.collection("roomTypes").doc(input.roomTypeId)),
    ]);
    if (member.data()?.status !== "active" || room.data()?.propertyId !== propertyId) throw new Error("FORBIDDEN");
    if (property.data()?.inventoryEngine !== "interval_v1") throw new Error("INVENTORY_CUTOVER_REQUIRED");
    const allocations = allocateIntervals(input.startAt, input.endAt, property.data()!.timezone ?? "Asia/Kolkata");
    const calendars = await Promise.all(allocations.map((a) => tx.get(calendarRef(propertyId, room.id, a.date))));
    for (let i = 0; i < allocations.length; i++) {
      const data = calendars[i].data() ?? {};
      if (allocations[i].intervals.some((key) => (data.reserved?.[key] ?? 0) + (data.blocked?.[key] ?? 0) + input.quantity > room.data()!.totalInventory)) throw new Error("CAPACITY_BELOW_COMMITMENTS");
    }
    for (const allocation of allocations) tx.set(calendarRef(propertyId, room.id, allocation.date), { propertyId, roomTypeId: room.id, date: allocation.date, blocked: Object.fromEntries(allocation.intervals.map((key) => [key, FieldValue.increment(input.quantity)])), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(ref, { ...input, propertyId, allocations, status: "active", createdBy: actorId, createdAt: FieldValue.serverTimestamp() });
  });
  await invalidatePublic("search:*");
  return { blockId: ref.id };
}
export async function releaseCapacityBlock(actorId: string, propertyId: string, blockId: string) {
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("inventoryBlocks").doc(blockId);
    const [block, member] = await Promise.all([tx.get(ref), tx.get(adminDb.collection("propertyMemberships").doc(`${propertyId}_${actorId}`))]);
    const data = block.data();
    if (member.data()?.status !== "active" || data?.propertyId !== propertyId) throw new Error("FORBIDDEN");
    if (data.status === "released") return;
    const allocations = data.allocations as Allocation[];
    const calendars = await Promise.all(allocations.map((allocation) => tx.get(calendarRef(propertyId, data.roomTypeId, allocation.date))));
    if (allocations.some((allocation, index) => allocation.intervals.some((key) => (calendars[index].data()?.blocked?.[key] ?? 0) < data.quantity))) throw new Error("INVENTORY_DRIFT");
    for (const allocation of data.allocations as Allocation[]) tx.set(calendarRef(propertyId, data.roomTypeId, allocation.date), { blocked: Object.fromEntries(allocation.intervals.map((key) => [key, FieldValue.increment(-data.quantity)])), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(ref, { status: "released", releasedBy: actorId, releasedAt: FieldValue.serverTimestamp() });
  });
  await invalidatePublic("search:*");
}

export async function setStopSell(actorId: string, propertyId: string, roomTypeId: string, date: string, enabled: boolean) {
  if (!validDate(date)) throw new Error("INVALID_DATE");
  await adminDb.runTransaction(async (tx) => {
    const [member, property, room] = await Promise.all([tx.get(adminDb.collection("propertyMemberships").doc(`${propertyId}_${actorId}`)), tx.get(adminDb.collection("properties").doc(propertyId)), tx.get(adminDb.collection("roomTypes").doc(roomTypeId))]);
    if (member.data()?.status !== "active" || room.data()?.propertyId !== propertyId) throw new Error("FORBIDDEN");
    if (property.data()?.inventoryEngine !== "interval_v1") throw new Error("INVENTORY_CUTOVER_REQUIRED");
    tx.set(calendarRef(propertyId, roomTypeId, date), { propertyId, roomTypeId, date, stopSell: enabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId }, { merge: true });
  });
  await invalidatePublic("search:*");
}
