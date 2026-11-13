"use client";
import Link from "next/link";
import { BulkRoomNumbers } from "./bulk-room-numbers";
import { compareRoomLabels } from "@/lib/partner/reservations/bulk-unit-domain";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Users,
  ShieldCheck,
  BedDouble,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { staffRoles, type SetupItem } from "@/lib/partner/pms/domain";
import { PartnerShell } from "./partner-shell";

export const pmsButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061224] disabled:cursor-wait disabled:opacity-50";
export const pmsInput =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#061224]";
export const pmsCard =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-xs";
export type PmsStatus = {
  state: "not_activated" | "setup" | "ready" | "disabled";
  role: string;
  activated: boolean;
  reason: string | null;
  items: SetupItem[];
  openingData: string;
  teamReviewed: boolean;
  allowEarlyWalkIns?: boolean;
  adminDisabled: boolean;
  inventoryVerification?: { passed: boolean; checkedAt: string | null };
  marketplace: { bookable: boolean; ownerPaused: boolean; reason: string };
};
export const stateLabels = {
  not_activated: "Not activated",
  setup: "Setup in progress",
  ready: "Ready to use",
  disabled: "Temporarily disabled",
};
type Team = {
  members: {
    userId: string;
    name: string;
    email: string | null;
    role: string;
    status: string;
  }[];
  invitations: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
  }[];
  events: {
    id: string;
    actorName: string;
    type: string;
    targetId: string;
    createdAt: string;
  }[];
  nextCursor: string | null;
};
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to save. Please retry.";
}
function hotelHref(href: string, id: string) {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("propertyId", id);
  return `${path}?${params}`;
}

