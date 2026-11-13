"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useHotelCapabilities } from "./hotel-capabilities";
import type { ReportReservationDraft } from "./reservation-operations";
type GuestData = {
  identityVersion: number;
  occupants: { name: string; ageGroup: "adult" | "child" | "infant" }[];
  registrationIncomplete: boolean;
  revision: number;
  createdByStaffId: string;
  bookingContact: { name: string; email: string; phone: string } | null;
  linked: boolean;
  leadEmail?: string;
  customerInvitation?: {
    status: "pending" | "expired" | "cancelled" | "accepted";
    email: string | null;
    expiresAt: string | null;
  } | null;
  recordedArrivalAt: string | null;
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
  timezone: string;
  adults: number;
  children: number;
  infants: number;
};
const field =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm";
export function ReservationGuests({
  bookingId,
  propertyId,
  onChanged,
  onDraftChange,
}: {
  bookingId: string;
  propertyId: string;
  onChanged: () => void;
  onDraftChange: ReportReservationDraft;
}) {
  const permits = useHotelCapabilities();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["partner", propertyId, "registration", bookingId],
    queryFn: ({ signal }) =>
      apiFetch<GuestData>(
        `/api/partner/bookings/${bookingId}/guest-registration`,
        { signal },
      ),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  if (q.isPending) return <p role="status">Loading guest registration…</p>;
  if (!q.data)
    return (
      <p role="alert">
        Unable to load guest registration.{" "}
        <button onClick={() => void q.refetch()}>Retry</button>
      </p>
    );
  return (
    <GuestForm
      key={bookingId}
      bookingId={bookingId}
      data={q.data}
      editable={permits("reservation.note")}
      onDraftChange={onDraftChange}
      onChanged={() => {
        void queryClient.invalidateQueries({
          queryKey: ["partner", propertyId, bookingId, "operations"],
        });
        onChanged();
      }}
      refresh={async () => {
        const result = await q.refetch();
        return result.isError ? undefined : result.data;
      }}
    />
  );
}
function GuestForm({
  bookingId,
  data: initialData,
  editable,
  refresh,
  onChanged,
  onDraftChange,
}: {
  bookingId: string;
  data: GuestData;
  editable: boolean;
  refresh: () => Promise<GuestData | undefined>;
  onChanged: () => void;
  onDraftChange: ReportReservationDraft;
}) {
  const [data, setData] = useState(initialData);
  const [formVersion, setFormVersion] = useState(0);
  async function reload() {
    setBusy(true);
    try {
      const next = await refresh();
      if (next) {
        setData(next);
        setFormVersion((version) => version + 1);
        setDirty(false);
        setError("");
        return true;
      }
      setError(
        "Unable to reload saved guest details. Your input is retained; retry reloading before saving again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [registrationSaving, setRegistrationSaving] = useState(false),
    [link, setLink] = useState("");
  const [dirty, setDirty] = useState(false);
  const [invitationDirty, setInvitationDirty] = useState(false);
  useEffect(() => {
    onDraftChange(
      "guests",
      dirty || invitationDirty,
      busy || registrationSaving,
    );
  }, [onDraftChange, dirty, invitationDirty, busy, registrationSaving]);
  useEffect(() => () => onDraftChange("guests", false), [onDraftChange]);
  async function send(path: string, body: object) {
    onDraftChange("guests", dirty || invitationDirty, true);
    setBusy(true);
    setError("");
    try {
      return await apiFetch<{ token?: string }>(
        `/api/partner/bookings/${bookingId}/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  const slots = (["adult", "child", "infant"] as const).flatMap((group) =>
    Array.from(
      {
        length:
          data[
            group === "adult"
              ? "adults"
              : group === "child"
                ? "children"
                : "infants"
          ],
      },
      (_, index) => ({
        group,
        index,
        guest: data.occupants.filter((g) => g.ageGroup === group)[index],
      }),
    ),
  );
  const when = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("en-IN", { timeZone: data.timezone })
      : "Not recorded";
  return (
    <section className="my-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-[#061224]">
      <h3 className="font-bold">Staying guests and registration</h3>
      <p className="text-xs text-slate-500">
        Name registration only. Existing pre-check-in and identity checks are
        separate.
      </p>
      <p className="text-sm">
        {data.identityVersion !== 2
          ? "Historical registration — review original guest details."
          : initialData.registrationIncomplete
            ? "Registration incomplete — accompanying details are still needed."
            : "Registration complete."}
      </p>
      <p className="text-xs text-slate-500">
        Recorded by staff: {data.createdByStaffId}. Booking contact:{" "}
        {data.bookingContact?.name || "Lead guest"}. Customer account:{" "}
        {initialData.linked ? "Verified and linked" : "Not linked"}.
      </p>
      <p className="text-xs">
        Recorded arrival: {when(initialData.recordedArrivalAt)}
        <br />
        Actual check-in: {when(initialData.actualCheckInAt)}
        <br />
        Actual checkout: {when(initialData.actualCheckOutAt)} ({data.timezone})
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error} Your input is retained.{" "}
          <button
            disabled={busy || registrationSaving}
            onClick={() => void reload()}
          >
            Reload saved details
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data.identityVersion !== 2 ? (
        <p className="text-sm">
          Historical manual/customer record. Original guest details and history
          are preserved; review before correcting ambiguous identities.
        </p>
      ) : (
        <>
          <button
            type="button"
            className={field}
            disabled={busy || registrationSaving}
            onClick={() => void reload()}
          >
            Reload saved guest details (replaces unsaved registration)
          </button>
          <form
            key={`${data.revision}:${formVersion}`}
            className="space-y-2"
            onChange={(e) => {
              const values = new FormData(e.currentTarget);
              setDirty(
                slots.some(
                  (slot, i) =>
                    String(values.get(`guest-${i}`) || "").trim() !==
                    (slot.guest?.name || ""),
                ),
              );
            }}
            onSubmit={async (e) => {
              e.preventDefault();
              setRegistrationSaving(true);
              setNotice("");
              const f = new FormData(e.currentTarget);
              const occupants = slots.flatMap((s, i) => {
                const name = String(f.get(`guest-${i}`) || "").trim();
                return name ? [{ name, ageGroup: s.group }] : [];
              });
              try {
                if (
                  await send("guest-registration", {
                    revision: data.revision,
                    occupants,
                  })
                ) {
                  onChanged();
                  const reloaded = await reload();
                  setNotice(
                    reloaded
                      ? "Guest registration saved."
                      : "Guest registration saved, but the latest details could not be loaded.",
                  );
                }
              } finally {
                setRegistrationSaving(false);
              }
            }}
          >
            {slots.map((s, i) => (
              <label className="block text-sm" key={`${s.group}-${s.index}`}>
                {s.group === "adult" && s.index === 0
                  ? "Lead staying adult"
                  : `${s.group} ${s.index + 1}`}
                <input
                  name={`guest-${i}`}
                  defaultValue={s.guest?.name || ""}
                  required={i === 0}
                  minLength={2}
                  maxLength={120}
                  disabled={!editable || busy || registrationSaving}
                  placeholder="Not registered yet"
                  className={field}
                />
              </label>
            ))}
            {editable && (
              <button disabled={busy || registrationSaving} className={field}>
                Save guest registration
              </button>
            )}
          </form>
          {editable && !initialData.linked && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const result = await send("customer-link", {
                  action: "invite",
                  email: f.get("email"),
                });
                if (result?.token) {
                  setInvitationDirty(false);
                  setLink(
                    `${location.origin}/reservation-invitations/${bookingId}#token=${result.token}`,
                  );
                  await refresh();
                  setNotice(
                    "Invitation created. Share privately with the selected recipient.",
                  );
                }
              }}
            >
              <h4 className="mt-4 font-semibold">Invite a customer account</h4>
              <p className="text-xs">
                This person will receive access to the reservation and guest
                updates. Use the lead guest’s email, or deliberately choose the
                separate booking contact. Matching contact details alone grant
                no access.
              </p>
              <label className="block text-sm">
                Recipient email
                <input
                  name="email"
                  defaultValue={data.leadEmail || ""}
                  onChange={(e) =>
                    setInvitationDirty(
                      e.target.value !== (data.leadEmail || ""),
                    )
                  }
                  required
                  type="email"
                  className={field}
                  disabled={busy || registrationSaving}
                />
              </label>
              <button disabled={busy || registrationSaving} className={field}>
                Create customer invitation
              </button>
              {initialData.customerInvitation && (
                <p className="mt-2 text-sm" role="status">
                  Invitation {initialData.customerInvitation.status}
                  {initialData.customerInvitation.email
                    ? ` · ${initialData.customerInvitation.email}`
                    : ""}
                  {initialData.customerInvitation.expiresAt
                    ? ` · Expires ${when(initialData.customerInvitation.expiresAt)}`
                    : ""}
                </p>
              )}
              {link && (
                <label className="block text-sm">
                  Private customer invitation
                  <input readOnly value={link} className={field} />
                </label>
              )}
              {(initialData.customerInvitation?.status === "pending" ||
                link) && (
                <button
                  type="button"
                  className={field}
                  disabled={busy || registrationSaving}
                  onClick={async () => {
                    if (await send("customer-link", { action: "cancel" })) {
                      setLink("");
                      await refresh();
                      setNotice("Invitation cancelled.");
                    }
                  }}
                >
                  Cancel invitation
                </button>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}
