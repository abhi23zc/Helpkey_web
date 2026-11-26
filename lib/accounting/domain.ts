import { createHash } from "node:crypto";
import {
  resolveBookingFinance,
  type Agreement,
  type CheckoutProof,
  type Sources,
} from "../booking-finance/domain";
import type { RecordData } from "../partner/dashboard/domain";

export const accounts = [
  "online_clearing",
  "hotel_collection_clearing",
  "pending_online",
  "pending_hotel",
  "commission_unallocated",
  "commission_income",
  "hotel_payable",
  "hotel_dues",
  "hotel_dues_receipt_clearing",
  "review_online",
  "review_hotel",
  "external_payment_clearing",
  "deduction_commissionTax",
  "deduction_statutory",
  "deduction_gatewayFees",
  "deduction_other",
] as const;
export type Account = (typeof accounts)[number];
export type Line = {
  account: Account;
  debitPaise: number;
  creditPaise: number;
};
export type Effect = {
  key: string;
  type: string;
  sourcePath: string;
  sourceFingerprint: string;
  occurredAt: string | null;
  amountPaise: number | null;
  status: "pending" | "recognized" | "reversed" | "review";
  lines: Line[];
  reverses?: string;
  agreementScope?: "accommodation" | "service";
  serviceAgreementReference?: string | null;
  sourceReferences?: string[];
  reviewReasons?: string[];
  unassessedItems?: string[];
  guestTaxPassThroughPaise?: number | null;
};
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            )
          : v,
      ) ?? "null",
    )
    .digest("hex");
