"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const steps = ["Property type", "Location", "Property details", "Rooms & rates", "Facilities", "Photos", "Verification", "Review"];
const input = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100";
const button = "rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60";
const propertyPhotoCategories = [
  { value: "exterior", label: "Exterior / facade" },
  { value: "reception", label: "Reception / common area" },
  { value: "room", label: "Room" },
  { value: "bathroom", label: "Bathroom" },
  { value: "additional", label: "Additional spaces" },
] as const;
const kycDocumentTypes = [
  { value: "pan", label: "PAN card", required: true, accept: ".jpg,.jpeg,.png,.pdf" },
  { value: "government_id_front", label: "Government ID front", required: true, accept: ".jpg,.jpeg,.png,.pdf" },
  { value: "government_id_back", label: "Government ID back", required: true, accept: ".jpg,.jpeg,.png,.pdf" },
  { value: "gst", label: "GST document", required: false, accept: ".jpg,.jpeg,.png,.pdf" },
] as const;
type Listing = { property: any; roomTypes: any[]; ratePlans: any[]; policies: any[]; media: any[]; documents: any[] };

export function PropertySetup({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [listing, setListing] = useState<Listing | null>(null);
  const [step, setStep] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const request = async (url: string, body?: unknown, method = "POST") => {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Could not save your changes.");
    return json;
  };

  const load = async () => {
    const response = await fetch(`/api/partner/properties/${propertyId}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error);
    setListing(json);
    // Deep-link support: /partner/properties/{id}?step=N jumps straight to a step.
    const requested = Number(searchParams.get("step"));
    const target = Number.isInteger(requested) && requested >= 1 && requested <= 8 ? requested : json.property.onboarding?.currentStep ?? 1;
    setStep(target);
  };

  useEffect(() => {
    void load().catch((error) => setNote(error.message));
  }, [propertyId, searchParams]);

  const saveStep = async (patch: any) => {
    setSaving(true);
    const next = Math.min(step + 1, 8);
    setListing((current) => (current ? { ...current, property: { ...current.property, ...patch } } : current));
    setStep(next);
    try {
      await Promise.all([
        request(`/api/partner/properties/${propertyId}`, patch, "PATCH"),
        request(`/api/partner/properties/${propertyId}/steps`, { step }),
      ]);
      setNote("Saved");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (!listing) return <main className="min-h-screen bg-slate-50 p-10 text-center">{note || "Loading your listing..."}</main>;

  const property = listing.property;
  const showFixedNext = step === 4;
  let body: React.ReactNode;

  if (step === 1) body = <TypeStep selected={property.propertyType} onSave={(type) => saveStep({ propertyType: type })} saving={saving} />;
  else if (step === 2) {
    body = (
      <form
        action={(formData) =>
          void saveStep({
            googlePlaceId: formData.get("place"),
            latitude: Number(formData.get("lat")),
            longitude: Number(formData.get("lng")),
            timezone: formData.get("timezone"),
            address: {
              line1: formData.get("address"),
              line2: null,
              landmark: null,
              city: formData.get("city"),
              district: null,
              state: formData.get("state"),
              postalCode: formData.get("pin"),
              countryCode: "IN",
            },
          })
        }
      >
        <Heading title="Find your property" text="Confirm the location and address guests will see." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="place" label="Google Place ID" value={property.googlePlaceId} />
          <Field name="timezone" label="Timezone" value={property.timezone || "Asia/Kolkata"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="lat" label="Latitude" value={property.latitude} type="number" />
          <Field name="lng" label="Longitude" value={property.longitude} type="number" />
        </div>
        <Field name="address" label="Address" value={property.address?.line1} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field name="city" label="City" value={property.address?.city} />
          <Field name="state" label="State" value={property.address?.state} />
          <Field name="pin" label="PIN code" value={property.address?.postalCode} />
        </div>
        <Save saving={saving} />
      </form>
    );
  } else if (step === 3) {
    body = (
      <form
        action={(formData) =>
          void saveStep({
            name: formData.get("name"),
            description: formData.get("description"),
            publicPhone: formData.get("phone"),
            publicEmail: formData.get("email"),
            checkInTime: formData.get("checkin"),
            checkOutTime: formData.get("checkout"),
            floors: Number(formData.get("floors")),
            totalPhysicalRooms: Number(formData.get("totalRooms")),
          })
        }
      >
        <Heading title="Property details" text="The information guests use to choose your hotel." />
        <Field name="name" label="Property name" value={property.name} />
        <label className="block text-sm font-medium">
          Description
          <textarea required minLength={20} name="description" defaultValue={property.description} className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="phone" label="Public phone" value={property.publicPhone} />
          <Field name="email" label="Public email" value={property.publicEmail} type="email" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="checkin" label="Check-in" value={property.checkInTime} type="time" />
          <Field name="checkout" label="Check-out" value={property.checkOutTime} type="time" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="floors" label="Floors" value={property.floors} type="number" />
          <Field name="totalRooms" label="Total rooms" value={property.totalPhysicalRooms} type="number" />
        </div>
        <Save saving={saving} />
      </form>
    );
  } else if (step === 4) body = <RoomsRates propertyId={propertyId} listing={listing} request={request} onChanged={load} />;
  else if (step === 5) body = <Facilities onSave={saveStep} saving={saving} selected={property.amenityIds ?? []} />;
  else if (step === 6) body = <PhotoStep propertyId={propertyId} listing={listing} onChanged={load} onContinue={() => void saveStep({})} />;
  else if (step === 7) body = <KycStep propertyId={propertyId} listing={listing} onChanged={load} onContinue={() => void saveStep({})} />;
  else {
    body = (
      <Review
        listing={listing}
        onSubmit={async () => {
          await request(`/api/partner/properties/${propertyId}/submit`);
          router.replace("/partner/dashboard");
        }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] pb-28">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/partner/dashboard" className="text-sm font-semibold">
            Save & close
          </Link>
          <span className="text-sm font-medium">Step {step} of 8</span>
        </div>
        <div className="mx-auto flex max-w-3xl gap-1 px-4 pb-3">
          {steps.map((_, index) => (
            <div key={index} className={`h-1 flex-1 rounded ${index < step ? "bg-slate-900" : "bg-slate-200"}`} />
          ))}
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="mb-4 text-xs font-bold uppercase tracking-[.18em] text-amber-600">{steps[step - 1]}</p>
        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">{body}</section>
        {note && <p className="mt-3 text-sm text-slate-600">{note}</p>}
      </div>
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-3xl gap-3">
          <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1} className="rounded-xl border border-slate-300 px-5 py-3 font-medium disabled:opacity-40">
            Back
          </button>
          {showFixedNext && <button type="button" onClick={() => setStep(5)} className="flex-1 rounded-xl bg-slate-900 py-3 font-semibold text-white">Continue to facilities</button>}
        </div>
      </nav>
    </main>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function Field({ name, label, value, type = "text" }: { name: string; label: string; value?: any; type?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input required name={name} type={type} step={type === "number" ? "any" : undefined} defaultValue={value ?? ""} className={input} />
    </label>
  );
}

function Save({ saving }: { saving: boolean }) {
  return (
    <button disabled={saving} className="mt-7 w-full rounded-xl bg-slate-900 p-3 font-semibold text-white">
      {saving ? "Saving..." : "Save and continue"}
    </button>
  );
}

function TypeStep({ selected, onSave, saving }: { selected: string; onSave: (type: string) => void; saving: boolean }) {
  const [type, setType] = useState(selected || "hotel");
  const types = ["hotel", "apartment", "villa", "resort", "hostel", "guest_house", "homestay", "other"];

  return (
    <>
      <Heading title="What kind of property is this?" text="Pick the closest category. This updates instantly and is saved when you continue." />
      <div className="grid grid-cols-2 gap-3">
        {types.map((item) => (
          <button
            type="button"
            onClick={() => setType(item)}
            key={item}
            className={`rounded-xl border p-4 text-left text-sm font-semibold capitalize transition ${type === item ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400"}`}
          >
            {item.replace("_", " ")}
          </button>
        ))}
      </div>
      <button disabled={saving} onClick={() => onSave(type)} className="mt-7 w-full rounded-xl bg-slate-900 p-3 font-semibold text-white">
        Save and continue
      </button>
    </>
  );
}

