import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { authorize } from "@/lib/partner/reservations/access";
import { safeData } from "@/lib/partner/reservations/operations";
import { unitCalendar } from "@/lib/partner/reservations/physical";
import {
  allocateIntervals,
  resolveLocal,
  validDate,
} from "@/lib/booking/domain";
import { calendarRef } from "@/lib/booking/inventory";
import { datePriceRef } from "@/lib/booking/date-prices";
import { validDurationPrices } from "@/lib/booking/duration-pricing";
import { invalidatePublic } from "@/lib/api/cache";
const id = z
  .string()
  .min(1)
  .max(180)
  .refine((s) => !s.includes("/"));
const date = z.string().refine(validDate);
export const roomsFeatures = () => ({
  calendar:
    process.env.PARTNER_ROOMS_CALENDAR === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.PARTNER_ROOMS_CALENDAR !== "false"),
  housekeeping:
    process.env.PARTNER_ROOMS_HOUSEKEEPING === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.PARTNER_ROOMS_HOUSEKEEPING !== "false"),
});
function enabled(feature: "calendar" | "housekeeping") {
  if (!roomsFeatures()[feature]) throw new Error("FEATURE_NOT_ENABLED");
}
export function days(start: string, end: string) {
  if (!validDate(start) || !validDate(end)) throw new Error("INVALID_DATE");
  const n = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (n < 1 || n > 31) throw new Error("SELECT_UP_TO_THIRTY_ONE_DAYS");
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
}
export async function workspace(
  uid: string,
  propertyId: string,
  start: string,
  end: string,
) {
  await authorize(uid, propertyId);
  const dates = days(start, end);
  const [p, rooms, rates, units, bookings, blocks] = await Promise.all([
    adminDb.collection("properties").doc(propertyId).get(),
    adminDb.collection("roomTypes").where("propertyId", "==", propertyId).get(),
    adminDb.collection("ratePlans").where("propertyId", "==", propertyId).get(),
    adminDb
      .collection("physicalUnits")
      .where("propertyId", "==", propertyId)
      .get(),
    adminDb
      .collection("bookings")
      .where("propertyId", "==", propertyId)
      .where("bookingStatus", "==", "checked_in")
      .get(),
    adminDb
      .collection("inventoryBlocks")
      .where("propertyId", "==", propertyId)
      .where("status", "==", "active")
      .get(),
  ]);
  const property = p.data()!;
  const roomDocs = rooms.docs.filter((d) => d.get("status") !== "archived");
  if (roomDocs.length > 100 || rates.size > 100)
    throw new Error("TOO_MANY_ROOM_OR_RATE_TYPES");
  const refs = roomDocs.flatMap((room) =>
    dates.map((d) =>
      adminDb
        .collection(
          property.inventoryEngine === "interval_v1"
            ? "inventoryCalendars"
            : "roomNightInventory",
        )
        .doc(`${propertyId}_${room.id}_${d}`),
    ),
  );
  const snapshots: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 300)
    snapshots.push(...(await adminDb.getAll(...refs.slice(i, i + 300))));
  const prices: FirebaseFirestore.DocumentSnapshot[] = [];
  const priceRefs = rates.docs
    .filter((d) => d.get("status") !== "archived")
    .flatMap((r) => dates.map((d) => datePriceRef(propertyId, r.id, d)));
  for (let i = 0; i < priceRefs.length; i += 300)
    prices.push(...(await adminDb.getAll(...priceRefs.slice(i, i + 300))));
  return {
    features: roomsFeatures(),
    timezone: property.timezone || "Asia/Kolkata",
    interval: property.inventoryEngine === "interval_v1",
    dates,
    calendars: snapshots.map((d) => ({
      id: d.id,
      ...safeData(d.data() || {}),
    })),
    prices: prices.filter((d) => d.exists).map((d) => safeData(d.data()!)),
    units: units.docs.map((d) => ({
      id: d.id,
      ...safeData(d.data()),
      occupied: bookings.docs.some((b) => b.get("physicalUnitId") === d.id),
      revision: d.get("revision") || 0,
    })),
    blocks: blocks.docs.map((d) => ({ id: d.id, ...safeData(d.data()) })),
  };
}
const cell = z
  .object({
    roomTypeId: id,
    ratePlanId: id.optional(),
    date,
    stopSell: z.boolean().optional(),
    clearPrice: z.boolean().optional(),
    basePricePaise: z.number().int().min(1).max(1000000000).optional(),
    durationPrices: z
      .array(
        z.object({
          hours: z.number().int().min(1).max(24),
          pricePaise: z.number().int().min(1).max(1000000000),
        }),
      )
      .max(24)
      .optional(),
  })
  .strict();
