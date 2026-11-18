import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { allocateIntervals, localParts } from "@/lib/booking/domain";
import {
  assignmentHistory,
  allocationCounts,
  type AssignmentSegment,
} from "@/lib/booking/assignment-segments";
import { calendarRef } from "@/lib/booking/inventory";
import { withDatePrices } from "@/lib/booking/date-prices";
import { operationalAccess } from "@/lib/partner/pms/access";
import { todayTransaction } from "@/lib/partner/today/cache";
import {
  prepareFolioPosting,
  readBillingSources,
  requireReconciled,
} from "@/lib/partner/billing/service";
import type { BillingEntry } from "@/lib/partner/billing/domain";
import {
  documentSources,
  type ClaimState,
} from "@/lib/partner/invoices/domain";
import { stayFinancials } from "@/lib/stay/domain";
import { safeData, requireFeature } from "./operations";
import { unitCalendar } from "./physical";
import { operationalPolicies } from "./operational-policies";
import {
  actionPermission,
  explicitAdjustment,
  extensionQuote,
  stayChangeInput,
  type StayChangeInput,
} from "./stay-change-domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const secret = () =>
  process.env.CURSOR_SIGNING_SECRET ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  (process.env.NODE_ENV !== "production"
    ? "development-stay-changes-only"
    : (() => {
        throw new Error("SIGNING_NOT_CONFIGURED");
      })());
