"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import {
  errorMessage,
  formatDateTime,
  formatRoleLabel,
  pmsButton,
  pmsCard,
  SettingsSubpageHeader,
  StatusPill,
  type PmsStatus,
  type TeamData,
} from "./settings-shared";

type EventCategory = "all" | "pms" | "team" | "rooms";

function categorizeEvent(type: string): Exclude<EventCategory, "all"> {
  if (type.startsWith("team_")) return "team";
  if (type.startsWith("room_")) return "rooms";
  return "pms";
}

function summarizeDiff(event: TeamData["events"][number]): string[] {
  const details: string[] = [];
  const after =
    event.after && typeof event.after === "object"
      ? (event.after as Record<string, unknown>)
      : null;
  const before =
    event.before && typeof event.before === "object"
      ? (event.before as Record<string, unknown>)
      : null;

  if (event.type === "team_invited" && after?.role) {
    details.push(`Invited ${event.targetId} as ${formatRoleLabel(String(after.role))}`);
  } else if (event.type === "team_invitation_cancelled") {
    details.push(`Cancelled invite for ${event.targetId}`);
  } else if (event.type === "team_invitation_accepted" && after?.role) {
    details.push(`Joined as ${formatRoleLabel(String(after.role))}`);
  } else if (event.type === "team_role" && before?.role && after?.role) {
    details.push(
      `Role changed: ${formatRoleLabel(String(before.role))} → ${formatRoleLabel(String(after.role))}`,
    );
  } else if (event.type === "team_revoke") {
    details.push("Access revoked");
  } else if (event.type === "marketplace_pause") {
    details.push(
      event.after === true ? "Public bookings paused" : "Public bookings resumed",
    );
  } else if (event.type === "pms_operational_policies" && after) {
    const enabled = Object.entries(after)
      .filter(([k, v]) => k !== "revision" && v === true)
      .map(([k]) => k.replace(/^require/, "").replace(/([A-Z])/g, " $1").trim());
    details.push(
      enabled.length ? `Enabled: ${enabled.join(", ")}` : "All policies off",
    );
  } else if (event.type.startsWith("room_number") && after?.label) {
    details.push(`Room ${String(after.label)} · ${String(after.status ?? "")}`);
  }

  return details;
}

export function ActivityLogSection({
  propertyId,
  propertyName,
  data,
}: {
  propertyId: string;
  propertyName?: string;
  data: PmsStatus;
}) {
  const [cursor, setCursor] = useState<string>();
  const [filter, setFilter] = useState<EventCategory>("all");
  const base = `/api/partner/properties/${propertyId}/pms/team`;

  const query = useQuery({
    queryKey: ["partner", propertyId, "team", cursor],
    queryFn: ({ signal }) =>
      apiFetch<TeamData>(`${base}${cursor ? `?before=${cursor}` : ""}`, {
        signal,
      }),
  });

  const events = useMemo(() => {
    const all = query.data?.events ?? [];
    if (filter === "all") return all;
    return all.filter((e) => categorizeEvent(e.type) === filter);
  }, [query.data?.events, filter]);

  return (
    <div className="space-y-6 pb-10 text-[#061224]">
      <SettingsSubpageHeader
        propertyId={propertyId}
        propertyName={propertyName}
        section="activity"
        title="Activity & Audit Log"
        description="Chronological audit trail of PMS operations, policy revisions, staff access, and room register updates."
        data={data}
        actions={
          <button
            type="button"
            className={pmsButton}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        }
      />

      <section className={pmsCard}>
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-[#c89b3c]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[#061224]">
              Hotel access activity
            </h2>
          </div>
          <div
            role="group"
            aria-label="Filter activity by category"
            className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1"
          >
            {(
              [
                ["all", "All"],
                ["pms", "PMS & Policies"],
                ["team", "Team & Invites"],
                ["rooms", "Room Register"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  filter === key
                    ? "bg-[#061224] text-white shadow-2xs"
                    : "text-slate-600 hover:bg-white hover:text-[#061224]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {query.isPending ? (
          <p role="status" className="py-8 text-sm text-slate-500">
            Loading audit activity…
          </p>
        ) : query.isError ? (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
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
        ) : !events.length ? (
          <p className="py-8 text-sm text-slate-500">
            No matching activity events on this page.
          </p>
        ) : (
          <ul className="mt-5 space-y-4 border-l-2 border-slate-100 pl-5">
            {events.map((event) => {
              const category = categorizeEvent(event.type);
              const details = summarizeDiff(event);
              const tone =
                category === "team"
                  ? "slate"
                  : category === "rooms"
                    ? "gold"
                    : "emerald";
              return (
                <li
                  key={event.id}
                  className="relative rounded-xl border border-slate-100 bg-slate-50/50 p-3.5"
                >
                  <span
                    aria-hidden="true"
                    className="absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-white bg-[#061224]"
                  />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#061224]">
                        {event.actorName}{" "}
                        <span className="font-normal text-slate-600">
                          · {event.type.replaceAll("_", " ")}
                        </span>
                      </p>
                      {details.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {details.map((text, idx) => (
                            <span
                              key={idx}
                              className="inline-flex rounded-lg border border-slate-200/80 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700"
                            >
                              {text}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill tone={tone}>
                        {category === "team"
                          ? "Team"
                          : category === "rooms"
                            ? "Rooms"
                            : "PMS"}
                      </StatusPill>
                      <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {cursor && (
            <button
              type="button"
              className={pmsButton}
              onClick={() => setCursor(undefined)}
            >
              Latest activity
            </button>
          )}
          {query.data?.nextCursor && (
            <button
              type="button"
              className={pmsButton}
              onClick={() => setCursor(query.data!.nextCursor!)}
            >
              Older activity
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
