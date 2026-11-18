"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Copy,
  Link2,
  MailPlus,
  Shield,
  UserMinus,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { staffRoles } from "@/lib/partner/pms/domain";
import {
  ConfirmActionDialog,
  errorMessage,
  formatDateTime,
  formatRoleLabel,
  formatShortDate,
  pmsButton,
  pmsCard,
  pmsDangerButton,
  pmsInput,
  pmsPrimaryButton,
  settingsHref,
  SettingsNoticeBanner,
  SettingsSubpageHeader,
  StatusPill,
  toInitials,
  type PmsStatus,
  type TeamData,
} from "./settings-shared";

export function TeamAccessSection({
  propertyId,
  propertyName,
  data,
}: {
  propertyId: string;
  propertyName?: string;
  data: PmsStatus;
}) {
  const client = useQueryClient();
  const base = `/api/partner/properties/${propertyId}/pms/team`;
  const query = useQuery({
    queryKey: ["partner", propertyId, "team", undefined],
    queryFn: ({ signal }) => apiFetch<TeamData>(base, { signal }),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("receptionist");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  async function send(body: object, clearInviteEmail = false) {
    setBusy(true);
    setError("");
    setNotice("");
    setLink("");
    setCopied(false);
    try {
      const result = await apiFetch<{ token?: string; invitationId?: string }>(
        base,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (result.token) {
        setLink(
          `${location.origin}/partner/invitations/${result.invitationId}#token=${result.token}`,
        );
        if (clearInviteEmail) setEmail("");
      }
      setNotice(
        result.token
          ? "Invitation created. Share the link privately with this person. It expires in 7 days and replaces any previous link."
          : "Team access updated.",
      );
      await client.invalidateQueries({ queryKey: ["partner"] });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setRevokeTarget(null);
    }
  }

  const members = query.data?.members ?? [];
  const activeMembersCount = members.filter((m) => m.status === "active").length;
  const invitations = query.data?.invitations ?? [];
  const recentEvents = (query.data?.events ?? []).slice(0, 6);

  return (
    <div className="space-y-6 pb-10 text-[#061224]">
      <SettingsSubpageHeader
        propertyId={propertyId}
        propertyName={propertyName}
        section="team"
        title="Team & Access"
        description="Invite staff with verified emails, assign fixed hotel roles, and revoke access immediately."
        data={data}
      />

      <SettingsNoticeBanner
        notice={notice}
        error={error}
        onDismissNotice={() => setNotice("")}
        onDismissError={() => setError("")}
      />

      {link && (
        <section className="rounded-2xl border border-[#e9ddc1] bg-[#fbf5e8] p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e9ddc1] bg-white text-[#936c22]">
              <Link2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <label
                htmlFor="private-invitation-link"
                className="block text-sm font-bold text-[#061224]"
              >
                Private invitation link
              </label>
              <p className="mt-0.5 text-xs text-amber-900/90">
                Share this link directly with the invited staff member. It
                expires in 7 days and replaces any previous link for this email.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  id="private-invitation-link"
                  readOnly
                  className={`${pmsInput} font-mono text-xs`}
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className={`${pmsPrimaryButton} shrink-0`}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(link)
                      .then(() => {
                        setCopied(true);
                        setNotice("Invitation link copied.");
                      })
                      .catch(() =>
                        setError("Select and copy the link manually."),
                      )
                  }
                >
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] xl:items-start">
        {/* Left: Team Members + Invitations */}
        <div className="space-y-6">
          {query.isPending ? (
            <div className={pmsCard} role="status">
              <p className="text-sm font-medium text-slate-500">
                Loading hotel team…
              </p>
            </div>
          ) : query.isError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-800"
            >
              <span>{errorMessage(query.error)}</span>
              <button
                type="button"
                className={pmsButton}
                onClick={() => void query.refetch()}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <section className={pmsCard}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Users
                      className="h-5 w-5 text-[#c89b3c]"
                      aria-hidden="true"
                    />
                    <h2 className="text-lg font-bold text-[#061224]">
                      Team members
                    </h2>
                  </div>
                  <StatusPill tone="slate">
                    {activeMembersCount} active
                  </StatusPill>
                </div>

                <div className="mt-4 divide-y divide-slate-100">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      className="flex flex-col gap-3 py-4 first:pt-2 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#061224] text-xs font-bold text-white">
                          {toInitials(m.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[#061224]">
                              {m.name}
                            </p>
                            <StatusPill
                              tone={m.status === "active" ? "emerald" : "slate"}
                            >
                              {m.status === "active" ? "Active" : m.status}
                            </StatusPill>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {m.email || "No email"}
                          </p>
                        </div>
                      </div>

                      {m.role === "owner" ? (
                        <StatusPill tone="gold">
                          <Shield className="h-3 w-3" aria-hidden="true" />
                          Owner · protected
                        </StatusPill>
                      ) : m.status === "active" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Role for ${m.name}`}
                            disabled={busy}
                            className={`${pmsInput} !min-h-10 !w-auto min-w-[160px]`}
                            value={m.role}
                            onChange={(e) =>
                              void send({
                                action: "role",
                                userId: m.userId,
                                role: e.target.value,
                              })
                            }
                          >
                            {staffRoles.map((r) => (
                              <option key={r} value={r}>
                                {formatRoleLabel(r)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={pmsDangerButton}
                            disabled={busy}
                            onClick={() =>
                              setRevokeTarget({
                                userId: m.userId,
                                name: m.name,
                              })
                            }
                          >
                            <UserMinus className="h-4 w-4" aria-hidden="true" />
                            Revoke access
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">
                          Invite again to restore access
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className={pmsCard}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-[#061224]">
                    Invitations
                  </h2>
                  <StatusPill tone="slate">
                    {invitations.filter((i) => i.status === "pending").length}{" "}
                    pending
                  </StatusPill>
                </div>

                {!invitations.length ? (
                  <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                    No invitations yet. Use the form on the right to create a
                    private invitation link.
                  </p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-100">
                    {invitations.map((inv) => {
                      const statusTone =
                        inv.status === "pending"
                          ? "amber"
                          : inv.status === "accepted"
                            ? "emerald"
                            : "slate";
                      return (
                        <div
                          key={inv.id}
                          className="flex flex-col gap-3 py-3.5 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-[#061224]">
                                {inv.email}
                              </p>
                              <StatusPill tone={statusTone}>
                                {inv.status}
                              </StatusPill>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatRoleLabel(inv.role)} · expires{" "}
                              {formatShortDate(inv.expiresAt)}
                            </p>
                          </div>

                          {inv.status === "pending" && (
                            <button
                              type="button"
                              className={pmsButton}
                              disabled={busy}
                              onClick={() =>
                                void send({
                                  action: "cancel",
                                  invitationId: inv.id,
                                })
                              }
                            >
                              Cancel invitation
                            </button>
                          )}
                          {["expired", "cancelled"].includes(inv.status) && (
                            <button
                              type="button"
                              className={pmsButton}
                              disabled={busy}
                              onClick={() =>
                                void send({
                                  action: "invite",
                                  email: inv.email,
                                  role: inv.role,
                                })
                              }
                            >
                              Create new link
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Right Rail: Invite Form + Recent Access Activity */}
        <div className="space-y-6">
          <section className={pmsCard}>
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-indigo-200/80 bg-indigo-50 text-indigo-700">
                <MailPlus className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#061224]">
                  Invite a team member
                </h2>
                <p className="text-xs text-slate-500">
                  Generates a private 7-day link
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Invite one person to this hotel. They must sign in with the
              invited verified email. Ownership changes are not supported here.
            </p>

            <form
              className="mt-4 space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void send({ action: "invite", email, role }, true);
              }}
            >
              <label className="block space-y-1.5 text-sm font-medium text-[#061224]">
                <span>Email</span>
                <input
                  required
                  type="email"
                  placeholder="staff@hotel.com"
                  className={pmsInput}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-[#061224]">
                <span>Role</span>
                <select
                  className={pmsInput}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {staffRoles.map((r) => (
                    <option key={r} value={r}>
                      {formatRoleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className={`${pmsPrimaryButton} w-full`}
                disabled={busy}
              >
                {busy ? "Creating…" : "Create invitation"}
              </button>
            </form>
          </section>

          <section className={pmsCard}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#061224]">
                Hotel access activity
              </h2>
              <Link
                href={settingsHref("activity", propertyId)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#936c22] hover:underline"
              >
                View all
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {!recentEvents.length ? (
              <p className="mt-3 text-xs text-slate-500">
                Team and PMS changes will appear here.
              </p>
            ) : (
              <ul className="mt-4 space-y-3.5 border-l border-slate-200 pl-4">
                {recentEvents.map((e) => (
                  <li key={e.id} className="relative text-xs">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#c89b3c]"
                    />
                    <p className="font-semibold text-[#061224]">
                      {e.actorName}{" "}
                      <span className="font-normal text-slate-600">
                        · {e.type.replaceAll("_", " ")}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatDateTime(e.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmActionDialog
        open={revokeTarget !== null}
        title={`Revoke ${revokeTarget?.name ?? "member"}'s access?`}
        description="Their active hotel sessions will be invalidated immediately and they will lose access to this property until invited again."
        confirmLabel="Revoke access"
        tone="danger"
        busy={busy}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) {
            void send({ action: "revoke", userId: revokeTarget.userId });
          }
        }}
      />
    </div>
  );
}
