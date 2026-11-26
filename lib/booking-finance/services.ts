import { createHash } from "node:crypto";
import { canonical, type Policy } from "../finance-settings/domain";
import type { RecordData } from "../partner/dashboard/domain";
import type { Agreement, Sources } from "./domain";

export type ServiceAgreement = {
  version: 1;
  id: string;
  bookingId: string;
  propertyId: string;
  ownerId: string;
  requestId: string;
  quoteVersion: number;
  title: string;
  amountPaise: number;
  category: string | null;
  preTaxPaise: number | null;
  commissionPaise: number;
  quoteFingerprint: string;
  policyFingerprint: string;
  acceptedAt: string;
  recordedBy: string;
  reason: string;
};
const digest = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
export const serviceId = (requestId: string, version: number) =>
  digest([requestId, version]);
export const serviceQuoteFingerprint = (r: RecordData) =>
  digest([
    r.id,
    r.offeringId ?? null,
    r.offeringVersion ?? null,
    r.quote?.version,
    r.quote?.amountPaise,
    r.quote?.scope ?? null,
    r.quote?.conditions ?? null,
    r.quote?.acceptedAt ?? null,
  ]);
export const validMoney = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= 1_000_000_000;
export function createServiceAgreement(
  a: Agreement,
  r: RecordData,
  details: {
    category: string | null;
    preTaxPaise: number | null;
    actorId: string;
    reason: string;
  },
): ServiceAgreement {
  if (
    !a.ownerId ||
    !r.id ||
    r.quote?.status !== "accepted" ||
    !Number.isSafeInteger(r.quote.version) ||
    r.quote.version < 1 ||
    !validMoney(r.quote.amountPaise) ||
    !r.quote.acceptedAt ||
    !Number.isFinite(Date.parse(r.quote.acceptedAt))
  )
    throw Error("The accepted service agreement is incomplete.");
  const p: Policy = a.terms.effective;
  let commissionPaise = 0;
  if (a.applicability === null)
    throw Error(
      "Commission applicability is missing from the original booking agreement.",
    );
  if (a.applicability) {
    if (!p.commissionBasis)
      throw Error("Commission basis is missing from the original agreement.");
    if (p.commissionBasis === "rooms_and_extras") {
      if (!details.category)
        throw Error(
          "Confirm this add-on’s original category before settlement.",
        );
      if (!p.eligibleExtraCategories?.length)
        throw Error(
          "Eligible extra categories are missing from the original agreement.",
        );
      if (
        p.eligibleExtraCategories.includes(
          details.category as NonNullable<
            Policy["eligibleExtraCategories"]
          >[number],
        )
      ) {
        if (
          !validMoney(details.preTaxPaise) ||
          details.preTaxPaise > r.quote.amountPaise
        )
          throw Error(
            "Confirm this add-on’s pre-tax amount before calculating commission.",
          );
        if (!Number.isSafeInteger(p.commissionBasisPoints))
          throw Error("The saved commission percentage is unavailable.");
        commissionPaise = Number(
          (BigInt(details.preTaxPaise) * BigInt(p.commissionBasisPoints!) +
            BigInt(5000)) /
            BigInt(10000),
        );
      }
    }
  }
  return {
    version: 1,
    id: serviceId(r.id, r.quote.version),
    bookingId: a.bookingId,
    propertyId: a.propertyId,
    ownerId: a.ownerId,
    requestId: r.id,
    quoteVersion: r.quote.version,
    title: r.name ?? r.title ?? "Hotel add-on",
    amountPaise: r.quote.amountPaise,
    category: details.category,
    preTaxPaise: details.preTaxPaise,
    commissionPaise,
    quoteFingerprint: serviceQuoteFingerprint(r),
    policyFingerprint: digest(a.terms),
    acceptedAt: r.quote.acceptedAt,
    recordedBy: details.actorId,
    reason: details.reason,
  };
}
export type FinanceIssue = {
  code: string;
  message: string;
  requestId: string | null;
  title: string | null;
  nextAction: string;
};
export function serviceFinance(b: RecordData, a: Agreement, sources: Sources) {
  const issues: FinanceIssue[] = [],
    agreements = sources.serviceAgreements ?? [];
  let totalPaise = 0,
    commissionPaise = 0;
  const requests: RecordData[] = b.customizations ?? [];
  const allocations: RecordData[] = b.stayPaymentReceipts ?? [];
  const fail = (r: RecordData, code: string, message: string) =>
    issues.push({
      code,
      message,
      requestId: r.id ?? null,
      title: r.name ?? "Hotel add-on",
      nextAction:
        code === "SERVICE_TERMS_MISSING"
          ? "Confirm service terms"
          : "Review the service payment and agreement",
    });
  const seen = new Set<string>();
  for (const r of requests.filter(
    (r) => r.settlement !== "included" && r.quote?.status === "accepted",
  )) {
    const identity = `${r.id}:${r.quote.version}`;
    if (seen.has(identity)) {
      fail(
        r,
        "SERVICE_DUPLICATE",
        "The service appears more than once in the booking.",
      );
      continue;
    }
    seen.add(identity);
    const q = r.quote,
      saved = agreements.find((s) => s.id === serviceId(r.id, q.version));
    if (!saved) {
      fail(
        r,
        "SERVICE_TERMS_MISSING",
        `Confirm the saved settlement terms for ${r.name ?? "this add-on"} (${validMoney(q.amountPaise) ? `₹${q.amountPaise / 100}` : "amount unavailable"}).`,
      );
      continue;
    }
    let recalculated: ServiceAgreement | null = null;
    try {
      recalculated = createServiceAgreement(a, r, {
        category: saved.category,
        preTaxPaise: saved.preTaxPaise,
        actorId: saved.recordedBy,
        reason: saved.reason,
      });
    } catch {
      /* A malformed saved agreement must remain blocked. */
    }
    if (
      !recalculated ||
      saved.commissionPaise !== recalculated.commissionPaise ||
      saved.id !== serviceId(r.id, q.version) ||
      saved.bookingId !== a.bookingId ||
      saved.propertyId !== a.propertyId ||
      saved.ownerId !== a.ownerId ||
      saved.quoteFingerprint !== serviceQuoteFingerprint(r) ||
      saved.policyFingerprint !== digest(a.terms) ||
      saved.amountPaise !== q.amountPaise ||
      !validMoney(saved.amountPaise) ||
      !validMoney(saved.commissionPaise)
    ) {
      fail(
        r,
        "SERVICE_AGREEMENT_CHANGED",
        "The service agreement no longer matches the accepted quote.",
      );
      continue;
    }
    const captures = sources.online.filter(
      (c) =>
        c.stayQuote &&
        ["captured", "refund_pending", "refunded"].includes(c.status) &&
        (c.paymentId || c.id) === q.paymentId,
    );
    const receipts = allocations.filter(
      (c) =>
        c.requestId === r.id &&
        c.quoteVersion === q.version &&
        c.paymentId === q.paymentId,
    );
    const refundRows = sources.refunds.filter(
      (c) =>
        c.stayQuote &&
        c.paymentId === q.paymentId &&
        c.requestId === r.id &&
        c.status !== "failed",
    );
    const refunded = refundRows
      .filter((c) => c.status === "processed")
      .reduce(
        (n, c) => n + (validMoney(c.amountPaise) ? c.amountPaise : NaN),
        0,
      );
    if (
      captures.some((c) => c.status === "refund_pending") ||
      refundRows.some((c) => c.status !== "processed") ||
      b.stayQuoteReconciliationPending
    )
      fail(
        r,
        "SERVICE_REFUND_PENDING",
        "An add-on payment or refund is still being confirmed.",
      );
    if (
      q.paymentId &&
      (captures.length !== 1 ||
        receipts.length !== 1 ||
        receipts[0]?.amountPaise !== saved.amountPaise ||
        captures[0]?.orderId !== receipts[0]?.orderId ||
        receipts[0]?.amountPaise < 0)
    )
      fail(
        r,
        "SERVICE_PAYMENT_MISMATCH",
        "The add-on receipt does not match its verified payment.",
      );
    if (
      (!q.paymentId && saved.amountPaise > 0) ||
      (q.paymentId &&
        receipts[0]?.status !== "paid" &&
        refunded !== saved.amountPaise)
    )
      fail(
        r,
        "SERVICE_PAYMENT_PENDING",
        "The accepted add-on has not been fully paid.",
      );
    if (
      !Number.isSafeInteger(refunded) ||
      refunded > saved.amountPaise ||
      (refunded !== 0 && refunded !== saved.amountPaise)
    )
      fail(
        r,
        "SERVICE_REFUND_REVIEW",
        "A partial or mismatched add-on refund needs a confirmed charge adjustment.",
      );
    if (
      ["cancelled", "declined"].includes(r.status) &&
      refunded !== saved.amountPaise
    )
      fail(
        r,
        "SERVICE_CANCELLATION_REVIEW",
        "The cancelled add-on’s payment must be refunded before settlement.",
      );
    if (refunded === 0 && !["cancelled", "declined"].includes(r.status)) {
      totalPaise += saved.amountPaise;
      commissionPaise += saved.commissionPaise;
    }
  }
  for (const c of sources.online.filter(
    (c) =>
      c.stayQuote &&
      ["captured", "refund_pending", "refunded"].includes(c.status),
  )) {
    const matched = allocations.filter(
      (r) => r.paymentId === (c.paymentId || c.id),
    );
    if (
      !matched.length ||
      matched.reduce(
        (n, r) => n + (validMoney(r.amountPaise) ? r.amountPaise : NaN),
        0,
      ) !== c.amountPaise ||
      new Set(matched.map((r) => `${r.requestId}:${r.quoteVersion}`)).size !==
        matched.length ||
      matched.some(
        (r) =>
          !requests.some(
            (q) =>
              q.id === r.requestId &&
              q.quote?.version === r.quoteVersion &&
              q.quote?.paymentId === r.paymentId &&
              q.settlement !== "included",
          ),
      )
    )
      fail(
        {},
        "SERVICE_ALLOCATION_MISMATCH",
        "An add-on capture does not match its allocated services.",
      );
  }
  if (
    !Number.isSafeInteger(totalPaise) ||
    !Number.isSafeInteger(commissionPaise)
  )
    fail(
      {},
      "SERVICE_TOTAL_INVALID",
      "The service totals could not be verified.",
    );
  return { totalPaise, commissionPaise, issues };
}
