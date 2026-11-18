"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Layers } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type {
  BulkUnitPreview,
  BulkUnitSource,
} from "@/lib/partner/reservations/bulk-unit-domain";
import { Drawer } from "./drawer";
import {
  pmsButton,
  pmsInput,
  pmsPrimaryButton,
  StatusPill,
} from "./settings/settings-shared";

export function BulkRoomNumbers({
  propertyId,
  rooms,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  propertyId: string;
  rooms: { id: string; name: string; inventory: number }[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const client = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };

  const [roomTypeId, setRoomTypeId] = useState("");
  const [mode, setMode] = useState<"range" | "list">("range");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<BulkUnitPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function edit(change: () => void) {
    change();
    setPreview(null);
    setError("");
    setNotice("");
  }

  async function submit(create: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const source: BulkUnitSource =
        mode === "range" ? { mode, start, end } : { mode, text };
      const body = create
        ? { action: "create", propertyId, previewId: preview!.previewId }
        : { action: "preview", propertyId, roomTypeId, source };
      if (create) {
        const result = await apiFetch<{ count: number }>(
          "/api/partner/physical-units/bulk",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        setPreview(null);
        setNotice(
          `Added ${result.count} room numbers. Sellable capacity is unchanged.`,
        );
        await client.invalidateQueries({ queryKey: ["partner", propertyId] });
      } else {
        const result = await apiFetch<BulkUnitPreview>(
          "/api/partner/physical-units/bulk",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        setPreview(result);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!hideTrigger && (
        <div className="mt-5">
          <button
            type="button"
            className={pmsPrimaryButton}
            aria-expanded={open}
            disabled={busy}
            onClick={() => setOpen(!open)}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            Add multiple room numbers
          </button>
        </div>
      )}

      <Drawer
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Add multiple room numbers"
        description="Add up to 100 numbers for one room type. Existing numbers are skipped, including inactive rooms."
        badge={<StatusPill tone="gold">Up to 100</StatusPill>}
      >
        <div className="space-y-5">
          <form
            className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium text-[#061224]">
                <span>Room type for multiple numbers</span>
                <select
                  required
                  className={pmsInput}
                  value={roomTypeId}
                  onChange={(e) => edit(() => setRoomTypeId(e.target.value))}
                >
                  <option value="">Choose room type</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · capacity {r.inventory}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-[#061224]">
                <span>Entry method</span>
                <select
                  className={pmsInput}
                  value={mode}
                  onChange={(e) =>
                    edit(() => setMode(e.target.value as "range" | "list"))
                  }
                >
                  <option value="range">Number range</option>
                  <option value="list">Paste a list</option>
                </select>
              </label>

              {mode === "range" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                    <span>First number</span>
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]+"
                      maxLength={40}
                      className={pmsInput}
                      placeholder="001"
                      value={start}
                      onChange={(e) => edit(() => setStart(e.target.value))}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-[#061224]">
                    <span>Last number</span>
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]+"
                      maxLength={40}
                      className={pmsInput}
                      placeholder="050"
                      value={end}
                      onChange={(e) => edit(() => setEnd(e.target.value))}
                    />
                  </label>
                </div>
              ) : (
                <label className="block space-y-1.5 text-sm font-medium text-[#061224]">
                  <span>Room numbers (commas or one per line)</span>
                  <textarea
                    required
                    rows={5}
                    maxLength={5000}
                    className={pmsInput}
                    placeholder={"A101, A102\nB201"}
                    value={text}
                    onChange={(e) => edit(() => setText(e.target.value))}
                  />
                </label>
              )}

              <button className={`${pmsButton} w-full`} type="submit">
                {busy
                  ? "Working…"
                  : preview
                    ? "Refresh preview"
                    : "Preview room numbers"}
              </button>
            </fieldset>
          </form>

          {preview && (
            <div
              className="space-y-3.5 rounded-2xl border border-[#e9ddc1] bg-[#fbf5e8]/60 p-4 sm:p-5 text-sm"
              aria-label="Room numbers preview"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[#061224]">
                  {preview.newLabels.length} new room numbers ·{" "}
                  {preview.remainingCapacity} capacity remaining
                </p>
                <StatusPill
                  tone={preview.capacityAfter < 0 ? "rose" : "emerald"}
                >
                  {preview.capacityAfter < 0
                    ? `Over by ${-preview.capacityAfter}`
                    : `${preview.capacityAfter} left after`}
                </StatusPill>
              </div>

              {preview.newLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.newLabels.slice(0, 24).map((lbl) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                    >
                      {lbl}
                    </span>
                  ))}
                  {preview.newLabels.length > 24 && (
                    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                      +{preview.newLabels.length - 24} more
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-1.5 rounded-xl border border-slate-200/80 bg-white p-3 text-xs text-slate-600">
                <p className="break-words">
                  <strong className="text-[#061224]">Proposed:</strong>{" "}
                  {preview.proposed.join(", ")}
                </p>
                <p className="break-words">
                  <strong className="text-[#061224]">New:</strong>{" "}
                  {preview.newLabels.join(", ") || "None"}
                </p>
                <p className="break-words">
                  <strong className="text-[#061224]">
                    Existing (skipped):
                  </strong>{" "}
                  {preview.existing
                    .map(
                      (u) =>
                        `${u.label} (${u.status}; ${rooms.find((r) => r.id === u.roomTypeId)?.name || "another room type"})`,
                    )
                    .join(", ") || "None"}
                </p>
                <p className="break-words">
                  <strong className="text-[#061224]">
                    Repeated entries (skipped):
                  </strong>{" "}
                  {preview.duplicates.join(", ") || "None"}
                </p>
              </div>

              {preview.capacityAfter < 0 ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800"
                >
                  Exceeds capacity by {-preview.capacityAfter}. Edit the numbers
                  or choose another room type, then preview again.
                </p>
              ) : (
                <p className="text-xs font-medium text-slate-700">
                  Capacity remaining after adding: {preview.capacityAfter}
                </p>
              )}

              <button
                type="button"
                className={`${pmsPrimaryButton} w-full`}
                disabled={busy || !preview.canSave}
                onClick={() => void submit(true)}
              >
                Add {preview.newLabels.length} room numbers
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-800"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                aria-hidden="true"
              />
              <span className="break-words">{error}</span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-800"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
              <span className="break-words">{notice}</span>
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
