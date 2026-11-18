import { allocateIntervals, type Allocation } from "./domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";

export type AssignmentSegment = {
  id: string;
  changeId: string | null;
  closedByChangeId?: string;
  unitId: string;
  unitLabel: string;
  roomTypeId: string;
  roomTypeName: string;
  startAt: string;
  endAt: string;
  inventoryEndAt: string;
  allocations: Allocation[];
};
export type AllocationGroup = {
  roomTypeId: string;
  unitId?: string;
  allocations: Allocation[];
};
export const allocationSignature = (allocations: Allocation[]) =>
  JSON.stringify(
    allocations
      .map((a) => [a.date, [...a.intervals].sort()])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
export function holdAllocationGroups(hold: RecordData): AllocationGroup[] {
  return Array.isArray(hold.assignmentSegments)
    ? hold.assignmentSegments.map((s: AssignmentSegment) => ({
        roomTypeId: s.roomTypeId,
        allocations: s.allocations,
      }))
    : [{ roomTypeId: hold.roomTypeId, allocations: hold.allocations }];
}
export function physicalAllocationGroups(b: RecordData): AllocationGroup[] {
  return Array.isArray(b.assignmentSegments)
    ? b.assignmentSegments.map((s: AssignmentSegment) => ({
        roomTypeId: s.roomTypeId,
        unitId: s.unitId,
        allocations: s.allocations,
      }))
    : b.physicalUnitId
      ? [
          {
            roomTypeId: b.roomType?.id,
            unitId: b.physicalUnitId,
            allocations: b.physicalAllocations ?? [],
          },
        ]
      : [];
}
/** Never synthesize missing evidence. Initialization is called only by an authorized stay change. */
export function assignmentHistory(
  b: RecordData,
  hold: RecordData,
): AssignmentSegment[] {
  const fail = () => {
    throw new Error("ASSIGNMENT_RECONCILIATION_REQUIRED");
  };
  if (
    hold.status !== "committed" ||
    hold.propertyId !== b.propertyId ||
    hold.quantity !== 1 ||
    (b.quantity ?? 1) !== 1 ||
    !b.physicalUnitId ||
    !b.roomType?.id
  )
    fail();
  const segments: AssignmentSegment[] = b.assignmentSegments ?? [
    {
      id: "original",
      changeId: null,
      unitId: b.physicalUnitId,
      unitLabel: b.physicalUnitLabel || "Room",
      roomTypeId: b.roomType.id,
      roomTypeName: b.roomType.name || "Room category",
      startAt: b.startAt,
      endAt: b.endAt,
      inventoryEndAt: b.inventoryEndAt,
      allocations: hold.allocations,
    },
  ];
  if (!Array.isArray(segments) || !segments.length || segments.length > 60)
    fail();
  if (
    b.assignmentSegments &&
    JSON.stringify(segments) !== JSON.stringify(hold.assignmentSegments)
  )
    fail();
  for (const s of segments) {
    if (
      !s.unitId ||
      s.unitId.includes("/") ||
      !s.roomTypeId ||
      s.roomTypeId.includes("/") ||
      !Number.isFinite(Date.parse(s.startAt)) ||
      !Number.isFinite(Date.parse(s.endAt)) ||
      !Number.isFinite(Date.parse(s.inventoryEndAt)) ||
      Date.parse(s.endAt) <= Date.parse(s.startAt) ||
      Date.parse(s.inventoryEndAt) < Date.parse(s.endAt)
    )
      fail();
    try {
      if (
        allocationSignature(s.allocations) !==
        allocationSignature(
          allocateIntervals(s.startAt, s.inventoryEndAt, b.timezone),
        )
      )
        fail();
    } catch {
      fail();
    }
  }
  if (
    segments[0].startAt !== b.startAt ||
    new Set(segments.map((s) => s.id)).size !== segments.length
  )
    fail();
  if (
    b.originalStay &&
    (segments[0].unitId !== b.originalStay.physicalUnitId ||
      segments[0].roomTypeId !== b.originalStay.roomType?.id)
  )
    fail();
  const current = segments[segments.length - 1];
  if (
    current.unitId !== b.physicalUnitId ||
    current.roomTypeId !== b.roomType.id ||
    current.endAt !== b.endAt ||
    current.inventoryEndAt !== b.inventoryEndAt ||
    hold.roomTypeId !== current.roomTypeId
  )
    fail();
  if (
    allocationSignature(current.allocations) !==
      allocationSignature(b.physicalAllocations ?? []) ||
    allocationSignature(current.allocations) !==
      allocationSignature(hold.allocations ?? [])
  )
    fail();
  if (
    !b.assignmentSegments &&
    allocationSignature(hold.allocations) !==
      allocationSignature(b.physicalAllocations ?? [])
  )
    fail();
  for (let i = 1; i < segments.length; i++)
    if (segments[i - 1].endAt !== segments[i].startAt) fail();
  return segments.map((s) => ({
    ...s,
    allocations: s.allocations.map((a) => ({
      ...a,
      intervals: [...a.intervals],
    })),
  }));
}
/** Counts retain turnover overlaps, even when two rooms share a category. */
export function allocationCounts(groups: AllocationGroup[], physical = false) {
  const counts = new Map<string, number>();
  for (const g of groups)
    for (const a of g.allocations)
      for (const slot of a.intervals) {
        const key = `${physical ? g.unitId : g.roomTypeId}/${a.date}/${slot}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
  return counts;
}
