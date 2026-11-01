"use client";
import { useState } from "react";
import { unlistedRequestSchema } from "@/lib/stay/contracts";
import type { z } from "zod";
import { hotelTimeIso } from "./guest-input-fields";
export type UnlistedDraft = z.infer<typeof unlistedRequestSchema>;
export function UnlistedRequestForm({
  timezone,
  disabled,
  onAdd,
}: {
  timezone: string;
  disabled: boolean;
  onAdd: (v: UnlistedDraft) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [note, setNote] = useState(""),
    [when, setWhen] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl border border-[var(--hk-border,#e7e4dc)] bg-white p-5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="min-h-11 text-left text-sm font-semibold text-[#0b1f3a]"
      >
        Ask the hotel for something else
      </button>
      <p className="text-xs leading-5 text-slate-500">
        The hotel reviews requests manually. Availability and price are not
        confirmed.
      </p>
      {open && (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-slate-600">
            Item or service *
            <input
              aria-label="Requested item or service"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Short note
            <textarea
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            When needed · hotel time ({timezone}) *
            <input
              type="datetime-local"
              aria-label="Request needed time"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={disabled || busy}
            className="min-h-11 rounded-xl bg-[#0b1f3a] px-4 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              setError("");
              if (!when) {
                setError("Choose when you need this during your stay.");
                return;
              }
              const parsed = unlistedRequestSchema.safeParse({
                name,
                note,
                neededAt: hotelTimeIso(when, timezone),
              });
              if (!parsed.success) {
                setError(parsed.error.issues[0].message);
                return;
              }
              setBusy(true);
              try {
                await onAdd(parsed.data);
                setName("");
                setNote("");
                setWhen("");
                setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Unable to add request. Try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Add request for hotel review"}
          </button>
        </div>
      )}
    </div>
  );
}
