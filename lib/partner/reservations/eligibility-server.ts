import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { allocateIntervals } from "@/lib/booking/domain";
import {
  bookingStart,
  bookingEnd,
  type RecordData,
} from "@/lib/partner/dashboard/domain";
import {
  operationalPolicies,
  type OperationalPolicies,
} from "./operational-policies";
import { ApiException } from "@/lib/api/errors";
import type { ActionEligibility, EligibilityFacts } from "./eligibility";

type BookingRow = { id: string; data: RecordData };
type RoomDependencies = {
  units: Map<string, RecordData>;
  calendars: Map<string, RecordData>;
  occupants: Map<string, Set<string>>;
  unitBlocks: Map<string, RecordData[]>;
  typeBlocks: Map<string, RecordData[]>;
};
const needsRoomFacts = (b: RecordData, policies: OperationalPolicies) =>
  b.bookingStatus === "confirmed" &&
  (policies.requireAssignedRoom || policies.requireCleanRoom) &&
  !!b.physicalUnitId;
const allocationsFor = (b: RecordData) =>
  b.startAt && b.endAt
    ? allocateIntervals(
        b.startAt,
        b.inventoryEndAt || b.endAt,
        b.timezone || "Asia/Kolkata",
      )
    : [];

function dependencies(
  units: Map<string, RecordData>,
  calendars: Map<string, RecordData>,
  blocks: RecordData[],
  occupants: RecordData[],
): RoomDependencies {
  const result: RoomDependencies = {
    units,
    calendars,
    occupants: new Map(),
    unitBlocks: new Map(),
    typeBlocks: new Map(),
  };
  for (const occupant of occupants) {
    if (!occupant.physicalUnitId) continue;
    const ids =
      result.occupants.get(occupant.physicalUnitId) || new Set<string>();
    ids.add(occupant.id);
    result.occupants.set(occupant.physicalUnitId, ids);
  }
  for (const block of blocks) {
    const map = block.unitId ? result.unitBlocks : result.typeBlocks;
    const key = block.unitId || block.roomTypeId;
    const rows = map.get(key) || [];
    rows.push(block);
    map.set(key, rows);
  }
  return result;
}

/** Both advisory batch reads and authoritative transactions use identical evaluation/versioning. */
function buildFacts(
  bookingId: string,
  b: RecordData,
  property: RecordData,
  now: number,
  source?: RoomDependencies,
): EligibilityFacts {
  const policies = operationalPolicies(property.pms?.operationalPolicies);
  let room: EligibilityFacts["room"];
  const versionDependencies: unknown[] = [];
  if (needsRoomFacts(b, policies)) {
    const unit = source?.units.get(b.physicalUnitId);
    const occupants = source?.occupants.get(b.physicalUnitId);
    const allocations = allocationsFor(b);
    const timezone = b.timezone || property.timezone || "Asia/Kolkata";
    room = {
      valid:
        !!unit &&
        unit.propertyId === b.propertyId &&
        unit.roomTypeId === b.roomType?.id &&
        unit.status === "active",
      clean: !!unit && ["clean", "inspected"].includes(unit.housekeepingStatus),
      occupied:
        (!!occupants && (occupants.size > 1 || !occupants.has(bookingId))) ||
        allocations.some((a) =>
          a.intervals.some((key) => {
            const slot = source?.calendars.get(`${b.physicalUnitId}_${a.date}`)
              ?.slots?.[key];
            return slot && slot !== bookingId;
          }),
        ),
      maintenance: [
        ...(source?.unitBlocks.get(b.physicalUnitId) || []),
        ...(source?.typeBlocks.get(b.roomType?.id) || []),
      ].some(
        (block) =>
          bookingStart(block, timezone) < bookingEnd(b, timezone) &&
          bookingEnd(block, timezone) > bookingStart(b, timezone),
      ),
    };
    versionDependencies.push(unit || null, room);
  }
  const version = createHash("sha256")
    .update(
      JSON.stringify([
        bookingId,
        b,
        policies,
        property.pms?.operationalPolicies?.revision ?? 0,
        !(b.startAt && Date.parse(b.startAt) > now),
        !(b.endAt && Date.parse(b.endAt) <= now),
        versionDependencies,
      ]),
    )
    .digest("hex");
  return { policies, room, version };
}

async function readDocuments(refs: FirebaseFirestore.DocumentReference[]) {
  const rows = new Map<string, RecordData>();
  for (let offset = 0; offset < refs.length; offset += 200) {
    for (const doc of await adminDb.getAll(
      ...refs.slice(offset, offset + 200),
    )) {
      if (doc.exists) rows.set(doc.id, doc.data()!);
    }
  }
  return rows;
}

