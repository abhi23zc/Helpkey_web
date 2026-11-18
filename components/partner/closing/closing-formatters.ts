import { formatPaise } from "@/lib/currency";
import type { RecordData } from "@/lib/partner/dashboard/domain";

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  collection: "Property collection",
  cash_return_or_property_refund: "Property refund",
  correction: "Receipt reversal",
  provider_capture: "Online payment",
  provider_return: "Online refund",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash drawer",
  upi: "UPI",
  card: "Card terminal",
  card_terminal: "Card terminal",
  provider: "Online gateway",
};

export const OWNERSHIP_LABELS: Record<string, string> = {
  reservation: "Room & stay",
  supplemental_service: "Add-on service",
};

export const QUEUE_LABELS: Record<string, { label: string; tone: "amber" | "rose" | "blue" | "slate" }> = {
  arrivals: { label: "Arrival today", tone: "blue" },
  awaiting_check_in: { label: "Awaiting check-in", tone: "slate" },
  departures: { label: "Departure today", tone: "blue" },
  in_house: { label: "In-house", tone: "blue" },
  unassigned: { label: "Room unassigned", tone: "amber" },
  room_attention: { label: "Room attention", tone: "amber" },
  balances: { label: "Balance due", tone: "amber" },
  requests: { label: "Guest request", tone: "blue" },
  overdue: { label: "Overdue arrival", tone: "rose" },
  overdue_departures: { label: "Overdue departure", tone: "rose" },
  attention: { label: "Attention required", tone: "amber" },
};

