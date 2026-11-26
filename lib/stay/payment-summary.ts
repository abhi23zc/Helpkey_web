import { stayFinancials } from "./domain";
import type { RecordData } from "../partner/dashboard/domain";
const valid = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
/** Audience-safe projection. Never carries commissions, ownership or private agreements. */
export function paymentSummary(b: RecordData) {
  const room = stayFinancials(b),
    receipts: RecordData[] = b.stayPaymentReceipts ?? [],
    requests: RecordData[] = b.customizations ?? [];
  const unique = new Map<string, RecordData>();
  let reliable = valid(b.totalPaise) && valid(b.paidPaise);
  for (const r of receipts) {
    const key = `${r.paymentId}:${r.requestId}:${r.quoteVersion}`;
    if (
      unique.has(key) ||
      !["paid","refund_pending","refunded"].includes(r.status) ||
      !valid(r.amountPaise) ||
      !requests.some(
        (q) =>
          q.id === r.requestId &&
          q.quote?.version === r.quoteVersion &&
          q.quote?.paymentId === r.paymentId &&
          q.quote?.amountPaise === r.amountPaise &&
          q.settlement !== "included",
      )
    )
      reliable = false;
    else unique.set(key, r);
  }
  for (const r of requests.filter(
    (r) => r.settlement !== "included" && r.quote?.paymentId,
  )) {
    if (
      r.quote.status !== "accepted" ||
      ![...unique.values()].some(
        (a) =>
          a.requestId === r.id &&
          a.paymentId === r.quote.paymentId &&
          a.quoteVersion === r.quote.version,
      )
    )
      reliable = false;
  }
  const agreed = requests.filter(
    (r) => r.settlement !== "included" && r.quote?.status === "accepted",
  );
  for (const r of agreed)
    if (
      !valid(r.quote.amountPaise) ||
      (r.quote.paymentId &&
        ![...unique.values()].some(
          (a) => a.requestId === r.id && a.paymentId === r.quote.paymentId,
        ))
    )
      reliable = false;
  if (
    new Set(agreed.map((r) => `${r.id}:${r.quote.version}`)).size !==
    agreed.length
  )
    reliable = false;
  const addonChargesPaise = agreed.reduce(
    (n, r) => n + (valid(r.quote.amountPaise) ? r.quote.amountPaise : 0),
    0,
  );
  const addonPaid = [...unique.values()].reduce((n, r) => n + r.amountPaise, 0);
  const addonRefunded = [...unique.values()]
    .filter((r) => r.status === "refunded")
    .reduce((n, r) => n + r.amountPaise, 0);
  const addonPending = [...unique.values()]
    .filter((r) => r.status === "refund_pending")
    .reduce((n, r) => n + r.amountPaise, 0);
  const addonDue = agreed
    .filter(
      (r) =>
        !["cancelled", "declined"].includes(r.status) && !r.quote.paymentId,
    )
    .reduce((n, r) => n + r.quote.amountPaise, 0);
  const totalChargesPaise = room.effectiveTotalPaise + addonChargesPaise,
    grossPaidPaise = (b.paidPaise ?? 0) + addonPaid,
    refundedPaise = (b.refundedPaise ?? 0) + addonRefunded,
    pendingRefundPaise = (b.refundDuePaise ?? 0) + addonPending,
    netPaidPaise = grossPaidPaise - refundedPaise;
  const outstandingPaise = room.balanceDuePaise + addonDue;
  if (
    ![
      totalChargesPaise,
      grossPaidPaise,
      refundedPaise,
      pendingRefundPaise,
      netPaidPaise,
      outstandingPaise,
    ].every(valid)
  )
    reliable = false;
  return {
    reliable,
    roomChargesPaise: reliable ? room.effectiveTotalPaise : null,
    addonChargesPaise: reliable ? addonChargesPaise : null,
    totalChargesPaise: reliable ? totalChargesPaise : null,
    grossPaidPaise: reliable ? grossPaidPaise : null,
    refundedPaise: reliable ? refundedPaise : null,
    pendingRefundPaise: reliable ? pendingRefundPaise : null,
    netPaidPaise: reliable ? netPaidPaise : null,
    outstandingPaise: reliable ? outstandingPaise : null,
  };
}