function RoomsRates({ propertyId, listing, request, onChanged }: { propertyId: string; listing: Listing; request: any; onChanged: () => Promise<void> }) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (kind: "room" | "policy" | "rate", form: FormData) => {
    setBusy(true);
    try {
      if (kind === "room") await request(`/api/partner/properties/${propertyId}/room-types`, { name: form.get("name"), description: form.get("description"), totalInventory: Number(form.get("inventory")), maxAdults: Number(form.get("adults")), maxChildren: 0, maxInfants: 0, bedConfigurations: [{ bedType: "double", count: 1 }] });
      if (kind === "policy") await request(`/api/partner/properties/${propertyId}/cancellation-policies`, { name: form.get("policyName"), description: form.get("policyDescription"), refundableUntilHours: Number(form.get("hours")), cancellationFeePercent: Number(form.get("fee")) });
      if (kind === "rate") {
        if (!listing.policies[0]) throw new Error("Add a cancellation policy first.");
        await request(`/api/partner/properties/${propertyId}/rate-plans`, { roomTypeId: form.get("roomTypeId"), name: form.get("rateName"), code: String(form.get("code")).toUpperCase(), basePricePaise: Math.round(Number(form.get("price")) * 100), cancellationPolicyId: listing.policies[0].id, paymentMode: "full" });
      }
      await onChanged();
      setNotice(kind === "room" ? "Room type added." : kind === "policy" ? "Cancellation policy added." : "Rate plan added.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Heading title="Rooms and rates" text="Set up your room inventory, cancellation promise, and nightly price. Each saved item appears below immediately." />
      <div className="grid gap-5 lg:grid-cols-2">
        <form action={(formData) => void add("room", formData)} className="rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold">1. Add a room type</h2>
          <p className="mt-1 text-sm text-slate-500">For example: Deluxe Double.</p>
          <Field name="name" label="Room name" />
          <label className="mt-3 block text-sm font-medium">
            Short description
            <textarea required minLength={10} name="description" placeholder="A comfortable room with..." className={input} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field name="inventory" label="Rooms to sell" type="number" />
            <Field name="adults" label="Max guests" type="number" />
          </div>
          <button disabled={busy} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
            Add room type
          </button>
        </form>
        <form action={(formData) => void add("policy", formData)} className="rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold">2. Set cancellation</h2>
          <p className="mt-1 text-sm text-slate-500">Guests see this before booking.</p>
          <Field name="policyName" label="Policy name" />
          <label className="mt-3 block text-sm font-medium">
            Policy details
            <textarea required minLength={10} name="policyDescription" placeholder="Free cancellation until..." className={input} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field name="hours" label="Hours before check-in" type="number" />
            <Field name="fee" label="Cancellation fee (%)" type="number" />
          </div>
          <button disabled={busy} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
            Save policy
          </button>
        </form>
      </div>
      {listing.roomTypes.length > 0 && <form action={(formData) => void add("rate", formData)} className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold">3. Add a sellable rate</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Room type<select required name="roomTypeId" className={input}>{listing.roomTypes.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><Field name="rateName" label="Rate name" /><Field name="code" label="Rate code" /><Field name="price" label="Price per night (INR)" type="number" /></div><button disabled={busy} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Add rate</button></form>}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary title="Room types" count={listing.roomTypes.length} items={listing.roomTypes.map((room) => room.name)} />
        <Summary title="Policies" count={listing.policies.length} items={listing.policies.map((policy) => policy.name)} />
        <Summary title="Rates" count={listing.ratePlans.length} items={listing.ratePlans.map((rate) => rate.name)} />
      </div>
      {notice && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">{notice}</p>}
    </>
  );
}

function Summary({ title, count, items }: { title: string; count: number; items: string[] }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-1 text-2xl font-bold">{count}</p>{items.slice(0, 2).map((item) => <p key={item} className="mt-1 truncate text-sm text-slate-600">{item}</p>)}</div>;
}

function Facilities({ selected, onSave, saving }: { selected: string[]; onSave: (value: any) => void; saving: boolean }) {
  const [items, setItems] = useState(selected);
  const options = ["Wi-Fi", "Parking", "Restaurant", "Air conditioning", "Lift", "Power backup", "Room service", "Hot water"];

  return (
    <>
      <Heading title="Facilities guests love" text="Choose all that are available at your property." />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => <button key={option} onClick={() => setItems((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]))} className={`rounded-full px-4 py-2 text-sm font-medium ${items.includes(option) ? "bg-slate-900 text-white" : "border border-slate-200"}`}>{option}</button>)}
      </div>
      <button disabled={saving} onClick={() => onSave({ amenityIds: items, childrenPolicy: { allowed: true }, petPolicy: { allowed: false }, smokingPolicy: { allowed: false }, identityRequirements: { governmentIdRequired: true } })} className="mt-7 w-full rounded-xl bg-slate-900 p-3 font-semibold text-white">
        Save and continue
      </button>
    </>
  );
}