function TeamEditor({ propertyId }: { propertyId: string }) {
  const client = useQueryClient(),
    base = `/api/partner/properties/${propertyId}/pms/team`;
  const [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ["partner", propertyId, "team", cursor],
    queryFn: ({ signal }) =>
      apiFetch<Team>(`${base}${cursor ? `?before=${cursor}` : ""}`, { signal }),
  });
  const [email, setEmail] = useState(""),
    [role, setRole] = useState<string>("receptionist"),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function send(body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    setLink("");
    try {
      const result = await apiFetch<{ token?: string; invitationId?: string }>(
        base,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (result.token)
        setLink(
          `${location.origin}/partner/invitations/${result.invitationId}#token=${result.token}`,
        );
      setNotice(
        result.token
          ? "Invitation created. Share the link privately with this person. It expires in 7 days and replaces any previous link."
          : "Team access updated.",
      );
      await client.invalidateQueries({ queryKey: ["partner"] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className={pmsCard}>
        <h2 className="text-lg font-bold">Invite a team member</h2>
        <p className="mt-1 text-sm text-slate-500">
          Invite one person to this hotel. They must sign in with the invited
          verified email. Ownership changes are not supported here.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ action: "invite", email, role });
          }}
        >
          <label className="text-sm">
            Email
            <input
              required
              type="email"
              className={pmsInput}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Role
            <select
              className={pmsInput}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {staffRoles.map((r) => (
                <option key={r} value={r}>
                  {r === "maintenance"
                    ? "Maintenance staff"
                    : r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button className={`${pmsButton} self-end`} disabled={busy}>
            Create invitation
          </button>
        </form>
        {link && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3">
            <label className="text-sm font-semibold">
              Private invitation link
              <input
                readOnly
                className={`${pmsInput} mt-2`}
                value={link}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              type="button"
              className={`${pmsButton} mt-2`}
              onClick={() =>
                void navigator.clipboard
                  .writeText(link)
                  .then(() => setNotice("Invitation link copied."))
                  .catch(() => setError("Select and copy the link manually."))
              }
            >
              Copy link
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm text-emerald-700">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
      {query.isPending ? (
        <p role="status">Loading hotel team…</p>
      ) : query.isError ? (
        <div role="alert" className={pmsCard}>
          {message(query.error)}{" "}
          <button className={pmsButton} onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        query.data && (
          <>
            <section className={pmsCard}>
              <h2 className="text-lg font-bold">Team members</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {query.data.members.map((m) => (
                  <div
                    key={m.userId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-sm text-slate-500">
                        {m.email || "No email"} · {m.status}
                      </p>
                    </div>
                    {m.role === "owner" ? (
                      <span className="text-sm font-bold">
                        Owner · protected
                      </span>
                    ) : m.status === "active" ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label={`Role for ${m.name}`}
                          disabled={busy}
                          className={pmsInput + " !w-auto"}
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
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <button
                          className={pmsButton}
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Revoke ${m.name}'s access to this hotel?`,
                              )
                            )
                              void send({ action: "revoke", userId: m.userId });
                          }}
                        >
                          Revoke access
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm">
                        Invite again to restore access
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section className={pmsCard}>
              <h2 className="text-lg font-bold">Invitations</h2>
              {!query.data.invitations.length && (
                <p className="mt-3 text-sm text-slate-500">
                  No invitations yet.
                </p>
              )}
              {query.data.invitations.map((i) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3"
                  key={i.id}
                >
                  <div className="text-sm">
                    <p className="font-semibold">{i.email}</p>
                    <p>
                      {i.role} · {i.status} · expires{" "}
                      {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  {i.status === "pending" && (
                    <button
                      className={pmsButton}
                      disabled={busy}
                      onClick={() =>
                        void send({ action: "cancel", invitationId: i.id })
                      }
                    >
                      Cancel invitation
                    </button>
                  )}
                  {["expired", "cancelled"].includes(i.status) && (
                    <button
                      className={pmsButton}
                      disabled={busy}
                      onClick={() =>
                        void send({
                          action: "invite",
                          email: i.email,
                          role: i.role,
                        })
                      }
                    >
                      Create new link
                    </button>
                  )}
                </div>
              ))}
            </section>
            <section className={pmsCard}>
              <h2 className="text-lg font-bold">Hotel access activity</h2>
              {!query.data.events.length && (
                <p className="mt-3 text-sm text-slate-500">
                  Team and PMS changes will appear here.
                </p>
              )}
              <ul className="mt-3 space-y-3">
                {query.data.events.map((e) => (
                  <li className="text-sm" key={e.id}>
                    <strong>{e.actorName}</strong> ·{" "}
                    {e.type.replaceAll("_", " ")}
                    <p className="break-all text-xs text-slate-500">
                      {e.targetId} · {new Date(e.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                {cursor && (
                  <button
                    className={pmsButton}
                    onClick={() => setCursor(undefined)}
                  >
                    Latest activity
                  </button>
                )}
                {query.data.nextCursor && (
                  <button
                    className={pmsButton}
                    onClick={() => setCursor(query.data!.nextCursor!)}
                  >
                    Older activity
                  </button>
                )}
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
function RoomRegister({ propertyId }: { propertyId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["partner", propertyId, "register-setup"],
    queryFn: async ({ signal }) => {
      const [units, listing] = await Promise.all([
        apiFetch<{
          units: {
            id: string;
            label: string;
            roomTypeId: string;
            status: string;
          }[];
        }>(`/api/partner/physical-units?propertyId=${propertyId}`, { signal }),
        apiFetch<{
          roomTypes: { id: string; name: string; inventory: number }[];
        }>(`/api/partner/properties/${propertyId}?view=rooms`, { signal }),
      ]);
      return { ...units, rooms: listing.roomTypes };
    },
  });
  const [room, setRoom] = useState(""),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function save(fields: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/api/partner/physical-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, ...fields }),
      });
      setLabel("");
      setNotice("Room register saved. Sellable capacity is unchanged.");
      await client.invalidateQueries({ queryKey: ["partner", propertyId] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={pmsCard}>
      <h2 className="text-lg font-bold">Physical room register</h2>
      <p className="mt-1 text-sm text-slate-500">
        Add room numbers within the configured capacity. This never adds rooms
        for sale.
      </p>
      {query.isPending ? (
        <p role="status">Loading room register…</p>
      ) : query.isError ? (
        <p role="alert">
          {message(query.error)}{" "}
          <button onClick={() => void query.refetch()} className={pmsButton}>
            Retry
          </button>
        </p>
      ) : (
        <>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ roomTypeId: room, label, status: "active" });
            }}
          >
            <label className="text-sm">
              Room type
              <select
                required
                className={pmsInput}
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              >
                <option value="">Choose room type</option>
                {query.data?.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · capacity {r.inventory}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Room number
              <input
                required
                maxLength={40}
                className={pmsInput}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. 101"
              />
            </label>
            <button className={`${pmsButton} self-end`} disabled={busy}>
              Add room number
            </button>
          </form>
          <BulkRoomNumbers key={propertyId} propertyId={propertyId} rooms={query.data?.rooms ?? []} />
          <div className="mt-4 divide-y divide-slate-100">
            {query.data?.units.toSorted((a, b) => compareRoomLabels(a.label, b.label)).map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <span className="text-sm">
                  <strong>{u.label}</strong> ·{" "}
                  {query.data?.rooms.find((r) => r.id === u.roomTypeId)?.name} ·{" "}
                  {u.status}
                </span>
                <button
                  disabled={busy}
                  className={pmsButton}
                  onClick={() =>
                    void save({
                      id: u.id,
                      roomTypeId: u.roomTypeId,
                      label: u.label,
                      status: u.status === "active" ? "inactive" : "active",
                    })
                  }
                >
                  {u.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            ))}
            {query.data?.units.length === 0 && (
              <p className="text-sm text-slate-500">
                No physical room numbers registered yet.
              </p>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}
    </section>
  );
}
function Settings({ propertyId }: { propertyId: string }) {
  const client = useQueryClient(),
    params = useSearchParams(),
    section = params.get("section") || "setup";
  const query = useQuery({
    queryKey: ["partner", propertyId, "pms"],
    queryFn: ({ signal }) =>
      apiFetch<PmsStatus>(`/api/partner/properties/${propertyId}/pms`, {
        signal,
      }),
    refetchInterval: 15_000,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function send(body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await apiFetch<PmsStatus>(
        `/api/partner/properties/${propertyId}/pms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (
        saved.inventoryVerification?.checkedAt &&
        !saved.inventoryVerification.passed
      )
        setError(
          "Inventory verification found inconsistencies. Review the checklist and contact support before using PMS.",
        );
      else setNotice("Hotel settings saved.");
      await client.invalidateQueries({ queryKey: ["partner"] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending)
    return <p role="status">Checking this hotel’s PMS setup…</p>;
  if (query.isError || !query.data)
    return (
      <div className={pmsCard} role="alert">
        {message(query.error)}{" "}
        <button className={pmsButton} onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  const data = query.data,
    owner = data.role === "owner";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Hotel settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Prepare hotel operations independently from your public listing.
        </p>
      </div>
      {owner && (
        <nav className="flex flex-wrap gap-2" aria-label="Hotel settings">
          <Link
            className={pmsButton}
            href={hotelHref("/partner/settings", propertyId)}
          >
            <ShieldCheck size={16} />
            PMS setup
          </Link>
          <Link
            className={pmsButton}
            href={hotelHref("/partner/settings?section=team", propertyId)}
          >
            <Users size={16} />
            Team
          </Link>
          <Link
            className={pmsButton}
            href={hotelHref("/partner/settings?section=rooms", propertyId)}
          >
            <BedDouble size={16} />
            Room numbers
          </Link>
        </nav>
      )}
      {section === "team" && owner ? (
        <TeamEditor propertyId={propertyId} />
      ) : section === "rooms" && owner ? (
        <RoomRegister propertyId={propertyId} />
      ) : (
        <>
          <section className={pmsCard}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">
                PMS: {stateLabels[data.state]}
              </h2>
              {owner && (
                <div className="flex flex-wrap gap-2">
                  {data.activated && (
                    <button
                      disabled={busy || !!data.reason}
                      onClick={() => void send({ action: "verify" })}
                      className={pmsButton}
                    >
                      Verify inventory
                    </button>
                  )}
                  {!data.activated ? (
                    <button
                      disabled={busy || !!data.reason}
                      onClick={() => void send({ action: "activate" })}
                      className={pmsButton}
                    >
                      Activate PMS
                    </button>
                  ) : (
                    <button
                      disabled={busy || data.adminDisabled}
                      onClick={() =>
                        void send({
                          action:
                            data.state === "disabled" ? "resume" : "disable",
                        })
                      }
                      className={pmsButton}
                    >
                      {data.state === "disabled"
                        ? "Enable PMS"
                        : "Temporarily disable PMS"}
                    </button>
                  )}
                </div>
              )}
            </div>
            {data.inventoryVerification?.checkedAt && (
              <p className="mt-2 text-xs text-slate-500">
                Last inventory verification:{" "}
                {new Date(
                  data.inventoryVerification.checkedAt,
                ).toLocaleString()}{" "}
                ·{" "}
                {data.inventoryVerification.passed
                  ? "Passed"
                  : "Needs reconciliation"}
              </p>
            )}
            {data.reason && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-amber-50 p-3 text-sm"
              >
                {data.reason}
              </p>
            )}
            {!owner && (
              <p className="mt-3 text-sm text-slate-500">
                Only the hotel owner can activate PMS or change setup
                declarations. Ask your owner to resolve incomplete items.
              </p>
            )}
          </section>
          <section className={pmsCard}>
            <h2 className="text-lg font-bold">
              Public bookings:{" "}
              {data.marketplace.bookable ? "Available" : "Unavailable"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {data.marketplace.reason} PMS availability is managed separately.
            </p>
            {owner && (
              <button
                className={`${pmsButton} mt-3`}
                disabled={busy}
                onClick={() =>
                  void send({
                    action: "marketplace",
                    paused: !data.marketplace.ownerPaused,
                  })
                }
              >
                {data.marketplace.ownerPaused
                  ? "Resume public bookings"
                  : "Pause public bookings"}
              </button>
            )}
          </section>
          <section className={pmsCard}>
            <h2 className="text-lg font-bold">Setup checklist</h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {data.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-4">
                  {item.complete ? (
                    <CheckCircle2
                      className="mt-1 shrink-0 text-emerald-600"
                      size={20}
                    />
                  ) : (
                    <Circle
                      className="mt-1 shrink-0 text-amber-600"
                      size={20}
                    />
                  )}
                  <div>
                    <p className="font-semibold">
                      {item.label}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        · {item.complete ? "Complete" : "Needs attention"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                    {owner && item.href && (
                      <Link
                        className="mt-2 inline-block text-sm font-semibold underline"
                        href={hotelHref(item.href, propertyId)}
                      >
                        Review setup
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {owner && (
            <Declarations
              key={`${propertyId}:${data.openingData}:${data.teamReviewed}`}
              data={data}
              busy={busy}
              save={send}
            />
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
    </div>
  );
}
function Declarations({
  data,
  busy,
  save,
}: {
  data: PmsStatus;
  busy: boolean;
  save: (body: object) => Promise<void>;
}) {
  const [opening, setOpening] = useState(data.openingData),
    [reviewed, setReviewed] = useState(data.teamReviewed),
    [early, setEarly] = useState(data.allowEarlyWalkIns === true);
  return (
    <form
      className={pmsCard}
      onSubmit={(e) => {
        e.preventDefault();
        void save({
          action: "declaration",
          openingData: opening,
          teamReviewed: reviewed,
          allowEarlyWalkIns: early,
        });
      }}
    >
      <h2 className="text-lg font-bold">Confirm opening information</h2>
      <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={early} disabled={busy} onChange={e => setEarly(e.target.checked)} />Allow overnight walk-ins before standard check-in. Charge full current-date nights; show checkout explicitly. Never book the previous night.</label>
      <label className="mt-4 block text-sm">
        Does this hotel have reservations or balances outside Helpkey to bring
        across?
        <select
          required
          disabled={busy}
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          className={`${pmsInput} mt-2`}
        >
          <option value="unknown">Choose an answer</option>
          <option value="none">
            No — all required information is already in Helpkey, or this is a
            new hotel
          </option>
          <option value="external">
            Yes — external reservations or balances need reconciliation
          </option>
        </select>
      </label>
      <p className="mt-2 text-sm text-slate-500">
        Import is not available in Phase 1. External opening information keeps
        setup incomplete.
      </p>
      <label className="mt-4 flex gap-2 text-sm">
        <input
          type="checkbox"
          disabled={busy}
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        I reviewed the hotel team, or I operate this hotel alone.
      </label>
      <button
        disabled={busy || opening === "unknown"}
        className={`${pmsButton} mt-4`}
      >
        Save opening information
      </button>
    </form>
  );
}
export function PmsSettingsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) =>
        selectedProperty ? (
          <Settings propertyId={selectedProperty.id} />
        ) : (
          <p>No assigned hotel. Ask the hotel owner for an invitation.</p>
        )
      }
    </PartnerShell>
  );
}