/** Fresh request-local dependencies shared by at most 50 rows; never used for a write. */
export async function loadPageEligibilityFacts(
  propertyId: string,
  bookings: BookingRow[],
  property: RecordData,
) {
  if (bookings.length > 50)
    throw new ApiException(
      "ELIGIBILITY_LIMIT_EXCEEDED",
      503,
      "Too many reservations for one eligibility page.",
    );
  if (bookings.some((b) => b.data.propertyId !== propertyId))
    throw new ApiException("FORBIDDEN", 403, "Hotel access required.");
  const policies = operationalPolicies(property.pms?.operationalPolicies);
  const requiringRooms = bookings.filter((b) =>
    needsRoomFacts(b.data, policies),
  );
  let source: RoomDependencies | undefined;
  if (requiringRooms.length) {
    const unitIds = [
      ...new Set(requiringRooms.map((b) => b.data.physicalUnitId as string)),
    ];
    const calendarIds = [
      ...new Set(
        requiringRooms.flatMap((b) =>
          allocationsFor(b.data).map(
            (a) => `${b.data.physicalUnitId}_${a.date}`,
          ),
        ),
      ),
    ];
    if (calendarIds.length > 2000)
      throw new ApiException(
        "ELIGIBILITY_LIMIT_EXCEEDED",
        503,
        "Room evaluation limit exceeded. Review a smaller reservation page.",
      );
    const [units, calendars, blocks, occupants] = await Promise.all([
      readDocuments(
        unitIds.map((id) => adminDb.collection("physicalUnits").doc(id)),
      ),
      readDocuments(
        calendarIds.map((id) =>
          adminDb.collection("physicalUnitCalendars").doc(id),
        ),
      ),
      adminDb
        .collection("inventoryBlocks")
        .where("propertyId", "==", propertyId)
        .where("status", "==", "active")
        .select(
          "unitId",
          "roomTypeId",
          "startAt",
          "endAt",
          "checkIn",
          "checkOut",
        )
        .limit(1001)
        .get(),
      adminDb
        .collection("bookings")
        .where("propertyId", "==", propertyId)
        .where("bookingStatus", "==", "checked_in")
        .select("physicalUnitId")
        .limit(10001)
        .get(),
    ]);
    if (blocks.docs.length > 1000 || occupants.docs.length > 10000)
      throw new ApiException(
        "ELIGIBILITY_LIMIT_EXCEEDED",
        503,
        "Hotel room evaluation limit exceeded. Review reservations individually or contact support.",
      );
    source = dependencies(
      units,
      calendars,
      blocks.docs.map((d) => d.data()),
      occupants.docs.map((d) => ({ ...d.data(), id: d.id })),
    );
  }
  const now = Date.now();
  return new Map(
    bookings.map((b) => [
      b.id,
      buildFacts(b.id, b.data, property, now, source),
    ]),
  );
}

/** Writes always re-read every dependency inside their own Firestore transaction. */
export async function loadEligibilityFacts(
  bookingId: string,
  b: RecordData,
  property: RecordData,
  tx?: FirebaseFirestore.Transaction,
): Promise<EligibilityFacts> {
  if (!tx)
    return (
      await loadPageEligibilityFacts(
        b.propertyId,
        [{ id: bookingId, data: b }],
        property,
      )
    ).get(bookingId)!;
  const policies = operationalPolicies(property.pms?.operationalPolicies);
  let source: RoomDependencies | undefined;
  if (needsRoomFacts(b, policies)) {
    const unit = (
      await tx.get(adminDb.collection("physicalUnits").doc(b.physicalUnitId))
    ).data();
    const [blocks, occupants] = await Promise.all([
      tx.get(
        adminDb
          .collection("inventoryBlocks")
          .where("propertyId", "==", b.propertyId)
          .where("status", "==", "active"),
      ),
      tx.get(
        adminDb
          .collection("bookings")
          .where("propertyId", "==", b.propertyId)
          .where("bookingStatus", "==", "checked_in"),
      ),
    ]);
    const allocations = allocationsFor(b);
    const calendars = await Promise.all(
      allocations.map((a) =>
        tx.get(
          adminDb
            .collection("physicalUnitCalendars")
            .doc(`${b.physicalUnitId}_${a.date}`),
        ),
      ),
    );
    source = dependencies(
      new Map(unit ? [[b.physicalUnitId, unit]] : []),
      new Map(calendars.filter((d) => d.exists).map((d) => [d.id, d.data()!])),
      blocks.docs.map((d) => d.data()),
      occupants.docs.map((d) => ({ ...d.data(), id: d.id })),
    );
  }
  return buildFacts(bookingId, b, property, Date.now(), source);
}

export function enforceEligibility(
  eligibility: ActionEligibility,
  expectedVersion?: string,
) {
  if (expectedVersion && expectedVersion !== eligibility.eligibilityVersion) {
    const stale = {
      code: "ELIGIBILITY_CHANGED",
      category: "stale" as const,
      message:
        "Reservation facts changed. Review current eligibility before submitting again.",
      resolution: null,
    };
    throw new ApiException(stale.code, 409, stale.message, undefined, {
      ...eligibility,
      allowed: false,
      reason: stale.message,
      blockers: [stale, ...eligibility.blockers],
    });
  }
  if (!eligibility.allowed)
    throw new ApiException(
      eligibility.blockers[0].code,
      eligibility.blockers.some(
        (b) => b.category === "permission" || b.category === "restriction",
      )
        ? 403
        : eligibility.blockers.some((b) => b.category === "state")
          ? 409
          : 422,
      eligibility.reason!,
      undefined,
      eligibility,
    );
}
