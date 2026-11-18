"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Layers, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { compareRoomLabels } from "@/lib/partner/reservations/bulk-unit-domain";
import { BulkRoomNumbers } from "../bulk-room-numbers";
import {
  ConfirmActionDialog,
  errorMessage,
  pmsButton,
  pmsCard,
  pmsDangerButton,
  pmsInput,
  pmsPrimaryButton,
  SettingsNoticeBanner,
  SettingsSubpageHeader,
  StatusPill,
  type PmsStatus,
} from "./settings-shared";

type RoomTypeSummary = {
  id: string;
  name: string;
  inventory: number;
  status?: string;
};

type PhysicalUnit = {
  id: string;
  label: string;
  roomTypeId: string;
  status: string;
};

export function RoomNumbersSection({
  propertyId,
  propertyName,
  data,
}: {
  propertyId: string;
  propertyName?: string;
  data: PmsStatus;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["partner", propertyId, "register-setup"],
    queryFn: async ({ signal }) => {
      const [units, listing] = await Promise.all([
        apiFetch<{ units: PhysicalUnit[] }>(
          `/api/partner/physical-units?propertyId=${propertyId}`,
          { signal },
        ),
        apiFetch<{ roomTypes: RoomTypeSummary[] }>(
          `/api/partner/properties/${propertyId}?view=rooms`,
          { signal },
        ),
      ]);
      return { units: units.units, rooms: listing.roomTypes };
    },
  });

  const [room, setRoom] = useState("");
  const [label, setLabel] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<PhysicalUnit | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const allRooms = useMemo(() => query.data?.rooms ?? [], [query.data?.rooms]);
  const activeRooms = useMemo(
    () => allRooms.filter((r) => r.status !== "paused"),
    [allRooms],
  );
  const allUnits = useMemo(() => query.data?.units ?? [], [query.data?.units]);

  const totalCapacity = activeRooms.reduce(
    (sum, r) => sum + (Number.isFinite(r.inventory) ? r.inventory : 0),
    0,
  );
  const totalActiveUnits = allUnits.filter((u) => u.status === "active").length;
  const capacityPct = totalCapacity
    ? Math.min(100, Math.round((totalActiveUnits / totalCapacity) * 100))
    : 0;

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUnits
      .filter((u) => {
        if (statusFilter !== "all" && u.status !== statusFilter) return false;
        if (q && !u.label.toLowerCase().includes(q)) return false;
        return true;
      })
      .toSorted((a, b) => compareRoomLabels(a.label, b.label));
  }, [allUnits, search, statusFilter]);

  const groupedByRoomType = useMemo(() => {
    const groups = allRooms.map((rt) => ({
      roomType: rt,
      units: filteredUnits.filter((u) => u.roomTypeId === rt.id),
      activeCount: allUnits.filter(
        (u) => u.roomTypeId === rt.id && u.status === "active",
      ).length,
    }));
    const knownIds = new Set(allRooms.map((r) => r.id));
    const orphaned = filteredUnits.filter((u) => !knownIds.has(u.roomTypeId));
    return { groups, orphaned };
  }, [allRooms, allUnits, filteredUnits]);

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
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setDeactivateTarget(null);
    }
  }

  return (
    <div className="space-y-6 pb-10 text-[#061224]">
      <SettingsSubpageHeader
        propertyId={propertyId}
        propertyName={propertyName}
        section="rooms"
        title="Room Numbers"
        description="Register physical room numbers within your configured sellable capacity. Adding room numbers never increases rooms for sale."
        data={data}
        actions={
          <button
            type="button"
            aria-expanded={bulkOpen}
            disabled={busy || query.isPending}
            onClick={() => setBulkOpen(true)}
            className={pmsPrimaryButton}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            Add multiple room numbers
          </button>
        }
      />

      <SettingsNoticeBanner
        notice={notice}
        error={error}
        onDismissNotice={() => setNotice("")}
        onDismissError={() => setError("")}
      />

      {query.isPending ? (
        <div className={pmsCard} role="status">
          <p className="text-sm font-medium text-slate-500">
            Loading room register…
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
            onClick={() => void query.refetch()}
            className={pmsButton}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Capacity Overview + Search/Filter */}
          <section className={pmsCard}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-bold text-[#061224]">
                    Physical room register
                  </h2>
                  <StatusPill
                    tone={
                      totalCapacity > 0 && totalActiveUnits === totalCapacity
                        ? "emerald"
                        : "gold"
                    }
                  >
                    {totalActiveUnits} of {totalCapacity} active rooms assigned (
                    {capacityPct}%)
                  </StatusPill>
                </div>
                <div
                  className="h-2 max-w-md overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={capacityPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Room number capacity progress"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      capacityPct === 100 ? "bg-emerald-500" : "bg-[#c89b3c]"
                    }`}
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="relative min-w-0 sm:w-56">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search room number…"
                    aria-label="Search room number"
                    className={`${pmsInput} !min-h-10 pl-9`}
                  />
                </div>
                <div
                  role="group"
                  aria-label="Filter rooms by status"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1"
                >
                  {(["all", "active", "inactive"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={statusFilter === status}
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition cursor-pointer ${
                        statusFilter === status
                          ? "bg-[#061224] text-white shadow-2xs"
                          : "text-slate-600 hover:bg-white hover:text-[#061224]"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Single room quick-add form */}
            <form
              className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-[1fr_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void save({ roomTypeId: room, label, status: "active" });
              }}
            >
              <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                <span>Room type</span>
                <select
                  required
                  className={pmsInput}
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                >
                  <option value="">Choose room type</option>
                  {activeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · capacity {r.inventory}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                <span>Room number</span>
                <input
                  required
                  maxLength={40}
                  className={pmsInput}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. 101"
                />
              </label>
              <button
                type="submit"
                className={`${pmsButton} self-end`}
                disabled={busy}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add room number
              </button>
            </form>
          </section>

          {/* Grouped Room-Type Cards */}
          <div className="space-y-4">
            {groupedByRoomType.groups.map(
              ({ roomType, units, activeCount }) => {
                const remaining = Math.max(0, roomType.inventory - activeCount);
                const complete =
                  roomType.inventory > 0 && activeCount === roomType.inventory;
                const paused = roomType.status === "paused";
                return (
                  <section key={roomType.id} className={pmsCard}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e9ddc1] bg-[#fbf5e8] text-[#936c22]">
                          <BedDouble className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-[#061224]">
                            {roomType.name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            Sellable capacity: {roomType.inventory}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {paused && <StatusPill tone="slate">Paused</StatusPill>}
                        <StatusPill tone={complete ? "emerald" : "gold"}>
                          {activeCount} / {roomType.inventory} assigned
                          {remaining > 0 ? ` · ${remaining} remaining` : ""}
                        </StatusPill>
                      </div>
                    </div>

                    {units.length === 0 && remaining === 0 ? (
                      <p className="mt-4 text-xs text-slate-500">
                        No room numbers match the current filter.
                      </p>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {units.map((u) => {
                          const isActive = u.status === "active";
                          return (
                            <div
                              key={u.id}
                              className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition ${
                                isActive
                                  ? "border-emerald-200/80 bg-emerald-50/35"
                                  : "border-slate-200 bg-slate-50/70 opacity-80"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  aria-hidden="true"
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    isActive ? "bg-emerald-500" : "bg-slate-400"
                                  }`}
                                />
                                <span className="truncate text-sm font-bold text-[#061224]">
                                  {u.label}
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">
                                  {u.status}
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  if (isActive) {
                                    setDeactivateTarget(u);
                                  } else {
                                    void save({
                                      id: u.id,
                                      roomTypeId: u.roomTypeId,
                                      label: u.label,
                                      status: "active",
                                    });
                                  }
                                }}
                                className={
                                  isActive
                                    ? `${pmsDangerButton} !min-h-8 !px-2.5 !py-1 !text-xs`
                                    : `${pmsButton} !min-h-8 !px-2.5 !py-1 !text-xs`
                                }
                              >
                                {isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          );
                        })}

                        {!search &&
                          statusFilter !== "inactive" &&
                          remaining > 0 &&
                          Array.from({ length: Math.min(remaining, 4) }).map(
                            (_, idx) => (
                              <div
                                key={`slot-${idx}`}
                                className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-3.5 py-2.5 text-xs font-medium text-slate-400"
                              >
                                Open slot
                              </div>
                            ),
                          )}
                      </div>
                    )}
                  </section>
                );
              },
            )}

            {groupedByRoomType.orphaned.length > 0 && (
              <section className={pmsCard}>
                <h3 className="text-base font-bold text-[#061224]">
                  Archived room types
                </h3>
                <div className="mt-3 divide-y divide-slate-100">
                  {groupedByRoomType.orphaned.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <span>
                        <strong>{u.label}</strong> · {u.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {allUnits.length === 0 && (
              <div className={`${pmsCard} text-center`}>
                <BedDouble
                  className="mx-auto h-8 w-8 text-slate-300"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-semibold text-[#061224]">
                  No physical room numbers registered yet.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Add individual room numbers above or bulk-generate a range.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Slide-over Bulk Room Numbers Drawer */}
      <BulkRoomNumbers
        key={propertyId}
        propertyId={propertyId}
        rooms={activeRooms}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        hideTrigger
      />

      <ConfirmActionDialog
        open={deactivateTarget !== null}
        title={`Deactivate room ${deactivateTarget?.label ?? ""}?`}
        description="Deactivated rooms cannot be assigned to stays and will reduce active registered rooms for this room type. Rooms with active assignments or maintenance blocks must be cleared first."
        confirmLabel="Deactivate"
        tone="danger"
        busy={busy}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (deactivateTarget) {
            void save({
              id: deactivateTarget.id,
              roomTypeId: deactivateTarget.roomTypeId,
              label: deactivateTarget.label,
              status: "inactive",
            });
          }
        }}
      />
    </div>
  );
}
