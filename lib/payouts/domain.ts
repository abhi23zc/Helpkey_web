import { assess, hash, iso, line } from "../accounting/domain";
import { eligible, summary, type readEvidence } from "../accounting/posting";
import type { Policy } from "../finance-settings/domain";

export * from "./deductions";
import {
  categories,
  deductionTotal,
  type Assessment,
  type Deductions,
} from "./deductions";
export type Evidence = Awaited<ReturnType<typeof readEvidence>>;
export function bookingPosition(
  bookingId: string,
  e: Evidence,
  assessment: Assessment | null,
  now = new Date(),
) {
  const { booking: b, agreement, proof, sources, journal, state } = e;
  if (!b) throw Error("PAYOUT_BOOKING_NOT_FOUND");
  let expected: ReturnType<typeof assess>;
  try {
    expected = assess(bookingId, b, agreement, proof, sources);
  } catch {
    expected = {
      effects: [],
      recognition: [],
      occurredAt: null,
      reasons: [
        "Financial evidence cannot be reliably assessed; reconcile this booking.",
      ],
      status: "review",
      commissionPaise: null,
      calculatedCommissionPaise: null,
      guestOutstandingPaise: null,
      guestTaxPaise: null,
      reviewIssues: [],
    };
  }
  const reasons = [...expected.reasons];
  const fingerprint = hash({
    expected: { ...expected, occurredAt: null },
    onlineStatuses: sources.online
      .filter((r) =>
        ["captured", "refund_pending", "refunded"].includes(r.status),
      )
      .map((r) => [r.id, r.status]),
    agreement,
    services: sources.serviceAgreements ?? [],
    proof,
    actualCheckOutAt: iso(b.actualCheckOutAt),
    journal: journal
      .filter(
        (j) => !["payout", "dues_payment", "dues_correction"].includes(j.type),
      )
      .map((j) => [j.id, j.sourceFingerprint, j.lines])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  let actual = summary([]);
  try {
    actual = summary(journal);
  } catch {
    reasons.push("Invalid journal entries.");
  }
  if (!eligible(b, state)) reasons.push("Booking is not accounting enrolled.");
  if (
    b.paymentReconciliationPending ||
    sources.online.some(
      (r) =>
        r.status === "refund_pending" ||
        (!r.stayQuote && r.status === "refunded"),
    )
  )
    reasons.push("Payment reconciliation or refund evidence requires review.");
  if (state.dirty || !state.processedAt || state.lastError)
    reasons.push("Accounting processing is pending or failed.");
  if (state.status !== "recognized" || expected.status !== "recognized")
    reasons.push("Completed, reconciled checkout is required.");
  if (hash(state.summary) !== hash(actual))
    reasons.push("Journal summary differs; reconcile accounting.");
  if (
    journal.some(
      (j) =>
        j.propertyId !== b.propertyId ||
        j.bookingId !== bookingId ||
        j.currency !== b.currency,
    )
  )
    reasons.push("Journal ownership or currency differs.");
  const recognition = journal.find((j) => j.id === state.recognitionId);
  if (!recognition || hash(recognition.lines) !== hash(expected.recognition))
    reasons.push("Recognition differs from current evidence.");
  const sourceKeys = new Set(expected.effects.map((x) => x.key));
  for (const effect of expected.effects) {
    const posted = journal.find((j) => j.id === effect.key);
    if (
      !posted ||
      posted.sourceFingerprint !== effect.sourceFingerprint ||
      hash(posted.lines) !== hash(effect.lines)
    )
      reasons.push("Collection evidence differs from journal.");
  }
  if (
    journal.some(
      (j) =>
        ![
          "recognition",
          "recognition_reversal",
          "assessment",
          "review_evidence",
          "payout",
          "dues_payment",
          "dues_correction",
        ].includes(j.type) && !sourceKeys.has(j.key),
    )
  )
    reasons.push("Previously recorded source is missing.");
  // Proof is written atomically by successful checkout; never use scheduled checkout.
  const checkoutAt = proof ? iso(b.actualCheckOutAt) : null;
  const proofAt = iso(
    (proof as unknown as { createdAt?: unknown } | null)?.createdAt,
  );
  if (!proofAt) reasons.push("Checkout proof occurrence date is missing.");
  if (checkoutAt && proofAt && checkoutAt !== proofAt)
    reasons.push(
      "Actual checkout timestamp differs from validated checkout proof.",
    );
  const delay = agreement?.terms.effective.payoutDelayDays;
  const eligibleAt =
    checkoutAt && Number.isInteger(delay) && delay! >= 0 && delay! <= 365
      ? new Date(Date.parse(checkoutAt) + delay! * 86400000).toISOString()
      : null;
  if (!eligibleAt)
    reasons.push("Actual checkout evidence or saved payout delay is missing.");
  if (checkoutAt && Date.parse(checkoutAt) > now.getTime())
    reasons.push("Checkout timestamp is in the future.");
  if (eligibleAt && Date.parse(eligibleAt) > now.getTime())
    reasons.push("Saved payout waiting period has not elapsed.");
  if (actual.payablePaise <= 0)
    reasons.push(
      actual.payablePaise < 0
        ? "Debit hotel payable requires review; no automatic dues or offset."
        : "No outstanding hotel payable.",
    );
  const baseReasons = [...new Set(reasons)];
  const current = assessment?.fingerprint === fingerprint;
  const deductionsPaise =
    current && assessment ? deductionTotal(assessment.items) : null;
  if (!current)
    reasons.push("Deduction assessment is missing or evidence changed.");
  else if (deductionsPaise === null)
    reasons.push("All deduction categories require an explicit assessment.");
  if (
    actual.payablePaise > 0 &&
    deductionsPaise !== null &&
    deductionsPaise >= actual.payablePaise
  )
    reasons.push(
      "Deductions must leave a positive payment and cannot exceed payable.",
    );
  return {
    bookingId,
    reference: b.confirmationCode ?? b.bookingReference ?? bookingId,
    fingerprint,
    checkoutAt,
    savedDelayDays: delay ?? null,
    eligibleAt,
    verifiedOnlinePaise: -journal
      .filter((j) => ["capture", "online_refund"].includes(j.type))
      .reduce(
        (n, j) =>
          n +
          j.lines
            .filter((l) => l.account === "pending_online")
            .reduce((v, l) => v + l.debitPaise - l.creditPaise, 0),
        0,
      ),
    hotelCollectionsPaise: journal
      .filter((j) =>
        ["hotel_collection", "hotel_refund", "hotel_reversal"].includes(j.type),
      )
      .reduce(
        (n, j) =>
          n +
          j.lines
            .filter((l) => l.account === "hotel_collection_clearing")
            .reduce((v, l) => v + l.debitPaise - l.creditPaise, 0),
        0,
      ),
    commissionPaise: expected.commissionPaise,
    grossPaise: actual.payablePaise,
    deductionsPaise,
    finalPaise:
      deductionsPaise === null
        ? null
        : Math.max(0, actual.payablePaise - deductionsPaise),
    pendingOnlinePaise: actual.pendingOnlinePaise,
    pendingHotelPaise: actual.pendingHotelPaise,
    assessment,
    assessmentCurrent: !!current,
    baseReasons,
    reasons: [...new Set(reasons)],
    eligible: reasons.length === 0,
  };
}
export function dueGuidance(
  policy: Policy,
  timezone: unknown,
  now = new Date(),
) {
  if (
    typeof timezone !== "string" ||
    !policy.payoutCycle ||
    (policy.payoutCycle === "weekly" && !policy.payoutWeekday)
  )
    return {
      date: null,
      issue: "Configure hotel timezone and payout cycle/weekday.",
    };
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (key: string) => parts.find((p) => p.type === key)!.value;
    const date = new Date(
      `${part("year")}-${part("month")}-${part("day")}T12:00:00Z`,
    );
    const weekdays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    if (policy.payoutCycle === "weekly")
      date.setUTCDate(
        date.getUTCDate() +
          ((weekdays.indexOf(policy.payoutWeekday!) - date.getUTCDay() + 7) %
            7),
      );
    return { date: date.toISOString().slice(0, 10), issue: null };
  } catch {
    return { date: null, issue: "Configure a valid hotel timezone." };
  }
}
export function payoutLines(grossPaise: number, items: Deductions) {
  const deduction = deductionTotal(items);
  if (deduction === null || deduction >= grossPaise || grossPaise <= 0)
    throw Error("INVALID_PAYOUT_AMOUNT");
  return [
    line("hotel_payable", grossPaise),
    line("external_payment_clearing", 0, grossPaise - deduction),
    ...categories.flatMap((k) =>
      items[k].status === "amount" && items[k].amountPaise > 0
        ? [line(`deduction_${k}`, 0, items[k].amountPaise)]
        : [],
    ),
  ];
}
