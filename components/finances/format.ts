import { formatPaise } from "@/lib/currency";
import type { FinanceStage } from "@/lib/finances/classification";
import type { ReportStatus } from "@/lib/dues/report-domain";

export function formatCurrency(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) {
    return "Not available";
  }
  return formatPaise(paise, { withFractions: true });
}

export function formatHotelDate(
  value: string | null | undefined,
  timezone = "Asia/Kolkata",
): string {
  if (!value) return "Not available";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const target = isDateOnly ? `${value}T12:00:00Z` : value;
  if (!Number.isFinite(Date.parse(target))) return value;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: isDateOnly ? "UTC" : timezone,
    }).format(new Date(target));
  } catch {
    return value.slice(0, 10);
  }
}

export function formatHotelDateTime(
  value: string | null | undefined,
  timezone = "Asia/Kolkata",
): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};

export function formatMethod(method: string | null | undefined): string {
  if (!method) return "Not specified";
  return METHOD_LABELS[method] ?? method.replaceAll("_", " ");
}

export function stagePresentation(stage: FinanceStage): {
  label: string;
  tone: string;
  icon: "ready" | "prepared" | "paid" | "dues" | "waiting" | "review" | "historical";
} {
  switch (stage) {
    case "ready_for_payment":
      return {
        label: "Ready for payment",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
        icon: "ready",
      };
    case "prepared_payout":
      return {
        label: "Prepared · unpaid",
        tone: "border-amber-200 bg-[#fbf5e8] text-[#755a1a]",
        icon: "prepared",
      };
    case "paid_out":
      return {
        label: "Paid out",
        tone: "border-slate-200 bg-slate-100 text-slate-700",
        icon: "paid",
      };
    case "dues_outstanding":
      return {
        label: "You owe Helpkey",
        tone: "border-amber-300 bg-amber-50 text-amber-900",
        icon: "dues",
      };
    case "dues_cleared":
    case "settled_zero":
      return {
        label: "Settled",
        tone: "border-slate-200 bg-slate-100 text-slate-700",
        icon: "paid",
      };
    case "awaiting_checkout":
      return {
        label: "Awaiting checkout",
        tone: "border-sky-200 bg-sky-50 text-sky-900",
        icon: "waiting",
      };
    case "awaiting_waiting_period":
      return {
        label: "Waiting period",
        tone: "border-sky-200 bg-sky-50 text-sky-900",
        icon: "waiting",
      };
    case "awaiting_deduction_review":
      return {
        label: "Deduction review",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
        icon: "review",
      };
    case "awaiting_evidence_review":
      return {
        label: "Evidence review",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
        icon: "review",
      };
    case "processing":
      return {
        label: "Processing update",
        tone: "border-sky-200 bg-sky-50 text-sky-900",
        icon: "waiting",
      };
    case "historical":
      return {
        label: "Historical · excluded",
        tone: "border-slate-200 bg-slate-100 text-slate-600",
        icon: "historical",
      };
  }
}

export function reportStatusPresentation(status: ReportStatus): {
  label: string;
  tone: string;
} {
  switch (status) {
    case "awaiting_verification":
      return {
        label: "Awaiting verification",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
      };
    case "recorded":
      return {
        label: "Recorded",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "rejected":
      return {
        label: "Rejected",
        tone: "border-rose-200 bg-rose-50 text-rose-800",
      };
    case "withdrawn":
      return {
        label: "Withdrawn",
        tone: "border-slate-200 bg-slate-100 text-slate-700",
      };
  }
}
