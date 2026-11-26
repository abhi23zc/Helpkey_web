"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import type { BookingFinance } from "@/lib/booking-finance/domain";

const money = (v: number | null) => v === null ? "Unknown · review required" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(v / 100);
const label = (v: string) => v.replaceAll("_", " ");
export function BookingFinanceSection({ bookingId, audience, revision }: { bookingId: string; audience: "admin" | "partner"; revision?: string | number }) {
  const query = useQuery({
    queryKey: ["booking-finance", audience, bookingId, revision],
    queryFn: ({ signal }) => apiFetch<BookingFinance>(`/api/${audience}/bookings/${encodeURIComponent(bookingId)}/finance`, { signal, cache: "no-store" }),
    retry: false, refetchOnWindowFocus: true, refetchInterval: 30_000,
  });
  // Staff retain operational booking access without receiving commercial data.
  if (query.error instanceof ApiClientError && query.error.status === 403) return null;
  const data = query.data;
  const setupRequired = data && data.status !== "historical" && data.agreement.setupReasons.some(reason => reason.includes("unconfigured"));
  return <section aria-label="Booking financial breakdown" className="my-4 min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">Booking financial breakdown</h3><span className="text-xs text-slate-500">Private commercial calculation</span></div>
    {query.isPending ? <p role="status">Loading booking finance…</p> : query.error ? <div role="alert"><p>Unable to load booking finance. {query.error.message}</p><button type="button" className="mt-2 min-h-10 rounded border px-4 font-semibold" onClick={() => void query.refetch()}>Retry booking finance</button></div> : data?.status === "historical" ? <p>{data.message}</p> : data && <>
      <p className={data.status === "review" ? "rounded-lg bg-amber-50 p-3 text-amber-900" : "text-slate-600"}>{setupRequired ? "Finance setup required" : data.status === "review" ? "Review required" : "Agreement captured"} · {label(data.agreement.source)} · {data.agreement.calculatedAt}</p>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Value label="Original accepted total" value={money(data.agreement.originalTotalPaise)} />
        <Value label="Original commission" value={money(data.agreement.commissionPaise)} />
        <Value label="Commission agreement" value={data.agreement.applicability === false ? "Source explicitly exempt" : data.agreement.terms.effective.commissionBasisPoints === undefined ? "Percentage unconfigured" : `${data.agreement.terms.effective.commissionBasisPoints / 100}% · ${label(data.agreement.terms.effective.commissionBasis ?? "basis unconfigured")}`} />
        <Value label="Eligible original pre-tax basis" value={money(data.agreement.commissionBasisPaise)} />
        <Value label="Commission earning" value={`${label(data.earning)}${data.earnedCommissionPaise === null ? "" : ` · ${money(data.earnedCommissionPaise)}`}`} />
        <Value label="Expected online payment at booking" value={money(data.agreement.expectedOnlinePaise)} />
        <Value label="Expected hotel payment at booking" value={money(data.agreement.expectedHotelPaise)} />
        <Value label="Verified reservation online captures" value={money(data.collections.onlinePaise)} />
        <Value label="Recorded hotel collections after reversals" value={money(data.collections.hotelPaise)} />
        <Value label="Net hotel collections after refunds" value={money(data.collections.hotelNetPaise)} />
        <Value label="Completed reservation refunds" value={money(data.collections.completedRefundPaise)} />
        <Value label="Pending reservation refunds" value={money(data.collections.pendingRefundPaise)} />
        <Value label="Current reservation outstanding" value={money(data.outstandingPaise)} />
        <Value label="Original hotel revenue before commission" value={money(data.hotelRevenuePaise)} />
        <Value label="Guest taxes · pass-through" value={money(data.guestTaxPassThroughPaise)} />
        <Value label="Separate service agreements" value={money(data.services.totalPaise)} />
        <Value label="Separate service receipts" value={money(data.services.receivedPaise)} />
        <Value label="Separate service outstanding" value={money(data.services.outstandingPaise)} />
      </dl>
      <div className="rounded-xl bg-slate-50 p-4"><h4 className="font-semibold">Calculated position before other adjustments</h4><p className="mt-1 font-bold">{data.positionPaise === null ? "Withheld pending collection or review" : data.positionPaise === 0 ? "No calculated amount due" : data.positionPaise > 0 ? `HelpKey owes hotel ${money(data.positionPaise)}` : `Hotel owes HelpKey ${money(-data.positionPaise)}`}</p><p className="mt-2 text-xs text-slate-600">This calculation is before commission tax, statutory deductions, gateway fees and other unassessed adjustments. It is not an available balance or final payout. Earning requires validated checkout and is independent of collection.</p></div>
      {data.reviewReasons.length > 0 && <div role="status"><h4 className="font-semibold">Review reasons</h4><ul className="mt-2 list-disc space-y-1 pl-5">{data.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
      {data.earning === "not_earned" && <p>Normal completed-stay commission is not earned. Cancellation and no-show treatment remains unassessed.</p>}
      <details><summary className="min-h-10 cursor-pointer py-2 font-semibold">Original charges and policy evidence</summary><div className="space-y-2 break-words pt-2"><p>Agreement v{data.agreement.agreementVersion} · Calculation v{data.agreement.calculationVersion} · Global revision {data.agreement.globalRevision} · Hotel revision {data.agreement.hotelRevision}</p>{data.agreement.charges.map(c => <p key={c.id}>{c.name}: {money(c.amountPaise)} · {label(c.owner)}{c.category ? ` · ${label(c.category)}` : ""}</p>)}<p>Excluded from commission: {data.agreement.excludedCharges.join(", ") || "None"}.</p><p>Rate provenance: {data.agreement.terms.provenance.commissionBasisPoints}. Basis provenance: {data.agreement.terms.provenance.commissionBasis}.</p><p>Unassessed: {data.unassessedItems.join(", ")}.</p></div></details>
    </>}
  </section>;
}
function Value({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd></div>;
}
