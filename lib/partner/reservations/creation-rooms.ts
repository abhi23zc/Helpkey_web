import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { allocateIntervals } from "@/lib/booking/domain";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";
import { ApiException } from "@/lib/api/errors";
import { assignPhysical } from "./physical";

type Stay = {
  propertyId: string;
  roomType: { id: string };
  startAt: string;
  endAt: string;
  inventoryEndAt: string;
  timezone: string;
};
export type CreationRoom = {
  id: string;
  label: string;
  housekeeping: string;
  occupiedNow: boolean;
  conflict: boolean;
  maintenance: boolean;
  available: boolean;
  readyNow: boolean;
  reason: string | null;
};
const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

/** Query one bounded page; availability is advisory until the creation transaction rechecks it. */
export async function creationRooms(
  uid: string,
  stay: Stay,
  immediate: boolean,
  rawCursor?: string,
) {
  const scope = [
    "creation-rooms",
    uid,
    stay.propertyId,
    stay.roomType.id,
    stay.startAt,
    stay.inventoryEndAt,
    String(immediate),
  ];
  let q = adminDb
    .collection("physicalUnits")
    .where("propertyId", "==", stay.propertyId)
    .where("roomTypeId", "==", stay.roomType.id)
    .orderBy(FieldPath.documentId())
    .limit(51);
  if (rawCursor) {
    try {
      const c = decodeCursor(rawCursor);
      if (
        c.id.includes("/") ||
        JSON.stringify(c.values) !== JSON.stringify(scope)
      )
        throw new Error();
      q = q.startAfter(c.id);
    } catch {
      throw new ApiException(
        "INVALID_CURSOR",
        422,
        "Room choices changed. Refresh availability and start from the first page.",
      );
    }
  }
  const [page, occupied, blocks] = await Promise.all([
    q.get(),
    adminDb
      .collection("bookings")
      .where("propertyId", "==", stay.propertyId)
      .where("bookingStatus", "==", "checked_in")
      .get(),
    adminDb
      .collection("inventoryBlocks")
      .where("propertyId", "==", stay.propertyId)
      .where("status", "==", "active")
      .get(),
  ]);
  const units = page.docs.slice(0, 50),
    allocations = allocateIntervals(
      stay.startAt,
      stay.inventoryEndAt,
      stay.timezone,
    );
  // Read existing sparse calendars in bounded unit batches instead of charging a
  // missing-document read for every room/day combination in a long stay.
  // Four filters expand per IN value; 20 stays below Firestore’s 100-component limit.
  const calendarRows: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let offset = 0; offset < units.length; offset += 20) {
    const page = await adminDb
      .collection("physicalUnitCalendars")
      .where("propertyId", "==", stay.propertyId)
      .where(
        "unitId",
        "in",
        units.slice(offset, offset + 20).map((u) => u.id),
      )
      .where("date", ">=", allocations[0].date)
      .where("date", "<=", allocations[allocations.length - 1].date)
      .get();
    calendarRows.push(...page.docs);
  }
  const calendars = new Map(calendarRows.map((d) => [d.id, d.data()]));
  const rows: CreationRoom[] = units.map((u) => {
    const occupiedNow = occupied.docs.some(
      (b) => b.get("physicalUnitId") === u.id,
    );
    const slots = allocations
      .flatMap((a) =>
        a.intervals.map((k) => calendars.get(`${u.id}_${a.date}`)?.slots?.[k]),
      )
      .filter(Boolean);
    const maintenance =
      slots.some((s) => String(s).startsWith("maintenance:")) ||
      blocks.docs.some(
        (b) =>
          b.get("unitId") === u.id &&
          overlaps(
            Date.parse(stay.startAt),
            Date.parse(stay.inventoryEndAt),
            Date.parse(b.get("startAt")),
            Date.parse(b.get("endAt")),
          ),
      );
    const conflict = slots.some((s) => !String(s).startsWith("maintenance:"));
    const active = u.get("status") === "active",
      housekeeping = u.get("housekeepingStatus") || "unknown";
    const available =
      active && !conflict && !maintenance && !(immediate && occupiedNow);
    return {
      id: u.id,
      label: String(u.get("label") || "Unlabelled room"),
      housekeeping,
      occupiedNow,
      conflict,
      maintenance,
      available,
      readyNow:
        available &&
        !occupiedNow &&
        ["clean", "inspected"].includes(housekeeping),
      reason: !active
        ? "Room is inactive."
        : maintenance
          ? "Maintenance overlaps this stay or turnover."
          : conflict
            ? "Another assignment overlaps this stay or turnover."
            : immediate && occupiedNow
              ? "A guest is still checked in, including any overdue stay."
              : immediate && !["clean", "inspected"].includes(housekeeping)
                ? "Not ready: check cleaning before the separate check-in action."
                : null,
    };
  });
  rows.sort(
    (a, b) =>
      Number(b.readyNow) - Number(a.readyNow) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  return {
    rooms: rows,
    nextCursor:
      page.size > 50
        ? encodeCursor({ id: units[units.length - 1].id, values: scope })
        : null,
  };
}

/** Reads only; returned closure must run after ALL transaction reads are finished. */
export async function prepareCreationAssignment(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  stay: Stay,
  unitId: string,
  immediate: boolean,
) {
  const [occupied, blocks] = await Promise.all([
    immediate
      ? tx.get(
          adminDb
            .collection("bookings")
            .where("propertyId", "==", stay.propertyId)
            .where("bookingStatus", "==", "checked_in"),
        )
      : Promise.resolve(null),
    tx.get(
      adminDb
        .collection("inventoryBlocks")
        .where("propertyId", "==", stay.propertyId)
        .where("status", "==", "active"),
    ),
  ]);
  if (occupied?.docs.some((b) => b.get("physicalUnitId") === unitId))
    throw new ApiException(
      "ROOM_OCCUPIED",
      409,
      "That room still has a checked-in guest. Choose another room or leave this reservation unassigned.",
    );
  if (
    blocks.docs.some(
      (b) =>
        b.get("unitId") === unitId &&
        overlaps(
          Date.parse(stay.startAt),
          Date.parse(stay.inventoryEndAt),
          Date.parse(b.get("startAt")),
          Date.parse(b.get("endAt")),
        ),
    )
  )
    throw new ApiException(
      "ROOM_UNDER_MAINTENANCE",
      409,
      "Maintenance overlaps the selected room's stay or turnover. Choose another room or leave unassigned.",
    );
  return assignPhysical(tx, bookingId, stay, unitId);
}
