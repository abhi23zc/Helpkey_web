"use client";
import { useState, useEffect, useRef, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { ExtrasOffer } from "@/lib/stay/offer-domain";
import { formatMoney } from "@/lib/customer/offer";
import type { RequestActor } from "./request-agreement-controls";
import type { StayRequest } from "@/lib/stay/contracts";
import { getOfferingImageUrl } from "@/lib/stay/imagery";
import {
  CreditCard,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

export function ExtrasOffers({
  actor,
  staff,
  currency,
  timezone,
  requests,
}: {
  actor: RequestActor;
  staff: boolean;
  currency: string;
  timezone: string;
  requests: StayRequest[];
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const url = `/api/${staff ? "partner/" : ""}bookings/${encodeURIComponent(actor.bookingId)}/extras-offers`;
  const q = useQuery({
    queryKey: ["extras-offers", actor.bookingId, staff, actor.revision],
    queryFn: () =>
      apiFetch<{ enabled: boolean; offers: ExtrasOffer[]; revision: number }>(url),
    refetchInterval: 15000,
  });

  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const confirmation = useRef<HTMLDialogElement>(null);
  const prompted = useRef(new Set<string>());
  const titleId = useId();

  const draftItems = requests.filter(
    (r) => r.offerDraft && !r.offerId && r.status === "requested",
  );
  const pending = requests.filter(
    (r) => !r.offerId && r.status === "requested" && r.settlement === "pending_hotel" && !r.quote,
  );
  const draftsLive = draftItems.every(
    (r) => r.quote?.status === "offered" && Date.parse(r.quote.expiresAt) > now,
  );
  const ready =
    staff &&
    actor.enabled &&
    Boolean(q.data?.enabled) &&
    q.data?.revision === actor.revision &&
    draftItems.length > 0 &&
    pending.length === 0 &&
    draftsLive;
  const draftTotal = draftItems.reduce(
    (sum, r) => sum + (r.quote?.amountPaise ?? 0),
    0,
  );
  const promptKey = `${actor.bookingId}:${draftItems
    .map((r) => `${r.id}:${r.quote?.version}`)
    .sort()
    .join("|")}`;

  useEffect(() => {
    if (!ready || prompted.current.has(promptKey)) return;
    prompted.current.add(promptKey);
    try {
      if (sessionStorage.getItem(`offer-prompt:${promptKey}`)) return;
      sessionStorage.setItem(`offer-prompt:${promptKey}`, "1");
    } catch {
      /* in-memory guard */
    }
    confirmation.current?.showModal();
  }, [ready, promptKey]);

  useEffect(() => {
    if (!ready) confirmation.current?.close();
  }, [ready]);

  async function act(action: string, offer?: ExtrasOffer) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          revision: q.data!.revision,
          ...(offer
            ? {
                offerId: offer.id,
                version: offer.version,
                selected: offer.items
                  .filter((i) => !excluded[`${offer.id}:${i.requestId}`])
                  .map((i) => i.requestId),
              }
            : {}),
        }),
      });
      if (action === "publish") confirmation.current?.close();
      await q.refetch();
      actor.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePay(offer: ExtrasOffer, amountPaise: number) {
    setPaying(true);
    setError("");
    try {
      const paymentUrl = `/api/bookings/${encodeURIComponent(actor.bookingId)}/stay-quote-payment`;
      const session = await apiFetch<{
        keyId: string;
        amount: number;
        currency: string;
        orderId: string;
      }>(paymentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: offer.id, quoteVersion: offer.version }),
      });

      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Secure payment could not load. Try again."));
          document.head.appendChild(script);
        });
      }

      if (!window.Razorpay) throw new Error("Payment could not load. Try again.");

      new window.Razorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        name: "Helpkey",
        order_id: session.orderId,
        handler: async (result) => {
          try {
            const paid = await apiFetch<{ refunded: boolean }>(paymentUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(result),
            });
            if (paid.refunded) {
              setError("This offer closed before payment completed. A full refund is queued.");
            }
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Payment status is being checked. Refresh before retrying.",
            );
          } finally {
            setPaying(false);
            actor.refresh();
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            setError("Payment not completed. Your additions remain awaiting payment.");
            actor.refresh();
          },
        },
      }).open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not start. Try again.");
      setPaying(false);
    }
  }

  if (!q.data) {
    return q.isError ? (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
        Extras offers could not load.{" "}
        <button className="font-bold underline" onClick={() => void q.refetch()}>
          Retry
        </button>
      </div>
    ) : null;
  }

  const formatDeadline = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("en-IN", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* STAFF PROMPT */}
      {staff && q.data.enabled && draftItems.length > 0 && (
        <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[#e8d9b5] bg-[#fbf7ee] p-4.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#061224]">
              {ready ? "Your combined offer is ready" : "Finish reviewing guest requests"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#68758c]">
              {pending.length
                ? `${pending.length} request${pending.length === 1 ? "" : "s"} still need a decision.`
                : !draftsLive
                  ? "Update expired prices before sending."
                  : `${draftItems.length} paid extra${draftItems.length === 1 ? "" : "s"} · ${formatMoney(draftTotal, currency)}. Review and send to let the guest choose and pay.`}{" "}
              Free approvals are already confirmed.
            </p>
          </div>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#152e4d] transition disabled:opacity-40"
            disabled={busy || !ready}
            onClick={() => {
              setError("");
              confirmation.current?.showModal();
            }}
          >
            Review &amp; send offer
          </button>
        </div>
      )}

      {/* STAFF CONFIRMATION DIALOG */}
      <dialog
        ref={confirmation}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[#e7e4dc] bg-white p-5 text-[#061224] shadow-2xl backdrop:bg-[#061224]/50 sm:p-6"
      >
        <h3 id={titleId} className="text-base font-extrabold text-[#061224]">
          Send this offer to the guest?
        </h3>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          All requests have been reviewed. Send the paid extras together so the guest can choose and pay once.
        </p>
        <ul className="my-4 divide-y divide-[#ede7dc]">
          {draftItems.map((r) => (
            <li
              key={r.id}
              className="flex min-w-0 items-start justify-between gap-3 py-3 text-xs"
            >
              <span className="min-w-0 break-words font-medium">
                {r.name}
                {r.variantName ? ` · ${r.variantName}` : ""}
              </span>
              <strong className="shrink-0 font-bold text-[#061224]">
                {formatMoney(r.quote?.amountPaise ?? 0, currency)}
              </strong>
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-3 border-t border-[#ede7dc] pt-3.5 text-xs font-bold text-[#061224]">
          <span>Offer total</span>
          <span>{formatMoney(draftTotal, currency)}</span>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          Free extras stay confirmed. The guest is only charged after accepting and completing payment.
        </p>
        {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            disabled={busy}
            onClick={() => confirmation.current?.close()}
          >
            Not now
          </button>
          <button
            type="button"
            className="min-h-10 rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-bold text-white hover:bg-[#152e4d]"
            disabled={busy || !ready}
            onClick={() => void act("publish")}
          >
            {busy ? "Sending…" : "Send offer to guest"}
          </button>
        </div>
      </dialog>

      {/* OFFERS LIST */}
      {q.data.offers
        .filter((o) => ["offered", "accepted", "paid"].includes(o.status))
        .map((o) => {
          const expired = Date.parse(o.expiresAt) <= now;
          const total = o.items
            .filter((i) =>
              o.status !== "offered"
                ? o.selectedRequestIds.includes(i.requestId)
                : !excluded[`${o.id}:${i.requestId}`],
            )
            .reduce((n, i) => n + i.amountPaise, 0);

          // -------------------------------------------------------------
          // 1. GUEST VIEW: ACCEPTED OFFER (AWAITING PAYMENT)
          // -------------------------------------------------------------
          if (!staff && o.status === "accepted") {
            const acceptedItems = o.items.filter((i) =>
              o.selectedRequestIds.includes(i.requestId),
            );

            return (
              <section
                key={o.id}
                className="overflow-hidden rounded-2xl border border-[#e8d9b5] bg-[#fbf7ee]/40 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8d9b5]/70 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fbf7ee] text-[#785d1c] border border-[#e8d9b5]">
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#061224]">
                        Complete Extras Confirmation
                      </h3>
                      <p className="text-[11px] text-stone-500">
                        Price locked with hotel · Complete payment to confirm your additions
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#e8d9b5] bg-[#fbf7ee] px-2.5 py-0.5 text-[11px] font-bold text-[#785d1c]">
                    <Clock className="h-3 w-3 text-[#b48a3c]" />
                    <span>Awaiting Payment</span>
                  </span>
                </div>

                {/* Items in Accepted Offer */}
                <div className="mt-3.5 space-y-2.5">
                  {acceptedItems.map((item) => {
                    const req = requests.find((r) => r.id === item.requestId);
                    return (
                      <div
                        key={item.requestId}
                        className="flex items-center gap-3 rounded-xl border border-[#e7e4dc] bg-white p-3 shadow-2xs"
                      >
                        {req && (
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-[#e5e1d8]">
                            <img
                              src={getOfferingImageUrl(req)}
                              alt={item.scope}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-[#061224]">{item.scope}</h4>
                          <p className="text-[11px] text-stone-500">
                            {item.conditions || "Unfulfilled services are refunded in full if the booking is cancelled."}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-extrabold text-[#061224]">
                            {formatMoney(item.amountPaise, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Policy & Deadline reassurance */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8d9b5]/60 pt-3 text-xs">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600">
                    <ShieldCheck className="h-4 w-4 text-[#785d1c]" />
                    <span>100% refundable if your stay is cancelled before check-in</span>
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Quote valid until {formatDeadline(o.expiresAt)}
                  </p>
                </div>

                {/* Action Bar */}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-[#e8d9b5]/60 pt-3.5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      Total Due for Extras
                    </span>
                    <p className="text-lg font-extrabold text-[#0b1f3a]">
                      {formatMoney(total, currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={paying || busy || expired || !actor.enabled}
                    onClick={() => void handlePay(o, total)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-6 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-[#152e4d] transition disabled:opacity-50"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>
                      {paying
                        ? "Opening secure payment…"
                        : `Pay ${formatMoney(total, currency)} & Confirm`}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {error && (
                  <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
                    {error}
                  </p>
                )}
              </section>
            );
          }

          // -------------------------------------------------------------
          // 2. GUEST VIEW: NEW OFFER RECEIVED (OFFERED)
          // -------------------------------------------------------------
          if (!staff && o.status === "offered") {
            return (
              <section
                key={o.id}
                className="overflow-hidden rounded-2xl border border-[#e8d9b5] bg-[#fbf7ee]/40 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8d9b5]/70 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fbf7ee] text-[#785d1c] border border-[#e8d9b5]">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#061224]">
                        Hotel Additions Offer
                      </h3>
                      <p className="text-[11px] text-stone-500">
                        Select the additions you would like to accept
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-stone-700">
                    Valid until {formatDeadline(o.expiresAt)}
                  </span>
                </div>

                <div className="mt-3.5 space-y-2.5">
                  {o.items.map((i) => {
                    const isChecked = !excluded[`${o.id}:${i.requestId}`];
                    const req = requests.find((r) => r.id === i.requestId);
                    return (
                      <label
                        key={i.requestId}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                          isChecked
                            ? "border-[#0b1f3a]/30 bg-white shadow-2xs"
                            : "border-stone-200 bg-stone-50/50 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={expired || busy}
                          checked={isChecked}
                          onChange={(e) =>
                            setExcluded((v) => ({
                              ...v,
                              [`${o.id}:${i.requestId}`]: !e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-stone-300 accent-[#0b1f3a]"
                        />
                        {req && (
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-[#e5e1d8]">
                            <img
                              src={getOfferingImageUrl(req)}
                              alt={i.scope}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-[#061224]">
                            {i.scope}
                          </span>
                          {i.conditions && (
                            <small className="block text-[11px] text-stone-500">
                              {i.conditions}
                            </small>
                          )}
                        </div>
                        <span className="text-xs font-bold text-[#061224]">
                          {formatMoney(i.amountPaise, currency)}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <p className="mt-3 text-[11px] text-stone-500">
                  Unchecked items will be declined. Accepting does not charge you right away. Approved free items remain confirmed.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8d9b5]/60 pt-3.5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      Selected Total
                    </span>
                    <p className="text-base font-extrabold text-[#0b1f3a]">
                      {formatMoney(total, currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || expired || !actor.enabled}
                      onClick={() => void act("accept", o)}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#152e4d] transition disabled:opacity-50"
                    >
                      {total
                        ? `Accept Selected Additions — ${formatMoney(total, currency)}`
                        : "Decline All Paid Extras"}
                    </button>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
                    {error}
                  </p>
                )}
              </section>
            );
          }

          // -------------------------------------------------------------
          // 3. PAID CONFIRMED VIEW
          // -------------------------------------------------------------
          if (o.status === "paid") {
            return (
              <section
                key={o.id}
                className="flex items-center justify-between rounded-2xl border border-[#e8d9b5] bg-[#fbf7ee] p-4 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-[#785d1c]" />
                  <div>
                    <h4 className="font-bold text-[#061224]">
                      Extras Payment Confirmed • {formatMoney(total, currency)}
                    </h4>
                    <p className="text-[11px] text-stone-600">
                      The hotel has confirmed your requested additions.
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-[#e8d9b5] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#785d1c]">
                  Confirmed
                </span>
              </section>
            );
          }

          // -------------------------------------------------------------
          // 4. STAFF VIEW
          // -------------------------------------------------------------
          return (
            <section
              key={o.id}
              className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4.5 text-xs"
            >
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <h3 className="font-bold text-[#061224]">
                  Combined Extras Offer · {formatMoney(total, currency)}
                </h3>
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700 uppercase">
                  {o.status}
                </span>
              </div>
              <ul className="space-y-1.5 text-slate-600">
                {o.items.map((i) => (
                  <li key={i.requestId} className="flex justify-between">
                    <span>{i.scope}</span>
                    <span className="font-bold">{formatMoney(i.amountPaise, currency)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-stone-400">
                Expires {formatDeadline(o.expiresAt)}
              </p>
              {staff && (
                <div className="border-t border-stone-100 pt-2.5">
                  <button
                    type="button"
                    className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    disabled={busy || !actor.enabled}
                    onClick={() => void act("withdraw", o)}
                  >
                    Withdraw unpaid offer
                  </button>
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