export function line(account: Account, debitPaise = 0, creditPaise = 0): Line {
  return { account, debitPaise, creditPaise };
}
export function assertBalanced(lines: Line[]) {
  if (
    lines.length < 2 ||
    lines.some(
      (l) =>
        !accounts.includes(l.account) ||
        ![l.debitPaise, l.creditPaise].every(
          (n) => Number.isSafeInteger(n) && n >= 0,
        ) ||
        (l.debitPaise > 0 && l.creditPaise > 0),
    )
  )
    throw Error("INVALID_JOURNAL_LINES");
  const debit = lines.reduce((n, l) => n + BigInt(l.debitPaise), BigInt(0));
  const credit = lines.reduce((n, l) => n + BigInt(l.creditPaise), BigInt(0));
  if (debit !== credit || debit > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("UNBALANCED_JOURNAL_EVENT");
}
export function totals(events: { lines: Line[] }[]) {
  const result = Object.fromEntries(accounts.map((a) => [a, 0])) as Record<
    Account,
    number
  >;
  for (const event of events) {
    assertBalanced(event.lines);
    for (const l of event.lines) {
      result[l.account] += l.debitPaise - l.creditPaise;
      if (!Number.isSafeInteger(result[l.account]))
        throw Error("UNSAFE_JOURNAL_TOTAL");
    }
  }
  return result;
}
export const iso = (v: unknown): string | null => {
  if (
    v &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof v.toDate === "function"
  )
    return v.toDate().toISOString();
  return typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
};

/** A booking is the unit of allocation. No hotel-level netting takes place. */
export function assess(
  bookingId: string,
  b: RecordData,
  agreement: Agreement | null,
  proof: CheckoutProof | null,
  sources: Sources,
) {
  const reasons: string[] = [],
    effects: Effect[] = [];
  const model = resolveBookingFinance(b, agreement, proof, sources);
  if (model.status === "historical")
    reasons.push("Saved booking agreement unavailable.");
  else reasons.push(...model.reviewReasons);
  if (
    agreement &&
    (agreement.bookingId !== bookingId || agreement.propertyId !== b.propertyId)
  )
    reasons.push("Agreement ownership differs from booking.");
  if (b.currency !== "INR")
    reasons.push("Unsupported or missing booking currency.");
  if (
    ["cancelled", "no_show", "expired", "payment_failed", "failed"].includes(
      b.bookingStatus,
    )
  )
    reasons.push(
      "Cancellation, no-show or failed-booking treatment requires review.",
    );
  if (
    sources.online.some(
      (r) => !r.stayQuote && ["refund_pending", "refunded"].includes(r.status),
    )
  )
    reasons.push(
      "Provider refund status requires review against refund evidence.",
    );
  const captured = new Map<string, RecordData>();
  for (const r of sources.online)
    if (["captured", "refund_pending", "refunded"].includes(r.status)) {
      const id = r.paymentId || r.id;
      if (captured.has(id)) {
        reasons.push(`Duplicate capture reference: ${id}.`);
        continue;
      }
      captured.set(id, r);
    }
  const valid = (r: RecordData) => {
    if (
      r.bookingId !== bookingId ||
      r.propertyId !== b.propertyId ||
      !Number.isSafeInteger(r.amountPaise) ||
      r.amountPaise <= 0 ||
      (r.currency !== undefined && r.currency !== b.currency)
    ) {
      reasons.push(`Invalid amount, currency or ownership: ${r.id}.`);
      return false;
    }
    if (!iso(r.createdAt))
      reasons.push(`Source occurrence date unavailable: ${r.id}.`);
    return b.currency === "INR";
  };
  const add = (
    r: RecordData,
    type: string,
    path: string,
    lines: Line[],
    fingerprint: unknown,
  ) => {
    assertBalanced(lines);
    effects.push({
      key: hash([type, type === "capture" ? r.paymentId || r.id : path]),
      type,
      sourcePath: path,
      sourceFingerprint: hash(fingerprint),
      occurredAt: iso(r.createdAt),
      amountPaise: r.amountPaise,
      status: "pending",
      lines,
      agreementScope: r.stayQuote ? "service" : "accommodation",
      serviceAgreementReference: r.stayQuote
        ? (b.stayPaymentReceipts ?? [])
            .filter((a: RecordData) => a.paymentId === (r.paymentId || r.id))
            .map((a: RecordData) => `${a.requestId}:v${a.quoteVersion}`)
            .join(", ") || null
        : null,
    });
  };
  let online = 0,
    hotel = 0;
  for (const r of captured.values())
    if (valid(r)) {
      add(
        r,
        "capture",
        `paymentAttempts/${r.id}`,
        [
          line("online_clearing", r.amountPaise),
          line("pending_online", 0, r.amountPaise),
        ],
        [
          r.bookingId,
          r.propertyId,
          r.amountPaise,
          r.currency,
          r.paymentId || r.id,
          r.orderId ?? null,
          r.stayQuote ?? null,
        ],
      );
      online += r.amountPaise;
    }
  const collections = new Map(
    sources.property
      .filter((r) => r.type === "collection")
      .map((r) => [r.id, r]),
  );
  const spent = new Map<string, number>();
  for (const r of sources.property.filter((r) => r.type === "collection"))
    if (valid(r)) {
      add(
        r,
        "hotel_collection",
        `propertyPayments/${r.id}`,
        [
          line("hotel_collection_clearing", r.amountPaise),
          line("pending_hotel", 0, r.amountPaise),
        ],
        [r.bookingId, r.propertyId, r.type, r.amountPaise, r.stayQuote ?? null],
      );
      hotel += r.amountPaise;
    }
  for (const r of sources.property.filter((r) =>
    ["reversal", "refund"].includes(r.type),
  ))
    if (valid(r)) {
      const original = collections.get(r.receiptId);
      const used = (spent.get(r.receiptId) ?? 0) + r.amountPaise;
      spent.set(r.receiptId, used);
      if (!original || !valid(original) || used > original.amountPaise) {
        reasons.push(`Unsupported hotel return: ${r.id}.`);
        continue;
      }
      add(
        r,
        `hotel_${r.type}`,
        `propertyPayments/${r.id}`,
        [
          line("pending_hotel", r.amountPaise),
          line("hotel_collection_clearing", 0, r.amountPaise),
        ],
        [r.bookingId, r.propertyId, r.type, r.receiptId, r.amountPaise],
      );
      effects.at(-1)!.reverses = hash([
        "hotel_collection",
        `propertyPayments/${r.receiptId}`,
      ]);
      hotel -= r.amountPaise;
    }
  const refunded = new Map<string, number>();
  for (const r of sources.refunds.filter((r) => r.status === "processed"))
    if (valid(r)) {
      const original = captured.get(r.paymentId),
        used = (refunded.get(r.paymentId) ?? 0) + r.amountPaise;
      refunded.set(r.paymentId, used);
      if (!original || !valid(original) || used > original.amountPaise) {
        reasons.push(`Unsupported provider refund: ${r.id}.`);
        continue;
      }
      add(
        r,
        "online_refund",
        `refunds/${r.id}`,
        [
          line("pending_online", r.amountPaise),
          line("online_clearing", 0, r.amountPaise),
        ],
        [
          r.bookingId,
          r.propertyId,
          r.paymentId,
          r.amountPaise,
          r.providerRefundId ?? r.razorpayRefundId ?? null,
        ],
      );
      effects.at(-1)!.occurredAt =
        iso(r.processedAt) ?? iso(r.updatedAt) ?? iso(r.createdAt);
      effects.at(-1)!.reverses = hash(["capture", r.paymentId]);
      online -= r.amountPaise;
    }
  if (![online, hotel].every((n) => Number.isSafeInteger(n) && n >= 0))
    reasons.push("Collection totals are invalid.");
  // Unsupported commercial evidence is still permanently traceable, without posting
  // an invented financial adjustment. Later assessment can link to these records.
  const audits = [
    ...sources.refunds
      .filter((r) => r.status !== "processed")
      .map((r) => ({ r, path: `refunds/${r.id}` })),
    ...sources.entries.map((r) => ({
      r,
      path: `bookings/${bookingId}/billingEntries/${r.id}`,
    })),
    ...(sources.changes ?? []).map((r) => ({
      r,
      path: `bookings/${bookingId}/stayChangeRequests/${r.id}`,
    })),
    ...(sources.events ?? [])
      .filter((r) =>
        /amend|stay_change|extend|credit|refund|cancel|no_show/.test(
          r.type ?? r.to ?? "",
        ),
      )
      .map((r) => ({ r, path: `bookings/${bookingId}/events/${r.id}` })),
  ];
  for (const { r, path } of audits) {
    const fingerprint = hash({
      bookingId,
      propertyId: b.propertyId,
      type: r.type ?? null,
      status: r.status ?? r.to ?? null,
      amountPaise: r.amountPaise ?? null,
      receiptId: r.receiptId ?? null,
      paymentId: r.paymentId ?? null,
      stayQuote: r.stayQuote ?? null,
    });
    effects.push({
      key: hash(["review_evidence", path, fingerprint]),
      type: "review_evidence",
      sourcePath: path,
      sourceFingerprint: fingerprint,
      occurredAt: iso(r.createdAt),
      amountPaise: Number.isSafeInteger(r.amountPaise) ? r.amountPaise : null,
      status: "review",
      lines: [line("commission_unallocated"), line("commission_income")],
      agreementScope: r.stayQuote ? "service" : "accommodation",
    });
  }
  const commission =
    model.status !== "historical" && model.earning === "earned"
      ? model.earnedCommissionPaise
      : null;
  const review = reasons.length > 0;
  const settled =
    !review &&
    commission !== null &&
    model.status !== "historical" &&
    model.outstandingPaise === 0 &&
    model.positionPaise !== null;
  const recognition: Line[] = [];
  if (!review && commission !== null)
    recognition.push(
      line("commission_unallocated", commission),
      line("commission_income", 0, commission),
    );
  if (settled) {
    const withheld = Math.min(online, commission!),
      payable = online - withheld,
      dues = commission! - withheld;
    recognition.push(
      line("pending_online", online),
      line("pending_hotel", hotel),
      line("hotel_collection_clearing", 0, hotel),
      line("commission_unallocated", 0, commission!),
    );
    if (payable) recognition.push(line("hotel_payable", 0, payable));
    if (dues) recognition.push(line("hotel_dues", dues));
  } else if (review) {
    if (online > 0)
      recognition.push(
        line("pending_online", online),
        line("review_online", 0, online),
      );
    if (hotel > 0)
      recognition.push(
        line("pending_hotel", hotel),
        line("review_hotel", 0, hotel),
      );
  }
  if (recognition.length) assertBalanced(recognition);
  const occurredAt =
    [
      iso((proof as RecordData | null)?.createdAt),
      iso(b.updatedAt),
      ...effects.map((e) => e.occurredAt),
    ]
      .filter((v): v is string => v !== null)
      .sort()
      .at(-1) ?? null;
  return {
    effects,
    recognition,
    occurredAt,
    reasons: [...new Set(reasons)],
    status: review ? "review" : settled ? "recognized" : "pending",
    commissionPaise: commission,
    calculatedCommissionPaise:
      model.status === "historical" ? null : model.totalCommissionPaise,
    guestOutstandingPaise:
      model.status === "historical" ? null : model.outstandingPaise,
    reviewIssues: model.status === "historical" ? [] : model.reviewIssues,
    guestTaxPaise:
      agreement?.charges.find((c) => c.kind === "guest_tax")?.amountPaise ??
      null,
  };
}
