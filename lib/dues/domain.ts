import { z } from "zod";
import { assess, hash, iso, line } from "../accounting/domain";
import { eligible, summary, type readEvidence } from "../accounting/posting";

export const idSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => !v.includes("/"));
export const methods = [
  "bank_transfer",
  "upi",
  "cheque",
  "cash",
  "other",
] as const;
export const rupeesSchema = z
  .string()
  .trim()
  .regex(
    /^\d+(?:\.\d{1,2})?$/,
    "Enter an amount in rupees with no more than two decimal places.",
  )
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(
      BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")),
    );
  })
  .pipe(
    z
      .number()
      .int()
      .positive("Enter an amount greater than zero.")
      .max(1_000_000_000, "Amount cannot exceed ₹1 crore."),
  );
export const paymentInput = z
  .object({
    bookingIds: z
      .array(idSchema)
      .min(1)
      .max(
        50,
        "Select up to 50 bookings; record another payment for the remainder.",
      )
      .refine(
        (a) => new Set(a).size === a.length,
        "Select each booking only once.",
      ),
    amountRupees: rupeesSchema,
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(methods),
    transactionReference: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(1000).default(""),
    replacesId: idSchema.nullable().default(null),
  })
  .strict()
  .transform(({ amountRupees, ...payment }) => ({
    ...payment,
    amountPaise: amountRupees,
  }));
export type PaymentInput = z.infer<typeof paymentInput>;
export type Allocation = {
  bookingId: string;
  reference: string;
  amountPaise: number;
  beforePaise: number;
  afterPaise: number;
  firstRecordedAt: string;
  evidenceFingerprint: string;
};
export type Receipt = {
  id: string;
  reference: string;
  propertyId: string;
  hotelName: string;
  amountPaise: number;
  paymentDate: string;
  method: (typeof methods)[number];
  transactionReference: string;
  normalizedReference: string;
  notes: string;
  allocations: Allocation[];
  actorId: string;
  recordedAt: string;
  replacesId: string | null;
};
export type Correction = {
  id: string;
  paymentId: string;
  propertyId: string;
  actorId: string;
  recordedAt: string;
  reason: string;
  receiptFingerprint: string;
};
export const normalizeReference = (reference: string) =>
  reference.trim().toUpperCase();
export const referenceKey = (
  propertyId: string,
  method: string,
  reference: string,
) => hash([propertyId, method, normalizeReference(reference)]);
export const receiptEventId = (paymentId: string, bookingId: string) =>
  hash(["dues_payment", paymentId, bookingId]);
export const correctionEventId = (paymentId: string, bookingId: string) =>
  hash(["dues_correction", paymentId, bookingId]);
