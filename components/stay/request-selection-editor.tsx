"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { type Offering, type StayRequest, type Selection } from "@/lib/stay/contracts";
import { canEditRequest } from "@/lib/stay/domain";
import { ResponseControls } from "./response-controls";
import { GuestInputFields } from "./guest-input-fields";
import type { RequestActor } from "./request-agreement-controls";
export function RequestSelectionEditor({ request: r, requests, actor, timezone }: { request: StayRequest; requests: StayRequest[]; actor: RequestActor; timezone: string }) {
  const [open, setOpen] = useState(false), [quantity, setQuantity] = useState(r.quantity), [variantId, setVariant] = useState(r.variantId), [inputs, setInputs] = useState<Selection["inputs"]>(r.inputs ?? {}), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [revision, setRevision] = useState(actor.revision);
  const q = useQuery({ queryKey: ["arrival-options", actor.bookingId], queryFn: ({ signal }) => apiFetch<{ offerings: Offering[] }>(`/api/bookings/${encodeURIComponent(actor.bookingId)}/pre-checkin`, { signal }), enabled: open });
  if (!actor.enabled) return null;
  if (!canEditRequest(r) || r.totalPaise > 0 || r.settlement === "paid") return <p className="mt-3 text-xs text-slate-500">This request is closed for online changes. Contact the hotel for assistance.</p>;
  const current = q.data?.offerings.find(o => o.id === r.offeringId);
  const offering: Offering = { name: r.name, description: r.description, kind: r.kind, travelerCategories: [], roomTypeIds: [], bookingModes: ["overnight", "hourly"], unitPricePaise: 0, maxQuantity: r.maxQuantity, advanceNoticeMinutes: 0, confirmation: r.confirmation, status: "active", ...current, ...r.requestRules, variants: current?.variants ?? [], id: r.offeringId, propertyId: current?.propertyId ?? "", version: r.offeringVersion };

  const siblings = requests.filter(n => n.id !== r.id && n.offeringId === r.offeringId && !["cancelled", "declined"].includes(n.status));
  const count = siblings.reduce((sum, n) => sum + n.quantity, quantity);
  const conflict = revision !== actor.revision;
  async function save(remove = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(actor.bookingId)}/stay-requests`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, requestId: r.id, selection: remove || !quantity ? null : { offeringId: r.offeringId, variantId, quantity, inputs } }) });
      setOpen(false); actor.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update request. Your changes have been kept."); actor.refresh(); } finally { setBusy(false); }
  }
  const button = "min-h-11 rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
  return <div className="mt-3 space-y-3">
    {!open ? <button className={button} onClick={() => { setRevision(actor.revision); setOpen(true); }}>Change request</button> : <>
      {q.isPending && <p className="text-xs">Checking available options…</p>}
      {q.isError && <p className="text-xs">Availability could not load. Existing details can still be reduced or removed. <button className="underline" onClick={() => void q.refetch()}>Retry</button></p>}
      {!!offering.variants.length && <label className="block text-sm">Selected option<select value={variantId ?? ""} disabled={busy || !current} onChange={e => setVariant(e.target.value || null)} className="mt-1 min-h-11 w-full rounded-lg border p-2">{!offering.variants.some(v => v.id === r.variantId) && <option value={r.variantId ?? ""}>{r.variantName ?? "Saved option"}</option>}{offering.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
      <ResponseControls offering={offering} optionName={offering.variants.find(v => v.id === variantId)?.name ?? r.variantName ?? r.name} quantity={quantity} count={count} disabled={busy} blockIncrease={!current} onChange={setQuantity} />
      {quantity > 0 && <GuestInputFields offering={offering} value={inputs} onChange={setInputs} disabled={busy} timezone={timezone} />}
      {conflict && <p role="alert" className="text-sm text-amber-800">This booking changed. Your edits have been kept. <button className="underline" onClick={() => setRevision(actor.revision)}>I’ve reviewed the current requests; retry my edits</button></p>}
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || conflict} onClick={() => void save()}>{busy ? "Saving…" : "Save request"}</button><button className={button} disabled={busy || conflict} onClick={() => void save(true)}>Remove request</button><button className={button} disabled={busy} onClick={() => setOpen(false)}>Cancel</button></div>
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
