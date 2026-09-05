"use client";

import { useMemo, useState } from "react";
import {
  BedDouble,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  IndianRupee,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { type CurrencyCode, formatPaise } from "@/lib/currency";
import { requestJson } from "@/lib/partner/upload-client";
import {
  type ListingMedia,
  type ListingRatePlan,
  type ListingRoomType,
  type ListingResponse,
  usePropertyListing,
} from "./use-property-listing";
import { Drawer } from "./drawer";

/* ---------- derived, real-data view model ---------- */

type RoomRow = {
  room: ListingRoomType;
  /** Cheapest active rate plan for the room, if any. */
  rate: ListingRatePlan | null;
  image: string | null;
};

/** A room's assigned cover wins; legacy rooms gracefully fall back to a property image. */
function roomImage(room: ListingRoomType, media: ListingMedia[]): string | null {
  const photos = media.filter((asset) => asset.kind === "property_image" && asset.imageUrl);
  const preferredId = room.coverMediaId ?? room.mediaIds[0];
  return photos.find((asset) => asset.id === preferredId)?.imageUrl ?? photos[0]?.imageUrl ?? null;
}

function cheapestRate(rates: ListingRatePlan[], roomTypeId: string): ListingRatePlan | null {
  return rates
    .filter((rate) => rate.roomTypeId === roomTypeId && rate.status === "active" && rate.basePricePaise > 0)
    .reduce<ListingRatePlan | null>((min, rate) => (!min || rate.basePricePaise < min.basePricePaise ? rate : min), null);
}

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  valueClass = "text-[#061224]",
  hint,
  hintClass = "text-slate-500",
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  hintClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>{icon}</div>
      <div className="min-w-0">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{label}</span>
        <span className={`text-xl font-extrabold mt-0.5 block ${valueClass}`}>{value}</span>
        {hint && <p className={`text-[11px] font-medium ${hintClass}`}>{hint}</p>}
      </div>
    </div>
  );
}

const ROOM_AMENITIES = ["Wi-Fi", "Air conditioning", "Hot water", "Room service", "TV", "Mini fridge", "Balcony", "Workspace", "Wardrobe", "Safe", "Hair dryer", "Bathtub"];
const primaryButtonClass = "inline-flex w-full items-center justify-center rounded-xl bg-[#061224] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0c1f3b] disabled:cursor-not-allowed disabled:opacity-50";
type EditorTab = "details" | "amenities" | "photos" | "inventory" | "rates";

