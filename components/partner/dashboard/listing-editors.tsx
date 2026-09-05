"use client";

import { useState } from "react";
import { CheckCircle2, ImageIcon, Loader2, Plus, Star, Upload } from "lucide-react";
import { formatPaise, toPaise } from "@/lib/currency";
import { requestJson, putFile, sha256Hex, uploadErrorMessage } from "@/lib/partner/upload-client";
import type { ListingResponse } from "./use-property-listing";

/* ---------- shared form primitives ---------- */

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[#c89b3c] focus:ring-1 focus:ring-[#c89b3c]";

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required = true,
  placeholder,
  minLength,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
      />
    </label>
  );
}

function TextArea({ name, label, defaultValue, minLength, placeholder }: { name: string; label: string; defaultValue?: string; minLength?: number; placeholder?: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <textarea name={name} required minLength={minLength} placeholder={placeholder} defaultValue={defaultValue ?? ""} rows={4} className={inputClass} />
    </label>
  );
}

export function SaveBar({ saving, error, saved, label = "Save changes" }: { saving: boolean; error?: string; saved?: boolean; label?: string }) {
  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
      {saved && !error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
        </p>
      )}
      <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all disabled:opacity-50">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

type EditorProps = { propertyId: string; listing: ListingResponse; onSaved: () => void };

/** Small hook to run a save handler with loading/error/saved state. */
function useSave(onSaved: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await fn();
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return { saving, error, saved, run };
}

/* ---------- Basic Details ---------- */

export function BasicDetailsEditor({ propertyId, listing, onSaved }: EditorProps) {
  const p = listing.property;
  const { saving, error, saved, run } = useSave(onSaved);

  const submit = (form: FormData) =>
    run(() =>
      requestJson(`/api/partner/properties/${propertyId}`, {
        name: form.get("name"),
        description: form.get("description"),
        publicPhone: form.get("publicPhone"),
        publicEmail: form.get("publicEmail"),
        checkInTime: form.get("checkInTime"),
        checkOutTime: form.get("checkOutTime"),
      }, "PATCH").then(() => undefined));

  return (
    <form action={submit} className="space-y-4">
      <Field name="name" label="Hotel name" defaultValue={p.name} minLength={2} />
      <TextArea name="description" label="Short description" defaultValue={p.description} minLength={20} placeholder="Describe what makes your property special (min 20 characters)." />
      <div className="grid grid-cols-2 gap-3">
        <Field name="publicPhone" label="Public phone" defaultValue={p.publicPhone} placeholder="+91…" />
        <Field name="publicEmail" label="Public email" type="email" defaultValue={p.publicEmail} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="checkInTime" label="Check-in time" type="time" defaultValue={p.checkInTime} />
        <Field name="checkOutTime" label="Check-out time" type="time" defaultValue={p.checkOutTime} />
      </div>
      <SaveBar saving={saving} error={error} saved={saved} />
    </form>
  );
}

/* ---------- Location ---------- */

