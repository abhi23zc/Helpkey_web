"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { StayRequest } from "@/lib/stay/contracts";
import { formatMoney } from "@/lib/customer/offer";
import { hotelTimeIso } from "./guest-input-fields";
export type RequestActor = {
  bookingId: string;
  revision: number;
  enabled: boolean;
  refresh: () => void;
};
export function RequestAgreementControls({
  request: r,
  actor,
  staff,
  currency,
  timezone,
  onDraftChange,
  compact = false,
}: {
  request: StayRequest;
  actor: RequestActor;
  staff: boolean;
  compact?: boolean;
  currency: string;
  timezone: string;
  onDraftChange?: (section: string, dirty: boolean, busy?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [response, setResponse] = useState(""),
    [amount, setAmount] = useState(""),
    [scope, setScope] = useState(
      `${r.name}${r.variantName ? ` · ${r.variantName}` : ""} × ${r.quantity}`,
    ),
    [conditions, setConditions] = useState(""),
    [expiry, setExpiry] = useState(""),
    [quoting, setQuoting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const draftKey = `request:${r.id}`;
  const initialScope = `${r.name}${r.variantName ? ` · ${r.variantName}` : ""} × ${r.quantity}`;
  const dirty = Boolean(
    response ||
      (quoting && (amount || conditions || expiry || scope !== initialScope)),
  );
  useEffect(() => {
    if (staff) onDraftChange?.(draftKey, dirty, busy);
  }, [staff, onDraftChange, draftKey, dirty, busy]);
  useEffect(
    () => () => {
      if (staff) onDraftChange?.(draftKey, false);
    },
    [staff, onDraftChange, draftKey],
  );
  const QuoteContainer = compact ? "details" : "div";
  const ManageContainer = compact ? "details" : "div";
  const q = r.quote,
    expired = q && Date.parse(q.expiresAt) <= now;
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        `/api/${staff ? "partner/" : ""}bookings/${encodeURIComponent(actor.bookingId)}/stay-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: actor.revision,
            requestId: r.id,
            action,
            response,
            quoteVersion: q?.version,
            ...(action === "quote"
              ? {
                  amountPaise: Math.round(Number(amount) * 100),
                  scope,
                  conditions,
                  ...(expiry
                    ? { expiresAt: hotelTimeIso(expiry, timezone) }
                    : {}),
                }
              : {}),
          }),
        },
      );
      setResponse("");
      setAmount("");
      setConditions("");
      setExpiry("");
      setScope(initialScope);
      setQuoting(false);
      actor.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Request changed. Refresh and retry.",
      );
      actor.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const url = `/api/bookings/${encodeURIComponent(actor.bookingId)}/stay-quote-payment`;
      const session = await apiFetch<{
        keyId: string;
        amount: number;
        currency: string;
        orderId: string;
      }>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: r.id, quoteVersion: q?.version }),
      });
      if (!window.Razorpay)
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Secure payment could not load. Try again."));
          document.head.appendChild(script);
        });
      if (!window.Razorpay)
        throw new Error("Payment could not load. Try again.");
      new window.Razorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        name: "Helpkey",
        order_id: session.orderId,
        handler: async (result) => {
          try {
            const paid = await apiFetch<{ refunded: boolean }>(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(result),
            });
            if (paid.refunded)
              setError(
                "This quote closed before payment completed. A full refund is queued.",
              );
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Payment status is being checked. Refresh before retrying.",
            );
          } finally {
            setBusy(false);
            actor.refresh();
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError(
              "Payment not completed. Your request remains awaiting payment. You can retry this session.",
            );
            actor.refresh();
          },
        },
      }).open();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Payment could not start. Try again.",
      );
      setBusy(false);
      actor.refresh();
    }
  }
  const buttonPrimary =
    "inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl bg-[#061224] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b1f3a] active:scale-[0.99] transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed";
  const buttonSecondary =
    "inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2 text-xs font-semibold text-[#061224] hover:bg-[#fbfbf9] hover:border-[#c89b3c]/50 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const buttonDanger =
    "inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-rose-200 bg-rose-50/50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100/70 hover:border-rose-300 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const button = buttonSecondary;
  return (
    <div className="mt-2.5 space-y-2.5">
      {expired && !q?.paymentId && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          This quote has expired. Ask the hotel for a new quote before accepting
          or paying.
        </p>
      )}
      {compact &&
        q?.status === "accepted" &&
        r.settlement === "awaiting_payment" &&
        !expired && (
          <p className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 text-xs leading-5 text-blue-900 font-medium">
            Waiting for the guest to complete payment.
          </p>
        )}
      {q && (
        <QuoteContainer
          className={
            compact
              ? "group rounded-xl border border-[#ede7dc] bg-[#fbfbf9] p-3 text-xs leading-5"
              : "rounded-xl bg-slate-50 p-4 text-xs leading-6"
          }
        >
          {compact && (
            <summary className="flex min-h-7 cursor-pointer list-none select-none items-center justify-between font-bold text-[#061224]">
              <span>Quote details · {formatMoney(q.amountPaise, currency)}</span>
              <ChevronDown size={13} className="transition-transform group-open:rotate-180 text-[#8b96aa]" />
            </summary>
          )}
          <div className={compact ? "mt-2 space-y-1.5 text-xs text-[#4d5870] pt-2 border-t border-[#f0ece4]" : "space-y-1"}>
            <p className="font-bold text-[#061224]">
              Hotel quote · {formatMoney(q.amountPaise, currency)} (all charges
              included)
            </p>
            <p>{q.scope}</p>
            <p>{q.conditions}</p>
            {!q.conditions
              .toLowerCase()
              .includes(
                "unfulfilled services are refunded in full if the booking is cancelled",
              ) && (
              <p>
                Unfulfilled services are refunded in full if the booking is
                cancelled.
              </p>
            )}
            <p className="text-[11px] text-[#8b96aa]">
              Expires{" "}
              {new Date(q.expiresAt).toLocaleString("en-IN", {
                timeZone: timezone,
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              (hotel time){!compact && ` · Version ${q.version}`}
            </p>
            {q.acceptedAt && (
              <p className="text-[#785d1c] font-bold">
                Price accepted{" "}
                {new Date(q.acceptedAt).toLocaleString("en-IN", {
                  timeZone: timezone,
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            {q.paymentId && (
              <p className="break-all text-[11px] text-[#8b96aa]">
                Payment reference: {q.paymentId} ·{" "}
                {q.paymentStatus?.replaceAll("_", " ")}
              </p>
            )}
          </div>
        </QuoteContainer>
      )}
      {actor.enabled && r.status === "requested" && !q?.paymentId && (
        <>
          {staff ? (
            <>
              {compact && !q && (
                <div className="pt-2 border-t border-[#f0ece4]">
                  <button
                    type="button"
                    disabled={busy}
                    className={`${buttonPrimary} w-full`}
                    onClick={() =>
                      void act(
                        r.source !== "unlisted" &&
                          !r.priceOnRequest &&
                          r.totalPaise > 0
                          ? "approve_price"
                          : "approve_free",
                      )
                    }
                  >
                    <Check size={14} className="text-[#b48a3c] shrink-0" />
                    <span>
                      {r.source !== "unlisted" &&
                      !r.priceOnRequest &&
                      r.totalPaise > 0
                        ? `Approve at listed price · ${formatMoney(r.totalPaise, currency)}`
                        : "Approve for free"}
                    </span>
                  </button>
                </div>
              )}
              <ManageContainer className="group">
                {compact && (
                  <summary className="flex min-h-8 cursor-pointer list-none select-none items-center justify-between rounded-lg px-2 text-xs font-semibold text-[#8b96aa] hover:text-[#061224] hover:bg-[#f4f2ee]/70 transition-colors">
                    <span>Manage request</span>
                    <ChevronDown
                      size={13}
                      className="transition-transform group-open:rotate-180"
                    />
                  </summary>
                )}
                <div className={compact ? "mt-2 space-y-3 rounded-xl border border-[#ede7dc] bg-[#fbfbf9] p-3 text-xs" : ""}>
                  <label className="block text-xs font-medium text-[#4d5870]">
                    Message to guest (optional)
                    <input
                      maxLength={1000}
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder="e.g. Confirmed! High-floor room assigned."
                      className="mt-1 min-h-10 w-full rounded-lg border border-[#ede7dc] bg-white p-2.5 text-xs text-[#061224] placeholder:text-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c]"
                    />
                  </label>
                  {compact && (
                    <p className="text-[11px] leading-relaxed text-[#8b96aa]">
                      Sent with your approval or quote decision. Required when
                      declining.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(!compact || q) && (
                      <button
                        type="button"
                        disabled={busy}
                        className={buttonPrimary}
                        onClick={() => void act("approve_free")}
                      >
                        <Check size={14} className="text-[#b48a3c] shrink-0" />
                        <span>Approve for free</span>
                      </button>
                    )}
                    {(!compact || q) &&
                      r.source !== "unlisted" &&
                      !r.priceOnRequest &&
                      r.totalPaise > 0 && (
                        <button
                          type="button"
                          disabled={busy}
                          className={buttonPrimary}
                          onClick={() => void act("approve_price")}
                        >
                          Approve at listed price ·{" "}
                          {formatMoney(r.totalPaise, currency)}
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonSecondary}
                      onClick={() => setQuoting(!quoting)}
                    >
                      Send price quote
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonDanger}
                      onClick={() => void act("decline")}
                    >
                      Decline with explanation
                    </button>
                    {q && (
                      <button
                        type="button"
                        disabled={busy || q.status === "withdrawn"}
                        className={buttonSecondary}
                        onClick={() => void act("withdraw")}
                      >
                        Withdraw quote
                      </button>
                    )}
                  </div>
                  {quoting && (
                    <div className="space-y-3 rounded-xl border border-[#c89b3c]/30 bg-white p-3.5 shadow-2xs">
                      <label className="block text-xs font-semibold text-[#061224]">
                        Final price ({currency})
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="e.g. 500"
                          className="mt-1 min-h-10 w-full rounded-lg border border-[#ede7dc] p-2 text-xs focus:border-[#c89b3c] focus:outline-none"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-[#061224]">
                        Exact scope
                        <textarea
                          value={scope}
                          maxLength={1500}
                          onChange={(e) => setScope(e.target.value)}
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-[#ede7dc] p-2 text-xs focus:border-[#c89b3c] focus:outline-none"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-[#061224]">
                        Conditions
                        <textarea
                          value={conditions}
                          maxLength={1000}
                          onChange={(e) => setConditions(e.target.value)}
                          placeholder="Special terms or conditions"
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-[#ede7dc] p-2 text-xs focus:border-[#c89b3c] focus:outline-none"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-[#061224]">
                        Expiry ({timezone}, optional)
                        <input
                          type="datetime-local"
                          value={expiry}
                          onChange={(e) => setExpiry(e.target.value)}
                          className="mt-1 min-h-10 w-full rounded-lg border border-[#ede7dc] p-2 text-xs focus:border-[#c89b3c] focus:outline-none"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy || !amount || !scope.trim()}
                        className={buttonPrimary}
                        onClick={() => void act("quote")}
                      >
                        Save final price for review
                      </button>
                    </div>
                  )}
                </div>
              </ManageContainer>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {q && q.status === "offered" && !expired && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={button}
                    onClick={() => void act("accept")}
                  >
                    Accept exact price · {formatMoney(q.amountPaise, currency)}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={button}
                    onClick={() => void act("reject")}
                  >
                    Decline quote
                  </button>
                </>
              )}
              {q?.status === "accepted" &&
                r.settlement === "awaiting_payment" &&
                !expired && (
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-5 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-[#152e4d] transition disabled:opacity-50"
                    onClick={() => void pay()}
                  >
                    {busy
                      ? "Checking payment…"
                      : `Pay ${formatMoney(q.amountPaise, currency)} to confirm`}
                  </button>
                )}
              {q && (
                <p className="w-full text-xs text-slate-500">
                  No payment is taken by accepting a price. Paid requests are
                  confirmed only after a successful payment.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