function RoomEditor({
  propertyId,
  room,
  initialTab,
  media,
  policies,
  rates,
  onRoomUpdated,
  onRateAdded,
  onRateUpdated,
}: {
  propertyId: string;
  room: ListingRoomType;
  initialTab: EditorTab;
  media: ListingMedia[];
  policies: ListingResponse["policies"];
  rates: ListingRatePlan[];
  onRoomUpdated: (room: ListingRoomType) => void;
  onRateAdded: (rate: ListingRatePlan) => void;
  onRateUpdated: (rate: ListingRatePlan) => void;
}) {
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [adults, setAdults] = useState(String(room.maxAdults));
  const [children, setChildren] = useState(String(room.maxChildren));
  const [infants, setInfants] = useState(String(room.maxInfants));
  const [bedType, setBedType] = useState(room.bedConfigurations[0]?.bedType ?? "double");
  const [bedCount, setBedCount] = useState(String(room.bedConfigurations[0]?.count ?? 1));
  const [size, setSize] = useState(room.roomSizeSqFt ? String(room.roomSizeSqFt) : "");
  const [bathroom, setBathroom] = useState(room.bathroomType);
  const [inventory, setInventory] = useState(String(room.inventory));
  const [status, setStatus] = useState<"active" | "paused">(room.status);
  const [amenities, setAmenities] = useState(room.amenityIds);
  const [mediaIds, setMediaIds] = useState(room.mediaIds);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(room.coverMediaId);
  const [selectedRateId, setSelectedRateId] = useState(rates[0]?.id ?? "new");

  const availablePhotos = media.filter((asset) => asset.kind === "property_image");
  const setNotice = (ok: boolean, text: string) => setMessage({ ok, text });
  const saveRoom = async (body: Record<string, unknown>, success: string) => {
    setSaving(true); setMessage(null);
    try {
      const response = await requestJson<{ roomType: ListingRoomType }>(`/api/partner/properties/${propertyId}/room-types/${room.id}`, body, "PATCH");
      if (!response.roomType) throw new Error("The room update was not returned.");
      onRoomUpdated(response.roomType); setNotice(true, success);
    } catch (cause) { setNotice(false, cause instanceof Error ? cause.message : "Could not save room changes."); }
    finally { setSaving(false); }
  };
  const integer = (value: string, label: string, min = 0) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min) throw new Error(`${label} must be a whole number of at least ${min}.`);
    return number;
  };
  const toggleAmenity = (amenity: string) => setAmenities((current) => current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity]);
  const toggleMedia = (id: string) => setMediaIds((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    if (!next.includes(coverMediaId ?? "")) setCoverMediaId(next[0] ?? null);
    return next;
  });

  const selectedRate = rates.find((rate) => rate.id === selectedRateId) ?? null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-medium text-slate-500">Changes are saved directly to this room type.</p><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{status === "active" ? "Live" : "Paused"}</span></div>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-100 pb-2">
        {(["details", "amenities", "photos", "inventory", "rates"] as EditorTab[]).map((item) => <button key={item} type="button" onClick={() => { setTab(item); setMessage(null); }} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize ${tab === item ? "bg-[#061224] text-white" : "text-slate-500 hover:bg-slate-50"}`}>{item}</button>)}
      </div>
      <div className="mt-4 space-y-3 text-xs">
        {tab === "details" && <>
          <label className="block font-bold text-slate-700">Room name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c89b3c]" /></label>
          <label className="block font-bold text-slate-700">Guest description<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c89b3c]" /></label>
          <div className="grid grid-cols-3 gap-2"><NumberField label="Adults" value={adults} setValue={setAdults} min={1} /><NumberField label="Children" value={children} setValue={setChildren} min={0} /><NumberField label="Infants" value={infants} setValue={setInfants} min={0} /></div>
          <div className="grid grid-cols-2 gap-2"><label className="font-bold text-slate-700">Bed type<select value={bedType} onChange={(event) => setBedType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="single">Single</option><option value="double">Double</option><option value="queen">Queen</option><option value="king">King</option><option value="sofa_bed">Sofa bed</option></select></label><NumberField label="Beds" value={bedCount} setValue={setBedCount} min={1} /></div>
          <div className="grid grid-cols-2 gap-2"><NumberField label="Room size (sq ft)" value={size} setValue={setSize} min={1} optional /><label className="font-bold text-slate-700">Bathroom<select value={bathroom} onChange={(event) => setBathroom(event.target.value as "private" | "shared")} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="private">Private</option><option value="shared">Shared</option></select></label></div>
          <button type="button" disabled={saving} onClick={() => { try { void saveRoom({ name: name.trim(), description: description.trim(), maxAdults: integer(adults, "Adults", 1), maxChildren: integer(children, "Children"), maxInfants: integer(infants, "Infants"), bedConfigurations: [{ bedType, count: integer(bedCount, "Beds", 1) }], roomSizeSqFt: size ? integer(size, "Room size", 1) : null, bathroomType: bathroom }, "Room details saved."); } catch (error) { setNotice(false, error instanceof Error ? error.message : "Check room details."); } }} className={primaryButtonClass}>Save details</button>
        </>}
        {tab === "amenities" && <><p className="text-slate-500">Select amenities available specifically in this room.</p><div className="flex flex-wrap gap-2">{ROOM_AMENITIES.map((amenity) => <button key={amenity} type="button" onClick={() => toggleAmenity(amenity)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${amenities.includes(amenity) ? "bg-[#061224] text-white" : "border border-slate-200 text-slate-600"}`}>{amenity}</button>)}</div><button type="button" disabled={saving} onClick={() => void saveRoom({ amenityIds: amenities }, "Room amenities saved.")} className={primaryButtonClass}>Save amenities</button></>}
        {tab === "photos" && <><p className="text-slate-500">Assign property photos to this room. The selected cover appears on the guest-facing room card.</p>{availablePhotos.length ? <div className="grid grid-cols-3 gap-2">{availablePhotos.map((photo) => <label key={photo.id} className={`relative cursor-pointer overflow-hidden rounded-xl border-2 ${mediaIds.includes(photo.id) ? "border-[#c89b3c]" : "border-transparent"}`}>{photo.imageUrl ? <img src={photo.imageUrl} alt={photo.altText || "Room photo"} className="h-20 w-full object-cover" /> : <div className="grid h-20 place-items-center bg-slate-100 text-slate-400">Photo</div>}<input type="checkbox" checked={mediaIds.includes(photo.id)} onChange={() => toggleMedia(photo.id)} className="absolute left-1 top-1" />{mediaIds.includes(photo.id) && <button type="button" onClick={(event) => { event.preventDefault(); setCoverMediaId(photo.id); }} className={`absolute bottom-1 right-1 rounded px-1.5 py-1 text-[9px] font-bold ${coverMediaId === photo.id ? "bg-[#061224] text-white" : "bg-white text-slate-600"}`}>{coverMediaId === photo.id ? "Cover" : "Set cover"}</button>}</label>)}</div> : <p className="rounded-xl bg-amber-50 p-3 font-medium text-amber-700">Upload property photos in the Listing page first, then assign them here.</p>}<button type="button" disabled={saving || mediaIds.length === 0} onClick={() => void saveRoom({ mediaIds, coverMediaId }, "Room photos saved.")} className={primaryButtonClass}>Save photos</button></>}
        {tab === "inventory" && <><p className="text-slate-500">Pausing a room prevents it from being offered for sale; its data and rate plans stay intact.</p><NumberField label="Rooms available to sell" value={inventory} setValue={setInventory} min={1} /><label className="block font-bold text-slate-700">Selling status<select value={status} onChange={(event) => setStatus(event.target.value as "active" | "paused")} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="active">Active and sellable</option><option value="paused">Paused / closed to sale</option></select></label><button type="button" disabled={saving} onClick={() => { try { void saveRoom({ totalInventory: integer(inventory, "Rooms available", 1), status }, "Inventory saved."); } catch (error) { setNotice(false, error instanceof Error ? error.message : "Check inventory."); } }} className={primaryButtonClass}>Save availability</button></>}
        {tab === "rates" && <RateEditor key={selectedRate?.id ?? "new"} propertyId={propertyId} roomTypeId={room.id} policies={policies} rates={rates} selectedRate={selectedRate} selectRate={setSelectedRateId} saving={saving} setSaving={setSaving} onMessage={setNotice} onRateAdded={onRateAdded} onRateUpdated={onRateUpdated} />}
        {message && <p className={`rounded-lg px-3 py-2 font-semibold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message.text}</p>}
      </div>
    </div>
  );
}

function NumberField({ label, value, setValue, min, optional = false }: { label: string; value: string; setValue: (value: string) => void; min: number; optional?: boolean }) { return <label className="block font-bold text-slate-700">{label}<input type="number" value={value} min={min} required={!optional} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c89b3c]" /></label>; }

function NewRoomEditor({ propertyId, onCreated }: { propertyId: string; onCreated: (room: ListingRoomType) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inventory, setInventory] = useState("1");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [infants, setInfants] = useState("0");
  const [bedType, setBedType] = useState("double");
  const [bedCount, setBedCount] = useState("1");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const integer = (value: string, label: string, min = 0) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min) throw new Error(`${label} must be a whole number of at least ${min}.`);
    return number;
  };
  const createRoom = async () => {
    setMessage(null);
    try {
      const roomName = name.trim();
      const roomDescription = description.trim();
      if (roomName.length < 2) throw new Error("Enter a room name with at least 2 characters.");
      if (roomDescription.length < 10) throw new Error("Add a guest description with at least 10 characters.");
      setSaving(true);
      const result = await requestJson<{ roomType: ListingRoomType }>(`/api/partner/properties/${propertyId}/room-types`, {
        name: roomName,
        description: roomDescription,
        totalInventory: integer(inventory, "Rooms available", 1),
        maxAdults: integer(adults, "Adults", 1),
        maxChildren: integer(children, "Children"),
        maxInfants: integer(infants, "Infants"),
        bedConfigurations: [{ bedType, count: integer(bedCount, "Beds", 1) }],
      }, "POST");
      if (!result.roomType) throw new Error("The new room was not returned.");
      onCreated(result.roomType);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not add the room type.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4 text-xs"><p className="rounded-xl bg-amber-50 px-3 py-2.5 font-medium text-amber-800">Start with the essentials. You can add room photos, amenities, availability, and rates immediately after creating it.</p><label className="block font-bold text-slate-700">Room name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Deluxe Double" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c89b3c]" autoFocus /></label><label className="block font-bold text-slate-700">Guest description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe this room for guests…" rows={4} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c89b3c]" /></label><div className="grid grid-cols-3 gap-2"><NumberField label="Adults" value={adults} setValue={setAdults} min={1} /><NumberField label="Children" value={children} setValue={setChildren} min={0} /><NumberField label="Infants" value={infants} setValue={setInfants} min={0} /></div><div className="grid grid-cols-2 gap-2"><label className="font-bold text-slate-700">Bed type<select value={bedType} onChange={(event) => setBedType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="single">Single</option><option value="double">Double</option><option value="queen">Queen</option><option value="king">King</option><option value="sofa_bed">Sofa bed</option></select></label><NumberField label="Beds" value={bedCount} setValue={setBedCount} min={1} /></div><NumberField label="Rooms available to sell" value={inventory} setValue={setInventory} min={1} />{message && <p className="rounded-lg bg-rose-50 px-3 py-2 font-semibold text-rose-700">{message}</p>}<button type="button" disabled={saving} onClick={() => void createRoom()} className={primaryButtonClass}>{saving ? "Adding room…" : "Create room type"}</button></div>;
}

function RateEditor({ propertyId, roomTypeId, policies, rates, selectedRate, selectRate, saving, setSaving, onMessage, onRateAdded, onRateUpdated }: { propertyId: string; roomTypeId: string; policies: ListingResponse["policies"]; rates: ListingRatePlan[]; selectedRate: ListingRatePlan | null; selectRate: (id: string) => void; saving: boolean; setSaving: (saving: boolean) => void; onMessage: (ok: boolean, text: string) => void; onRateAdded: (rate: ListingRatePlan) => void; onRateUpdated: (rate: ListingRatePlan) => void }) {
  const [name, setName] = useState(selectedRate?.name ?? ""); const [code, setCode] = useState(selectedRate?.code ?? ""); const [price, setPrice] = useState(selectedRate ? String(Math.round(selectedRate.basePricePaise / 100)) : ""); const [policy, setPolicy] = useState(selectedRate?.cancellationPolicyId ?? policies[0]?.id ?? ""); const [paymentMode, setPaymentMode] = useState(selectedRate?.paymentMode ?? "full"); const [status, setStatus] = useState<"active" | "paused">(selectedRate?.status ?? "active");
  const submit = async () => { const nightly = Number(price); if (!name.trim() || !/^[A-Z0-9_-]{2,32}$/.test(code) || !Number.isInteger(nightly) || nightly < 1 || !policy) { onMessage(false, "Provide a rate name, uppercase code, nightly price, and cancellation policy."); return; } setSaving(true); try { if (selectedRate) { const result = await requestJson<{ ratePlan: ListingRatePlan }>(`/api/partner/properties/${propertyId}/rate-plans/${selectedRate.id}`, { name: name.trim(), code, basePricePaise: nightly * 100, cancellationPolicyId: policy, paymentMode, status }, "PATCH"); if (!result.ratePlan) throw new Error("The rate update was not returned."); onRateUpdated(result.ratePlan); onMessage(true, "Rate plan saved."); } else { const result = await requestJson<{ ratePlan: ListingRatePlan }>(`/api/partner/properties/${propertyId}/rate-plans`, { roomTypeId, name: name.trim(), code, basePricePaise: nightly * 100, cancellationPolicyId: policy, paymentMode }); if (!result.ratePlan) throw new Error("The rate plan was not returned."); onRateAdded(result.ratePlan); selectRate(result.ratePlan.id); onMessage(true, "Rate plan added."); } } catch (cause) { onMessage(false, cause instanceof Error ? cause.message : "Could not save rate plan."); } finally { setSaving(false); } };
  return <><div className="flex gap-2 overflow-x-auto">{rates.map((rate) => <button key={rate.id} type="button" onClick={() => selectRate(rate.id)} className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold ${selectedRate?.id === rate.id ? "border-[#c89b3c] bg-amber-50 text-[#8a5c0e]" : "border-slate-200 text-slate-600"}`}>{rate.name}</button>)}<button type="button" onClick={() => selectRate("new")} className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold ${!selectedRate ? "border-[#c89b3c] bg-amber-50 text-[#8a5c0e]" : "border-slate-200 text-slate-600"}`}>+ New</button></div>{!policies.length && <p className="rounded-lg bg-amber-50 p-2 font-semibold text-amber-700">Add a cancellation policy in Listing before creating a rate.</p>}<label className="block font-bold text-slate-700">Rate name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><div className="grid grid-cols-2 gap-2"><label className="font-bold text-slate-700">Code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="FLEX" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><NumberField label="Price / night (₹)" value={price} setValue={setPrice} min={1} /></div><label className="block font-bold text-slate-700">Cancellation policy<select value={policy} onChange={(event) => setPolicy(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="">Select a policy</option>{policies.map((item) => <option key={item.id} value={item.id}>{item.name ?? "Policy"}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="font-bold text-slate-700">Payment<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="full">Pay in full</option><option value="deposit">Deposit</option><option value="pay_at_property">Pay at property</option></select></label>{selectedRate && <label className="font-bold text-slate-700">Status<select value={status} onChange={(event) => setStatus(event.target.value as "active" | "paused")} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="active">Active</option><option value="paused">Paused</option></select></label>}</div><button type="button" disabled={saving || !policies.length} onClick={() => void submit()} className={primaryButtonClass}>{selectedRate ? "Save rate plan" : "Add rate plan"}</button></>;
}

export function PartnerRoomsRatesView({
  propertyId,
  propertyName = "The Balmoral Hotel",
}: {
  propertyId?: string;
  propertyName?: string;
}) {
  const listing = usePropertyListing(propertyId);
  const { data, property } = listing;
  // The platform is INR-only; narrow the string to the currency literal.
  const currency = listing.currency as CurrencyCode;

  const rows = useMemo<RoomRow[]>(() => {
    if (!data) return [];
    return data.roomTypes.map((room) => ({
      room,
      rate: cheapestRate(data.ratePlans, room.id),
      image: roomImage(room, data.media),
    }));
  }, [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("details");
  const [editorOpen, setEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = rows.find((row) => row.room.id === selectedId) ?? null;
  const openEditor = (roomId: string, tab: EditorTab) => {
    setSelectedId(roomId);
    setEditorTab(tab);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setSelectedId(null);
  };
  const openNewRoom = () => {
    setEditorOpen(false);
    setSelectedId(null);
    setCreateOpen(true);
  };
  const onRoomCreated = (room: ListingRoomType) => {
    listing.addRoomType(room);
    setCreateOpen(false);
    setSelectedId(room.id);
    setEditorTab("details");
    setEditorOpen(true);
  };

  /* ---------- derived metrics (real data only) ---------- */
  const totalRooms = rows.reduce((sum, row) => sum + (row.room.inventory || 0), 0);
  const activeCategories = rows.length;
  const startingPaise = listing.startingPricePaise;

  /* ---------- loading / empty states ---------- */
  if (!propertyId) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-slate-400">
        <p className="text-sm font-semibold">Select a property from the top bar to manage its rooms.</p>
      </div>
    );
  }

  if (listing.loading && !data) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-[#c89b3c]" />
          <p className="text-sm font-semibold">Loading rooms…</p>
        </div>
      </div>
    );
  }

  const backgroundRefreshing = listing.loading && Boolean(data);

  return (
    <div className="space-y-6 text-[#061224] pb-16">
      {backgroundRefreshing && (
        <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-[#c89b3c]/15" role="status" aria-label="Refreshing">
          <div className="hk-loading-bar h-full w-1/4 rounded-full bg-[#c89b3c]" />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#061224]">Rooms</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Manage room availability, prices and guest-ready status for {property?.name ?? propertyName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openNewRoom}
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Room Type
          </button>
          <Link
            href="/partner/listing"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <Eye className="h-4 w-4 text-slate-500" />
            Preview Guest View
          </Link>
        </div>
      </div>

      {/* Metrics (real data) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<BedDouble className="h-6 w-6" />}
          iconClass="bg-amber-50 text-[#c89b3c]"
          label="Active Categories"
          value={`${activeCategories} ${activeCategories === 1 ? "Type" : "Types"}`}
          hint={`Total ${totalRooms} sellable room${totalRooms === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-6 w-6" />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Sellable Rooms"
          value={`${totalRooms} ${totalRooms === 1 ? "Room" : "Rooms"}`}
          valueClass="text-emerald-700"
          hint={`${rows.filter((r) => r.rate).length} of ${activeCategories} priced`}
          hintClass="text-[#c89b3c]"
        />
        <MetricCard
          icon={<IndianRupee className="h-6 w-6" />}
          iconClass="bg-blue-50 text-blue-600"
          label="Starting Rate"
          value={startingPaise !== null ? formatPaise(startingPaise, { currency }) : "Not set"}
          hint={startingPaise !== null ? "Lowest active rate plan" : "Add a rate plan"}
        />
        <MetricCard
          icon={<KeyRound className="h-6 w-6" />}
          iconClass="rounded-full bg-amber-50 text-amber-600"
          label="Rate Plans"
          value={String(data?.ratePlans.length ?? 0)}
          hint="Across all room types"
        />
      </div>

      {/* Room Types */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-[#061224]">Room Types</h2>

        {rows.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                <BedDouble className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-base font-bold">No room types yet</h3>
              <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">
                Add rooms and rate plans from the Listing editor to manage them here.
              </p>
              <button
                type="button"
                onClick={openNewRoom}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0c1f3b]"
              >
                <Plus className="h-4 w-4" /> Add Room Type
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map(({ room, rate, image }) => {
                  return (
                    <div
                      key={room.id}
                      onClick={() => openEditor(room.id, "details")}
                      className="group relative cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4 transition-all duration-200 hover:border-[#c89b3c] hover:shadow-sm"
                    >
                      <div className="flex gap-4">
                        <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt={room.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="grid h-full place-items-center text-slate-300">
                              <BedDouble className="h-6 w-6" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-sm font-bold text-[#061224] truncate">{room.name}</h3>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                                rate
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {room.status === "paused" ? "Paused" : rate ? "Sellable" : "No rate"}
                            </span>
                          </div>

                          <div className="mt-1">
                            {rate ? (
                              <>
                                <span className="text-base font-bold text-[#c89b3c]">{formatPaise(rate.basePricePaise, { currency })}</span>
                                <span className="text-xs text-slate-500 font-medium"> / night</span>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">No rate plan set</span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-1 text-center mt-2.5 pt-2 border-t border-slate-100 text-[10px]">
                            <div>
                              <span className="font-bold text-[#061224] text-xs block">{room.inventory}</span>
                              <span className="text-slate-400 font-medium">Sellable rooms</span>
                            </div>
                            <div>
                              <span className="font-bold text-[#061224] text-xs block">{room.maxAdults}</span>
                              <span className="text-slate-400 font-medium">Max guests</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor(room.id, "details");
                          }}
                          className="flex-1 rounded-xl bg-[#061224] py-2 text-center text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all flex items-center justify-center gap-1"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit room
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor(room.id, "inventory");
                          }}
                          className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-all"
                        >
                          Availability
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openEditor(room.id, "rates"); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all">Manage rates</button>
                      </div>
                    </div>
                  );
                })}
          </div>
        )}
      </div>

      {selected && (
        <Drawer
          open={editorOpen}
          onClose={closeEditor}
          title={`Edit ${selected.room.name}`}
          description="Update guest-facing details, availability, photos, and rates."
        >
          <RoomEditor key={`${selected.room.id}-${editorTab}`} propertyId={propertyId} room={selected.room} initialTab={editorTab} media={data?.media ?? []} policies={data?.policies ?? []} rates={(data?.ratePlans ?? []).filter((rate) => rate.roomTypeId === selected.room.id)} onRoomUpdated={(room) => listing.updateRoomType(room.id, room)} onRateAdded={listing.addRatePlan} onRateUpdated={(rate) => listing.updateRatePlan(rate.id, rate)} />
        </Drawer>
      )}

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Add room type" description="Create a new room without leaving this page.">
        <NewRoomEditor propertyId={propertyId} onCreated={onRoomCreated} />
      </Drawer>

      {/* Sync footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs font-medium text-slate-500">
        <button
          type="button"
          onClick={() => listing.reload()}
          className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${backgroundRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>

        <div className="flex items-center gap-1.5 text-slate-600">
          {property?.approvalStatus === "approved" ? (
            <>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Your rates and availability are live on Helpkey.</span>
            </>
          ) : (
            <>
              <Clock3 className="h-4 w-4 text-[#c89b3c]" />
              <span>Changes apply once your listing is approved.</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