export const REFUND_STATUS_LABELS: Record<string, { label: string; tone: "green" | "amber" | "rose" | "blue" | "neutral" }> = {
  processed: { label: "Processed", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  attention: { label: "Needs attention", tone: "rose" },
  failed: { label: "Failed", tone: "rose" },
  refund_pending: { label: "Refund queued", tone: "blue" },
};

export function formatActivityType(type?: string): string {
  if (!type) return "Payment activity";
  return ACTIVITY_TYPE_LABELS[type] || type.replaceAll("_", " ");
}

export function formatPaymentMethod(method?: string): string {
  if (!method) return "Recorded method";
  return PAYMENT_METHOD_LABELS[method.toLowerCase()] || method.toUpperCase();
}

export function formatOwnership(ownership?: string): string {
  if (!ownership) return "Reservation";
  return OWNERSHIP_LABELS[ownership] || ownership.replaceAll("_", " ");
}

export function formatMoney(paise: number | null | undefined): string {
  return formatPaise(paise, { withFractions: true });
}

export function formatPlural(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type ParsedTotalsKey = {
  type: string;
  typeLabel: string;
  method: string;
  methodLabel: string;
  ownership: string;
  ownershipLabel: string;
};

export function parseTotalsKey(rawKey: string): ParsedTotalsKey {
  const [type = "", method = "", ownership = ""] = rawKey.split(" / ").map((s) => s.trim());
  return {
    type,
    typeLabel: formatActivityType(type),
    method,
    methodLabel: formatPaymentMethod(method),
    ownership,
    ownershipLabel: formatOwnership(ownership),
  };
}

export function formatClosingDate(dateStr?: string, timezone = "Asia/Kolkata"): string {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function formatClosingDateTime(isoOrMs?: string | number, timezone = "Asia/Kolkata"): string {
  if (!isoOrMs) return "—";
  try {
    const date = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
    if (isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(date);
  } catch {
    return "—";
  }
}

export type BlockerItem = {
  id: string;
  code: string;
  category: "ledger" | "shift" | "chronology" | "integrity" | "general";
  title: string;
  detail: string;
  bookingId?: string;
  bookingReference?: string;
  guestName?: string;
  shiftId?: string;
  actorName?: string;
};

export function parseBlockerString(
  raw: string,
  bookingLookup?: Map<string, { confirmationCode?: string; bookingReference?: string; leadGuest?: { name?: string } }>,
): BlockerItem {
  // Check if booking-prefixed: e.g. "3rbrjFGTNRcS0Gu3Ej4S: Received ledger ₹0.00 differs from authoritative booking received ₹900.00: receipt history needs review."
  const colonIdx = raw.indexOf(":");
  if (colonIdx > 0 && colonIdx < 80) {
    const prefix = raw.slice(0, colonIdx).trim();
    const rest = raw.slice(colonIdx + 1).trim();
    const booking = bookingLookup?.get(prefix);

    if (rest.toLowerCase().includes("received ledger") || rest.toLowerCase().includes("receipt history")) {
      const ref = booking?.confirmationCode || booking?.bookingReference || prefix;
      const guest = booking?.leadGuest?.name;
      return {
        id: `blocker-booking-${prefix}`,
        code: "LEDGER_DISCREPANCY",
        category: "ledger",
        title: `Payment discrepancy on ${ref}${guest ? ` (${guest})` : ""}`,
        detail: rest,
        bookingId: prefix,
        bookingReference: ref,
        guestName: guest,
      };
    }

    if (rest.toLowerCase().includes("billing")) {
      const ref = booking?.confirmationCode || booking?.bookingReference || prefix;
      const guest = booking?.leadGuest?.name;
      return {
        id: `blocker-billing-${prefix}`,
        code: "BILLING_DISCREPANCY",
        category: "ledger",
        title: `Billing discrepancy on ${ref}${guest ? ` (${guest})` : ""}`,
        detail: rest,
        bookingId: prefix,
        bookingReference: ref,
        guestName: guest,
      };
    }
  }

  // Check if shift-related: e.g. "Shift <id> must be closed by <name/uid>..."
  const shiftMatch = raw.match(/Shift\s+([a-f0-9]{32,64}|[a-zA-Z0-9_-]+)\s+must be closed by\s+([^.]+)/i);
  if (shiftMatch) {
    const shiftId = shiftMatch[1];
    const opener = shiftMatch[2].trim();
    return {
      id: `blocker-shift-${shiftId}`,
      code: "OPEN_SHIFT",
      category: "shift",
      title: "Open cashier shift must be closed",
      detail: `Shift opened by ${opener} must be closed before the day can be reported.`,
      shiftId,
      actorName: opener,
    };
  }

  // Check chronological order: e.g. "Close YYYY-MM-DD next; reports must cover dates in chronological order."
  if (raw.toLowerCase().includes("chronological order")) {
    return {
      id: "blocker-chronology",
      code: "CHRONOLOGY_ORDER",
      category: "chronology",
      title: "Sequential closing required",
      detail: raw,
    };
  }

  // Shift reconciliation failure
  if (raw.toLowerCase().includes("does not reconcile with its immutable source receipts")) {
    return {
      id: "blocker-shift-reconcile",
      code: "SHIFT_RECONCILE_FAILED",
      category: "integrity",
      title: "Cashier shift reconciliation failure",
      detail: raw,
    };
  }

  return {
    id: `blocker-${raw.slice(0, 32)}`,
    code: "GENERAL_BLOCKER",
    category: "general",
    title: "Closing requirement not met",
    detail: raw,
  };
}

export type DailyKpis = {
  dayCollectionsPaise: number;
  dayRefundsPaise: number;
  dayNetPaise: number;
  daySourceCount: number;
  shiftExpectedPaise: number;
  shiftCountedPaise: number;
  shiftDifferencePaise: number;
  openShiftsCount: number;
  closedShiftsCount: number;
  outstandingBalancePaise: number;
  unresolvedCount: number;
  pendingRefundPaise: number;
  pendingRefundsCount: number;
  blockersCount: number;
};

export function computeDailyKpis(model?: RecordData): DailyKpis {
  if (!model) {
    return {
      dayCollectionsPaise: 0,
      dayRefundsPaise: 0,
      dayNetPaise: 0,
      daySourceCount: 0,
      shiftExpectedPaise: 0,
      shiftCountedPaise: 0,
      shiftDifferencePaise: 0,
      openShiftsCount: 0,
      closedShiftsCount: 0,
      outstandingBalancePaise: 0,
      unresolvedCount: 0,
      pendingRefundPaise: 0,
      pendingRefundsCount: 0,
      blockersCount: 0,
    };
  }

  let dayCollectionsPaise = 0;
  let dayRefundsPaise = 0;
  let daySourceCount = 0;

  for (const [key, t] of Object.entries(model.activityTotals || {})) {
    const item = t as { amountPaise: number; count: number };
    daySourceCount += item.count || 0;
    if (key.includes("refund") || key.includes("return")) {
      dayRefundsPaise += item.amountPaise || 0;
    } else {
      dayCollectionsPaise += item.amountPaise || 0;
    }
  }

  let shiftExpectedPaise = 0;
  let shiftCountedPaise = 0;
  let shiftDifferencePaise = 0;
  let openShiftsCount = 0;
  let closedShiftsCount = 0;

  for (const s of (model.shiftSummaries || []) as RecordData[]) {
    if (s.status === "open" || !s.closedDate) {
      openShiftsCount++;
    } else {
      closedShiftsCount++;
      shiftExpectedPaise += s.expectedPaise || 0;
      if (s.countedPaise != null) shiftCountedPaise += s.countedPaise;
      if (s.differencePaise != null) shiftDifferencePaise += s.differencePaise;
    }
  }

  const unresolvedRows = (model.unresolved || []) as RecordData[];
  const unresolvedCount = model.pagination?.counts?.unresolved ?? unresolvedRows.length;
  const outstandingBalancePaise = unresolvedRows.reduce(
    (sum, r) => sum + (r.reservationBalancePaise || 0) + (r.serviceBalancePaise || 0),
    0,
  );

  const pendingRefundRows = (model.pendingRefunds || []) as RecordData[];
  const pendingRefundsCount = model.pagination?.counts?.pendingRefunds ?? pendingRefundRows.length;
  const pendingRefundPaise = pendingRefundRows.reduce((sum, r) => sum + (r.amountPaise || 0), 0);

  const blockersCount = model.pagination?.counts?.blockers ?? (model.blockers || []).length;

  return {
    dayCollectionsPaise,
    dayRefundsPaise,
    dayNetPaise: dayCollectionsPaise - dayRefundsPaise,
    daySourceCount,
    shiftExpectedPaise,
    shiftCountedPaise,
    shiftDifferencePaise,
    openShiftsCount,
    closedShiftsCount,
    outstandingBalancePaise,
    unresolvedCount,
    pendingRefundPaise,
    pendingRefundsCount,
    blockersCount,
  };
}
