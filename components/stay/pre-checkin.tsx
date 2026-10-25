"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { variantPrice } from "@/lib/stay/pricing";
import { canEditRequest, emptyPreCheckin } from "@/lib/stay/domain";
import { localParts } from "@/lib/booking/domain";
import type {
  Offering,
  Selection,
  StayBookingData,
} from "@/lib/stay/contracts";
import { PersonalizationPicker, TravelerChips } from "./personalization-picker";
import { StayRequestList } from "./stay-request-list";
type Booking = Partial<StayBookingData> & {
  id: string;
  bookingStatus: string;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  currency: string;
  leadGuest?: { name?: string; email?: string; phone?: string } | null;
  propertyPublicPhone?: string | null;
  specialRequest?: string | null;
};
export function PreCheckinPanel({ booking }: { booking: Booking }) {
  const q = useQuery({
    queryKey: ["arrival-options", booking.id],
    queryFn: ({ signal }) =>
      apiFetch<{
        offerings: Offering[];
        editable: boolean;
        startAt?: string | null;
      }>(`/api/bookings/${encodeURIComponent(booking.id)}/pre-checkin`, {
        signal,
      }),
    enabled: booking.bookingStatus === "confirmed",
    refetchOnWindowFocus: true,
    refetchInterval: booking.bookingStatus === "confirmed" ? 15000 : false,
  });
  const [editing, setEditing] = useState(false);
  const editable = booking.bookingStatus === "confirmed" && q.data?.editable;
  return (
    <section className="my-5 rounded-2xl border border-[#e7e4dc] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#061224]">
          Prepare for Your Arrival
        </h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
          Pre check-in:{" "}
          {booking.preCheckin?.status === "submitted"
            ? "Submitted"
            : "Incomplete"}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Pre check-in helps the hotel prepare for your arrival. Actual check-in
        is performed by the hotel.
      </p>
      {booking.preCheckin?.expectedArrivalAt && (
        <p className="mt-3 text-sm">
          Expected arrival:{" "}
          {new Date(booking.preCheckin.expectedArrivalAt).toLocaleString(
            "en-IN",
            { timeZone: booking.timezone },
          )}{" "}
          ({booking.timezone})
        </p>
      )}
      {!!booking.travelerPreferences?.length && (
        <p className="mt-2 text-sm">
          Travel preferences: {booking.travelerPreferences.join(", ")}
        </p>
      )}
      {booking.preCheckin?.notes && (
        <p className="mt-2 text-sm">
          Arrival notes: {booking.preCheckin.notes}
        </p>
      )}
      <div className="mt-4">
        <StayRequestList
          requests={booking.customizations ?? []}
          currency={booking.currency}
          timezone={booking.timezone}
        />
      </div>
      {q.isPending && booking.bookingStatus === "confirmed" && (
        <p className="mt-3 text-sm text-slate-500">Loading arrival options…</p>
      )}
      {q.isError && (
        <div className="mt-3 text-sm text-red-700">
          Arrival options could not load.{" "}
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="underline"
          >
            Retry
          </button>
        </div>
      )}
      {editable && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 rounded-xl bg-[#061224] px-4 py-3 text-sm font-semibold text-white"
        >
          {booking.preCheckin?.status === "submitted"
            ? "Update pre check-in"
            : "Prepare for arrival"}
        </button>
      )}
      {editing && editable && (
        <ArrivalEditor
          booking={{
            ...booking,
            startAt: booking.startAt ?? q.data?.startAt ?? null,
          }}
          offerings={q.data?.offerings ?? []}
          close={() => setEditing(false)}
        />
      )}
      {!editable && (!q.isPending || booking.bookingStatus !== "confirmed") && (
        <p className="mt-3 text-sm text-slate-500">
          {booking.bookingStatus === "pending_payment"
            ? "Pre check-in will be available once your booking is confirmed."
            : "Online changes are closed. Contact the hotel for assistance."}
          {booking.propertyPublicPhone ? ` ${booking.propertyPublicPhone}` : ""}
        </p>
      )}
    </section>
  );
}
function ArrivalEditor({
  booking,
  offerings,
  close,
}: {
  booking: Booking;
  offerings: Offering[];
  close: () => void;
}) {
  const client = useQueryClient();
  const initial = booking.preCheckin ?? emptyPreCheckin();
  const [revision] = useState(booking.stayRevision ?? 0);
  const [preferences, setPreferences] = useState(
    booking.travelerPreferences ?? [],
  );
  const [notes, setNotes] = useState(initial.notes);
  const [arrival, setArrival] = useState(() => {
    if (!initial.expectedArrivalAt) return "";
    const p = localParts(
      Date.parse(initial.expectedArrivalAt),
      booking.timezone,
    );
    return `${p.date}T${p.time}`;
  });
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conflict = (booking.stayRevision ?? 0) !== revision;
  const requests = booking.customizations ?? [];
  const [selections, setSelections] = useState<Selection[]>(() =>
    requests
      .filter(
        (r) =>
          r.unitPricePaise === 0 &&
          !["cancelled", "declined", "fulfilled"].includes(r.status),
      )
      .map((r) => ({
        offeringId: r.offeringId,
        variantId: r.variantId,
        quantity: r.quantity,
      })),
  );
  // Keep committed requests visible even if the owner pauses/edits their catalog entry.
  const editableRequests = requests.filter((r) => canEditRequest(r));
  const retainedQuantities: Record<string, number> = {};
  for (const r of requests.filter((r) => r.unitPricePaise > 0 && !["cancelled", "declined"].includes(r.status))) {
    retainedQuantities[r.offeringId] = (retainedQuantities[r.offeringId] ?? 0) + r.quantity;
  }
  const fresh = offerings.flatMap((o) => {
    if (requests.some((r) => r.offeringId === o.id && (r.preparationStarted || r.status === "declined"))) return [];
    const existing = requests.filter((r) => r.offeringId === o.id && r.status !== "cancelled");
    if (!o.variants.length) return existing.length || variantPrice(o, null) > 0 ? [] : [o];
    const variants = o.variants.filter((v) => variantPrice(o, v.id) === 0 && !existing.some((r) => r.variantId === v.id));
    return variants.length ? [{ ...o, variants }] : [];
  });
  async function save(submit: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ booking: unknown }>(
        `/api/bookings/${encodeURIComponent(booking.id)}/pre-checkin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision,
            travelerPreferences: preferences,
            notes,
            expectedArrivalLocal: arrival || null,
            selections,
            submit,
            guestsReviewed: reviewed,
          }),
        },
      );
      client.setQueryData(queryKeys.booking(booking.id), result);
      await client.invalidateQueries({
        queryKey: ["arrival-options", booking.id],
      });
      close();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save arrival details.",
      );
      await client.invalidateQueries({
        queryKey: queryKeys.booking(booking.id),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
      <TravelerChips
        value={preferences}
        onChange={setPreferences}
        disabled={busy}
      />
      <label className="block text-sm font-medium">
        Expected arrival ({booking.timezone})
        <input
          type="datetime-local"
          value={arrival}
          disabled={busy}
          onChange={(e) => setArrival(e.target.value)}
          className="mt-2 block w-full rounded-xl border border-slate-200 p-3"
        />
      </label>
      <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <h3 className="font-semibold">Guest information</h3>
        <p className="mt-2">
          {(booking.guestNames ?? [booking.leadGuest?.name ?? "Guest"]).join(
            ", ",
          )}
        </p>
        <p>
          {booking.leadGuest?.email} · {booking.leadGuest?.phone}
        </p>
        <label className="mt-3 flex gap-2">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I have reviewed the guest information
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Contact the hotel if guest details need correcting. No additional
          identity documents are needed here.
        </p>
      </div>
      {editableRequests.map((r) => {
        const s = selections.find(
          (s) => s.offeringId === r.offeringId && s.variantId === r.variantId,
        );
        const current = offerings.find((o) => o.id === r.offeringId);
        const sameVariant = current && (current.variants.length ? current.variants.some((v) => v.id === r.variantId) : r.variantId === null);
        const otherQuantity = (retainedQuantities[r.offeringId] ?? 0) + selections.filter((s) => s.offeringId === r.offeringId && s.variantId !== r.variantId).reduce((sum, s) => sum + s.quantity, 0);
        const max = current && sameVariant && variantPrice(current, r.variantId) === 0
          ? Math.max(r.quantity, Math.min(r.maxQuantity, current.maxQuantity) - otherQuantity)
          : r.quantity;
        return (
          <label
            key={r.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            {r.name} {r.variantName} · Free
            <select
              disabled={busy}
              value={s?.quantity ?? 0}
              onChange={(e) => {
                const rest = selections.filter(
                  (s) =>
                    !(
                      s.offeringId === r.offeringId &&
                      s.variantId === r.variantId
                    ),
                );
                const quantity = Number(e.target.value);
                setSelections(
                  quantity
                    ? [
                        ...rest,
                        {
                          offeringId: r.offeringId,
                          variantId: r.variantId,
                          quantity,
                        },
                      ]
                    : rest,
                );
              }}
              className="rounded-lg border p-2"
            >
              {Array.from({ length: Math.max(max, r.quantity) + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Remove request" : n}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <PersonalizationPicker
        offerings={fresh}
        retainedQuantities={retainedQuantities}
        freeOnly
        selections={selections}
        onChange={setSelections}
        preferences={preferences}
        startAt={booking.startAt ?? ""}
        timezone={booking.timezone}
        disabled={busy}
      />
      <label className="block text-sm">
        Additional arrival notes
        <textarea
          maxLength={1000}
          rows={3}
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 p-3"
        />
      </label>
      <p className="text-xs text-slate-500">
        Only free requests can be changed here, before their deadline and before
        preparation begins. Paid extras need hotel assistance.
      </p>
      {conflict && (
        <p role="alert" className="text-sm text-amber-800">
          The hotel updated this booking while you were editing. Close this form
          and reopen it to review the latest details.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || conflict}
          onClick={() => void save(false)}
          className="rounded-xl border px-4 py-3 text-sm"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={busy || conflict || !reviewed || !arrival}
          onClick={() => void save(true)}
          className="rounded-xl bg-[#061224] px-4 py-3 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Submit pre check-in"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={close}
          className="px-3 text-sm underline"
        >
          Close
        </button>
      </div>
    </div>
  );
}
