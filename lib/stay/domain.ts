import { resolveResponse, responseLimit, needsResponseText } from "./response";
import { includedOffering } from "./inclusions";
import { billableUnits, type PricingContext, variantPrice } from "./pricing";
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
/** Validate edited details against the rules agreed when the request was created. */
export function validateResponseInputs(o: { name: string } & import("./contracts").RequestRules, inputs: import("./contracts").Selection["inputs"], startAt: string, now: number, context?: PricingContext) {
      if ((o.noteRequired || o.responseConfig?.responseType === "text") && !inputs?.note?.trim())
        throw new StaySelectionError(
          `Provide ${o.noteLabel || "a note"} for ${o.name}.`,
        );
      if (
        (o.timeRequired || o.formType === "scheduled") &&
        !inputs?.serviceAt
      )
        throw new StaySelectionError(`Choose when you need ${o.name}.`);
      if (o.peopleRequired && !inputs?.people)
        throw new StaySelectionError("Choose the number of people.");
      if (
        inputs?.serviceAt &&
        (!context ||
          Date.parse(inputs.serviceAt) < Math.max(now, Date.parse(startAt)) ||
          Date.parse(inputs.serviceAt) >= Date.parse(context.endAt))
      )
        throw new StaySelectionError(
          "Choose an upcoming service time within your booked stay.",
        );
      const groups = o.choiceGroups ?? [];
      if (
        Object.keys(inputs?.choices ?? {}).some(
          (key) => !groups.some((g) => g.id === key),
        )
      )
        throw new StaySelectionError("An option changed. Review your choices.");
      for (const g of groups) {
        const choice = inputs?.choices?.[g.id];
        if ((g.required && !choice) || (choice && !g.options.includes(choice)))
          throw new StaySelectionError(`Choose a valid ${g.name}.`);
      }
}
export function selectedRequests(
  offerings: Offering[],
  selections: Selection[],
  roomTypeId: string,
  mode: string,
  startAt: string,
  cancellationPolicy: unknown,
  now = Date.now(),
  context?: PricingContext,
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
      if (o.category === "pets" && context?.petsAllowed !== true)
        throw new StaySelectionError(
          "This property does not allow pet requests.",
        );
      if (includedOffering(o, context?.includedCodes ?? []))
        throw new StaySelectionError(
          `${o.name} is already included in your room or rate.`,
        );
      const variant = o.variants.find((v) => v.id === s.variantId);
      if (
        (o.variants.length && !variant) ||
        (!o.variants.length && s.variantId)
      )
        throw new StaySelectionError("Choose a valid customization option.");
      if (
        !resolveResponse(o).quantityEnabled &&
        s.quantity !== 1
      )
        throw new StaySelectionError("This request can only be selected once.");
      validateResponseInputs(o, s.inputs, startAt, now, context);
      const units = billableUnits(o, s.quantity, s.inputs, context);
      if (resolveResponse(o).responseType === "single" && quantities.has(o.id)) throw new StaySelectionError("Choose only one option for this offering.");
      const quantity = (quantities.get(o.id) ?? 0) + s.quantity;
      quantities.set(o.id, quantity);
      if (quantity > responseLimit(o))
        throw new StaySelectionError(
          `Choose at most ${o.maxQuantity} for ${o.name}.`,
        );
      return {
        requestRules: structuredClone(Object.fromEntries(Object.entries({ formType: o.formType, responseConfig: resolveResponse(o), maxQuantity: responseLimit(o), noteRequired: !!needsResponseText(o), noteLabel: o.noteLabel, peopleRequired: o.peopleRequired, timeRequired: o.timeRequired, choiceGroups: o.choiceGroups }).filter(([, value]) => value !== undefined)) as import("./contracts").RequestRules),
        agreementVersion: 2,
        source: "catalog",
        priceOnRequest: o.formType === "custom",
        pricingUnit: o.pricingUnit ?? "item",
        billableQuantity: units,
        inputs: s.inputs ?? {},
        choiceLabels: Object.fromEntries(
          (o.choiceGroups ?? []).map((g) => [g.id, g.name]),
        ),
        settlement:
          o.confirmation === "approval" || o.formType === "custom"
            ? "pending_hotel"
            : "included",
        id: JSON.stringify([o.id, s.variantId]),
        offeringId: o.id,
        offeringVersion: o.version,
        name: o.name,
        description: o.description,
        kind: o.kind,
        variantId: s.variantId,
        variantName: variant?.name ?? null,
        variantInclusions: variant?.inclusions ?? null,
        quantity: s.quantity,
        unitPricePaise: variantPrice(o, s.variantId),
        totalPaise: variantPrice(o, s.variantId) * units,
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
  const extrasTotalPaise = requests.reduce(
    (sum, r) =>
      sum +
      (r.agreementVersion === 2 && r.settlement !== "included"
        ? 0
        : r.totalPaise),
    0,
  );
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
    request.source !== "unlisted" &&
    !request.quote &&
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
          ...(r.quote && !r.quote.paymentId
            ? { quote: { ...r.quote, status: "withdrawn" as const } }
            : {}),
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
