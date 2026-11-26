"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Proposal } from "@/lib/booking/amendments/domain";
import type {
  editOptions,
  quoteAmendment,
  publicAttempt,
} from "@/lib/booking/amendments/service";
type Options = Awaited<ReturnType<typeof editOptions>>;
type Quote = Awaited<ReturnType<typeof quoteAmendment>>;
type Attempt = ReturnType<typeof publicAttempt>;
const button =
  "min-h-10 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50";
const field =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm text-slate-900";
const money = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    n / 100,
  );
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to save. Your draft is retained.";
const post = <T,>(path: string, body: unknown = {}, key?: string) =>
  apiFetch<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
  });
export function EditBooking({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={button} onClick={() => setOpen(true)}>
        Edit booking
      </button>
      {open && (
        <BookingEditor bookingId={bookingId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function BookingEditor({
  bookingId,
  onClose,
}: {
  bookingId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    reviewRegion = useRef<HTMLElement>(null),
    key = useRef<string>(""),
    actionPending = useRef(false);
  const client = useQueryClient();
  const [options, setOptions] = useState<Options | null>(null),
    [draft, setDraft] = useState<Proposal | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null),
    [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [guestsOnly, setGuestsOnly] = useState(false);
  const [refunds, setRefunds] = useState<
    { status: string; amountPaise: number }[]
  >([]);
  const base = `/api/bookings/${encodeURIComponent(bookingId)}`;
  const hotelTimezone = options?.timezone ?? "Asia/Kolkata";
  const hotelTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: hotelTimezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  async function load(preserve = false) {
    const o = await apiFetch<Options>(`${base}/edit-options`);
    setOptions(o);
    setAttempt(o.active ?? o.recent);
    setRefunds(o.refunds ?? []);
    if (!o.canEditStay && o.canEditGuests) setGuestsOnly(true);
    if (!preserve) {
      const current = o.current;
      setDraft({
        roomTypeId: current.roomTypeId,
        ratePlanId: current.ratePlanId,
        checkIn: current.checkIn,
        checkOut: current.checkOut,
        arrivalTime: current.arrivalTime,
        durationMinutes: current.durationMinutes,
        adults: current.adults,
        children: current.children,
        infants: current.infants,
        occupants: current.occupants,
        bookingContact: current.bookingContact,
      } as Proposal);
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    void Promise.resolve()
      .then(() => load())
      .catch((e) => setError(message(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (quote) reviewRegion.current?.focus();
  }, [quote]);
  useEffect(() => {
    if (
      !attempt ||
      ["applied", "cancelled", "failed", "expired"].includes(attempt.status)
    )
      return;
    let stopped = false;
    const timer = setInterval(() => {
      void apiFetch<{ amendment: Attempt; refunds: typeof refunds }>(
        `${base}/amendments/${attempt.id}`,
      )
        .then((r) => {
          if (stopped) return;
          setAttempt(r.amendment);
          setRefunds(r.refunds);
          if (r.amendment.status === "applied") {
            setNotice(
              r.amendment.checkoutReplaced
                ? "Checkout updated. Continue payment from your booking."
                : "Your booking changes are confirmed.",
            );
            void client.invalidateQueries();
          }
        })
        .catch((e) => {
          if (!stopped) setError(message(e));
        });
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [attempt?.id, attempt?.status, base, client]); // eslint-disable-line react-hooks/exhaustive-deps
  function change(patch: Partial<Proposal>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setQuote(null);
    key.current = "";
    setNotice("");
  }
  async function action(fn: () => Promise<void>) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  async function review() {
    if (draft) {
      setQuote(await post<Quote>(`${base}/amendments/quote`, draft));
      key.current = crypto.randomUUID();
    }
  }
  async function confirm() {
    if (!quote) return;
    const r = await post<{ amendment: Attempt }>(
      `${base}/amendments`,
      { quoteId: quote.quoteId },
      key.current,
    );
    setAttempt(r.amendment);
    setQuote(null);
    if (r.amendment.status === "applied") {
      setNotice(
        r.amendment.checkoutReplaced
          ? "Checkout updated. Continue payment from your booking."
          : "Your booking changes are confirmed.",
      );
      await client.invalidateQueries();
    }
  }
  async function pay() {
    if (!attempt) return;
    const session = await post<{
      razorpay: {
        keyId: string;
        orderId: string;
        amount: number;
        currency: string;
        name: string;
      };
    }>(`${base}/amendments/${attempt.id}/payment-session`);
    if (!window.Razorpay)
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error("Payment checkout could not load. Try again."));
        document.body.appendChild(script);
      });
    if (!window.Razorpay) throw new Error("Payment checkout is unavailable.");
    new window.Razorpay({
      key: session.razorpay.keyId,
      order_id: session.razorpay.orderId,
      amount: session.razorpay.amount,
      currency: session.razorpay.currency,
      name: session.razorpay.name,
      handler: (response) => {
        void action(async () => {
          await post(`${base}/verify-payment`, response);
          setNotice("Payment received. Checking your saved amendment…");
        });
      },
      modal: {
        ondismiss: () =>
          setNotice(
            "Your original booking remains unchanged while the amendment awaits payment or verification.",
          ),
      },
    }).open();
  }
  const active =
    attempt &&
    !["applied", "cancelled", "expired", "failed"].includes(attempt.status);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="edit-booking-title"
      className="m-auto max-h-[90dvh] w-[min(94vw,44rem)] overflow-y-auto rounded-2xl bg-stone-50 p-5 text-slate-900 shadow-xl backdrop:bg-black/50"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-stone-50 py-2">
        <h2 id="edit-booking-title" className="text-xl font-bold">
          Edit booking
        </h2>
        <button
          className={button}
          onClick={onClose}
          aria-label="Close booking editor"
        >
          Close
        </button>
      </div>
      <p className="my-3 text-sm text-slate-600">
        Review availability and the complete price before confirming. No
        modification fee.
      </p>
      {error && (
        <p
          role="alert"
          className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="my-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {!options && !error && <p role="status">Loading booking options…</p>}
      {options && (
        <>
          <p className="text-xs text-slate-600">
            Hotel time ({hotelTimezone}).{" "}
            Stay changes close:{" "}
            {options.stayDeadline
              ? hotelTime(options.stayDeadline)
              : "Hotel assistance required"}
            . Names and contact close:{" "}
            {hotelTime(options.guestDeadline)}.
          </p>
          {options.paymentReplacementRequired && (
            <p className="my-3 text-sm">
              The previous checkout was refunded. Review your booking to create
              a new secure checkout.
            </p>
          )}
          {options.cancellationDeadline && (
            <p className="mt-1 text-xs">
              Cancellation deadline:{" "}
              {hotelTime(options.cancellationDeadline)}. Editing
              will never extend it.
            </p>
          )}
          {!options.canEditStay && !active && (
            <p className="my-3 text-sm">
              {options.blocker?.replaceAll("_", " ")}. Contact the hotel for
              assistance.{" "}
              {options.hotelContact.phone && (
                <a
                  className="underline"
                  href={`tel:${options.hotelContact.phone}`}
                >
                  {options.hotelContact.phone}
                </a>
              )}
            </p>
          )}
          {active && (
            <div className="my-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p role="status">
                {attempt.status === "awaiting_payment"
                  ? "Your proposed changes are reserved while awaiting payment."
                  : "Payment verification in progress."}
              </p>
              <p className="text-sm">
                Reservation expires:{" "}
                {attempt.expiresAt
                  ? hotelTime(attempt.expiresAt)
                  : "Checking…"}
              </p>
              {attempt.status === "awaiting_payment" && (
                <button
                  disabled={busy}
                  className={button}
                  onClick={() => void action(pay)}
                >
                  Pay {money(attempt.amountToCollectPaise, attempt.currency)}
                </button>
              )}
              <button
                disabled={busy}
                className={button}
                onClick={() =>
                  void action(async () => {
                    const r = await post<{ amendment: Attempt }>(
                      `${base}/amendments/${attempt.id}/cancel`,
                    );
                    setAttempt(r.amendment);
                    await load(true);
                  })
                }
              >
                Discard proposed changes
              </button>
            </div>
          )}
          {attempt &&
            ["failed", "expired", "cancelled"].includes(attempt.status) && (
              <p className="my-3 text-sm">
                Proposed changes {attempt.status}.{" "}
                {attempt.outcomeCode?.replaceAll("_", " ")}. Refresh options
                before trying again.
              </p>
            )}
          {refunds.map((r, i) => (
            <p key={i} role="status">
              Refund {money(r.amountPaise)}: {r.status}
            </p>
          ))}
          {draft &&
            !active &&
            !notice &&
            !quote &&
            (options.canEditStay || options.canEditGuests) && (
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(
                    guestsOnly
                      ? async () => {
                          await apiFetch(`${base}/guest-details`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              occupants: draft.occupants,
                              bookingContact: draft.bookingContact,
                              revision: options.revision,
                              stayRevision: options.stayRevision,
                            }),
                          });
                          setNotice(
                            "Guest and reservation contact details saved.",
                          );
                          await client.invalidateQueries();
                        }
                      : review,
                  );
                }}
              >
                <fieldset disabled={busy} className="space-y-4">
                {options.canEditGuests && (
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={guestsOnly}
                      onChange={(e) => {
                        setGuestsOnly(e.target.checked);
                        setQuote(null);
                      }}
                    />
                    Change only guest names and reservation contact
                  </label>
                )}
                {!guestsOnly && options.canEditStay && (
                  <fieldset className="grid gap-3 sm:grid-cols-2">
                    <legend className="mb-2 font-semibold">
                      Choose stay changes
                    </legend>
                    <label className="text-sm sm:col-span-2">
                      Room and package
                      <select
                        className={field}
                        value={draft.ratePlanId}
                        onChange={(e) => {
                          const p = options.packages.find(
                            (p) => p.ratePlanId === e.target.value,
                          )!;
                          change({
                            ratePlanId: p.ratePlanId,
                            roomTypeId: p.roomTypeId,
                          });
                        }}
                      >
                        {options.packages.map((p) => (
                          <option key={p.ratePlanId} value={p.ratePlanId}>
                            {p.roomName} — {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Arrival date
                      <input
                        required
                        type="date"
                        className={field}
                        value={draft.checkIn}
                        onChange={(e) => change({ checkIn: e.target.value })}
                      />
                    </label>
                    {options.current.bookingMode === "hourly" ? (
                      <>
                        <label className="text-sm">
                          Start time
                          <input
                            required
                            type="time"
                            step={900}
                            className={field}
                            value={draft.arrivalTime}
                            onChange={(e) =>
                              change({ arrivalTime: e.target.value })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          Duration (hours)
                          <input
                            required
                            type="number"
                            min={1}
                            max={24}
                            className={field}
                            value={(draft.durationMinutes ?? 60) / 60}
                            onChange={(e) =>
                              change({
                                durationMinutes: Number(e.target.value) * 60,
                              })
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <label className="text-sm">
                        Departure date
                        <input
                          required
                          type="date"
                          className={field}
                          value={draft.checkOut}
                          onChange={(e) => change({ checkOut: e.target.value })}
                        />
                      </label>
                    )}
                    {(["adults", "children", "infants"] as const).map((k) => (
                      <label key={k} className="text-sm capitalize">
                        {k}
                        <input
                          required
                          type="number"
                          min={k === "adults" ? 1 : 0}
                          max={k === "adults" ? 12 : 10}
                          className={field}
                          value={draft[k]}
                          onChange={(e) => {
                            const count = Math.min(
                              k === "adults" ? 12 : 10,
                              Math.max(
                                k === "adults" ? 1 : 0,
                                Number(e.target.value),
                              ),
                            );
                            const group =
                              k === "adults"
                                ? "adult"
                                : k === "children"
                                  ? "child"
                                  : "infant";
                            const people = draft.occupants.filter(
                              (o) => o.ageGroup === group,
                            );
                            change({
                              [k]: count,
                              occupants: [
                                ...draft.occupants.filter(
                                  (o) => o.ageGroup !== group,
                                ),
                                ...Array.from(
                                  { length: count },
                                  (_, i) =>
                                    people[i] ?? { name: "", ageGroup: group },
                                ),
                              ],
                            });
                          }}
                        />
                      </label>
                    ))}
                  </fieldset>
                )}
                <fieldset>
                  <legend className="font-semibold">Staying guests</legend>
                  {draft.occupants.map((o, i) => (
                    <label key={i} className="mt-2 block text-sm">
                      {o.ageGroup}{" "}
                      {
                        draft.occupants
                          .slice(0, i + 1)
                          .filter((p) => p.ageGroup === o.ageGroup).length
                      }
                      <input
                        required
                        minLength={2}
                        maxLength={120}
                        className={field}
                        value={o.name}
                        onChange={(e) =>
                          change({
                            occupants: draft.occupants.map((p, n) =>
                              n === i ? { ...p, name: e.target.value } : p,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-2 font-semibold">
                    Reservation contact
                  </legend>
                  {(["name", "email", "phone"] as const).map((k) => (
                    <label key={k} className="text-sm capitalize">
                      {k}
                      <input
                        required
                        type={
                          k === "email"
                            ? "email"
                            : k === "phone"
                              ? "tel"
                              : "text"
                        }
                        className={field}
                        value={draft.bookingContact[k]}
                        onChange={(e) =>
                          change({
                            bookingContact: {
                              ...draft.bookingContact,
                              [k]: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                <button
                  className={button}
                  disabled={busy || (!guestsOnly && !options.canEditStay)}
                >
                  {busy
                    ? "Checking…"
                    : guestsOnly
                      ? "Save guest details"
                      : "Review availability and price"}
                </button>
                </fieldset>
              </form>
            )}
          {quote && (
            <section
              ref={reviewRegion}
              tabIndex={-1}
              className="mt-5 space-y-3 rounded-xl border border-stone-300 bg-white p-4"
              aria-label="Review proposed changes"
            >
              <h3 className="font-bold">Review your changes</h3>
              <p className="text-sm">
                {quote.previous.roomName}:{" "}
                {hotelTime(quote.previous.startAt)} →{" "}
                {quote.proposed.roomName}:{" "}
                {hotelTime(quote.proposed.startAt)} to{" "}
                {hotelTime(quote.proposed.endAt)}
              </p>
              {draft && (
                <div className="space-y-1 text-sm">
                  <p>
                    Guests: {options.current.adults} adults,{" "}
                    {options.current.children} children,{" "}
                    {options.current.infants} infants → {draft.adults} adults,{" "}
                    {draft.children} children, {draft.infants} infants.
                  </p>
                  <p>
                    Staying guests:{" "}
                    {draft.occupants.map((o) => o.name).join(", ")}.
                  </p>
                  <p className="break-words">
                    Reservation contact: {draft.bookingContact.name},{" "}
                    {draft.bookingContact.email}, {draft.bookingContact.phone}.
                  </p>
                  <p>
                    Previous accommodation agreement:{" "}
                    {money(quote.previous.totalPaise, quote.currency)}.
                  </p>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ["Published price", quote.published.totalPaise],
                  ["Agreed accommodation total", quote.accepted.totalPaise],
                  ["Retained difference", quote.retainedDifferencePaise],
                  ["Accommodation paid / credit", quote.creditPaise],
                  ["Additional payment", quote.amountToCollectPaise],
                  ["Remaining hotel balance", quote.hotelBalancePaise],
                ].map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt>{label}</dt>
                    <dd className="text-right font-semibold">
                      {money(Number(value), quote.currency)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs">
                Includes accommodation {money(quote.accepted.subtotalPaise)},
                tax {money(quote.accepted.taxPaise)}, booking charges{" "}
                {money(quote.accepted.customerFeePaise)}. Separately agreed
                services retain their own balances.
              </p>
              {quote.serviceBalances && (
                <p className="text-xs">
                  Separate services: paid{" "}
                  {money(quote.serviceBalances.paidPaise, quote.currency)},
                  outstanding{" "}
                  {money(
                    quote.serviceBalances.awaitingPaymentPaise,
                    quote.currency,
                  )}
                  , refund pending{" "}
                  {money(quote.serviceBalances.refundDuePaise, quote.currency)}.
                </p>
              )}
              <p className="text-xs">
                Inclusions:{" "}
                {[
                  ...quote.changedInclusions.proposed.roomAmenities,
                  ...quote.changedInclusions.proposed.propertyAmenities,
                  ...quote.changedInclusions.proposed.rateInclusions,
                ]
                  .map((i: { label: string }) => i.label)
                  .join(", ") || "No additional inclusions"}
                . Review expires{" "}
                {hotelTime(quote.expiresAt)}.
              </p>
              <button className={button} onClick={() => setQuote(null)}>
                Change proposal
              </button>
              {quote.serviceImpacts.map((s) => (
                <div key={s.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                  <strong>{s.name}</strong>:{" "}
                  {s.approved ? "Hotel approved move" : s.reasons.join("; ")}
                  {!s.approved && (
                    <p>
                      Resolve with the hotel, then review again.{" "}
                      {options.hotelContact.phone && (
                        <a
                          href={`tel:${options.hotelContact.phone}`}
                          className="underline"
                        >
                          Call hotel
                        </a>
                      )}
                    </p>
                  )}
                </div>
              ))}
              <button
                className={button}
                disabled={busy || quote.serviceImpacts.some((s) => !s.approved)}
                onClick={() => void action(confirm)}
              >
                {busy
                  ? "Saving…"
                  : quote.amountToCollectPaise > 0
                    ? "Accept changes and continue to payment"
                    : "Confirm changes"}
              </button>
            </section>
          )}
          <div className="mt-4 flex gap-3">
            <button
              disabled={busy}
              className={button}
              onClick={() => void action(() => load(true))}
            >
              Refresh options
            </button>
            <a
              className={`${button} inline-flex items-center`}
              href={`/trips/${bookingId}#customizations`}
            >
              Request customizations
            </a>
          </div>
        </>
      )}
    </dialog>
  );
}
