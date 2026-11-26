import { serviceFinance, type ServiceAgreement } from "./services";
import {
  resolvePolicy,
  canonical,
  type Policy,
} from "@/lib/finance-settings/domain";
import {
  reconciliation,
  type BillingEntry,
} from "@/lib/partner/billing/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import { offeringCategory, type Offering } from "@/lib/stay/contracts";

export type FinanceSource = "marketplace" | "direct" | "walk_in" | "unknown";
export type Charge = {
  id: string;
  name: string;
  kind: "room" | "extra" | "guest_tax" | "customer_fee";
  amountPaise: number | null;
  preTaxPaise: number | null;
  category: string | null;
  owner: "hotel" | "pass_through" | "unresolved";
};
export type Agreement = {
  activeAccommodationAgreement?: Agreement;
  activeAccommodationRevision?: string;
  agreementVersion: 1;
  calculationVersion: 1;
  bookingId: string;
  propertyId: string;
  ownerId: string | null;
  source: FinanceSource;
  rawSource: string | null;
  reservationPurpose: string | null;
  globalRevision: number;
  hotelRevision: number;
  terms: ReturnType<typeof resolvePolicy>;
  calculatedAt: string;
  charges: Charge[];
  originalTotalPaise: number | null;
  expectedOnlinePaise: number | null;
  expectedHotelPaise: number | null;
  originalChargeState: string;
  commissionBasisPaise: number | null;
  commissionPaise: number | null;
  applicability: boolean | null;
  setupReasons: string[];
  excludedCharges: string[];
};
export type CheckoutProof = {
  bookingId: string;
  propertyId: string;
  actorId: string;
  agreementVersion: 1;
  calculationVersion: 1;
  originalChargeState: string;
  checkoutChargeState: string;
  validated: true;
};
export type Sources = {
  entries: BillingEntry[];
  property: RecordData[];
  online: RecordData[];
  refunds: RecordData[];
  events?: RecordData[];
  changes?: RecordData[];
  serviceAgreements?: ServiceAgreement[];
};
const money = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const safeSum = (values: (number | null)[]): number | null => {
  if (values.some((v) => v === null)) return null;
  const total = values.reduce<number>((n, v) => n + v!, 0);
  return money(total);
};
export function financeSource(b: RecordData): FinanceSource {
  if (b.source === "manual_partner")
    return b.reservationPurpose === "walk_in"
      ? "walk_in"
      : b.reservationPurpose === "reservation"
        ? "direct"
        : "unknown";
  return b.source === "marketplace" || !b.source ? "marketplace" : "unknown";
}
function originalExtras(b: RecordData): RecordData[] {
  return (b.customizations ?? []).filter(
    (r: RecordData) =>
      r.settlement === "included" || (r.agreementVersion !== 2 && !r.quote),
  );
}
/** Only charge-affecting facts; preparation, assignment and fulfilment do not amend a price. */
export function chargeState(b: RecordData): string {
  return canonical({
    propertyId: b.propertyId,
    source: b.source ?? null,
    purpose: b.reservationPurpose ?? null,
    room: b.roomType?.id ?? b.roomTypeId ?? null,
    rate: b.ratePlan?.id ?? b.ratePlanId ?? null,
    startAt: b.startAt ?? null,
    endAt: b.endAt ?? null,
    checkIn: b.checkIn ?? null,
    checkOut: b.checkOut ?? null,
    adults: b.adults ?? null,
    children: b.children ?? null,
    quantity: b.quantity ?? 1,
    total: b.totalPaise,
    subtotal: b.subtotalPaise,
    tax: b.taxPaise,
    fee: b.customerFeePaise,
    extrasTotal: b.extrasTotalPaise ?? 0,
    extras: originalExtras(b).map((r) => ({
      id: r.id,
      offeringId: r.offeringId,
      offeringVersion: r.offeringVersion,
      quantity: r.quantity,
      billableQuantity: r.billableQuantity,
      unitPricePaise: r.unitPricePaise,
      totalPaise: r.totalPaise,
      inactive: ["cancelled", "declined"].includes(r.status),
    })),
  });
}
/** Zero-price requests cannot amend the monetary room agreement. Preserve saved snapshots verbatim. */
export function sameRoomCharges(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    const normalize = (s: string) => {
      const v = JSON.parse(s);
      if (!Array.isArray(v.extras)) return null;
      return canonical({
        ...v,
        extras: v.extras.filter((r: RecordData) => r.totalPaise !== 0),
      });
    };
    const a = normalize(left),
      b = normalize(right);
    return a !== null && a === b;
  } catch {
    return false;
  }
}
export function captureAgreement(
  bookingId: string,
  b: RecordData,
  ownerId: string | null,
  offerings: Offering[],
  global: Policy,
  overrides: Policy,
  globalRevision: number,
  hotelRevision: number,
  now = new Date().toISOString(),
): Agreement {
  const terms = resolvePolicy(global, overrides),
    p = terms.effective,
    source = financeSource(b);
  const reasons: string[] = [],
    excluded: string[] = [];
  const charges: Charge[] = [
    {
      id: "room",
      name: "Original accommodation",
      kind: "room",
      amountPaise: money(b.subtotalPaise),
      preTaxPaise: money(b.subtotalPaise),
      category: null,
      owner: ownerId ? "hotel" : "unresolved",
    },
    ...originalExtras(b).map((r): Charge => {
      const o = offerings.find((o) => o.id === r.offeringId);
      const amount = money(r.totalPaise);
      // Catalog prices currently carry no explicit extra tax breakdown. Keep that unknown.
      const preTax = amount === 0 ? 0 : money(r.preTaxPaise);
      return {
        id: r.id,
        name: r.name ?? "Original extra",
        kind: "extra",
        amountPaise: amount,
        preTaxPaise: preTax,
        category: o ? offeringCategory(o) : null,
        owner:
          ownerId && o?.propertyId === b.propertyId ? "hotel" : "unresolved",
      };
    }),
    {
      id: "guest_tax",
      name: "Guest taxes (pass-through)",
      kind: "guest_tax",
      amountPaise: money(b.taxPaise),
      preTaxPaise: null,
      category: null,
      owner: "pass_through",
    },
    {
      id: "customer_fee",
      name: "Customer fee",
      kind: "customer_fee",
      amountPaise: money(b.customerFeePaise),
      preTaxPaise: null,
      category: null,
      owner: "unresolved",
    },
  ];
  const applicability =
    source === "unknown"
      ? null
      : (p[
          source === "marketplace"
            ? "marketplaceCommission"
            : source === "direct"
              ? "directCommission"
              : "walkInCommission"
        ] ?? null);
  if (applicability === null)
    reasons.push("Commission applicability is unconfigured for this source.");
  const eligible: Charge[] = [];
  if (applicability === true) {
    if (p.commissionBasisPoints === undefined)
      reasons.push("Commission percentage is unconfigured.");
    if (!p.commissionBasis) reasons.push("Commission basis is unconfigured.");
    if (
      p.commissionBasis === "rooms_and_extras" &&
      !p.eligibleExtraCategories?.length
    )
      reasons.push("Eligible extra categories are unconfigured.");
    for (const c of charges) {
      if (c.kind === "room") eligible.push(c);
      else if (c.kind === "extra" && p.commissionBasis === "rooms_and_extras") {
        if (!c.category && c.amountPaise !== 0)
          reasons.push(`Original category unavailable: ${c.name}.`);
        else if (
          p.eligibleExtraCategories?.some((category) => category === c.category)
        )
          eligible.push(c);
        else excluded.push(c.name);
      } else excluded.push(c.name);
    }
    for (const c of eligible)
      if (c.preTaxPaise === null)
        reasons.push(`Original pre-tax amount unavailable: ${c.name}.`);
  } else excluded.push(...charges.map((c) => c.name));
  const basis =
    applicability === true && p.commissionBasis
      ? safeSum(eligible.map((c) => c.preTaxPaise))
      : null;
  const commission =
    applicability === false
      ? 0
      : !reasons.length &&
          basis !== null &&
          p.commissionBasisPoints !== undefined
        ? Number(
            (BigInt(basis) * BigInt(p.commissionBasisPoints) + BigInt(5000)) /
              BigInt(10000),
          )
        : null;
  if (!ownerId) reasons.push("Original hotel ownership is unavailable.");
  for (const c of charges) {
    if (c.amountPaise === null)
      reasons.push(`Original charge amount unavailable: ${c.name}.`);
    if (
      c.kind === "extra" &&
      c.amountPaise !== 0 &&
      c.preTaxPaise === null &&
      !reasons.includes(`Original pre-tax amount unavailable: ${c.name}.`)
    )
      reasons.push(`Original pre-tax amount unavailable: ${c.name}.`);
    if (c.amountPaise !== 0 && c.owner === "unresolved")
      reasons.push(`Charge ownership unresolved: ${c.name}.`);
  }
  const originalTotalPaise = money(b.totalPaise);
  if (
    originalTotalPaise === null ||
    safeSum(charges.map((c) => c.amountPaise)) !== originalTotalPaise
  )
    reasons.push(
      "Original charge lines do not reconcile to the accepted total.",
    );
  const expectedOnlinePaise = money(b.payableNowPaise);
  const expectedHotelPaise =
    originalTotalPaise !== null && expectedOnlinePaise !== null
      ? money(originalTotalPaise - expectedOnlinePaise)
      : null;
  if (expectedHotelPaise === null)
    reasons.push("Original expected payment split is unavailable.");
  return {
    agreementVersion: 1,
    calculationVersion: 1,
    bookingId,
    propertyId: b.propertyId,
    ownerId,
    source,
    rawSource: b.source ?? null,
    reservationPurpose: b.reservationPurpose ?? null,
    globalRevision,
    hotelRevision,
    terms,
    calculatedAt: now,
    charges,
    originalTotalPaise,
    expectedOnlinePaise,
    expectedHotelPaise,
    originalChargeState: chargeState(b),
    commissionBasisPaise: basis,
    commissionPaise: commission,
    applicability,
    setupReasons: reasons,
    excludedCharges: excluded,
  };
}
export const unassessedItems = [
  "Commission tax",
  "Statutory deductions",
  "Gateway fees",
  "Other adjustments",
];
export function resolveBookingFinance(
  b: RecordData,
  agreement: Agreement | null,
  proof: CheckoutProof | null,
  sources: Sources,
) {
  const supportedRevision = !!agreement?.activeAccommodationAgreement && agreement.activeAccommodationRevision === b.accommodationRevision;
  if (supportedRevision) agreement = agreement!.activeAccommodationAgreement!;
  if (!agreement)
    return {
      status: "historical" as const,
      message: "Historical finance agreement unavailable",
    };
  const folio = reconciliation(
    b,
    sources.entries,
    sources.property,
    sources.online,
    sources.refunds,
  );
  const reviews = [
    ...agreement.setupReasons,
    ...folio.warnings,
    ...folio.notices,
    ...folio.serviceWarnings,
  ];
  const supplemental = serviceFinance(b, agreement, sources);
  reviews.push(...supplemental.issues.map((i) => i.message));
  const adjusted =
    !sameRoomCharges(chargeState(b), agreement.originalChargeState) ||
    sources.entries.length > 0 ||
    (b.customizationCreditPaise ?? 0) !== 0 ||
    (b.billingNetPaise ?? 0) !== 0 ||
    (b.refundedPaise ?? 0) !== 0 ||
    (b.refundDuePaise ?? 0) !== 0 ||
    sources.refunds.some((r) => !r.stayQuote) ||
    sources.property.some((r) => r.type === "refund") ||
    (sources.changes?.length ?? 0) > 0 ||
    sources.events?.some(
      (e) =>
        /amend|stay_change|extend|credit|refund/.test(e.type ?? "") &&
        !(supportedRevision && e.type === "customer_amendment_applied" && e.agreementRevision) &&
        !/^stay_quote_|^stay_request_/.test(e.type ?? "") &&
        !(
          e.refundId &&
          sources.refunds.some((r) => r.id === e.refundId && r.stayQuote)
        ),
    );
  if (adjusted)
    reviews.push(
      "The original room booking was financially changed. Review its charges before settlement.",
    );
  const invalidProof =
    proof &&
    (proof.bookingId !== agreement.bookingId ||
      proof.propertyId !== agreement.propertyId ||
      proof.agreementVersion !== 1 ||
      proof.calculationVersion !== 1 ||
      proof.validated !== true ||
      proof.originalChargeState !== agreement.originalChargeState ||
      !sameRoomCharges(
        proof.checkoutChargeState,
        agreement.originalChargeState,
      ));
  if (invalidProof)
    reviews.push("Checkout calculation differs from the original agreement.");
  const completed = ["checked_out", "completed"].includes(b.bookingStatus);
  if (completed && !proof)
    reviews.push("Validated checkout proof is unavailable.");
  const noEarning = [
    "pending_payment",
    "payment_failed",
    "failed",
    "expired",
    "cancelled",
    "no_show",
  ].includes(b.bookingStatus);
  const knownLifecycle =
    noEarning ||
    completed ||
    ["confirmed", "checked_in"].includes(b.bookingStatus);
  if (!knownLifecycle)
    reviews.push(
      "Booking lifecycle state is unavailable or unsupported; finance review is required.",
    );
  const calculationUnreliable = agreement.setupReasons.some(
    (reason) =>
      !reason.includes("ownership") &&
      !reason.includes("expected payment split"),
  );
  const earning = noEarning
    ? ("not_earned" as const)
    : !knownLifecycle ||
        adjusted ||
        supplemental.issues.length > 0 ||
        calculationUnreliable ||
        agreement.commissionPaise === null ||
        (completed && (!proof || invalidProof))
      ? ("review" as const)
      : completed
        ? ("earned" as const)
        : ("provisional" as const);
  const captured = new Map<string, RecordData>();
  for (const r of sources.online)
    if (
      !r.stayQuote &&
      ["captured", "refund_pending", "refunded"].includes(r.status)
    ) {
      const id = r.paymentId || r.id,
        previous = captured.get(id);
      if (previous && previous.amountPaise !== r.amountPaise)
        reviews.push(`Conflicting capture amount: ${id}.`);
      else captured.set(id, r);
    }
  const sum = (rows: RecordData[]) =>
    safeSum(rows.map((r) => money(r.amountPaise)));
  const onlinePaise = sum([...captured.values()]);
  const hotelGross = sum(
    sources.property.filter((r) => r.type === "collection"),
  );
  const hotelReversed = sum(
    sources.property.filter((r) => r.type === "reversal"),
  );
  const hotelRefunded = sum(
    sources.property.filter((r) => r.type === "refund"),
  );
  const hotelPaise =
    hotelGross !== null && hotelReversed !== null
      ? money(hotelGross - hotelReversed)
      : null;
  const hotelNetPaise =
    hotelPaise !== null && hotelRefunded !== null
      ? money(hotelPaise - hotelRefunded)
      : null;
  if ([onlinePaise, hotelNetPaise].some((v) => v === null))
    reviews.push("Collection amounts are invalid or incomplete.");
  const collectionsReliable =
    !folio.warnings.length && onlinePaise !== null && hotelNetPaise !== null;
  const outstandingPaise = collectionsReliable
    ? money(folio.reservation.balanceDuePaise + folio.services.balanceDuePaise)
    : null;
  const taxes =
    agreement.charges.find((c) => c.kind === "guest_tax")?.amountPaise ?? null;
  const hotelRevenuePaise = agreement.charges.some(
    (c) => c.owner === "unresolved" && c.amountPaise !== 0,
  )
    ? null
    : safeSum(
        agreement.charges
          .filter((c) => c.owner === "hotel")
          .map((c) => c.amountPaise),
      );
  const hotelEntitlementPaise =
    hotelRevenuePaise !== null &&
    taxes !== null &&
    agreement.commissionPaise !== null
      ? hotelRevenuePaise +
        taxes +
        supplemental.totalPaise -
        agreement.commissionPaise -
        supplemental.commissionPaise
      : null;
  // Position is positive when HelpKey owes the hotel, negative when the hotel owes HelpKey.
  const positionPaise =
    !noEarning &&
    !reviews.length &&
    !adjusted &&
    outstandingPaise === 0 &&
    folio.reservation.netPaidPaise === folio.reservation.effectiveTotalPaise &&
    hotelEntitlementPaise !== null &&
    hotelNetPaise !== null
      ? hotelEntitlementPaise - hotelNetPaise
      : null;
  return {
    status: reviews.length ? ("review" as const) : ("ready" as const),
    agreement,
    earning,
    earnedCommissionPaise:
      earning === "earned"
        ? agreement.commissionPaise! + supplemental.commissionPaise
        : null,
    collections: {
      onlinePaise,
      hotelPaise,
      hotelNetPaise,
      completedRefundPaise: folio.reservation.completedRefundPaise,
      pendingRefundPaise: folio.reservation.pendingRefundPaise,
    },
    services: {
      totalPaise: folio.services.totalPaise,
      receivedPaise: folio.services.receivedPaise,
      outstandingPaise: folio.serviceWarnings.length
        ? null
        : folio.services.balanceDuePaise,
    },
    outstandingPaise,
    hotelRevenuePaise,
    guestTaxPassThroughPaise: taxes,
    hotelEntitlementPaise,
    positionPaise,
    serviceRequests: ((b.customizations ?? []) as RecordData[])
      .filter(
        (r: RecordData) =>
          r.settlement !== "included" && r.quote?.status === "accepted",
      )
      .map((r: RecordData) => ({ id: r.id, quoteVersion: r.quote.version })),
    serviceAgreements: sources.serviceAgreements ?? [],
    reviewIssues: supplemental.issues,
    totalCommissionPaise:
      agreement.commissionPaise === null
        ? null
        : agreement.commissionPaise + supplemental.commissionPaise,
    reviewReasons: [...new Set(reviews)],
    unassessedItems,
  };
}
export type BookingFinance = ReturnType<typeof resolveBookingFinance>;
