"use client";
import { useEffect, useState } from "react";
import { resolveLocal } from "@/lib/booking/domain";
import { requestJson } from "@/lib/partner/upload-client";
type CalendarView = { capacity: number; calendar: { reserved?: Record<string, number>; blocked?: Record<string, number>; stopSell?: boolean }; blocks: { id: string; reason: string; quantity: number; startAt: string; endAt: string }[] };
export function CapacityControls({ propertyId, roomTypeId, timezone }: { propertyId: string; roomTypeId: string; timezone: string }) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [view, setView] = useState<CalendarView | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const url = `/api/partner/properties/${propertyId}/inventory-blocks`;
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    fetch(`${url}?${new URLSearchParams({ roomTypeId, date })}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then(setView).catch((error) => { if (error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, [date, roomTypeId, url, version]);
  const mutate = async (action: () => Promise<unknown>) => { setBusy(true); setMessage(""); try { await action(); setVersion((n) => n + 1); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save inventory"); } finally { setBusy(false); } };
  return <div className="space-y-3 rounded-xl border border-slate-200 p-3"><h3 className="font-bold">Time-based availability and maintenance</h3><label className="block">Property-local date ({timezone})<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>{date && <>
    {view && <><p>{view.capacity} rooms · {Object.keys(view.calendar.reserved ?? {}).filter((key) => (view.calendar.reserved?.[key] ?? 0) > 0).length} reserved quarter-hour intervals</p><label className="block"><input type="checkbox" disabled={busy} checked={view.calendar.stopSell ?? false} onChange={(e) => void mutate(() => requestJson(url, { roomTypeId, date, stopSell: e.target.checked }, "PATCH"))} /> Stop selling availability on this date</label></>}
    <div className="grid grid-cols-2 gap-2"><label>Block begins<input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} className="block w-full rounded border p-2" /></label><label>Block ends<input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} className="block w-full rounded border p-2" /></label></div>
    <label className="block">Room quantity<input type="number" min={1} max={view?.capacity ?? 500} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="block w-full rounded border p-2" /></label><label className="block">Reason<input value={reason} minLength={3} onChange={(e) => setReason(e.target.value)} className="block w-full rounded border p-2" /></label>
    <button type="button" disabled={busy || reason.trim().length < 3} className="rounded bg-[#061224] px-3 py-2 text-white disabled:opacity-50" onClick={() => void mutate(() => { if (end <= start) throw new Error("Select an end time after the start time."); return requestJson(url, { roomTypeId, startAt: new Date(resolveLocal(date, start, timezone)).toISOString(), endAt: new Date(resolveLocal(date, end, timezone)).toISOString(), quantity, reason }, "POST"); })}>Add maintenance block</button>
    {view?.blocks.map((block) => <div key={block.id} className="rounded border p-2"><p>{block.reason} · {block.quantity} room(s)</p><p>{new Date(block.startAt).toLocaleTimeString("en-IN", { timeZone: timezone })}–{new Date(block.endAt).toLocaleTimeString("en-IN", { timeZone: timezone })}</p><button type="button" disabled={busy} className="underline" onClick={() => void mutate(() => requestJson(`${url}/${block.id}`, {}, "DELETE"))}>Release block</button></div>)}
  </>}{message && <p role="status" className="text-rose-700">{message}</p>}</div>;
}
