import { billableUnits } from "@/lib/stay/pricing";
import { includedOffering } from "@/lib/stay/inclusions";
import { extraTotals } from "@/lib/stay/domain";
import { supplementalFinancials } from "@/lib/stay/agreements";
import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { allocateIntervals } from "../domain";
import { amendmentRateAvailable, priceAmendment } from "./pricing";
import { calendarRef, hasCapacity } from "../inventory";
import { amenitySnapshotFor } from "@/lib/bookings";
import {
  acceptPrice,
  allocationDifference,
  breakdown,
  cancellationDeadline,
  guestPatch,
  requiredAdvance,
  validateOccupants,
  type EditPolicy,
  type Proposal,
} from "./domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";

export const digest = (v: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(v, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
      ),
    )
    .digest("hex");
export function fail(code: string, message = code): never {
  throw new ApiException(
    code,
    code === "NOT_FOUND"
      ? 404
      : code === "IDEMPOTENCY_KEY_REQUIRED"
        ? 422
        : code.endsWith("NOT_CONFIGURED")
          ? 503
          : 409,
    message,
  );
}
export function serviceVersion(r: RecordData) {
  return digest(r);
}
export function stayFingerprint(p: Proposal) {
  return digest({
    roomTypeId: p.roomTypeId,
    ratePlanId: p.ratePlanId,
    checkIn: p.checkIn,
    checkOut: p.checkOut ?? null,
    arrivalTime: p.arrivalTime ?? null,
    durationMinutes: p.durationMinutes ?? null,
    adults: p.adults,
    children: p.children,
    infants: p.infants,
    occupants: p.occupants,
  });
}
export type ServiceImpact = {
  id: string;
  name: string;
  reasons: string[];
  approved: boolean;
};
/** Read-only preparation: callers complete every read before applying returned writes. */
export async function prepareProposal(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  b: RecordData,
  input: Proposal,
  reserved: RecordData | null = null,
  fixed?: RecordData,
) {
  validateOccupants(input);
  if (
    extraTotals(0, 0, "pay_at_property", b.customizations ?? [])
      .extrasTotalPaise !== (b.extrasTotalPaise ?? 0)
  )
    fail("FINANCIAL_EVIDENCE_INCOMPLETE");
  const policy = b.editPolicy as EditPolicy;
  if (input.roomTypeId === b.roomType.id && input.ratePlanId !== b.ratePlan.id)
    fail("PACKAGE_ASSISTANCE_REQUIRED");
  if (
    ![policy.originalRatePlanId, ...policy.equivalentRatePlanIds].includes(
      input.ratePlanId,
    )
  )
    fail("PACKAGE_ASSISTANCE_REQUIRED");
  const [pd, rd, rateDoc, hd, receipts, refunds, collections, approvals] =
    await Promise.all([
      tx.get(adminDb.collection("properties").doc(b.propertyId)),
      tx.get(adminDb.collection("roomTypes").doc(input.roomTypeId)),
      tx.get(adminDb.collection("ratePlans").doc(input.ratePlanId)),
      tx.get(adminDb.collection("inventoryHolds").doc(bookingId)),
      tx.get(
        adminDb
          .collection("paymentAttempts")
          .where("bookingId", "==", bookingId),
      ),
      tx.get(adminDb.collection("refunds").where("bookingId", "==", bookingId)),
      tx.get(
        adminDb
          .collection("propertyPayments")
          .where("bookingId", "==", bookingId),
      ),
      tx.get(
        adminDb
          .collection("bookings")
          .doc(bookingId)
          .collection("serviceMoveApprovals"),
      ),
    ]);
  const property = pd.data() ?? {},
    room = rd.data() ?? {},
    rate = rateDoc.data() ?? {},
    hold = hd.data();
  if (
    !amendmentRateAvailable(b, property, room, rate, input.roomTypeId) ||
    property.status !== "active" ||
    property.approvalStatus !== "approved" ||
    !property.isBookable ||
    property.marketplaceOwnerPaused
  )
    fail("RATE_NOT_AVAILABLE");
  if (
    !hold ||
    !["held", "committed"].includes(hold.status) ||
    !Array.isArray(hold.allocations)
  )
    fail("INVENTORY_ALLOCATION_MISSING");
  const evaluated = await priceAmendment(
    tx,
    b.propertyId,
    input.ratePlanId,
    { ...input, bookingMode: b.bookingMode },
    {
      ...property,
      timezone: b.timezone,
      ...(fixed
        ? {
            checkInTime: fixed.patch.arrivalTime,
            checkOutTime: fixed.patch.departureTime,
          }
        : {}),
    },
    {
      ...room,
      ...(fixed
        ? { cleaningBufferMinutes: fixed.patch.cleaningBufferMinutes }
        : {}),
    },
    {
      ...rate,
      paymentMode: policy.paymentMode,
      depositBasisPoints: policy.depositBasisPoints,
    },
  );
  const published = breakdown(evaluated);
  const price = fixed
    ? {
        accepted: fixed.accepted,
        retainedDifferencePaise: fixed.retainedDifferencePaise,
      }
    : acceptPrice(published, policy.accepted);
  const currentAmenities = await amenitySnapshotFor(
    property,
    room,
    rate,
    (ref) => tx.get(ref),
  );
  const amenities = fixed?.patch.amenitySnapshot ?? currentAmenities;
  const cancellationDoc = rate.cancellationPolicyId
    ? await tx.get(
        adminDb
          .collection("cancellationPolicies")
          .doc(rate.cancellationPolicyId),
      )
    : null;
  const cancellation = cancellationDoc?.data() ?? null;
  if (
    rate.cancellationPolicyId &&
    (!cancellation ||
      cancellation.propertyId !== b.propertyId ||
      cancellation.status !== "active")
  )
    fail("RATE_NOT_AVAILABLE");
  const terms = cancellationDeadline(
    policy,
    evaluated.startAt,
    b.cancellationPolicy ?? null,
    Date.now(),
  );
  const fingerprint = stayFingerprint(input);
  const serviceImpacts: ServiceImpact[] = [];
  const customizations: RecordData[] = [];
  const active = (b.customizations ?? []) as RecordData[];
  const offeringIds = [
    ...new Set(
      active
        .filter(
          (r) => !["cancelled", "declined", "fulfilled"].includes(r.status),
        )
        .map((r) => r.offeringId)
        .filter(Boolean),
    ),
  ] as string[];
  const catalogDocs = await Promise.all(
    offeringIds.map((id) =>
      tx.get(pd.ref.collection("stayCustomizations").doc(id)),
    ),
  );
  const catalog = new Map(catalogDocs.map((d) => [d.id, d.data()]));
  const refundPending = (r: RecordData) =>
    r.quote?.paymentStatus === "refund_pending" ||
    (b.stayPaymentReceipts ?? []).some(
      (receipt: RecordData) =>
        receipt.requestId === r.id && receipt.status === "refund_pending",
    ) ||
    refunds.docs.some(
      (d) =>
        d.get("stayQuote") &&
        d.get("status") !== "processed" &&
        (d.get("allocationId") === r.id ||
          (r.quote?.paymentId && d.get("paymentId") === r.quote.paymentId)),
    );
  for (const r of active) {
    if (["cancelled", "declined", "fulfilled"].includes(r.status)) {
      if (refundPending(r))
        serviceImpacts.push({
          id: r.id,
          name: r.name,
          reasons: ["Service refund is being reconciled"],
          approved: false,
        });
      customizations.push(r);
      continue;
    }
    const changedTime =
      evaluated.startAt !== b.startAt || evaluated.endAt !== b.endAt;
    const changedRoom = input.roomTypeId !== b.roomType.id;
    const changedPeople =
      input.adults !== b.adults ||
      input.children !== b.children ||
      input.infants !== (b.infants ?? 0) ||
      digest(input.occupants) !== digest(b.occupants ?? []);
    const o = catalog.get(r.offeringId);
    const reasons: string[] = [];
    const serviceStart = r.inputs?.serviceAt
      ? Date.parse(r.inputs.serviceAt)
      : null;
    const serviceStillFits =
      serviceStart !== null &&
      serviceStart >= Date.parse(evaluated.startAt) &&
      serviceStart < Date.parse(evaluated.endAt) &&
      serviceStart + (r.inputs?.hours ?? 0) * 3600000 <=
        Date.parse(evaluated.endAt);
    const scheduleChanges =
      changedTime &&
      (serviceStart === null
        ? evaluated.startAt !== b.startAt
        : !serviceStillFits);
    if (scheduleChanges) reasons.push("Service schedule or duration changes");
    if (changedTime || changedPeople) {
      try {
        const before =
          r.billableQuantity ??
          billableUnits({ pricingUnit: r.pricingUnit }, r.quantity, r.inputs, {
            startAt: b.startAt,
            endAt: b.endAt,
            nights: b.nights,
            adults: b.adults,
            children: b.children,
          });
        const after = billableUnits(
          { pricingUnit: r.pricingUnit },
          r.quantity,
          r.inputs,
          {
            startAt: evaluated.startAt,
            endAt: evaluated.endAt,
            nights: evaluated.nights,
            adults: input.adults,
            children: input.children,
          },
        );
        if (before !== after)
          reasons.push("Service quantity or duration needs fresh agreement");
      } catch {
        reasons.push("Service time does not fit the proposed stay");
      }
    }
    const shiftedServiceAt = r.inputs?.serviceAt
      ? new Date(
          Date.parse(r.inputs.serviceAt) +
            Date.parse(evaluated.startAt) -
            Date.parse(b.startAt),
        ).toISOString()
      : null;
    if (
      scheduleChanges &&
      shiftedServiceAt &&
      (Date.parse(shiftedServiceAt) < Date.parse(evaluated.startAt) ||
        Date.parse(shiftedServiceAt) + (r.inputs?.hours ?? 0) * 3600000 >
          Date.parse(evaluated.endAt))
    )
      reasons.push("Service time does not fit the proposed stay");
    if (
      changedRoom &&
      (!o ||
        (o.roomTypeIds?.length && !o.roomTypeIds.includes(input.roomTypeId)))
    )
      reasons.push("Room eligibility needs hotel review");
    if (
      changedPeople &&
      (r.pricingUnit === "person" || r.inputs?.people || o?.peopleRequired)
    )
      reasons.push("Service occupants or quantity changes");
    const codes = (snapshot: RecordData) =>
      [
        ...(snapshot.roomAmenities ?? []),
        ...(snapshot.propertyAmenities ?? []),
        ...(snapshot.rateInclusions ?? []),
      ].map((a) => a.code);
    if (
      changedRoom &&
      o &&
      includedOffering(
        o as import("@/lib/stay/contracts").OfferingInput,
        codes(amenities),
      ) !==
        includedOffering(
          o as import("@/lib/stay/contracts").OfferingInput,
          codes(b.amenitySnapshot ?? {}),
        )
    )
      reasons.push("Package inclusion needs hotel review");
    if (reasons.length && Date.parse(r.deadlineAt) <= Date.now())
      reasons.push("Service deadline has passed");
    if (
      reasons.length > 0 &&
      (r.preparationStarted || ["preparing", "ready"].includes(r.status))
    )
      reasons.push("Preparation has started");
    const financialPending = refundPending(r);
    if (financialPending) reasons.push("Service refund is being reconciled");
    const approval = approvals.docs.find(
      (d) =>
        d.get("requestId") === r.id &&
        d.get("proposalFingerprint") === fingerprint &&
        d.get("serviceVersion") === serviceVersion(r),
    );
    const movable =
      !financialPending &&
      !r.preparationStarted &&
      !["preparing", "ready"].includes(r.status) &&
      !reasons.some((s) =>
        /occupants|inclusion|eligibility|fresh agreement|deadline|does not fit/.test(
          s,
        ),
      );
    const approved = Boolean(approval && movable);
    if (reasons.length)
      serviceImpacts.push({ id: r.id, name: r.name, reasons, approved });
    customizations.push(
      approved
        ? {
            ...r,
            ...(shiftedServiceAt
              ? { inputs: { ...r.inputs, serviceAt: shiftedServiceAt } }
              : {}),
            amendmentSchedule: {
              startAt: evaluated.startAt,
              endAt: evaluated.endAt,
              proposalFingerprint: fingerprint,
            },
            deadlineAt: new Date(
              Math.min(Date.parse(r.deadlineAt), Date.parse(evaluated.startAt)),
            ).toISOString(),
          }
        : r,
    );
  }
  const original = hold.allocations;
  const proposed = allocateIntervals(
    evaluated.startAt,
    evaluated.inventoryEndAt,
    evaluated.timezone,
  );
  const additional = allocationDifference(
    proposed,
    original,
    hold.roomTypeId === input.roomTypeId,
  );
  const owned = reserved?.inventoryReserved
    ? (reserved.additionalAllocations ?? [])
    : [];
  const additionalDocs = additional.length
    ? await tx.getAll(
        ...additional.map((a) =>
          calendarRef(b.propertyId, input.roomTypeId, a.date),
        ),
      )
    : [];
  const calendars = additionalDocs.map((d, i) => {
    const data = d.data() ?? {},
      counts = { ...data.reserved };
    for (const a of owned)
      if (a.date === additional[i].date)
        for (const key of a.intervals) counts[key] = (counts[key] ?? 0) - 1;
    return { ...data, reserved: counts };
  });
  if (!hasCapacity(additional, calendars, room.totalInventory))
    fail("SOLD_OUT_FOR_DATES");
  const originalDocs = original.length
    ? await tx.getAll(
        ...original.map((a: { date: string }) =>
          calendarRef(b.propertyId, hold.roomTypeId, a.date),
        ),
      )
    : [];
  if (
    original.some((a: { intervals: string[] }, i: number) =>
      a.intervals.some((k) => (originalDocs[i].get("reserved")?.[k] ?? 0) < 1),
    )
  )
    fail("INVENTORY_DRIFT");
  const servicePaymentIds = new Set(
    (b.stayPaymentReceipts ?? []).map((r: RecordData) => r.paymentId),
  );
  let credit = 0,
    initialServicesPaidPaise = 0;
  const capturesGross = receipts.docs
    .filter(
      (d) =>
        !d.get("stayQuote") &&
        ["captured", "refund_pending", "refunded"].includes(d.get("status")),
    )
    .reduce((n, d) => {
      const value = d.get("amountPaise");
      if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        d.get("currency") !== b.currency
      )
        fail("FINANCIAL_EVIDENCE_INCOMPLETE");
      return n + value;
    }, 0);
  const propertyGross = collections.docs
    .filter(
      (d) =>
        !d.get("stayQuote") && !d.get("requestId") && !d.get("allocationId"),
    )
    .reduce(
      (n, d) =>
        n +
        (d.get("type") === "collection"
          ? d.get("amountPaise")
          : d.get("type") === "reversal"
            ? -d.get("amountPaise")
            : 0),
      0,
    );
  if (capturesGross + propertyGross !== (b.paidPaise ?? 0))
    fail("FINANCIAL_EVIDENCE_INCOMPLETE");
  for (const d of receipts.docs) {
    const r = d.data();
    if (
      r.stayQuote ||
      servicePaymentIds.has(r.paymentId) ||
      r.unusable ||
      !["captured", "refund_pending", "refunded"].includes(r.status)
    )
      continue;
    const reservedRefund = refunds.docs
      .filter(
        (f) =>
          f.get("paymentId") === r.paymentId && f.get("status") !== "failed",
      )
      .reduce((n, f) => n + f.get("amountPaise"), 0);
    const services = r.serviceAmountPaise ?? 0;
    if (
      !Number.isSafeInteger(services) ||
      services < 0 ||
      services > r.amountPaise ||
      (services > 0 && reservedRefund > 0)
    )
      fail("FINANCIAL_EVIDENCE_INCOMPLETE");
    initialServicesPaidPaise += services;
    credit += Math.max(0, r.amountPaise - services - reservedRefund);
  }
  for (const d of collections.docs) {
    const r = d.data();
    if (r.stayQuote || r.requestId || r.allocationId) continue;
    if (!Number.isSafeInteger(r.amountPaise) || r.amountPaise < 0)
      fail("FINANCIAL_EVIDENCE_INCOMPLETE");
    if (
      (b.extrasTotalPaise ?? 0) > 0 &&
      r.accommodationAmountPaise === undefined
    )
      fail("FINANCIAL_EVIDENCE_INCOMPLETE");
    const accommodation = r.accommodationAmountPaise ?? r.amountPaise;
    if (
      !Number.isSafeInteger(accommodation) ||
      accommodation < 0 ||
      accommodation > r.amountPaise
    )
      fail("FINANCIAL_EVIDENCE_INCOMPLETE");
    if (r.type === "collection")
      initialServicesPaidPaise += r.amountPaise - accommodation;
    credit +=
      r.type === "collection"
        ? accommodation
        : ["refund", "reversal"].includes(r.type)
          ? -accommodation
          : 0;
  }
  credit = Math.max(0, credit);
  const requiredAdvancePaise = requiredAdvance(
    price.accepted.totalPaise,
    policy,
  );
  const amountToCollectPaise = Math.max(0, requiredAdvancePaise - credit);
  const extras = b.extrasTotalPaise ?? 0;
  const services = supplementalFinancials(
    b.customizations ?? [],
    b.stayPaymentReceipts,
  );
  const serviceBalances = {
    paidPaise: initialServicesPaidPaise + services.paidPaise,
    awaitingPaymentPaise:
      Math.max(
        0,
        extras - (b.customizationCreditPaise ?? 0) - initialServicesPaidPaise,
      ) + services.awaitingPaymentPaise,
    refundDuePaise: services.refundDuePaise,
    refundedPaise: services.refundedPaise,
  };
  const patch = {
    ...evaluated,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    unitPricePaise: fixed?.patch.unitPricePaise ?? evaluated.unitPricePaise,
    accommodationPricing: {
      published: fixed?.published ?? published,
      accepted: price.accepted,
      retainedDifferencePaise: price.retainedDifferencePaise,
    },
    dates: Array.from({ length: evaluated.nights }, (_, i) =>
      new Date(Date.parse(`${evaluated.checkIn}T12:00Z`) + i * 86400000)
        .toISOString()
        .slice(0, 10),
    ),
    ...price.accepted,
    ...guestPatch(b, input),
    roomType: {
      id: input.roomTypeId,
      name: fixed?.patch.roomType.name ?? room.name,
    },
    ratePlan: {
      id: input.ratePlanId,
      name: fixed?.patch.ratePlan.name ?? rate.name,
      paymentMode: policy.paymentMode,
      depositBasisPoints: policy.depositBasisPoints,
    },
    roomTotalPaise: price.accepted.totalPaise,
    totalPaise: price.accepted.totalPaise + extras,
    extrasTotalPaise: extras,
    payableNowPaise:
      requiredAdvancePaise +
      (policy.paymentMode === "pay_at_property" ? 0 : extras),
    balanceDuePaise: Math.max(0, price.accepted.totalPaise - credit),
    amenitySnapshot: amenities,
    breakfastIncluded: fixed
      ? fixed.patch.breakfastIncluded
      : rate.breakfastIncluded === true,
    customizations,
    cancellationPolicy: b.cancellationPolicy ?? null,
    cancellationPolicyId: b.cancellationPolicyId ?? null,
    editPolicy: { ...policy, ...terms, accepted: price.accepted },
    preCheckin: {
      status: "incomplete",
      expectedArrivalAt: null,
      guestsConfirmedAt: null,
      submittedAt: null,
      draft: null,
      notes: b.preCheckin?.notes ?? "",
    },
  };
  return {
    patch,
    proposedAllocations: proposed,
    additionalAllocations: additional,
    originalAllocations: original,
    originalRoomTypeId: hold.roomTypeId,
    published: fixed?.published ?? published,
    accepted: price.accepted,
    retainedDifferencePaise: price.retainedDifferencePaise,
    creditPaise: credit,
    requiredAdvancePaise,
    amountToCollectPaise,
    hotelBalancePaise: Math.max(
      0,
      price.accepted.totalPaise - Math.max(credit, requiredAdvancePaise),
    ),
    serviceImpacts,
    serviceBalances,
    proposalFingerprint: fingerprint,
    currency: b.currency,
    hotelReservationsPhone: property.customerEditing?.reservationsPhone ?? null,
    priceFingerprint: digest({
      evaluated,
      published,
      amenities,
      rate: {
        name: rate.name,
        breakfastIncluded: fixed
          ? fixed.patch.breakfastIncluded
          : rate.breakfastIncluded === true,
      },
      cancellation: b.cancellationPolicy ?? null,
    }),
  };
}