const bulkInput = z.object({ cells: z.array(cell).min(1).max(100) }).strict();
const fingerprint = (docs: FirebaseFirestore.DocumentSnapshot[]) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        docs.map((d) => [
          d.ref.path,
          d.updateTime
            ? [d.updateTime.seconds, d.updateTime.nanoseconds]
            : null,
        ]),
      ),
    )
    .digest("hex");
async function readBulk(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  enabled("calendar");
  await authorize(uid, propertyId, tx);
  const { cells } = bulkInput.parse(raw);
  const prop = await tx.get(adminDb.collection("properties").doc(propertyId));
  const refs = cells.flatMap((c) => [
    adminDb.collection("roomTypes").doc(c.roomTypeId),
    ...(c.ratePlanId
      ? [
          adminDb.collection("ratePlans").doc(c.ratePlanId),
          datePriceRef(propertyId, c.ratePlanId, c.date),
        ]
      : [calendarRef(propertyId, c.roomTypeId, c.date)]),
  ]);
  const docs = await tx.getAll(
    ...[...new Map(refs.map((r) => [r.path, r])).values()],
  );
  const map = new Map(docs.map((d) => [d.ref.path, d]));
  const seen = new Set<string>();
  for (const c of cells) {
    if (Date.parse(c.date) > Date.now() + 366 * 86400000)
      throw new Error("DATE_TOO_FAR_AHEAD");
    const key = `${c.ratePlanId || c.roomTypeId}:${c.date}`;
    if (seen.has(key)) throw new Error("DUPLICATE_CELL");
    seen.add(key);
    const r = map.get(`roomTypes/${c.roomTypeId}`)?.data();
    if (r?.propertyId !== propertyId || r.status === "archived")
      throw new Error("ROOM_NOT_AVAILABLE");
    if (
      c.date <
      new Intl.DateTimeFormat("en-CA", {
        timeZone: prop.get("timezone") || "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    )
      throw new Error("PAST_DATE_NOT_EDITABLE");
    if (!c.ratePlanId) {
      if (prop.get("inventoryEngine") !== "interval_v1")
        throw new Error("INVENTORY_CUTOVER_REQUIRED");
      if (
        typeof c.stopSell !== "boolean" ||
        c.basePricePaise ||
        c.durationPrices ||
        c.clearPrice
      )
        throw new Error("INVALID_CELL");
    } else {
      const rate = map.get(`ratePlans/${c.ratePlanId}`)?.data();
      if (
        rate?.propertyId !== propertyId ||
        rate.roomTypeId !== c.roomTypeId ||
        rate.status === "archived" ||
        c.stopSell !== undefined
      )
        throw new Error("RATE_NOT_AVAILABLE");
      if (
        c.clearPrice &&
        (c.basePricePaise !== undefined || c.durationPrices !== undefined)
      )
        throw new Error("INVALID_CELL");
      if (
        !c.clearPrice &&
        ((rate.bookingMode || "overnight") === "hourly"
          ? !validDurationPrices(c.durationPrices) ||
            c.basePricePaise !== undefined
          : !c.basePricePaise || c.durationPrices !== undefined)
      )
        throw new Error("INVALID_RATE_CONFIGURATION");
    }
  }
  return { cells, fingerprint: fingerprint([prop, ...docs]) };
}
export async function bulk(uid: string, propertyId: string, raw: unknown) {
  const input = z
    .object({
      action: z.enum(["preview", "apply"]),
      input: bulkInput.optional(),
      previewId: id.optional(),
    })
    .strict()
    .parse(raw);
  if (input.action === "preview") {
    const previewId = randomUUID();
    const preview = await adminDb.runTransaction(async (tx) => {
      const data = await readBulk(tx, uid, propertyId, input.input);
      tx.create(adminDb.collection("roomBulkPreviews").doc(previewId), {
        ...data,
        uid,
        propertyId,
        expiresAt: Timestamp.fromMillis(Date.now() + 300000),
        applied: false,
      });
      return data;
    });
    return { previewId, cells: preview.cells };
  }
  if (!input.previewId) throw new Error("PREVIEW_REQUIRED");
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("roomBulkPreviews").doc(input.previewId!);
    const snap = await tx.get(ref);
    const p = snap.data();
    if (!p || p.uid !== uid || p.propertyId !== propertyId)
      throw new Error("INVALID_PREVIEW");
    await authorize(uid, propertyId, tx);
    if (p.applied) return;
    if (p.expiresAt.toMillis() < Date.now()) throw new Error("PREVIEW_EXPIRED");
    const current = await readBulk(tx, uid, propertyId, { cells: p.cells });
    if (current.fingerprint !== p.fingerprint)
      throw new Error("DATA_CHANGED_PREVIEW_AGAIN");
    for (const c of current.cells) {
      if (!c.ratePlanId)
        tx.set(
          calendarRef(propertyId, c.roomTypeId, c.date),
          {
            propertyId,
            roomTypeId: c.roomTypeId,
            date: c.date,
            stopSell: c.stopSell,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          },
          { merge: true },
        );
      else if (c.clearPrice)
        tx.delete(datePriceRef(propertyId, c.ratePlanId, c.date));
      else
        tx.set(datePriceRef(propertyId, c.ratePlanId, c.date), {
          propertyId,
          roomTypeId: c.roomTypeId,
          ratePlanId: c.ratePlanId,
          date: c.date,
          ...(c.durationPrices
            ? { durationPrices: c.durationPrices }
            : { basePricePaise: c.basePricePaise }),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });
    }
    for (const rateId of new Set(
      current.cells.flatMap((c) => (c.ratePlanId ? [c.ratePlanId] : [])),
    ))
      tx.update(adminDb.collection("ratePlans").doc(rateId), {
        datePricingEnabled: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    tx.update(ref, { applied: true, appliedAt: FieldValue.serverTimestamp() });
    tx.create(
      adminDb
        .collection("properties")
        .doc(propertyId)
        .collection("roomEvents")
        .doc(),
      {
        type: "bulk_update",
        cells: current.cells,
        actorId: uid,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  await invalidatePublic("home", "search:*", "property:*", "bookable:*");
  return { ok: true };
}
const housekeepingInput = z
  .object({
    unitId: id,
    status: z.enum(["unknown", "dirty", "clean", "inspected"]),
    revision: z.number().int().nonnegative(),
    note: z.string().trim().max(500).default(""),
  })
  .strict();
export async function housekeeping(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  enabled("housekeeping");
  const input = housekeepingInput.parse(raw);
  await adminDb.runTransaction(async (tx) => {
    await authorize(uid, propertyId, tx);
    const ref = adminDb.collection("physicalUnits").doc(input.unitId);
    const unit = await tx.get(ref);
    if (
      unit.get("propertyId") !== propertyId ||
      unit.get("status") !== "active"
    )
      throw new Error("ROOM_NOT_AVAILABLE");
    if ((unit.get("revision") || 0) !== input.revision)
      throw new Error("DATA_CHANGED_REFRESH");
    tx.update(ref, {
      housekeepingStatus: input.status,
      housekeepingNote: input.note,
      housekeepingUpdatedAt: FieldValue.serverTimestamp(),
      housekeepingUpdatedBy: uid,
      revision: FieldValue.increment(1),
    });
    tx.create(ref.collection("events").doc(), {
      type: "housekeeping",
      status: input.status,
      note: input.note,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
}
const maintenanceInput = z
  .object({
    unitId: id.optional(),
    roomTypeId: id,
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    quantity: z.number().int().min(1).max(500),
    reason: z.string().trim().min(3).max(500),
    requestId: z.string().uuid(),
  })
  .strict();
export async function maintenance(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  enabled("calendar");
  const input = maintenanceInput.parse(raw);
  const blockId = createHash("sha256")
    .update(`${propertyId}:${uid}:${input.requestId}`)
    .digest("hex");
  await adminDb.runTransaction(async (tx) => {
    await authorize(uid, propertyId, tx);
    const ref = adminDb.collection("inventoryBlocks").doc(blockId);
    const previous = await tx.get(ref);
    if (previous.exists) {
      if (previous.get("requestFingerprint") !== JSON.stringify(input))
        throw new Error("IDEMPOTENCY_CONFLICT");
      return;
    }
    const p = await tx.get(adminDb.collection("properties").doc(propertyId));
    const room = await tx.get(
      adminDb.collection("roomTypes").doc(input.roomTypeId),
    );
    if (p.get("inventoryEngine") !== "interval_v1")
      throw new Error("INVENTORY_CUTOVER_REQUIRED");
    if (
      room.get("propertyId") !== propertyId ||
      room.get("status") !== "active"
    )
      throw new Error("ROOM_NOT_AVAILABLE");
    if (
      Date.parse(input.endAt) <= Date.now() ||
      Date.parse(input.startAt) > Date.now() + 366 * 86400000
    )
      throw new Error("INVALID_MAINTENANCE_DATES");
    const allocations = allocateIntervals(
      input.startAt,
      input.endAt,
      p.get("timezone") || "Asia/Kolkata",
    );
    const calendars = await tx.getAll(
      ...allocations.map((a) => calendarRef(propertyId, room.id, a.date)),
    );
    const unit = input.unitId
      ? await tx.get(adminDb.collection("physicalUnits").doc(input.unitId))
      : null;
    if (
      input.unitId &&
      (unit?.get("propertyId") !== propertyId ||
        unit.get("roomTypeId") !== room.id ||
        unit.get("status") !== "active" ||
        input.quantity !== 1)
    )
      throw new Error("INVALID_PHYSICAL_ROOM");
    const physical = input.unitId
      ? await tx.getAll(
          ...allocations.map((a) => unitCalendar(input.unitId!, a.date)),
        )
      : [];
    if (
      physical.some((d, i) =>
        allocations[i].intervals.some((k) => d.get(`slots.${k}`)),
      )
    )
      throw new Error("ROOM_ALREADY_ASSIGNED");
    if (
      calendars.some((d, i) =>
        allocations[i].intervals.some(
          (k) =>
            (d.data()?.reserved?.[k] || 0) +
              (d.data()?.blocked?.[k] || 0) +
              input.quantity >
            room.get("totalInventory"),
        ),
      )
    )
      throw new Error("CAPACITY_BELOW_COMMITMENTS");
    for (const a of allocations)
      tx.set(
        calendarRef(propertyId, room.id, a.date),
        {
          propertyId,
          roomTypeId: room.id,
          date: a.date,
          blocked: Object.fromEntries(
            a.intervals.map((k) => [k, FieldValue.increment(input.quantity)]),
          ),
        },
        { merge: true },
      );
    physical.forEach((d, i) =>
      tx.set(d.ref, {
        propertyId,
        unitId: input.unitId,
        slots: {
          ...(d.data()?.slots || {}),
          ...Object.fromEntries(
            allocations[i].intervals.map((k) => [k, `maintenance:${blockId}`]),
          ),
        },
      }),
    );
    if (unit)
      tx.update(unit.ref, { assignmentRevision: FieldValue.increment(1) });
    tx.create(ref, {
      ...input,
      propertyId,
      allocations,
      requestFingerprint: JSON.stringify(input),
      status: "active",
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await invalidatePublic("search:*", "property:*", "bookable:*");
  return { blockId };
}
export async function exactAvailability(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  await authorize(uid, propertyId);
  const input = z
    .object({
      roomTypeId: id,
      startDate: date,
      startTime: z.string(),
      endDate: date,
      endTime: z.string(),
    })
    .parse(raw);
  const [p, room] = await Promise.all([
    adminDb.collection("properties").doc(propertyId).get(),
    adminDb.collection("roomTypes").doc(input.roomTypeId).get(),
  ]);
  if (room.get("propertyId") !== propertyId) throw new Error("FORBIDDEN");
  const tz = p.get("timezone") || "Asia/Kolkata";
  const start = resolveLocal(input.startDate, input.startTime, tz),
    end =
      resolveLocal(input.endDate, input.endTime, tz) +
      Number(room.get("cleaningBufferMinutes") ?? 30) * 60000;
  const a = allocateIntervals(
    new Date(start).toISOString(),
    new Date(end).toISOString(),
    tz,
  );
  if (p.get("inventoryEngine") !== "interval_v1")
    throw new Error("INVENTORY_CUTOVER_REQUIRED");
  const docs = await adminDb.getAll(
    ...a.map((x) => calendarRef(propertyId, room.id, x.date)),
  );
  const available =
    room.get("status") !== "active" || docs.some((d) => d.get("stopSell"))
      ? 0
      : Math.max(
          0,
          Math.min(
            ...a.flatMap((x, i) =>
              x.intervals.map(
                (k) =>
                  room.get("totalInventory") -
                  (docs[i].data()?.reserved?.[k] || 0) -
                  (docs[i].data()?.blocked?.[k] || 0),
              ),
            ),
          ),
        );
  return { available, includesCleaningBuffer: true };
}
export async function pricingPreview(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  await authorize(uid, propertyId);
  const { bookingInput } = await import("@/lib/booking/contracts");
  const input = bookingInput.omit({ propertySlug: true }).parse(raw);
  const [property, room, rate] = await Promise.all([
    adminDb.collection("properties").doc(propertyId).get(),
    adminDb.collection("roomTypes").doc(input.roomTypeId).get(),
    adminDb.collection("ratePlans").doc(input.ratePlanId).get(),
  ]);
  if (
    room.get("propertyId") !== propertyId ||
    rate.get("propertyId") !== propertyId ||
    rate.get("roomTypeId") !== room.id ||
    room.get("status") !== "active" ||
    rate.get("status") !== "active"
  )
    throw new Error("RATE_NOT_AVAILABLE");
  const { withDatePrices } = await import("@/lib/booking/date-prices"),
    { evaluateStay } = await import("@/lib/booking/domain");
  const effective = await withDatePrices(
    propertyId,
    rate.id,
    rate.data()!,
    input,
  );
  const durationPrices =
    effective.datePrices[input.checkIn]?.durationPrices ||
    rate.get("durationPrices") ||
    [];
  const requestedDurationPriced =
    input.bookingMode !== "hourly" ||
    durationPrices.some(
      (p: { hours: number }) => p.hours * 60 === input.durationMinutes,
    );
  return {
    requestedDurationPriced,
    ...evaluateStay(
      requestedDurationPriced
        ? input
        : { ...input, durationMinutes: durationPrices[0]?.hours * 60 },
      property.data()!,
      room.data()!,
      effective,
    ),
    durationPrices:
      effective.datePrices[input.checkIn]?.durationPrices ||
      rate.get("durationPrices") ||
      [],
  };
}
export async function roomHistory(
  uid: string,
  propertyId: string,
  unitId: string,
) {
  await authorize(uid, propertyId);
  id.parse(unitId);
  const ref = adminDb.collection("physicalUnits").doc(unitId);
  if ((await ref.get()).get("propertyId") !== propertyId)
    throw new Error("FORBIDDEN");
  const events = await ref
    .collection("events")
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  return {
    events: events.docs.map((d) => ({ id: d.id, ...safeData(d.data()) })),
  };
}