export const receiptLines = (amountPaise: number) => [
  line("hotel_dues_receipt_clearing", amountPaise),
  line("hotel_dues", 0, amountPaise),
];
export const correctionLines = (amountPaise: number) => [
  line("hotel_dues", amountPaise),
  line("hotel_dues_receipt_clearing", 0, amountPaise),
];
export type Evidence = Awaited<ReturnType<typeof readEvidence>>;
export function duesPosition(
  bookingId: string,
  e: Evidence,
  historyReasons: string[] = [],
) {
  const { booking: b, agreement, proof, sources, state, journal } = e;
  const reasons = [...historyReasons];
  let actual = summary([]);
  try {
    actual = summary(journal);
  } catch {
    reasons.push("The accounting journal is invalid. Review accounting.");
  }
  let expected: ReturnType<typeof assess> | null = null;
  if (!b)
    reasons.push(
      "The original booking is missing; review its payment history.",
    );
  else {
    try {
      expected = assess(bookingId, b, agreement, proof, sources);
    } catch {
      reasons.push("Financial evidence cannot be verified. Review accounting.");
    }
    if (state.propertyId && state.propertyId !== b.propertyId)
      reasons.push("The accounting state belongs to another hotel.");
    if (!eligible(b, state))
      reasons.push("Historical booking is not enrolled in accounting.");
    if (state.dirty || !state.processedAt || state.lastError)
      reasons.push(
        "Accounting is updating or needs another processing attempt.",
      );
    if (b.paymentReconciliationPending || b.stayQuoteReconciliationPending)
      reasons.push("A guest payment is still being confirmed.");
    if (
      journal.some(
        (j) =>
          j.bookingId !== bookingId ||
          j.propertyId !== b.propertyId ||
          j.currency !== b.currency,
      )
    )
      reasons.push("Journal ownership or currency differs from the booking.");
  }
  if (hash(actual) !== hash(state.summary))
    reasons.push("The accounting summary differs from its journal.");
  if (expected) {
    reasons.push(...expected.reasons);
    const recognition = journal.find((j) => j.id === state.recognitionId);
    if (
      expected.status === "recognized" &&
      (!recognition || hash(recognition.lines) !== hash(expected.recognition))
    )
      reasons.push(
        "The recorded settlement differs from current booking evidence.",
      );
    const keys = new Set(expected.effects.map((j) => j.key));
    for (const effect of expected.effects) {
      const posted = journal.find((j) => j.id === effect.key);
      if (
        !posted ||
        posted.sourceFingerprint !== effect.sourceFingerprint ||
        hash(posted.lines) !== hash(effect.lines)
      )
        reasons.push(
          "A collection or refund differs from the accounting journal.",
        );
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
          ].includes(j.type) && !keys.has(j.id),
      )
    )
      reasons.push("Previously recorded financial evidence is missing.");
    if (
      actual.duesPaise > 0 &&
      (state.status !== "recognized" || expected.status !== "recognized")
    )
      reasons.push(
        "Complete checkout and accounting checks before clearing these dues.",
      );
  }
  if (actual.duesPaise < 0)
    reasons.push(
      "Recorded hotel payments exceed the currently recognized dues. Review the booking; money has not been moved to another booking.",
    );
  const firstRecordedAt =
    journal
      .filter(
        (j) =>
          j.type === "recognition" &&
          j.lines.some((l) => l.account === "hotel_dues" && l.debitPaise > 0),
      )
      .map((j) => iso(j.recordedAt))
      .filter((v): v is string => !!v)
      .sort()
      .at(0) ?? null;
  if (actual.duesPaise > 0 && !firstRecordedAt)
    reasons.push("The date these dues were first recorded is unavailable.");
  const fingerprint = hash({
    bookingId,
    expected: expected ? { ...expected, occurredAt: null } : null,
    agreement,
    proof,
    services: sources.serviceAgreements ?? [],
    journal: journal
      .map((j) => [j.id, j.sourceFingerprint, j.lines])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    summary: state.summary,
    dirty: state.dirty ?? false,
    status: state.status ?? null,
    reasons,
  });
  return {
    bookingId,
    reference: String(b?.confirmationCode ?? b?.bookingReference ?? bookingId),
    duesPaise: actual.duesPaise,
    firstRecordedAt,
    fingerprint,
    status: reasons.length
      ? "Needs attention"
      : actual.duesPaise > 0
        ? "Outstanding"
        : journal.some((j) => j.type === "dues_payment")
          ? "Cleared"
          : "No dues",
    collectible: !reasons.length && actual.duesPaise > 0,
    reasons: [...new Set(reasons)],
    details: {
      earnedCommissionPaise: actual.earnedCommissionPaise,
      guestOutstandingPaise: expected?.guestOutstandingPaise ?? null,
      serviceIssues: state.serviceIssues ?? [],
    },
  };
}
export type Position = ReturnType<typeof duesPosition>;
export function allocate(
  positions: Position[],
  amountPaise: number,
): Allocation[] {
  if (positions.some((p) => !p.collectible || !p.firstRecordedAt))
    throw Error("Review the selected bookings before recording a payment.");
  const maximum = positions.reduce((n, p) => n + p.duesPaise, 0);
  if (
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0 ||
    amountPaise > maximum
  )
    throw Error(
      "The amount exceeds the selected outstanding dues or is invalid.",
    );
  let remaining = amountPaise;
  return [...positions]
    .sort(
      (a, b) =>
        a.firstRecordedAt!.localeCompare(b.firstRecordedAt!) ||
        a.bookingId.localeCompare(b.bookingId),
    )
    .flatMap((p) => {
      const amount = Math.min(remaining, p.duesPaise);
      remaining -= amount;
      return amount
        ? [
            {
              bookingId: p.bookingId,
              reference: p.reference,
              amountPaise: amount,
              beforePaise: p.duesPaise,
              afterPaise: p.duesPaise - amount,
              firstRecordedAt: p.firstRecordedAt!,
              evidenceFingerprint: p.fingerprint,
            },
          ]
        : [];
    });
}
export function hotelToday(timezone: unknown, now: Date) {
  if (typeof timezone !== "string")
    throw Error("Configure the hotel timezone before recording a payment.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function validatePaymentDate(
  date: string,
  timezone: unknown,
  now: Date,
) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date > hotelToday(timezone, now)
  )
    throw Error(
      "Payment date must be valid and cannot be in the future in the hotel timezone.",
    );
}
