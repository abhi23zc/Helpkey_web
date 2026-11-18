import { formatPaise } from "@/lib/currency";

export type ShiftStatus = "open" | "closed";

export type ShiftSnapshot = {
  openingPaise: number;
  expectedPaise: number;
  countedPaise: number;
  differencePaise: number;
  collectedPaise: number;
  returnedPaise: number;
  correctionsPaise: number;
  sourceCount: number;
  reason: string;
  reviewedRevision: number;
};

export type ShiftSummaryItem = {
  id: string;
  propertyId: string;
  actorId: string;
  openerName: string;
  closerName?: string;
  status: ShiftStatus;
  timezone: string;
  openedDate: string;
  openedAt: string;
  closedDate?: string;
  closedAt?: string;
  openingPaise: number;
  collectedPaise: number;
  returnedPaise: number;
  correctionsPaise: number;
  sourceCount: number;
  revision: number;
  snapshot?: ShiftSnapshot;
};

export type ShiftSourceReceipt = {
  id: string;
  type: "collection" | "refund" | "reversal" | string;
  amountPaise: number;
  cashEffectPaise: number;
  shiftId?: string;
  method: string;
  reference?: string | null;
  reason?: string | null;
  bookingId?: string | null;
  bookingReference?: string | null;
  guestName?: string | null;
  createdAt: string;
  correctionOfShiftId?: string | null;
};

export type ShiftReviewData = {
  collectedPaise: number;
  returnedPaise: number;
  correctionsPaise: number;
  sourceCount: number;
  expectedPaise: number;
  differencePaise?: number;
  countedPaise?: number;
  reason?: string;
};

export type ShiftListResponse = {
  flags: { shifts: boolean; daily: boolean };
  reportingStart: string | null;
  activeId: string | null;
  timezone?: string;
  shifts: ShiftSummaryItem[];
  nextCursor: string | null;
};

export type ShiftDetailResponse = {
  shift: ShiftSummaryItem;
  review: ShiftReviewData;
  sources: ShiftSourceReceipt[];
  nextCursor: string | null;
};

/** Exact nonnegative paise parsing with whitespace trim and safety cap. */
export function parseRupeesToPaise(text: string): number {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter an exact nonnegative amount with at most two decimal places.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100_000_000) {
    throw new Error("Amount cannot exceed ₹10,00,000.");
  }
  return n;
}

export function tryParseRupeesToPaise(text: string): { ok: true; paise: number } | { ok: false; error: string } {
  try {
    return { ok: true, paise: parseRupeesToPaise(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid amount" };
  }
}

export function formatFriendlyTimezone(tz?: string): string {
  if (!tz) return "Local time";
  if (tz.includes("Kolkata")) return "India Time (IST)";
  const city = tz.split("/").pop()?.replaceAll("_", " ") || tz;
  return `Local time (${city})`;
}

export type TransactionDescriptor = {
  label: string;
  tone: "emerald" | "rose" | "amber" | "slate";
  signedCashEffect: string;
  hasDrawerImpact: boolean;
};

export function describeCashTransaction(
  receipt: Pick<ShiftSourceReceipt, "type" | "cashEffectPaise" | "amountPaise">,
): TransactionDescriptor {
  const effect = receipt.cashEffectPaise ?? 0;
  if (receipt.type === "collection") {
    return {
      label: "Cash collected",
      tone: "emerald",
      signedCashEffect: `+${formatPaise(receipt.amountPaise, { withFractions: true })}`,
      hasDrawerImpact: true,
    };
  }
  if (receipt.type === "refund") {
    return {
      label: "Cash refunded",
      tone: "rose",
      signedCashEffect: `-${formatPaise(receipt.amountPaise, { withFractions: true })}`,
      hasDrawerImpact: true,
    };
  }
  if (receipt.type === "reversal") {
    if (effect < 0) {
      return {
        label: "Same-shift reversal",
        tone: "amber",
        signedCashEffect: `-${formatPaise(receipt.amountPaise, { withFractions: true })}`,
        hasDrawerImpact: true,
      };
    }
    return {
      label: "Past-shift correction",
      tone: "slate",
      signedCashEffect: "No drawer impact",
      hasDrawerImpact: false,
    };
  }
  return {
    label: receipt.type,
    tone: effect > 0 ? "emerald" : effect < 0 ? "rose" : "slate",
    signedCashEffect:
      effect > 0
        ? `+${formatPaise(effect, { withFractions: true })}`
        : effect < 0
          ? `-${formatPaise(-effect, { withFractions: true })}`
          : "No drawer impact",
    hasDrawerImpact: effect !== 0,
  };
}

export const DEFINITIVE_CLOSING_ERRORS = [
  "REVIEW_CHANGED",
  "REASON_REQUIRED",
  "ACKNOWLEDGEMENT_REQUIRED",
  "CLOSING_BLOCKED",
  "SHIFT_ALREADY_OPEN",
  "OPEN_SHIFT_REQUIRED",
  "FEATURE_DISABLED",
  "UNSUPPORTED_DATE",
  "DAY_ALREADY_CLOSED",
  "SHIFT_CLOSED",
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "PMS_RESTRICTED",
  "PMS_DISABLED",
  "PMS_SETUP_REQUIRED",
  "REVIEW_UNAVAILABLE",
  "NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
];

export function isDefinitiveClosingError(code: string): boolean {
  return DEFINITIVE_CLOSING_ERRORS.includes(code);
}
