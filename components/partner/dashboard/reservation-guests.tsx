"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useHotelCapabilities } from "./hotel-capabilities";
import type { ReportReservationDraft } from "./reservation-operations";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  RotateCcw,
  User,
  UserCheck,
  Users,
} from "lucide-react";

type GuestData = {
  identityVersion: number;
  registrationEditable: boolean;
  occupants: { name: string; ageGroup: "adult" | "child" | "infant" }[];
  registrationIncomplete: boolean;
  revision: number;
  createdByStaffId: string | null;
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

  if (q.isPending)
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-2xl border border-[#ede7dc] bg-white p-6 text-xs font-semibold text-[#8b96aa]"
      >
        <RotateCcw className="h-4 w-4 animate-spin text-[#c89b3c]" />
        <span>Loading guest registration…</span>
      </div>
    );

  if (!q.data)
    return (
      <div
        role="alert"
        className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
      >
        <span>Unable to load guest registration.</span>
        <button
          className="font-bold underline"
          onClick={() => void q.refetch()}
        >
          Retry
        </button>
      </div>
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
    <section className="space-y-4 rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 text-[#061224] shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3efe8] pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#061224]">
              Staying guests and registration
            </h3>
            <p className="text-[11px] text-[#8b96aa]">
              Registered guest names and room occupant details
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
            initialData.registrationIncomplete
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {!data.registrationEditable
            ? "Completed stay"
            : initialData.registrationIncomplete
              ? "Registration incomplete — accompanying details are still needed."
              : "Registration complete."}
        </span>
      </div>

      {/* Metadata Channel & Account */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b96aa]">
            Booking Channel
          </span>
          <p className="mt-0.5 font-bold text-[#061224]">
            {data.createdByStaffId ? "Front Desk" : "Helpkey Online"}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b96aa]">
            Guest Account
          </span>
          <div className="mt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                initialData.linked
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-100 text-[#4d5870]"
              }`}
            >
              {initialData.linked ? "Verified & Linked" : "Guest booking"}
            </span>
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b96aa]">
            Occupancy
          </span>
          <p className="mt-0.5 font-bold text-[#061224]">
            {data.adults} adult{data.adults > 1 ? "s" : ""}
            {data.children > 0
              ? `, ${data.children} child${data.children > 1 ? "ren" : ""}`
              : ""}
            {data.infants > 0
              ? `, ${data.infants} infant${data.infants > 1 ? "s" : ""}`
              : ""}
          </p>
        </div>
      </div>

      {/* Stay Timings Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3 text-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8b96aa]">
            <Clock className="h-3 w-3 text-[#c89b3c]" />
            <span>Recorded arrival</span>
          </div>
          <p className="font-semibold text-[#061224]">
            {when(initialData.recordedArrivalAt)}
          </p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8b96aa]">
            <Clock className="h-3 w-3 text-emerald-600" />
            <span>Actual check-in</span>
          </div>
          <p className="font-semibold text-[#061224]">
            {when(initialData.actualCheckInAt)}
          </p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8b96aa]">
            <Clock className="h-3 w-3 text-[#8b96aa]" />
            <span>Actual checkout</span>
          </div>
          <p className="font-semibold text-[#061224]">
            {when(initialData.actualCheckOutAt)}{" "}
            <span className="text-[10px] text-[#8b96aa]">
              ({data.timezone})
            </span>
          </p>
        </div>
      </div>

      {/* Alerts & Notices */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>{error} Your input is retained.</p>
            <button
              type="button"
              className="font-bold underline hover:text-red-900"
              disabled={busy || registrationSaving}
              onClick={() => void reload()}
            >
              Reload saved details
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {!data.registrationEditable ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs text-[#68758c]">
          <Info className="h-4 w-4 text-[#c89b3c] shrink-0" />
          <p>
            This completed stay record is locked. Contact property management if
            historical registration details need adjustment.
          </p>
        </div>
      ) : (
        <>
          {/* Reload Saved Details Action */}
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#ede7dc] bg-[#fbfaf8] px-3 py-1.5 text-xs font-semibold text-[#68758c] hover:bg-[#fbf5e8] hover:text-[#061224] hover:border-[#c89b3c] transition-colors disabled:opacity-50"
              disabled={busy || registrationSaving}
              onClick={() => void reload()}
            >
              <RotateCcw className="h-3 w-3 text-[#c89b3c]" />
              <span>
                Reload saved guest details (replaces unsaved registration)
              </span>
            </button>
          </div>

          {/* Occupants Registration Form */}
          <form
            key={`${data.revision}:${formVersion}`}
            className="space-y-3"
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
            <div className="space-y-3">
              {slots.map((s, i) => {
                const isLead = s.group === "adult" && s.index === 0;
                const labelText = isLead
                  ? "Lead staying adult"
                  : `${s.group} ${s.index + 1}`;
                return (
                  <label
                    key={`${s.group}-${s.index}`}
                    className="block text-xs font-semibold text-[#68758c] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[#061224] font-bold">
                        <User
                          className={`h-3.5 w-3.5 ${
                            isLead ? "text-[#c89b3c]" : "text-[#8b96aa]"
                          }`}
                        />
                        <span>{labelText}</span>
                      </span>
                      {isLead ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                          Primary Guest
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium capitalize text-[#8b96aa]">
                          {s.group} occupant
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        name={`guest-${i}`}
                        aria-label={labelText}
                        defaultValue={s.guest?.name || ""}
                        required={i === 0}
                        minLength={2}
                        maxLength={120}
                        disabled={!editable || busy || registrationSaving}
                        placeholder={
                          isLead
                            ? "Full legal name of lead guest"
                            : "Full name of occupant (optional)"
                        }
                        className="w-full rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#061224] shadow-xs placeholder-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c] disabled:bg-[#f8f6f0] disabled:text-[#8b96aa] transition-colors"
                      />
                    </div>
                  </label>
                );
              })}
            </div>

            {editable && (
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={busy || registrationSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#132c50] transition-colors disabled:opacity-50"
                >
                  <UserCheck className="h-4 w-4 text-[#c89b3c]" />
                  <span>Save guest registration</span>
                </button>
              </div>
            )}
          </form>

          {/* Customer Invitation Section */}
          {editable && data.identityVersion === 2 && !initialData.linked && (
            <div className="mt-5 rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-4 space-y-3.5">
              <form
                className="space-y-3"
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
                <div className="flex items-center gap-2 border-b border-[#f3efe8] pb-2.5">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c]">
                    <Mail className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#061224]">
                      Invite a customer account
                    </h4>
                  </div>
                </div>

                <p className="text-xs text-[#68758c] leading-relaxed">
                  Provide customer account access to this reservation. Use the
                  lead guest’s email or an agreed booking contact.
                </p>

                <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
                  Recipient email
                  <div className="relative">
                    <input
                      name="email"
                      aria-label="Recipient email"
                      defaultValue={data.leadEmail || ""}
                      onChange={(e) =>
                        setInvitationDirty(
                          e.target.value !== (data.leadEmail || ""),
                        )
                      }
                      required
                      type="email"
                      placeholder="guest@example.com"
                      className="w-full rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 text-xs font-medium text-[#061224] shadow-xs placeholder-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c] disabled:bg-[#f8f6f0] disabled:text-[#8b96aa]"
                      disabled={busy || registrationSaving}
                    />
                  </div>
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={busy || registrationSaving}
                    className="inline-flex items-center justify-center rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#132c50] transition-colors disabled:opacity-50"
                  >
                    Create customer invitation
                  </button>
                  {(initialData.customerInvitation?.status === "pending" ||
                    link) && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
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
                </div>

                {initialData.customerInvitation && (
                  <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ede7dc] bg-white p-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                          initialData.customerInvitation.status === "accepted"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : initialData.customerInvitation.status === "pending"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-slate-200 bg-slate-100 text-slate-700"
                        }`}
                      >
                        Invitation {initialData.customerInvitation.status}
                      </span>
                      {initialData.customerInvitation.email && (
                        <span className="font-semibold text-[#061224]">
                          {initialData.customerInvitation.email}
                        </span>
                      )}
                    </div>
                    {initialData.customerInvitation.expiresAt && (
                      <p className="text-[11px] text-[#8b96aa]">
                        Expires {when(initialData.customerInvitation.expiresAt)}
                      </p>
                    )}
                  </div>
                )}

                {link && (
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5 pt-1">
                    Private customer invitation
                    <input
                      aria-label="Private customer invitation"
                      readOnly
                      value={link}
                      className="w-full rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2 text-xs font-mono font-medium text-[#061224] shadow-xs focus:outline-none"
                    />
                  </label>
                )}
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