export function LocationEditor({ propertyId, listing, onSaved }: EditorProps) {
  const p = listing.property;
  const { saving, error, saved, run } = useSave(onSaved);

  const submit = (form: FormData) =>
    run(() =>
      requestJson(`/api/partner/properties/${propertyId}`, {
        googlePlaceId: form.get("googlePlaceId"),
        latitude: Number(form.get("latitude")),
        longitude: Number(form.get("longitude")),
        timezone: form.get("timezone"),
        address: {
          line1: form.get("line1"),
          line2: null,
          landmark: null,
          city: form.get("city"),
          district: null,
          state: form.get("state"),
          postalCode: form.get("postalCode"),
          countryCode: "IN",
        },
      }, "PATCH").then(() => undefined));

  return (
    <form action={submit} className="space-y-4">
      <Field name="line1" label="Address" defaultValue={p.address?.line1} minLength={2} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="city" label="City" defaultValue={p.address?.city} minLength={2} />
        <Field name="state" label="State" defaultValue={p.address?.state} minLength={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="postalCode" label="PIN code" defaultValue={p.address?.postalCode} minLength={4} />
        <Field name="timezone" label="Timezone" defaultValue={p.timezone || "Asia/Kolkata"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="latitude" label="Latitude" type="number" defaultValue={p.latitude} />
        <Field name="longitude" label="Longitude" type="number" defaultValue={p.longitude} />
      </div>
      <Field name="googlePlaceId" label="Google Place ID" defaultValue={p.googlePlaceId} />
      <SaveBar saving={saving} error={error} saved={saved} />
    </form>
  );
}

/* ---------- Amenities ---------- */

const AMENITY_OPTIONS = ["Wi-Fi", "Parking", "Restaurant", "Air conditioning", "Lift", "Power backup", "Room service", "Hot water", "Spa", "Gym", "Swimming pool", "Airport transfer"];

export function AmenitiesEditor({ propertyId, listing, onSaved }: EditorProps) {
  const [selected, setSelected] = useState<string[]>(listing.property.amenityIds ?? []);
  const { saving, error, saved, run } = useSave(onSaved);

  const toggle = (option: string) =>
    setSelected((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));

  const submit = () =>
    run(() =>
      requestJson(`/api/partner/properties/${propertyId}`, {
        amenityIds: selected,
        childrenPolicy: listing.property.childrenPolicy ?? { allowed: true },
        petPolicy: listing.property.petPolicy ?? { allowed: false },
        smokingPolicy: listing.property.smokingPolicy ?? { allowed: false },
        identityRequirements: { governmentIdRequired: true },
      }, "PATCH").then(() => undefined));

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-slate-500">Select every facility available at your property.</p>
      <div className="flex flex-wrap gap-2">
        {AMENITY_OPTIONS.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${active ? "bg-[#061224] text-white" : "border border-slate-200 text-slate-700 hover:border-slate-400"}`}
            >
              {option}
            </button>
          );
        })}
      </div>
      <form action={submit}>
        <SaveBar saving={saving} error={error} saved={saved} label="Save amenities" />
      </form>
    </div>
  );
}

/* ---------- Policies (cancellation) ---------- */

export function PoliciesEditor({ propertyId, listing, onSaved }: EditorProps) {
  const { saving, error, saved, run } = useSave(onSaved);

  const submit = (form: FormData) =>
    run(async () => {
      await requestJson(`/api/partner/properties/${propertyId}/cancellation-policies`, {
        name: form.get("name"),
        description: form.get("description"),
        refundableUntilHours: Number(form.get("hours")),
        cancellationFeePercent: Number(form.get("fee")),
      });
    });

  return (
    <div className="space-y-5">
      {listing.policies.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Existing policies</p>
          {listing.policies.map((policy) => (
            <div key={policy.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700">{policy.name ?? policy.id}</div>
          ))}
        </div>
      )}
      <form action={submit} className="space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Add a cancellation policy</p>
        <Field name="name" label="Policy name" placeholder="Flexible" minLength={2} />
        <TextArea name="description" label="Policy details" minLength={10} placeholder="Free cancellation until 24 hours before check-in." />
        <div className="grid grid-cols-2 gap-3">
          <Field name="hours" label="Refundable until (hours before)" type="number" />
          <Field name="fee" label="Cancellation fee (%)" type="number" />
        </div>
        <SaveBar saving={saving} error={error} saved={saved} label="Add policy" />
      </form>
    </div>
  );
}

/* ---------- Rooms & rates ---------- */

export function RoomsEditor({ propertyId, listing, onSaved }: EditorProps) {
  const room = useSave(onSaved);
  const rate = useSave(onSaved);

  const submitRoom = (form: FormData) =>
    room.run(async () => {
      await requestJson(`/api/partner/properties/${propertyId}/room-types`, {
        name: form.get("name"),
        description: form.get("description"),
        totalInventory: Number(form.get("inventory")),
        maxAdults: Number(form.get("adults")),
        maxChildren: 0,
        maxInfants: 0,
        bedConfigurations: [{ bedType: "double", count: 1 }],
      });
    });

  const submitRate = (form: FormData) =>
    rate.run(async () => {
      if (!listing.policies[0]) throw new Error("Add a cancellation policy first.");
      await requestJson(`/api/partner/properties/${propertyId}/rate-plans`, {
        roomTypeId: form.get("roomTypeId"),
        name: form.get("rateName"),
        code: String(form.get("code")).toUpperCase(),
        basePricePaise: toPaise(Number(form.get("price"))),
        cancellationPolicyId: listing.policies[0].id,
        paymentMode: "full",
      });
    });

  return (
    <div className="space-y-6">
      {listing.roomTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Existing rooms</p>
          {listing.roomTypes.map((rt) => {
            const cheapest = listing.ratePlans.filter((r) => r.roomTypeId === rt.id).sort((a, b) => a.basePricePaise - b.basePricePaise)[0];
            return (
              <div key={rt.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
                <span className="font-bold text-[#061224]">{rt.name} <span className="font-medium text-slate-500">· {rt.inventory} rooms</span></span>
                <span className="font-bold text-[#c89b3c]">{cheapest ? formatPaise(cheapest.basePricePaise) : "No rate"}</span>
              </div>
            );
          })}
        </div>
      )}

      <form action={submitRoom} className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold text-[#061224]">1. Add a room type</p>
        <Field name="name" label="Room name" placeholder="Deluxe Double" minLength={2} />
        <TextArea name="description" label="Short description" minLength={10} placeholder="A comfortable room with…" />
        <div className="grid grid-cols-2 gap-3">
          <Field name="inventory" label="Rooms to sell" type="number" />
          <Field name="adults" label="Max guests" type="number" />
        </div>
        <SaveBar saving={room.saving} error={room.error} saved={room.saved} label="Add room type" />
      </form>

      {listing.roomTypes.length > 0 && (
        <form action={submitRate} className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-bold text-[#061224]">2. Add a sellable rate</p>
          {!listing.policies.length && <p className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-amber-700">Add a cancellation policy first (Policies section).</p>}
          <label className="block text-xs font-semibold text-slate-700">
            Room type
            <select name="roomTypeId" required className={inputClass}>
              {listing.roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field name="rateName" label="Rate name" placeholder="Standard" minLength={2} />
            <Field name="code" label="Rate code" placeholder="STD" />
          </div>
          <Field name="price" label="Price per night (₹)" type="number" />
          <SaveBar saving={rate.saving} error={rate.error} saved={rate.saved} label="Add rate" />
        </form>
      )}
    </div>
  );
}

/* ---------- Photos ---------- */

const PHOTO_CATEGORIES = [
  { value: "exterior", label: "Exterior / facade" },
  { value: "reception", label: "Reception / common area" },
  { value: "room", label: "Room" },
  { value: "bathroom", label: "Bathroom" },
  { value: "additional", label: "Additional spaces" },
] as const;

export function PhotosEditor({ propertyId, listing, onSaved }: EditorProps) {
  const [category, setCategory] = useState<(typeof PHOTO_CATEGORIES)[number]["value"]>("exterior");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  const photos = listing.media.filter((m) => m.kind === "property_image");

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    try {
      for (const file of Array.from(files)) {
        const checksum = await sha256Hex(file);
        const signed = await requestJson<{ uploadId: string; uploadUrl: string; headers: Record<string, string> }>(
          `/api/partner/properties/${propertyId}/media/upload-url`,
          { fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum, category },
        );
        await putFile(signed.uploadUrl, signed.headers, file);
        await requestJson(`/api/partner/properties/${propertyId}/media/finalize`, { uploadId: signed.uploadId });
      }
      setStatus("Photos uploaded. They stay private until approved.");
      onSaved();
    } catch (cause) {
      setStatus(uploadErrorMessage(cause));
    } finally {
      setUploading(false);
    }
  };

  const setCover = async (mediaId: string) => {
    await requestJson(`/api/partner/properties/${propertyId}/media/${mediaId}`, { makeCover: true }, "PATCH");
    onSaved();
  };

  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-slate-700">
        Photo category
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={inputClass}>
          {PHOTO_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center hover:border-[#c89b3c] transition-colors">
        <Upload className="mb-2 h-6 w-6 text-slate-400" />
        <span className="text-xs font-bold text-slate-700">Choose JPG, PNG or WebP</span>
        <span className="mt-1 text-[11px] text-slate-500">Up to 12 MB each · multiple allowed</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={uploading} onChange={(e) => { const files = e.target.files; e.currentTarget.value = ""; void handleFiles(files); }} />
      </label>

      {status && <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{status}</p>}

      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-slate-500">{photos.length} / 6 photos</span>
        {photos.length >= 6 ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Enough photos</span> : <span className="text-amber-600">Add {6 - photos.length} more</span>}
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {photo.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.imageUrl} alt={photo.altText || "Property photo"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center"><ImageIcon className="h-4 w-4 text-slate-300" /></div>
              )}
              {photo.isCover ? (
                <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-[#c89b3c] px-1.5 py-0.5 text-[8px] font-bold text-[#061224]"><Star className="h-2.5 w-2.5 fill-current" /> Cover</span>
              ) : (
                <button type="button" onClick={() => void setCover(photo.id)} className="absolute inset-x-1 bottom-1 rounded-md bg-slate-900/80 py-0.5 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">Set cover</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Safety (KYC) ---------- */

const KYC_DOCS = [
  { value: "pan", label: "PAN card", required: true },
  { value: "government_id_front", label: "Government ID front", required: true },
  { value: "government_id_back", label: "Government ID back", required: true },
  { value: "gst", label: "GST document", required: false },
] as const;

export function SafetyEditor({ propertyId, listing, onSaved }: EditorProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const documentSet = new Set(listing.documents.map((d) => d.documentType));

  const handleFile = async (documentType: string, file: File | null) => {
    if (!file) return;
    setUploading(documentType);
    setStatus(`Uploading ${file.name}…`);
    try {
      const checksum = await sha256Hex(file);
      const signed = await requestJson<{ uploadId: string; uploadUrl: string; headers: Record<string, string> }>(
        `/api/partner/properties/${propertyId}/kyc/upload-url`,
        { documentType, fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum },
      );
      await putFile(signed.uploadUrl, signed.headers, file);
      await requestJson(`/api/partner/properties/${propertyId}/kyc/finalize`, { uploadId: signed.uploadId });
      setStatus("Document uploaded and stored privately.");
      onSaved();
    } catch (cause) {
      setStatus(uploadErrorMessage(cause));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500">PAN and government ID (front & back) are required before submission. Files stay private.</p>
      {KYC_DOCS.map((doc) => {
        const existing = listing.documents.find((d) => d.documentType === doc.value);
        const isBusy = uploading === doc.value;
        return (
          <div key={doc.value} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#061224]">{doc.label}</p>
                <p className="text-[11px] font-medium text-slate-500">{doc.required ? "Required" : "Optional"}</p>
                {existing ? (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Uploaded ({existing.status || "pending"})</p>
                ) : (
                  <p className="mt-1 text-[11px] font-semibold text-amber-600">Not uploaded</p>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#061224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#0c1f3b] transition-colors">
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {existing ? "Replace" : "Upload"}
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={Boolean(uploading)} onChange={(e) => { const file = e.target.files?.[0] ?? null; e.currentTarget.value = ""; void handleFile(doc.value, file); }} />
              </label>
            </div>
          </div>
        );
      })}
      {status && <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{status}</p>}
      <p className="text-[11px] font-medium text-slate-400">{documentSet.size} document{documentSet.size === 1 ? "" : "s"} on file.</p>
    </div>
  );
}
