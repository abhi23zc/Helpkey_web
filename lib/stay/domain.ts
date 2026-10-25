import { variantPrice } from "./pricing";
import { cancellationRefund } from "@/lib/booking/domain";
import type {
  Offering,
  Selection,
  StayRequest,
  RequestStatus,
} from "./contracts";

export class StaySelectionError extends Error {}

export const emptyPreCheckin = () => ({
  status: "incomplete" as const,
  expectedArrivalAt: null,
  notes: "",
  submittedAt: null,
});
export function offeringUnavailableReason(
  offering: Offering,
  roomTypeId: string,
  mode: string,
  startAt: string,
  now = Date.now(),
): "paused" | "room" | "mode" | "deadline" | null {
  if (offering.status !== "active") return "paused";
  if (offering.roomTypeIds.length && !offering.roomTypeIds.includes(roomTypeId))
    return "room";
  if (!offering.bookingModes.includes(mode as "hourly" | "overnight"))
    return "mode";
  if (!(now < Date.parse(startAt) - offering.advanceNoticeMinutes * 60000))
    return "deadline";
  return null;
}
export function eligibleOffering(
  offering: Offering,
  roomTypeId: string,
  mode: string,
  startAt: string,
  now = Date.now(),
) {
  return (
    offeringUnavailableReason(offering, roomTypeId, mode, startAt, now) === null
  );
}
export function selectedRequests(
  offerings: Offering[],
  selections: Selection[],
  roomTypeId: string,
  mode: string,
  startAt: string,
  cancellationPolicy: unknown,
  now = Date.now(),
): StayRequest[] {
  const quantities = new Map<string, number>();
  return [...selections]
    .sort(
      (a, b) =>
        a.offeringId.localeCompare(b.offeringId) ||
        String(a.variantId).localeCompare(String(b.variantId)),
    )
    .map((s) => {
      const o = offerings.find((o) => o.id === s.offeringId);
      if (!o || !eligibleOffering(o, roomTypeId, mode, startAt, now))
        throw new StaySelectionError(
          "This customization is no longer available. Review your selections.",
        );
      const variant = o.variants.find((v) => v.id === s.variantId);
      if (
        (o.variants.length && !variant) ||
        (!o.variants.length && s.variantId)
      )
        throw new StaySelectionError("Choose a valid customization option.");
      const quantity = (quantities.get(o.id) ?? 0) + s.quantity;
      quantities.set(o.id, quantity);
      if (quantity > o.maxQuantity)
        throw new StaySelectionError(
          `Choose at most ${o.maxQuantity} for ${o.name}.`,
        );
      return {
        id: JSON.stringify([o.id, s.variantId]),
        offeringId: o.id,
        offeringVersion: o.version,
        name: o.name,
        description: o.description,
        kind: o.kind,
        variantId: s.variantId,
        variantName: variant?.name ?? null,
        quantity: s.quantity,
        unitPricePaise: variantPrice(o, s.variantId),
        totalPaise: variantPrice(o, s.variantId) * s.quantity,
        maxQuantity: o.maxQuantity,
        confirmation: o.confirmation,
        deadlineAt: new Date(
          Date.parse(startAt) - o.advanceNoticeMinutes * 60000,
        ).toISOString(),
        cancellationPolicy,
        status: o.confirmation === "immediate" ? "confirmed" : "requested",
        preparationStarted: false,
        response: null,
        updatedAt: new Date(now).toISOString(),
      };
    });
}
// Exclude response timestamps from price/terms fingerprints.
export function agreedRequests(requests: StayRequest[]) {
  return requests.map((r) =>
    Object.fromEntries(
      Object.entries(r).filter(
        ([key]) =>
          !["updatedAt", "response", "status", "preparationStarted"].includes(
            key,
          ),
      ),
    ),
  );
}
export function extraTotals(
  roomTotalPaise: number,
  roomPayableNowPaise: number,
  paymentMode: string,
  requests: StayRequest[],
) {
  const extrasTotalPaise = requests.reduce((sum, r) => sum + r.totalPaise, 0);
  const totalPaise = roomTotalPaise + extrasTotalPaise;
  const payableNowPaise =
    paymentMode === "pay_at_property"
      ? 0
      : roomPayableNowPaise + extrasTotalPaise;
  return {
    roomTotalPaise,
    extrasTotalPaise,
    totalPaise,
    payableNowPaise,
    balanceDuePaise: totalPaise - payableNowPaise,
  };
}
export function canEditRequest(request: StayRequest, now = Date.now()) {
  return (
    request.unitPricePaise === 0 &&
    !request.preparationStarted &&
    ["requested", "confirmed"].includes(request.status) &&
    now < Date.parse(request.deadlineAt)
  );
}
export function assertRequestTransition(
  current: RequestStatus,
  next: RequestStatus,
) {
  const allowed: Partial<Record<RequestStatus, RequestStatus[]>> = {
    requested: ["confirmed", "declined"],
    confirmed: ["preparing"],
    preparing: ["ready"],
    ready: ["fulfilled"],
  };
  if (!allowed[current]?.includes(next))
    throw new StaySelectionError(
      "This request has changed. Refresh before updating it.",
    );
}
export function stayFinancials(data: {
  totalPaise?: number;
  paidPaise?: number;
  refundedPaise?: number;
  refundDuePaise?: number;
  customizationCreditPaise?: number;
  bookingStatus?: string;
}) {
  const effectiveTotalPaise = Math.max(
    0,
    (data.totalPaise ?? 0) - (data.customizationCreditPaise ?? 0),
  );
  const netPaidPaise = Math.max(
    0,
    (data.paidPaise ?? 0) -
      (data.refundedPaise ?? 0) -
      (data.refundDuePaise ?? 0),
  );
  return {
    effectiveTotalPaise,
    netPaidPaise,
    balanceDuePaise: [
      "cancelled",
      "expired",
      "payment_failed",
      "no_show",
    ].includes(data.bookingStatus ?? "")
      ? 0
      : Math.max(0, effectiveTotalPaise - netPaidPaise),
  };
}

export function cancelOutstandingRequests(
  requests: StayRequest[],
  now = Date.now(),
) {
  return requests.map((r) =>
    ["fulfilled", "declined", "cancelled"].includes(r.status)
      ? r
      : {
          ...r,
          status: "cancelled" as const,
          updatedAt: new Date(now).toISOString(),
        },
  );
}

/** Remove declined extras before applying the room policy; reserve refunds once. */
export function remainingCancellationRefund(
  data: {
    paidPaise?: number;
    refundedPaise?: number;
    refundDuePaise?: number;
    customizationCreditPaise?: number;
    totalPaise?: number;
    startAt?: string;
    checkIn: string;
    cancellationPolicy?: Parameters<typeof cancellationRefund>[3];
  },
  now: number,
  partnerCaused: boolean,
) {
  const credit = data.customizationCreditPaise ?? 0;
  return cancellationRefund(
    Math.max(0, (data.paidPaise ?? 0) - credit),
    Math.max(
      0,
      (data.refundedPaise ?? 0) + (data.refundDuePaise ?? 0) - credit,
    ),
    data.startAt ?? `${data.checkIn}T00:00:00Z`,
    data.cancellationPolicy ?? null,
    now,
    partnerCaused,
    Math.max(0, (data.totalPaise ?? data.paidPaise ?? 0) - credit),
  );
}