function sign(v: unknown) {
  const data = Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${data}.${createHmac("sha256", secret()).update(data).digest("base64url")}`;
}
const reviewSchema = z.object({
  uid: z.string(),
  propertyId: z.string(),
  bookingId: z.string(),
  expiresAt: z.number(),
  fingerprint: z.string(),
  input: stayChangeInput,
});
function verify(token: string) {
  const [data, signature, extra] = token.split(".");
  const expected = createHmac("sha256", secret())
      .update(data || "")
      .digest(),
    actual = Buffer.from(signature || "", "base64url");
  if (
    !data ||
    extra ||
    actual.length !== expected.length ||
    !timingSafeEqual(expected, actual)
  )
    throw new ApiException("INVALID_PREVIEW", 422);
  try {
    return reviewSchema.parse(
      JSON.parse(Buffer.from(data, "base64url").toString()),
    );
  } catch {
    throw new ApiException("INVALID_PREVIEW", 422);
  }
}
function conflict(code: string, message: string): never {
  const resolution = /SERVICE/.test(code)
    ? null
    : /BILLING|REDUCTION|DEBIT/.test(code)
      ? ("payments" as const)
      : /CLEAN/.test(code)
        ? ("housekeeping" as const)
        : /ROOM|CAPACITY|INVENTORY|ASSIGNMENT/.test(code)
          ? ("assignment" as const)
          : null;
  throw new ApiException(code, 409, message, undefined, {
    allowed: false,
    reason: message,
    eligibilityVersion: "stay-change",
    blockers: [{ code, message, category: "state", resolution }],
  });
}

async function evaluate(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  bookingId: string,
  input: StayChangeInput,
  changeId: string,
) {
  requireFeature("stayChanges");
  requireFeature("allocation");
  const now = Date.now(),
    effectiveAt = new Date(now).toISOString();
  const ref = adminDb.collection("bookings").doc(bookingId),
    b = (await tx.get(ref)).data();
  if (!b) throw new ApiException("NOT_FOUND", 404);
  const access = await operationalAccess(
      uid,
      b.propertyId,
      actionPermission[input.action],
      tx,
    ),
    p = access.property;
  if (
    b.bookingStatus !== "checked_in" ||
    b.inventoryReleased ||
    b.inventoryEngine !== "interval_v1" ||
    p.inventoryEngine !== "interval_v1" ||
    Date.parse(b.startAt) > now ||
    Date.parse(b.endAt) <= now
  )
    conflict(
      "STAY_CHANGE_NOT_ALLOWED",
      "Only a currently occupied stay with an assigned room and future departure can be changed.",
    );
  if ((p.currency || "INR") !== b.currency)
    conflict(
      "CURRENCY_RECONCILIATION_REQUIRED",
      "The hotel and saved reservation currencies differ. Reconcile the financial settings before changing the stay.",
    );
  const holdRef = adminDb.collection("inventoryHolds").doc(bookingId),
    hold = (await tx.get(holdRef)).data();
  if (!hold)
    conflict(
      "ASSIGNMENT_RECONCILIATION_REQUIRED",
      "The inventory history is missing. Ask the owner to reconcile this reservation before changing it.",
    );
  let segments: AssignmentSegment[];
  try {
    segments = assignmentHistory(b, hold);
  } catch {
    conflict(
      "ASSIGNMENT_RECONCILIATION_REQUIRED",
      "The room and inventory history do not reconcile. Ask the owner to reconcile this reservation; no automatic repair was attempted.",
    );
  }
  const currentUnit = (
    await tx.get(adminDb.collection("physicalUnits").doc(b.physicalUnitId))
  ).data();
  if (
    !currentUnit ||
    currentUnit.propertyId !== b.propertyId ||
    currentUnit.roomTypeId !== b.roomType.id ||
    currentUnit.status !== "active"
  )
    conflict(
      "ASSIGNMENT_RECONCILIATION_REQUIRED",
      "The current room assignment is no longer valid. Ask the owner to reconcile it first.",
    );
  const moving = input.action === "move" || input.action === "category";
  const unitId = moving ? input.unitId : b.physicalUnitId;
  const unitRef = adminDb.collection("physicalUnits").doc(unitId),
    unit = (await tx.get(unitRef)).data();
  if (!unit || unit.propertyId !== b.propertyId || unit.status !== "active")
    conflict("ROOM_NOT_AVAILABLE", "Choose an active room in this hotel.");
  if (
    moving &&
    (unitId === b.physicalUnitId ||
      (input.action === "move"
        ? unit.roomTypeId !== b.roomType.id
        : unit.roomTypeId === b.roomType.id))
  )
    conflict(
      "INVALID_DESTINATION",
      input.action === "move"
        ? "Choose another room in the same category."
        : "Choose a room in another category.",
    );
  const room = (
    await tx.get(adminDb.collection("roomTypes").doc(unit.roomTypeId))
  ).data();
  if (
    !room ||
    room.propertyId !== b.propertyId ||
    room.status !== "active" ||
    !(room.bookingModes ?? p.bookingModes ?? ["overnight"]).includes(
      b.bookingMode || "overnight",
    )
  )
    conflict(
      "ROOM_NOT_AVAILABLE",
      "This room category is unavailable for this stay mode.",
    );
  if (
    (b.adults ?? 1) > (room.maxAdults ?? 1) ||
    (b.children ?? 0) > (room.maxChildren ?? 0) ||
    (b.infants ?? 0) > (room.maxInfants ?? 10) ||
    (b.adults ?? 1) + (b.children ?? 0) >
      (room.maxOccupancy ?? (room.maxAdults ?? 1) + (room.maxChildren ?? 0))
  )
    conflict(
      "ROOM_CAPACITY_EXCEEDED",
      "The selected room cannot accommodate this party.",
    );
  if (
    moving &&
    operationalPolicies(p.pms?.operationalPolicies).requireCleanRoom &&
    !["clean", "inspected"].includes(unit.housekeepingStatus)
  )
    conflict(
      "ROOM_NOT_CLEAN",
      "The destination must be clean or inspected. Resolve its housekeeping status first.",
    );
  const [occupants, blocks] = await Promise.all([
    tx.get(
      adminDb
        .collection("bookings")
        .where("propertyId", "==", b.propertyId)
        .where("bookingStatus", "==", "checked_in"),
    ),
    tx.get(
      adminDb
        .collection("inventoryBlocks")
        .where("propertyId", "==", b.propertyId)
        .where("status", "==", "active"),
    ),
  ]);
  if (
    occupants.docs.some(
      (d) => d.id !== bookingId && d.get("physicalUnitId") === b.physicalUnitId,
    )
  )
    conflict(
      "ASSIGNMENT_RECONCILIATION_REQUIRED",
      "Another in-house stay claims the current room. Reconcile the assignments before proceeding.",
    );
  if (
    occupants.docs.some(
      (d) => d.id !== bookingId && d.get("physicalUnitId") === unitId,
    )
  )
    conflict(
      "ROOM_OCCUPIED",
      "The destination is occupied. Check out or move its current guest first.",
    );
  let endAt = b.endAt as string,
    amount = explicitAdjustment(input),
    price: RecordData | null = null,
    rate: RecordData | null = null;
  if (input.action === "extend") {
    const rateId =
      input.ratePlanId || b.operationalRatePlanId || b.ratePlan?.id;
    if (!rateId)
      conflict(
        "RATE_NOT_AVAILABLE",
        "This stay has no reliable extension rate. Reconcile its rate before extending.",
      );
    const savedRate = (
      await tx.get(adminDb.collection("ratePlans").doc(rateId))
    ).data();
    if (
      !savedRate ||
      savedRate.propertyId !== b.propertyId ||
      savedRate.roomTypeId !== unit.roomTypeId ||
      savedRate.status !== "active"
    )
      conflict(
        "RATE_NOT_AVAILABLE",
        "An active rate for the current category is required. Review the rate with a manager.",
      );
    const oldDate = localParts(Date.parse(b.endAt), b.timezone).date;
    rate = await withDatePrices(
      b.propertyId,
      rateId,
      savedRate,
      {
        bookingMode: b.bookingMode,
        checkIn: oldDate,
        checkOut: input.departureDate,
      },
      tx,
    );
    const extension = extensionQuote(b, p, room, rate, input, now);
    endAt = extension.endAt;
    amount = extension.adjustmentPaise;
    price = extension.price;
  } else if (input.action === "early_departure") {
    endAt =
      input.departure === "now"
        ? effectiveAt
        : new Date(input.departure).toISOString();
    if (Date.parse(endAt) < now || Date.parse(endAt) >= Date.parse(b.endAt))
      conflict(
        "INVALID_DEPARTURE",
        "Choose now or a future hotel-local time before the current departure. Backdating is unavailable.",
      );
    if (
      (b.customizations ?? []).some(
        (r: RecordData) =>
          ![
            "declined",
            "withdrawn",
            "cancelled",
            "completed",
            "fulfilled",
          ].includes(r.status) &&
          (["night", "stay"].includes(r.pricingUnit) ||
            r.kind === "duration" ||
            r.scope === "stay" ||
            ((r.inputs?.serviceAt || r.deadlineAt) &&
              Date.parse(r.inputs?.serviceAt || r.deadlineAt) +
                (r.inputs?.hours ?? 0) * 3600000 >=
                Date.parse(endAt))),
      )
    )
      conflict(
        "RESOLVE_SERVICE_COMMITMENTS",
        "Resolve time-dependent services in Stay requests before shortening this stay.",
      );
  }
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > 100_000_000)
    conflict(
      "STAY_AMOUNT_LIMIT",
      "This adjustment exceeds the supported folio amount limit. Contact the owner for review.",
    );
  const permissions = access.permissions;
  if (
    (input.action === "category" ||
      (input.action === "extend" && input.negotiatedPaise !== undefined)) &&
    !permissions.includes("rates.manage")
  )
    throw new ApiException(
      "FORBIDDEN",
      403,
      "Pricing-management permission is required for complimentary or negotiated prices.",
    );
  if (
    (amount > 0 && !permissions.includes("billing.post")) ||
    (amount < 0 && !permissions.includes("billing.adjust"))
  )
    throw new ApiException(
      "FORBIDDEN",
      403,
      "The financial adjustment requires the corresponding billing permission.",
    );
  const sources = await readBillingSources(tx, bookingId);
  try {
    requireReconciled(b, sources);
  } catch (error) {
    if (!permissions.includes("payment.read"))
      conflict(
        "BILLING_RECONCILIATION_REQUIRED",
        "The financial records need review by the owner or cashier before changing this stay.",
      );
    throw error;
  }
  const invoiceState = (
    await tx.get(ref.collection("invoiceWorkspace").doc("state"))
  ).data() as ClaimState | undefined;
  const reductionSourceId =
    "reductionSourceId" in input
      ? (input.reductionSourceId ?? "booking")
      : "booking";
  if (amount < 0) {
    const source = documentSources(b, sources.entries).find(
      (s) => s.id === reductionSourceId,
    );
    if (
      !source ||
      source.amountPaise < -amount ||
      !(
        source.id === "booking" ||
        sources.entries.some(
          (e) => `entry:${e.id}` === source.id && e.stayChangeId,
        )
      )
    )
      conflict(
        "REDUCTION_SOURCE_REQUIRED",
        "Choose an eligible accommodation source with enough unreduced charges.",
      );
  }
  const additions: BillingEntry[] = amount
    ? [
        {
          id: changeId,
          propertyId: b.propertyId,
          bookingId,
          requestId: changeId,
          stayChangeId: changeId,
          actorId: uid,
          actorName: access.user.fullName || "Staff",
          revision: (b.billingRevision ?? 0) + 1,
          type: amount < 0 ? "credit" : "charge",
          originalEntryId: null,
          amountPaise: amount,
          category: "other",
          description: `Stay change: ${input.action.replaceAll("_", " ")}`,
          reason: "",
          details: {
            explanation: "Agreed stay change",
            ...(price &&
            input.action === "extend" &&
            input.negotiatedPaise === undefined
              ? { pricing: price }
              : {}),
          },
          ...(amount < 0 ? { reductionSourceId } : {}),
        },
      ]
    : [];
  const posting: RecordData = amount
    ? prepareFolioPosting(b, sources.entries, additions, invoiceState)
    : {};
  const current = segments[segments.length - 1],
    buffer = moving
      ? Math.max(
          0,
          (Date.parse(current.inventoryEndAt) - Date.parse(current.endAt)) /
            60000,
        )
      : (b.cleaningBufferMinutes ?? 30);
  const destinationBuffer = moving
    ? (room.cleaningBufferMinutes ?? p.cleaningBufferMinutes ?? 30)
    : buffer;
  if (
    ![buffer, destinationBuffer].every(
      (v) => Number.isSafeInteger(v) && v >= 0 && v <= 1440,
    )
  )
    conflict(
      "ASSIGNMENT_RECONCILIATION_REQUIRED",
      "The saved or configured cleaning buffer is invalid. Ask the owner to reconcile it before changing the stay.",
    );
  const inventoryEndAt = new Date(
    Date.parse(endAt) + destinationBuffer * 60000,
  ).toISOString();
  const next = segments.map((s) => ({ ...s }));
  if (moving) {
    const closedEnd = new Date(now + buffer * 60000).toISOString();
    next[next.length - 1] = {
      ...current,
      closedByChangeId: changeId,
      endAt: effectiveAt,
      inventoryEndAt: closedEnd,
      allocations: allocateIntervals(current.startAt, closedEnd, b.timezone),
    };
    next.push({
      id: changeId,
      changeId,
      unitId,
      unitLabel: unit.label || "Room",
      roomTypeId: unit.roomTypeId,
      roomTypeName: room.name || "Room category",
      startAt: effectiveAt,
      endAt,
      inventoryEndAt,
      allocations: allocateIntervals(effectiveAt, inventoryEndAt, b.timezone),
    });
  } else
    next[next.length - 1] = {
      ...current,
      endAt,
      inventoryEndAt,
      allocations: allocateIntervals(
        current.startAt,
        inventoryEndAt,
        b.timezone,
      ),
      changeId,
    };
  if (next.length > 60)
    conflict(
      "STAY_CHANGE_LIMIT",
      "This stay has reached the supported limit of 60 room segments. Contact support for reconciliation.",
    );
  const affectedStart = moving
    ? now
    : Math.min(Date.parse(b.endAt), Date.parse(endAt));
  if (
    blocks.docs.some((d) => {
      const v = d.data();
      return (
        (v.unitId ? v.unitId === unitId : v.roomTypeId === unit.roomTypeId) &&
        Date.parse(v.startAt) < Date.parse(inventoryEndAt) &&
        Date.parse(v.endAt) > affectedStart
      );
    })
  )
    conflict(
      "ROOM_MAINTENANCE",
      "The selected room or category has maintenance during the stay or turnover. Review Rooms.",
    );
  const groups = (rows: AssignmentSegment[]) =>
    rows.map((s) => ({
      roomTypeId: s.roomTypeId,
      unitId: s.unitId,
      allocations: s.allocations,
    }));
  const oldCounts = allocationCounts(groups(segments)),
    newCounts = allocationCounts(groups(next));
  const oldPhysical = allocationCounts(groups(segments), true),
    newPhysical = allocationCounts(groups(next), true);
  const typeKeys = new Set([...oldCounts.keys(), ...newCounts.keys()]),
    unitKeys = new Set([...oldPhysical.keys(), ...newPhysical.keys()]);
  const refs = [
    ...new Map(
      [...typeKeys].map((k) => {
        const [type, date] = k.split("/");
        const r = calendarRef(b.propertyId, type, date);
        return [r.path, r] as const;
      }),
    ).values(),
    ...new Map(
      [...unitKeys].map((k) => {
        const [id, date] = k.split("/");
        const r = unitCalendar(id, date);
        return [r.path, r] as const;
      }),
    ).values(),
  ];
  const docs = await tx.getAll(...refs),
    calendars = new Map(docs.map((d) => [d.ref.path, d.data() ?? {}]));
  const capacities = new Map<string, number>();
  for (const type of new Set([...typeKeys].map((k) => k.split("/")[0]))) {
    const r = (await tx.get(adminDb.collection("roomTypes").doc(type))).data();
    if (
      !r ||
      r.propertyId !== b.propertyId ||
      !Number.isSafeInteger(r.totalInventory)
    )
      conflict(
        "ASSIGNMENT_RECONCILIATION_REQUIRED",
        "A historical room category is missing. Reconcile inventory before proceeding.",
      );
    capacities.set(type, r.totalInventory);
  }
  for (const key of typeKeys) {
    const [type, date, slot] = key.split("/"),
      calendar = calendars.get(calendarRef(b.propertyId, type, date).path)!;
    const reserved = calendar.reserved?.[slot] ?? 0,
      old = oldCounts.get(key) ?? 0,
      revised = reserved - old + (newCounts.get(key) ?? 0),
      blocked = calendar.blocked?.[slot] ?? 0;
    if (
      !Number.isSafeInteger(reserved) ||
      reserved < old ||
      !Number.isSafeInteger(blocked) ||
      blocked < 0
    )
      conflict(
        "INVENTORY_DRIFT",
        "Inventory does not reconcile. Ask the owner to review allocation history.",
      );
    if (
      revised < 0 ||
      revised + blocked > capacities.get(type)! ||
      (calendar.stopSell && (newCounts.get(key) ?? 0) > old)
    )
      conflict(
        "STAY_CAPACITY_CONFLICT",
        "The room category has no capacity for the changed stay and cleaning overlap. Choose another room, or move first and review the extension again.",
      );
  }
  for (const key of unitKeys) {
    const [id, date, slot] = key.split("/"),
      owner = calendars.get(unitCalendar(id, date).path)!.slots?.[slot];
    if (oldPhysical.has(key) && owner !== bookingId)
      conflict(
        "ASSIGNMENT_RECONCILIATION_REQUIRED",
        "A saved room allocation is missing or belongs to another stay. Reconcile room history before proceeding.",
      );
    if (newPhysical.has(key) && owner && owner !== bookingId)
      conflict(
        "ROOM_ALREADY_ASSIGNED",
        "This room is reserved or under maintenance during the changed stay or cleaning. Move to an eligible room first, then review the extension; availability is checked again.",
      );
  }
  const last = next[next.length - 1],
    local = localParts(Date.parse(endAt), b.timezone);
  const patch = {
    ...posting,
    ...(input.action === "extend"
      ? {
          operationalRatePlanId:
            input.ratePlanId || b.operationalRatePlanId || b.ratePlan.id,
        }
      : {}),
    roomType: { id: unit.roomTypeId, name: room.name },
    physicalUnitId: unitId,
    physicalUnitLabel: unit.label,
    physicalAllocations: last.allocations,
    assignmentSegments: next,
    endAt,
    inventoryEndAt,
    checkOut: local.date,
    departureTime: local.time,
    durationMinutes: (Date.parse(endAt) - Date.parse(b.startAt)) / 60000,
    nights:
      b.bookingMode === "hourly"
        ? 0
        : (Date.parse(local.date) - Date.parse(b.checkIn)) / 86400000,
    cleaningBufferMinutes:
      (Date.parse(inventoryEndAt) - Date.parse(endAt)) / 60000,
  };
  const financials = stayFinancials({
    totalPaise: b.totalPaise,
    ...b,
    ...patch,
  });
  // Time itself advances between review and commit. Hash durable dependencies, not generated segments.
  const fingerprint = hash(
    safeData({
      b,
      hold,
      property: p,
      unit,
      currentUnit,
      room,
      rate,
      sources,
      invoiceState: invoiceState ?? null,
      occupants: occupants.docs.map((d) => ({
        id: d.id,
        unitId: d.get("physicalUnitId"),
      })),
      blocks: blocks.docs.map((d) => ({ id: d.id, ...d.data() })),
      calendars: Object.fromEntries(calendars),
      amount,
    }),
  );
  return {
    ref,
    b,
    access,
    holdRef,
    hold,
    input,
    effectiveAt,
    endAt,
    inventoryEndAt,
    segments: next,
    patch,
    additions,
    fingerprint,
    oldCounts,
    newCounts,
    typeKeys,
    oldPhysical,
    newPhysical,
    unitKeys,
    calendars,
    unitRef,
    moving,
    summary: {
      before: {
        room: b.physicalUnitLabel,
        category: b.roomType.name,
        departure: b.endAt,
      },
      after: { room: unit.label, category: room.name, departure: endAt },
      effectiveAt,
      affectedInterval: {
        startAt: new Date(affectedStart).toISOString(),
        endAt: inventoryEndAt,
      },
      ...(permissions.includes("payment.read")
        ? {
            adjustmentPaise: amount,
            balanceDuePaise: financials.balanceDuePaise,
            refundableExcessPaise: Math.max(
              0,
              (b.paidPaise ?? 0) -
                (b.refundedPaise ?? 0) -
                (b.refundDuePaise ?? 0) -
                financials.effectiveTotalPaise,
            ),
          }
        : {}),
      blockers: [],
      documentFollowUp:
        amount > 0
          ? "Issue an additional invoice for the new charge when appropriate."
          : amount < 0
            ? "Review credit-note follow-up against the original invoiced accommodation source."
            : "Issued documents remain unchanged.",
      notice:
        "No checkout, refund, collection, service extension or document is performed automatically.",
    },
  };
}

export async function previewStayChange(
  uid: string,
  bookingId: string,
  raw: unknown,
) {
  const input = stayChangeInput.parse(raw);
  const r = await adminDb.runTransaction((tx) =>
    evaluate(tx, uid, bookingId, input, "preview"),
  );
  return {
    ...r.summary,
    token: sign({
      uid,
      propertyId: r.b.propertyId,
      bookingId,
      input,
      fingerprint: r.fingerprint,
      expiresAt: Date.now() + 300000,
    }),
  };
}
export async function confirmStayChange(
  uid: string,
  bookingId: string,
  raw: unknown,
  key: string,
) {
  const input = z
      .object({
        token: z.string().max(16000),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(raw),
    review = verify(input.token);
  if (review.uid !== uid || review.bookingId !== bookingId)
    throw new ApiException("INVALID_PREVIEW", 403);
  if (!key || key.length > 180)
    throw new ApiException("IDEMPOTENCY_KEY_REQUIRED", 422);
  const id = hash(`${uid}\0${bookingId}\0stay-change\0${key}`),
    payloadHash = hash(input);
  return todayTransaction(async (tx, changed) => {
    const ref = adminDb.collection("bookings").doc(bookingId),
      b = (await tx.get(ref)).data();
    if (!b || b.propertyId !== review.propertyId)
      throw new ApiException("NOT_FOUND", 404);
    const currentAccess = await operationalAccess(
      uid,
      b.propertyId,
      actionPermission[review.input.action],
      tx,
    );
    const receiptRef = ref.collection("stayChangeRequests").doc(id),
      receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      if (receipt.get("payloadHash") !== payloadHash)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      changed(b.propertyId);
      const result = { ...receipt.get("result") };
      if (!currentAccess.permissions.includes("payment.read")) {
        delete result.adjustmentPaise;
        delete result.balanceDuePaise;
        delete result.refundableExcessPaise;
      }
      return result;
    }
    if (review.expiresAt < Date.now())
      conflict(
        "PREVIEW_EXPIRED",
        "This review expired. Review the current stay again.",
      );
    const r = await evaluate(tx, uid, bookingId, review.input, id);
    if (r.fingerprint !== review.fingerprint)
      conflict(
        "STAY_REVIEW_CHANGED",
        "The reservation, price, financial records or room availability changed. Review again before confirming.",
      );
    // All reads have completed. Inventory, folio, history, projections and receipt commit together.
    const inventoryWrites = new Map<
      string,
      {
        type: string;
        date: string;
        reserved: Record<string, FirebaseFirestore.FieldValue>;
      }
    >();
    for (const k of r.typeKeys) {
      const delta = (r.newCounts.get(k) ?? 0) - (r.oldCounts.get(k) ?? 0);
      if (!delta) continue;
      const [type, date, slot] = k.split("/"),
        path = calendarRef(b.propertyId, type, date).path;
      const row = inventoryWrites.get(path) ?? { type, date, reserved: {} };
      row.reserved[slot] = FieldValue.increment(delta);
      inventoryWrites.set(path, row);
    }
    for (const row of inventoryWrites.values())
      tx.set(
        calendarRef(b.propertyId, row.type, row.date),
        {
          propertyId: b.propertyId,
          roomTypeId: row.type,
          date: row.date,
          reserved: row.reserved,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    const physical = new Map<
      string,
      { unitId: string; date: string; slots: Record<string, string> }
    >();
    for (const k of r.unitKeys) {
      if (r.oldPhysical.has(k) === r.newPhysical.has(k)) continue;
      const [unitId, date, slot] = k.split("/"),
        path = unitCalendar(unitId, date).path;
      const row = physical.get(path) ?? {
        unitId,
        date,
        slots: { ...r.calendars.get(path)!.slots },
      };
      if (r.newPhysical.has(k)) row.slots[slot] = bookingId;
      else if (row.slots[slot] === bookingId) delete row.slots[slot];
      physical.set(path, row);
    }
    for (const row of physical.values())
      tx.set(unitCalendar(row.unitId, row.date), {
        ...row,
        propertyId: b.propertyId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    if (r.moving) {
      const oldUnit = adminDb.collection("physicalUnits").doc(b.physicalUnitId);
      tx.update(oldUnit, {
        housekeepingStatus: "dirty",
        housekeepingNote: "Guest moved room",
        housekeepingUpdatedBy: uid,
        housekeepingUpdatedAt: FieldValue.serverTimestamp(),
        assignmentRevision: FieldValue.increment(1),
        revision: FieldValue.increment(1),
      });
      tx.create(oldUnit.collection("events").doc(id), {
        type: "housekeeping",
        status: "dirty",
        bookingId,
        stayChangeId: id,
        actorId: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(r.unitRef, { assignmentRevision: FieldValue.increment(1) });
    for (const { id: entryId, ...entry } of r.additions)
      tx.create(ref.collection("billingEntries").doc(entryId), {
        ...entry,
        reason: input.reason,
        createdAt: FieldValue.serverTimestamp(),
      });
    tx.update(r.holdRef, {
      originalAllocationEvidence: r.hold.originalAllocationEvidence ?? {
        roomTypeId: r.hold.roomTypeId,
        allocations: r.hold.allocations,
      },
      roomTypeId: r.patch.roomType.id,
      allocations: r.patch.physicalAllocations,
      assignmentSegments: r.segments,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      ...r.patch,
      originalStay: b.originalStay ?? {
        roomType: b.roomType,
        physicalUnitId: b.physicalUnitId,
        physicalUnitLabel: b.physicalUnitLabel ?? null,
        startAt: b.startAt,
        endAt: b.endAt,
        inventoryEndAt: b.inventoryEndAt,
        checkOut: b.checkOut,
      },
      reservationRevision: (b.reservationRevision ?? 0) + 1,
      stayRevision: (b.stayRevision ?? 0) + 1,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("events").doc(id), {
      type: `stay_${review.input.action}`,
      stayChangeId: id,
      actorId: uid,
      reason: input.reason,
      ...r.summary,
      createdAt: FieldValue.serverTimestamp(),
    });
    const result = { id, ...r.summary };
    tx.create(receiptRef, {
      payloadHash,
      result,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    changed(b.propertyId);
    return result;
  });
}

/** Advisory choices reserve nothing; the selected command is always evaluated again. */
export async function stayChangeChoices(uid: string, bookingId: string) {
  return adminDb.runTransaction(async (tx) => {
    const b = (
      await tx.get(adminDb.collection("bookings").doc(bookingId))
    ).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    const access = await operationalAccess(
      uid,
      b.propertyId,
      "reservation.read",
      tx,
    );
    const { features } = await import("./access");
    const capabilities = Object.fromEntries(
      Object.entries(actionPermission).map(([action, permission]) => [
        action,
        features().stayChanges &&
          features().allocation &&
          b.bookingStatus === "checked_in" &&
          access.permissions.includes(permission),
      ]),
    );
    if (!Object.values(capabilities).some(Boolean))
      return {
        capabilities,
        units: [],
        rates: [],
        history: [],
        original: null,
        timezone: b.timezone,
        bookingMode: b.bookingMode,
        departure: b.endAt,
      };
    const [units, rates] = await Promise.all([
      tx.get(
        adminDb
          .collection("physicalUnits")
          .where("propertyId", "==", b.propertyId),
      ),
      tx.get(
        adminDb
          .collection("ratePlans")
          .where("propertyId", "==", b.propertyId)
          .where("status", "==", "active"),
      ),
    ]);
    const sources = access.permissions.includes("billing.adjust")
      ? await readBillingSources(tx, bookingId)
      : null;
    const choices = await Promise.all(
      units.docs
        .filter((d) => d.id !== b.physicalUnitId)
        .map(async (d) => {
          const v = d.data(),
            action = v.roomTypeId === b.roomType?.id ? "move" : "category";
          if (!capabilities[action]) return null;
          try {
            await evaluate(
              tx,
              uid,
              bookingId,
              action === "move"
                ? { action, unitId: d.id }
                : {
                    action,
                    unitId: d.id,
                    settlement: "complimentary",
                    adjustmentPaise: 0,
                  },
              "preview",
            );
            return {
              id: d.id,
              label: v.label,
              roomTypeId: v.roomTypeId,
              condition: v.housekeepingStatus || "unknown",
              action,
              eligible: true,
              blocker: null,
            };
          } catch (error) {
            if (!(error instanceof ApiException)) throw error;
            return {
              id: d.id,
              label: v.label,
              roomTypeId: v.roomTypeId,
              condition: v.housekeepingStatus || "unknown",
              action,
              eligible: false,
              blocker: error.message,
            };
          }
        }),
    );
    return {
      reductionSources: sources
        ? documentSources(b, sources.entries).filter(
            (s) =>
              s.amountPaise > 0 &&
              (s.id === "booking" ||
                sources.entries.some(
                  (e) => `entry:${e.id}` === s.id && e.stayChangeId,
                )),
          )
        : [],
      capabilities,
      units: choices.filter((v) => v !== null),
      rates: rates.docs.map((d) => ({
        id: d.id,
        name: d.get("name"),
        roomTypeId: d.get("roomTypeId"),
      })),
      history: (b.assignmentSegments ?? []).map((s: AssignmentSegment) => ({
        id: s.id,
        changeId: s.changeId,
        room: s.unitLabel,
        category: s.roomTypeName,
        startAt: s.startAt,
        endAt: s.endAt,
      })),
      original: b.originalStay
        ? {
            category: b.originalStay.roomType.name,
            room: b.originalStay.physicalUnitLabel,
            departure: b.originalStay.endAt,
          }
        : null,
      currentRoomTypeId: b.roomType?.id,
      timezone: b.timezone,
      bookingMode: b.bookingMode || "overnight",
      departure: b.endAt,
    };
  });
}
