import { formatMoney } from "@/lib/customer/offer";
import type { RequestQuote, StayRequest } from "./contracts";

export function requestLabel(r: StayRequest, now = Date.now()) {
  if (["declined", "cancelled"].includes(r.status))
    return r.status === "declined" ? "Declined" : "Cancelled";
  if (r.quote?.paymentStatus === "refund_pending") return "Refund pending";
  if (r.quote?.paymentStatus === "refunded") return "Refunded";
  if (
    r.agreementVersion !== 2 ||
    r.settlement === "included" ||
    r.settlement === "paid"
  )
    return null;
  if (r.quote?.status === "withdrawn")
    return "Quote withdrawn · awaiting hotel";
  if (r.quote && Date.parse(r.quote.expiresAt) <= now)
    return "Quote expired · request a new quote";
  if (r.settlement === "awaiting_payment") return "Awaiting payment";
  if (r.settlement === "awaiting_customer")
    return "Awaiting your price acceptance";
  return r.source === "unlisted" || r.priceOnRequest
    ? "Awaiting hotel review / quote"
    : "Awaiting hotel approval · not charged";
}
export function assertLiveQuote(
  r: StayRequest,
  version: number,
  now = Date.now(),
) {
  if (
    !r.quote ||
    r.quote.version !== version ||
    !["offered", "accepted"].includes(r.quote.status) ||
    Date.parse(r.quote.expiresAt) <= now ||
    ["declined", "cancelled"].includes(r.status)
  )
    throw new Error(
      "This quote changed, expired or was withdrawn. Refresh and review the latest request.",
    );
  return r.quote;
}
export function quotedPrice(r: StayRequest, quote: RequestQuote) {
  return {
    ...r,
    quote,
    status: "requested" as const,
    settlement: "awaiting_customer" as const,
  };
}
export function supplementalFinancials(
  requests: StayRequest[] = [],
  receipts?: import("./contracts").StayPaymentReceipt[],
): {
  totalPaise: number;
  paidPaise: number;
  refundDuePaise: number;
  refundedPaise: number;
  awaitingPaymentPaise: number;
} {
  if (receipts?.length) {
    const summary = supplementalFinancials(requests);
    return {
      ...summary,
      ...receipts.reduce(
        (sum, r) => ({
          paidPaise: sum.paidPaise + r.amountPaise,
          refundDuePaise:
            sum.refundDuePaise +
            (r.status === "refund_pending" ? r.amountPaise : 0),
          refundedPaise:
            sum.refundedPaise + (r.status === "refunded" ? r.amountPaise : 0),
          totalPaise:
            sum.totalPaise + (r.status === "paid" ? r.amountPaise : 0),
        }),
        { paidPaise: 0, refundDuePaise: 0, refundedPaise: 0, totalPaise: 0 },
      ),
    };
  }
  return requests.reduce(
    (sum, r) => {
      const q = r.quote;
      if (q?.paymentId) {
        sum.paidPaise += q.amountPaise;
        if (q.paymentStatus === "refund_pending")
          sum.refundDuePaise += q.amountPaise;
        if (q.paymentStatus === "refunded") sum.refundedPaise += q.amountPaise;
        if (!["refund_pending", "refunded"].includes(q.paymentStatus ?? ""))
          sum.totalPaise += q.amountPaise;
      }
      if (
        r.status === "requested" &&
        r.settlement === "awaiting_payment" &&
        q &&
        q.status === "accepted" &&
        Date.parse(q.expiresAt) > Date.now()
      )
        sum.awaitingPaymentPaise += q.amountPaise;
      return sum;
    },
    {
      totalPaise: 0,
      paidPaise: 0,
      refundDuePaise: 0,
      refundedPaise: 0,
      awaitingPaymentPaise: 0,
    },
  );
}

/** A pending zero placeholder is not a free agreement; final quotes supersede estimates. */
export function requestAmountLabel(r: StayRequest, currency = "INR") {
  if (r.quote) return formatMoney(r.quote.amountPaise, currency);
  if (
    (r.source === "unlisted" || r.priceOnRequest) &&
    r.settlement !== "included"
  )
    return ["declined", "cancelled"].includes(r.status)
      ? "Not charged"
      : "Awaiting quote";
  return r.totalPaise ? formatMoney(r.totalPaise, currency) : "Free";
}