function PhotoStep({ propertyId, listing, onChanged, onContinue }: { propertyId: string; listing: Listing; onChanged: () => Promise<void>; onContinue: () => void }) {
  const [category, setCategory] = useState<(typeof propertyPhotoCategories)[number]["value"]>("exterior");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const photoCount = listing.media.length;

  useEffect(() => {
    let cancelled = false;
    if (!listing.media.length) {
      setPreviewUrls({});
      return;
    }
    void fetch(`/api/partner/properties/${propertyId}/media/preview-urls`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "Unable to load previews.");
        if (!cancelled) setPreviewUrls(Object.fromEntries(json.previews.map((item: { id: string; url: string }) => [item.id, item.url])));
      })
      .catch(() => { if (!cancelled) setStatus("Photos are saved. Their previews could not be loaded yet."); });
    return () => { cancelled = true; };
  }, [propertyId, listing.media]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}...`);

    try {
      for (const file of Array.from(files)) {
        const checksum = await sha256Hex(file);
        const signed = await postJson(`/api/partner/properties/${propertyId}/media/upload-url`, { fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum, category });
        await putFile(signed.uploadUrl, signed.headers, file);
        await postJson(`/api/partner/properties/${propertyId}/media/finalize`, { uploadId: signed.uploadId });
      }

      await onChanged();
      setStatus("Photos uploaded. They are private and pending review.");
    } catch (error) {
      setStatus(uploadErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Heading title="Add property photos" text="Upload at least six sharp photos. They stay private until approved by your team." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-slate-200 p-5">
          <label className="block text-sm font-medium">
            Photo category
            <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className={input}>
              {propertyPhotoCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <span className="text-base font-semibold text-slate-900">Choose JPG, PNG, or WebP images</span>
            <span className="mt-2 text-sm text-slate-500">Up to 12 MB each. You can upload multiple files at once.</span>
            <span className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Select photos</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={uploading} onChange={(event) => { const files = event.target.files; event.currentTarget.value = ""; void handleFiles(files); }} />
          </label>
          {status && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{status}</p>}
          <button type="button" disabled={uploading || photoCount < 6} onClick={onContinue} className={`mt-5 w-full ${button}`}>
            {photoCount < 6 ? `Add ${6 - photoCount} more photo${6 - photoCount === 1 ? "" : "s"} to continue` : "Continue"}
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Progress</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{photoCount}/6</p>
          <p className="mt-2 text-sm text-slate-600">Exterior, reception, room, bathroom, and additional spaces are all accepted.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {listing.media.length ? listing.media.map((asset) => <article key={asset.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="aspect-[4/3] bg-slate-200">{previewUrls[asset.id] ? <img src={previewUrls[asset.id]} alt={`${String(asset.category || "property")} photo`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs font-medium text-slate-500">Loading preview...</div>}</div><div className="p-3"><p className="text-xs font-semibold capitalize text-slate-700">{String(asset.category || "additional").replace("_", " ")}</p><p className="mt-1 text-xs text-amber-700">Pending approval</p></div></article>) : <p className="col-span-2 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">No photos uploaded yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

function KycStep({ propertyId, listing, onChanged, onContinue }: { propertyId: string; listing: Listing; onChanged: () => Promise<void>; onContinue: () => void }) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const documentSet = new Set(listing.documents.map((item) => item.documentType));
  const requiredMissing = kycDocumentTypes.filter((item) => item.required && !documentSet.has(item.value)).length;

  const handleFile = async (documentType: (typeof kycDocumentTypes)[number]["value"], file: File | null) => {
    if (!file) return;
    setUploading(documentType);
    setStatus(`Uploading ${file.name}...`);

    try {
      const checksum = await sha256Hex(file);
      const signed = await postJson(`/api/partner/properties/${propertyId}/kyc/upload-url`, { documentType, fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum });
      await putFile(signed.uploadUrl, signed.headers, file);
      await postJson(`/api/partner/properties/${propertyId}/kyc/finalize`, { uploadId: signed.uploadId });
      await onChanged();
      setStatus("Document uploaded and stored privately.");
    } catch (error) {
      setStatus(uploadErrorMessage(error));
    } finally {
      setUploading(null);
    }
  };

  return (
    <>
      <Heading title="Verify ownership" text="PAN and government ID front and back are required before submission. Files stay private." />
      <div className="space-y-4">
        {kycDocumentTypes.map((item) => {
          const existing = listing.documents.find((document) => document.documentType === item.value);
          const isBusy = uploading === item.value;

          return (
            <div key={item.value} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <p className="text-sm text-slate-500">{item.required ? "Required for submission" : "Optional"}</p>
                  {existing ? <p className="mt-2 text-sm text-emerald-700">Uploaded: {existing.fileName} ({existing.status || "pending"})</p> : <p className="mt-2 text-sm text-amber-700">Not uploaded yet</p>}
                </div>
                <label className={`inline-flex cursor-pointer items-center justify-center ${button}`}>
                  {isBusy ? "Uploading..." : existing ? "Replace file" : "Upload file"}
                  <input type="file" accept={item.accept} className="hidden" disabled={Boolean(uploading)} onChange={(event) => { const file = event.target.files?.[0] ?? null; event.currentTarget.value = ""; void handleFile(item.value, file); }} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {status && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{status}</p>}
      <button disabled={Boolean(uploading) || requiredMissing > 0} onClick={onContinue} className={`mt-6 w-full ${button}`}>
        {requiredMissing > 0 ? `Upload ${requiredMissing} required document${requiredMissing === 1 ? "" : "s"} to continue` : "Continue"}
      </button>
    </>
  );
}

function Review({ listing, onSubmit }: { listing: Listing; onSubmit: () => Promise<void> }) {
  const docs = new Set(listing.documents.map((document) => document.documentType));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const roomIdsWithRates = new Set(listing.ratePlans.filter((rate) => rate.cancellationPolicyId).map((rate) => rate.roomTypeId));
  const rows = [
    ["Property details", Boolean(listing.property.description && listing.property.checkInTime && listing.property.checkOutTime && listing.property.publicPhone)],
    ["Confirmed location", Boolean(listing.property.address?.city && listing.property.googlePlaceId)],
    ["Facilities and policies", Boolean(listing.property.amenityIds?.length)],
    ["Rooms, prices and cancellation", listing.roomTypes.length > 0 && listing.policies.length > 0 && listing.roomTypes.every((room) => roomIdsWithRates.has(room.id))],
    ["Six photos", listing.media.length >= 6],
    ["Identity documents", ["pan", "government_id_front", "government_id_back"].every((item) => docs.has(item))],
  ];
  const complete = rows.every(([, isComplete]) => isComplete);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onSubmit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not submit this listing. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <Heading title="Ready for review?" text="The listing only goes live after all required items are reviewed and approved." />
      <div className="space-y-3">
        {rows.map(([label, isComplete]) => <div key={String(label)} className="flex justify-between rounded-xl bg-slate-50 p-4"><span>{label}</span><span className={isComplete ? "text-emerald-700" : "text-amber-700"}>{isComplete ? "Complete" : "Needs attention"}</span></div>)}
      </div>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p>}
      {!complete && <p className="mt-5 text-sm text-slate-600">Finish each item marked “Needs attention” before submitting.</p>}
      <button type="button" disabled={submitting || !complete} onClick={() => void submit()} className="mt-7 w-full rounded-xl bg-amber-400 p-3 font-bold disabled:cursor-not-allowed disabled:opacity-50">
        {submitting ? "Submitting listing..." : "Submit for review"}
      </button>
    </>
  );
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Request failed.");
  return json;
}

async function putFile(url: string, headers: Record<string, string>, file: File) {
  const response = await fetch(url, { method: "PUT", headers, body: file });
  if (!response.ok) throw new Error("UPLOAD_FAILED");
}

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof TypeError) return "Upload could not reach storage. Check your R2 bucket CORS for this app origin.";
  if (error instanceof Error) {
    if (error.message === "UPLOAD_FAILED") return "Upload was rejected by storage. Check file type, size, and signed URL expiry.";
    if (error.message === "UPLOAD_EXPIRED") return "The upload link expired before final save. Try the upload again.";
    if (error.message === "R2_OBJECT_VERIFICATION_FAILED") return "The file reached storage but verification failed. Retry with the original file.";
    return error.message;
  }
  return "Upload failed.";
}
