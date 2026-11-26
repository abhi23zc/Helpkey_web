import { hash, iso } from "./domain";
import type { Journal } from "./posting";
import type { RecordData } from "../partner/dashboard/domain";
export type PaymentRow = {
  id: string;
  bookingId: string;
  bookingIds: string[];
  type: string;
  title: string;
  purpose: string;
  amountPaise: number;
  occurredAt: string | null;
  direction: "in" | "out" | "record_only";
  status: string;
};
export function paymentHistory(
  journal: Journal[],
  bookings: RecordData[],
  refunds: RecordData[] = [],
): PaymentRow[] {
  const titles: Record<string, string> = {
    dues_payment: "Payment received from hotel",
    dues_correction: "Hotel payment recording corrected",
    capture: "Online payment received",
    hotel_collection: "Hotel payment received",
    online_refund: "Guest refund completed",
    hotel_refund: "Hotel refund completed",
    hotel_reversal: "Hotel collection corrected",
    payout: "Hotel payout recorded",
  };
  const rows = new Map<string, PaymentRow>();
  for (const e of journal) {
    if (
      !titles[e.type] ||
      !Number.isSafeInteger(e.amountPaise) ||
      e.amountPaise! < 0
    )
      continue;
    const b = bookings.find((b) => b.id === e.bookingId);
    const service =
      e.agreementScope === "service" ||
      (b?.stayPaymentReceipts ?? []).some(
        (r: RecordData) => e.sourcePath === `paymentAttempts/${r.paymentId}`,
      );
    const purpose = ["dues_payment", "dues_correction"].includes(e.type)
      ? "Hotel dues"
      : e.type === "payout"
        ? "Hotel settlement"
        : service
          ? "Add-on service"
          : "Room booking";
    const key = hash([e.type, e.sourcePath]);
    rows.set(key, {
      id: ["dues_payment", "dues_correction"].includes(e.type) ? key : e.id,
      bookingId: [
        ...new Set([...(rows.get(key)?.bookingIds ?? []), e.bookingId]),
      ].sort()[0],
      bookingIds: [
        ...new Set([...(rows.get(key)?.bookingIds ?? []), e.bookingId]),
      ].sort(),
      type: e.type,
      title: titles[e.type],
      purpose,
      amountPaise:
        e.amountPaise! +
        (["dues_payment", "dues_correction"].includes(e.type)
          ? (rows.get(key)?.amountPaise ?? 0)
          : 0),
      occurredAt: iso(e.occurredAt) ?? iso(e.recordedAt),
      direction: ["hotel_reversal", "dues_correction"].includes(e.type)
        ? "record_only"
        : ["capture", "hotel_collection", "dues_payment"].includes(e.type)
          ? "in"
          : "out",
      status: ["hotel_reversal", "dues_correction"].includes(e.type)
        ? "Corrected"
        : e.type === "payout"
          ? "Paid"
          : e.type.includes("refund")
            ? "Refunded"
            : "Received",
    });
  }
  for (const r of refunds.filter(
    (r) => !["processed", "failed"].includes(r.status),
  ))
    if (Number.isSafeInteger(r.amountPaise) && r.amountPaise > 0) {
      const id = hash(["refund_pending", r.id]);
      rows.set(id, {
        id,
        bookingId: r.bookingId,
        bookingIds: [r.bookingId],
        type: "refund_pending",
        title: "Guest refund pending",
        purpose: r.stayQuote ? "Add-on service" : "Room booking",
        amountPaise: r.amountPaise,
        occurredAt: iso(r.createdAt),
        direction: "out",
        status: "Awaiting refund",
      });
    }
  return [...rows.values()].sort(
    (a, b) =>
      (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "") ||
      b.id.localeCompare(a.id),
  );
}
