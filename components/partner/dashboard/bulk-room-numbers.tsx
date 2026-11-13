"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type {
  BulkUnitPreview,
  BulkUnitSource,
} from "@/lib/partner/reservations/bulk-unit-domain";

const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const buttonClass =
  "min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
export function BulkRoomNumbers({
  propertyId,
  rooms,
}: {
  propertyId: string;
  rooms: { id: string; name: string; inventory: number }[];
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [roomTypeId, setRoomTypeId] = useState("");
  const [mode, setMode] = useState<"range" | "list">("range");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [text, setText] = useState("");
  const [preview, setPreview] = useState<BulkUnitPreview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      <button
        type="button"
        className={buttonClass}
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        Add multiple room numbers
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-500">
            Add up to 100 numbers for one room type. Existing numbers are
            skipped, including inactive rooms.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
          >
            <fieldset disabled={busy} className="space-y-3">
              <label className="block text-sm">
                Room type for multiple numbers
                <select
                  required
                  className={inputClass}
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
              <label className="block text-sm">
                Entry method
                <select
                  className={inputClass}
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
                  <label className="text-sm">
                    First number
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]+"
                      maxLength={40}
                      className={inputClass}
                      placeholder="001"
                      value={start}
                      onChange={(e) => edit(() => setStart(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    Last number
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]+"
                      maxLength={40}
                      className={inputClass}
                      placeholder="050"
                      value={end}
                      onChange={(e) => edit(() => setEnd(e.target.value))}
                    />
                  </label>
                </div>
              ) : (
                <label className="block text-sm">
                  Room numbers (commas or one per line)
                  <textarea
                    required
                    rows={5}
                    maxLength={5000}
                    className={inputClass}
                    placeholder={"A101, A102\nB201"}
                    value={text}
                    onChange={(e) => edit(() => setText(e.target.value))}
                  />
                </label>
              )}
              <button className={buttonClass} type="submit">
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
              className="space-y-3 rounded-xl bg-slate-50 p-3 text-sm"
              aria-label="Room numbers preview"
            >
              <p className="font-semibold">
                {preview.newLabels.length} new room numbers ·{" "}
                {preview.remainingCapacity} capacity remaining
              </p>
              <p className="break-words">
                Proposed: {preview.proposed.join(", ")}
              </p>
              <p className="break-words">
                New: {preview.newLabels.join(", ") || "None"}
              </p>
              <p className="break-words">
                Existing (skipped):{" "}
                {preview.existing
                  .map(
                    (u) =>
                      `${u.label} (${u.status}; ${rooms.find((r) => r.id === u.roomTypeId)?.name || "another room type"})`,
                  )
                  .join(", ") || "None"}
              </p>
              <p className="break-words">
                Repeated entries (skipped):{" "}
                {preview.duplicates.join(", ") || "None"}
              </p>
              {preview.capacityAfter < 0 ? (
                <p role="alert" className="text-red-700">
                  Exceeds capacity by {-preview.capacityAfter}. Edit the numbers
                  or choose another room type, then preview again.
                </p>
              ) : (
                <p>Capacity remaining after adding: {preview.capacityAfter}</p>
              )}
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !preview.canSave}
                onClick={() => void submit(true)}
              >
                Add {preview.newLabels.length} room numbers
              </button>
            </div>
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
      )}
    </div>
  );
}
