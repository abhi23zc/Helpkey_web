import type { paymentSummary } from "@/lib/stay/payment-summary";
export function BookingPaymentSummary({
  summary,
  compact = false,
  currency = "INR",
}: {
  summary: ReturnType<typeof paymentSummary>;
  compact?: boolean;
  currency?: string;
}) {
  const money = (v: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
      v / 100,
    );
  if (!summary.reliable)
    return (
      <p className="text-xs text-amber-800">
        Payment details need review. Open the booking to check its receipts.
      </p>
    );
  if (compact)
    return (
      <div className="space-y-1">
        <p className="font-semibold text-slate-900">
          {money(summary.totalChargesPaise!)}
          <span className="ml-1 text-[10px] font-normal text-slate-500">
            total
          </span>
        </p>
        {summary.addonChargesPaise! > 0 && (
          <p className="text-[11px] text-slate-500">
            Room {money(summary.roomChargesPaise!)} · Add-ons{" "}
            {money(summary.addonChargesPaise!)}
          </p>
        )}
        <p className="text-[11px] text-slate-600">
          Paid {money(summary.grossPaidPaise!)} · Due{" "}
          {money(summary.outstandingPaise!)}
        </p>
        {summary.refundedPaise! > 0 && (
          <p className="text-[11px] text-slate-500">
            Refunded {money(summary.refundedPaise!)}
          </p>
        )}
        {summary.pendingRefundPaise! > 0 && (
          <p className="text-[11px] text-amber-800">
            Refund pending {money(summary.pendingRefundPaise!)}
          </p>
        )}
      </div>
    );
  return (
    <dl
      aria-label="Payment summary"
      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm"
    >
      {(
        [
          ["Room booking", summary.roomChargesPaise],
          ["Separate add-ons", summary.addonChargesPaise],
          ["Total charges", summary.totalChargesPaise],
          ["Total paid", summary.grossPaidPaise],
          ...(summary.refundedPaise! > 0
            ? [["Refunded", summary.refundedPaise]]
            : []),
          ...(summary.pendingRefundPaise! > 0
            ? [["Refund pending", summary.pendingRefundPaise]]
            : []),
          ["Balance due", summary.outstandingPaise],
        ] as [string, number][]
      ).map(([label, amount]) => (
        <div className="flex flex-wrap justify-between gap-2" key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-semibold text-slate-900">{money(amount)}</dd>
        </div>
      ))}
    </dl>
  );
}
