import type { calculateAgreement } from "@/lib/finance/calculation";
import { formatMoney } from "@/lib/customer/offer";
type Calculation = ReturnType<typeof calculateAgreement>["publicCalculation"];
export function SavedCalculation({ calculation: c, currency = "INR" }: { calculation: Calculation; currency?: string }) {
  return <>{c.lines.map(l => <div className="flex justify-between gap-3 py-1" key={l.id}><dt>{l.kind === "room" ? "Room" : l.kind === "customer_fee" ? "Service fee" : l.category} · {l.serviceDate} · {l.quantity}</dt><dd>{formatMoney(l.taxablePaise, currency)}</dd></div>)}<div className="flex justify-between gap-3 py-1"><dt>Taxes</dt><dd>{formatMoney(c.taxPaise, currency)}</dd></div><div className="flex justify-between gap-3 py-1 font-semibold"><dt>Accepted total</dt><dd>{formatMoney(c.totalPaise, currency)}</dd></div><div className="flex justify-between gap-3 py-1"><dt>Payable at acceptance</dt><dd>{formatMoney(c.payableNowPaise, currency)}</dd></div><div className="flex justify-between gap-3 py-1"><dt>Hotel balance at acceptance</dt><dd>{formatMoney(c.hotelBalancePaise, currency)}</dd></div></>;
}
export function SavedCancellation({ calculation: c, timezone = "Asia/Kolkata" }: { calculation: Calculation; timezone?: string }) {
  const late = c.cancellation.lateCharge;
  const description = late.kind === "fixed" ? formatMoney(late.amountPaise) : `${late.basisPoints / 100}% of ${late.basis === "final_total" ? "the final total" : "the taxable total"}`;
  const noShow = c.cancellation.noShow;
  const noShowDescription = noShow.kind === "fixed" ? formatMoney(noShow.amountPaise) : `${noShow.basisPoints / 100}% of ${noShow.basis === "final_total" ? "the final total" : "the taxable total"}`;
  return <p className="text-xs">Free cancellation through {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(c.cancellation.freeUntil))} ({timezone}). Afterwards the saved charge is {description}, capped at eligible funds collected. No-show charge: {noShowDescription}, subject to the same collected-funds cap. Unpaid hotel balances are not collected automatically. Separately accepted services follow their own terms.</p>;
}

export type PublicFinancialHistory = Awaited<ReturnType<typeof import("@/lib/finance/booking-history").publicBookingFinancialHistory>>;
export function SavedFinancialHistory({ history, currency = "INR" }: { history: PublicFinancialHistory; currency?: string }) {
  return <>{history.calculations.filter(a => a.collectionPool === "stay").map(a => <div key={a.id} className="my-2"><dt className="font-semibold">{a.id === "original" ? "Original agreement" : "Additional agreement"}</dt><SavedCalculation calculation={a.calculation} currency={currency} /></div>)}{history.reversals.map(r => <div key={r.id} className="flex justify-between gap-3"><dt>Reduction · {r.originalLineId}</dt><dd>−{formatMoney(r.totalPaise, currency)}</dd></div>)}<div className="flex justify-between gap-3 font-semibold"><dt>Current agreed stay total</dt><dd>{formatMoney(history.stay.totalPaise, currency)}</dd></div></>;
}
