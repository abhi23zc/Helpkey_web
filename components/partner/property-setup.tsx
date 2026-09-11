"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BedDouble, Building, Building2, Check, CheckCircle2, ChevronLeft, CircleCheck, CircleHelp, Home, Hotel, Loader2, LockKeyhole, MapPin, Search, Sparkles, Trees, Users, Warehouse } from "lucide-react";
import { loadGoogleMaps, placesLibrary } from "@/lib/google/maps-loader";

const steps = ["Property type", "Location", "Property details", "Rooms & rates", "Facilities", "Photos", "Verification", "Review"];
const input = "mt-2 w-full rounded-xl border border-slate-300/80 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-[#092442] focus:ring-4 focus:ring-[#092442]/10";
const button = "rounded-xl bg-[#092442] px-5 py-2.5 text-xs sm:text-sm font-extrabold text-white shadow-md transition-all hover:bg-[#061633] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60";
const propertyPhotoCategories = [
  { value: "exterior", label: "Exterior / facade" },
  { value: "reception", label: "Reception / common area" },
  { value: "room", label: "Room" },
  { value: "bathroom", label: "Bathroom" },
  { value: "additional", label: "Additional spaces" },
] as const;
const allowedPropertyPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPropertyPhotoBytes = 12 * 1024 * 1024;
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
  const [savedAt, setSavedAt] = useState<string | null>(null);

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
    // A draft can revisit saved work but cannot skip required setup stages.
    const requested = Number(searchParams.get("step"));
    const current = json.property.onboarding?.currentStep ?? 1;
    const target = Number.isInteger(requested) && requested >= 1 && requested <= current ? requested : current;
    setStep(target);
  };

  useEffect(() => {
    void load().catch((error) => setNote(error.message));
  }, [propertyId, searchParams]);

  const saveStep = async (patch: any): Promise<boolean> => {
    setSaving(true);
    setNote("");
    try {
      // The property write must finish before we mark a step complete.  Running
      // these independently can leave a draft on the next step when its fields
      // were rejected by validation or a transient write failure.
      await request(`/api/partner/properties/${propertyId}`, patch, "PATCH");
      await request(`/api/partner/properties/${propertyId}/steps`, { step });
      setListing((current) => current ? {
        ...current,
        property: {
          ...current.property,
          ...patch,
          onboarding: {
            ...(current.property.onboarding ?? {}),
            currentStep: Math.min(step + 1, 8),
            completedSteps: [...new Set([...(current.property.onboarding?.completedSteps ?? []), step])],
          },
        },
      } : current);
      setStep((current) => Math.min(current + 1, 8));
      setSavedAt("Saved just now");
      return true;
    } catch (error) {
      setNote(error instanceof Error ? `We couldn’t save your changes. Your previous saved information is safe. ${error.message}` : "We couldn’t save your changes. Your previous saved information is safe.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const completeCurrentStep = async () => {
    setSaving(true);
    setNote("");
    try {
      await request(`/api/partner/properties/${propertyId}/steps`, { step });
      setListing((current) => current ? { ...current, property: { ...current.property, onboarding: { ...(current.property.onboarding ?? {}), currentStep: Math.min(step + 1, 8), completedSteps: [...new Set([...(current.property.onboarding?.completedSteps ?? []), step])] } } } : current);
      setStep((current) => Math.min(current + 1, 8));
      setSavedAt("Saved just now");
    } catch (error) {
      setNote(error instanceof Error ? `We couldn’t save your progress. ${error.message}` : "We couldn’t save your progress.");
    } finally {
      setSaving(false);
    }
  };

  if (!listing) return <main className="min-h-screen bg-[#f6f3ed] p-10 text-center text-sm font-medium text-slate-600">{note || "Loading your listing..."}</main>;

  const property = listing.property;
  let body: React.ReactNode;

  if (step === 1) body = <TypeStep selected={property.propertyType} onSave={(type) => saveStep({ propertyType: type })} saving={saving} />;
  else if (step === 2) body = <LocationStep property={property} saving={saving} onSave={saveStep} />;
  else if (step === 3) body = <DetailsStep property={property} saving={saving} onSave={saveStep} />;
  else if (step === 4) body = <RoomsRates propertyId={propertyId} listing={listing} request={request} onChanged={load} onContinue={completeCurrentStep} saving={saving} />;
  else if (step === 5) body = <Facilities onSave={saveStep} saving={saving} selected={property.amenityIds ?? []} />;
  else if (step === 6) body = <PhotoStep propertyId={propertyId} listing={listing} onChanged={load} onContinue={() => void completeCurrentStep()} />;
  else if (step === 7) body = <KycStep propertyId={propertyId} listing={listing} onChanged={load} onContinue={() => void completeCurrentStep()} />;
  else {
    body = (
      <Review
        listing={listing}
        onFix={(target) => setStep(target)}
        onSubmit={async () => {
          await request(`/api/partner/properties/${propertyId}/submit`);
          router.replace("/partner/dashboard");
        }}
      />
    );
  }

  const completedStepsCount = listing.property.onboarding?.completedSteps?.length ?? Math.max(0, step - 1);
  const progressPercent = Math.round((completedStepsCount / steps.length) * 100);

  return (
    <main className="min-h-screen bg-[#f8f6f0] pb-12 text-[#071633]">
      <header className="sticky top-0 z-30 border-b border-[#ded8cf] bg-white/95 shadow-[0_4px_20px_rgba(7,22,51,0.04)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Left: Save & Exit + Brand Logo */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/partner/onboarding"
              className="group flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2 text-xs sm:text-sm font-bold text-[#092442] shadow-xs transition hover:border-[#092442] hover:bg-[#092442] hover:text-white"
            >
              <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Save & exit</span>
            </Link>
            <div className="hidden h-5 w-[1px] bg-slate-200 sm:block" />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#092442] text-amber-400 shadow-xs">
                <Hotel className="h-4 w-4" />
              </span>
              <div className="flex flex-col leading-none">
                <span className="text-xs font-extrabold tracking-tight text-[#092442]">Helpkey</span>
                <span className="text-[10px] font-bold text-[#bb8525]">Partner Portal</span>
              </div>
            </div>
          </div>

          {/* Right: Actions, Auto-save, Property Name & Help */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Auto-Save Indicator Badge */}
            <div className="hidden items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/80 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs sm:flex" aria-live="polite">
              {saving ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-500" />
                  <span className="font-medium text-amber-700">Saving changes...</span>
                </>
              ) : savedAt ? (
                <>
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium text-slate-700">{savedAt}</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-slate-500">Auto-saves on continue</span>
                </>
              )}
            </div>

            {/* Step Count Badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-1.5 text-xs font-extrabold text-[#092442]">
              <span className="text-[#bb8525]">Step {step} of {steps.length}</span>
            </div>

            {/* Property Name Tag */}
            <div className="hidden items-center gap-2 rounded-xl bg-[#092442]/5 border border-[#092442]/10 px-3 py-1.5 text-xs font-bold text-[#092442] md:flex">
              <span className="max-w-[140px] truncate font-black">{listing.property.name}</span>
            </div>

            {/* Help Link */}
            <Link
              href="/help"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs transition hover:border-[#092442] hover:text-[#092442]"
            >
              <CircleHelp className="h-4 w-4 text-slate-500" />
              <span className="hidden sm:inline">Help</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content & Sidebar Grid */}
      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-8">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#bb8525]" />
            <p className="text-[11px] font-extrabold uppercase tracking-[.22em] text-[#bb8525]">Step {step} — {steps[step - 1]}</p>
          </div>
          <section className="rounded-2xl border border-[#ded8cf] bg-white p-6 shadow-[0_8px_30px_rgba(7,22,51,0.04)] sm:p-8">
            {body}
          </section>
          {note && <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-relaxed font-medium text-rose-900 shadow-xs">{note}</p>}
        </div>

        {/* Sidebar Summary Card */}
        <aside className="hidden h-fit rounded-2xl border border-[#ded8cf] bg-white p-6 shadow-[0_8px_30px_rgba(7,22,51,0.04)] lg:block">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#bb8525]">Your listing</p>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-700 border border-emerald-200/60">Draft mode</span>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <div>
              <p className="text-3xl font-black text-[#092442]">
                {completedStepsCount}
                <span className="text-lg font-bold text-slate-400">/8</span>
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">steps complete</p>
            </div>
            <div className="text-right">
              <p className="text-base font-black text-[#bb8525]">{progressPercent}%</p>
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-[#092442] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-6 rounded-xl border border-amber-200/70 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 text-[#092442]">
              <LockKeyhole className="h-4 w-4 text-[#bb8525]" />
              <p className="text-sm font-extrabold">Need help?</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Your draft stays completely private until you submit for final review.</p>
            <Link href="/help" className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[#092442] hover:underline">
              Visit Help Centre <ChevronLeft className="h-3 w-3 rotate-180" />
            </Link>
          </div>
        </aside>
      </div>

      {/* Bottom Navigation */}
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-4 pb-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(1, current - 1))}
          disabled={step === 1 || saving}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white px-5 text-sm font-extrabold text-[#092442] shadow-xs transition hover:border-[#092442] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        <span className="text-xs font-semibold text-slate-500 sm:hidden" aria-live="polite">
          {saving ? "Saving..." : savedAt || "Saves on continue"}
        </span>
      </nav>
    </main>
  );
}

type PlaceSelection = {
  googlePlaceId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  address: { line1: string; city: string; state: string; postalCode: string };
};

const defaultMapCenter = { lat: 22.9734, lng: 78.6569 };

function locationComponent(components: Array<{ types: string[]; longText?: string | null; shortText?: string | null; long_name?: string; short_name?: string }> | undefined, types: string[]) {
  const component = components?.find((item) => types.some((type) => item.types.includes(type)));
  return component?.longText ?? component?.long_name ?? component?.shortText ?? component?.short_name ?? "";
}

function selectionFromGeocode(result: google.maps.GeocoderResult, latLng: google.maps.LatLngLiteral, fallbackName: string): PlaceSelection {
  const components = result.address_components;
  const streetNumber = locationComponent(components, ["street_number"]);
  const route = locationComponent(components, ["route"]);
  const premise = locationComponent(components, ["premise", "establishment", "point_of_interest"]);
  const locality = locationComponent(components, ["sublocality_level_1", "sublocality"]);
  const city = locationComponent(components, ["locality", "administrative_area_level_3", "postal_town"]);
  const state = locationComponent(components, ["administrative_area_level_1"]);
  const postalCode = locationComponent(components, ["postal_code"]);
  const street = [streetNumber, route].filter(Boolean).join(" ");
  const line1 = [premise || fallbackName, street, locality].filter(Boolean).join(", ") || result.formatted_address || fallbackName;

  return {
    googlePlaceId: result.place_id,
    name: premise || fallbackName || city || "Pinned location",
    formattedAddress: result.formatted_address,
    latitude: latLng.lat,
    longitude: latLng.lng,
    address: { line1, city, state, postalCode },
  };
}

function LocationStep({ property, saving, onSave }: { property: any; saving: boolean; onSave: (patch: any) => Promise<boolean> }) {
  const [query, setQuery] = useState(property.address?.city ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [selected, setSelected] = useState<PlaceSelection | null>(() => property.googlePlaceId && typeof property.latitude === "number" && typeof property.longitude === "number" ? {
    googlePlaceId: property.googlePlaceId,
    name: property.name,
    formattedAddress: [property.address?.line1, property.address?.city, property.address?.state, property.address?.postalCode].filter(Boolean).join(", "),
    latitude: property.latitude,
    longitude: property.longitude,
    address: { line1: property.address?.line1 ?? "", city: property.address?.city ?? "", state: property.address?.state ?? "", postalCode: property.address?.postalCode ?? "" },
  } : null);
  const requestId = useRef(0);

  const updateSelection = (next: PlaceSelection) => {
    setSelected(next);
    setQuery(next.formattedAddress || next.name);
    setSuggestions([]);
    setMessage("");
  };

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setSuggestions([]); return; }
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { AutocompleteSuggestion } = await placesLibrary();
        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value, includedRegionCodes: ["IN"] });
        if (currentRequest === requestId.current) setSuggestions(response.suggestions.map((item) => item.placePrediction).filter((item): item is google.maps.places.PlacePrediction => Boolean(item)));
      } catch (error) {
        if (currentRequest === requestId.current) setMessage(error instanceof Error ? error.message : "Google place search is unavailable. Please try again.");
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const choose = async (prediction: google.maps.places.PlacePrediction) => {
    setLoading(true); setMessage("");
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location", "addressComponents"] });
      if (!place.id || !place.location) throw new Error("Choose a result with a confirmed location.");
      const streetNumber = locationComponent(place.addressComponents, ["street_number"]);
      const route = locationComponent(place.addressComponents, ["route"]);
      const premise = locationComponent(place.addressComponents, ["premise", "establishment"]);
      const locality = locationComponent(place.addressComponents, ["sublocality_level_1", "sublocality"]);
      const line1 = [premise || place.displayName, [streetNumber, route].filter(Boolean).join(" "), locality].filter(Boolean).join(", ") || place.formattedAddress || "";
      const next: PlaceSelection = {
        googlePlaceId: place.id,
        name: place.displayName ?? property.name,
        formattedAddress: place.formattedAddress ?? line1,
        latitude: place.location.lat(),
        longitude: place.location.lng(),
        address: {
          line1,
          city: locationComponent(place.addressComponents, ["locality", "administrative_area_level_3", "postal_town"]),
          state: locationComponent(place.addressComponents, ["administrative_area_level_1"]),
          postalCode: locationComponent(place.addressComponents, ["postal_code"]),
        },
      };
      updateSelection(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not use that location.");
    } finally { setLoading(false); }
  };

  const submit = async () => {
    if (!selected) { setMessage("Search for and select your property from Google Maps first."); return; }
    if (!selected.address.line1 || !selected.address.city || !selected.address.state || !selected.address.postalCode) { setMessage("Complete the visible address fields before saving."); return; }
    await onSave({ googlePlaceId: selected.googlePlaceId, latitude: selected.latitude, longitude: selected.longitude, timezone: property.timezone || "Asia/Kolkata", address: { ...selected.address, line2: null, landmark: null, district: null, countryCode: "IN" } });
  };

  return <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <Heading title="Where is your property?" text="Search Google Maps, then confirm the guest-facing address. We use the precise location privately for bookings and verification." />
    <label className="block text-sm font-bold text-[#0b1f3a]">Search your property
      <span className="relative mt-2 block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setMessage(""); }} placeholder="Property name, address, or landmark" className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm outline-none focus:border-[#0b1f3a] focus:ring-4 focus:ring-[#0b1f3a]/10" />{(loading || suggestions.length > 0) && <div role="listbox" className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">{loading && <p className="px-3 py-2 text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Finding places…</p>}{suggestions.map((suggestion, index) => <button key={`${suggestion.text.toString()}-${index}`} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(suggestion)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"><span className="block text-sm font-bold text-[#0b1f3a]">{suggestion.text.toString()}</span>{suggestion.secondaryText && <span className="mt-0.5 block text-xs text-slate-500">{suggestion.secondaryText.toString()}</span>}</button>)}</div>}</span>
    </label>
    <LocationMapPicker
      city={property.address?.city}
      propertyName={property.name}
      selected={selected}
      onPick={updateSelection}
      onBusy={setLoading}
      onMessage={setMessage}
    />
    {selected && <div className="mt-5 rounded-2xl border border-[#e5e1d8] bg-[#f7f8fa] p-4"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fbf3df] text-[#9a6b18]"><MapPin className="h-5 w-5" /></span><div><p className="font-bold text-[#0b1f3a]">{selected.name}</p><p className="mt-1 text-sm leading-6 text-slate-600">{selected.formattedAddress}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Address shown to guests<input required value={selected.address.line1} onChange={(event) => setSelected((current) => current ? { ...current, address: { ...current.address, line1: event.target.value } } : current)} className={input} /></label><label className="text-sm font-semibold text-slate-700">City<input required value={selected.address.city} onChange={(event) => setSelected((current) => current ? { ...current, address: { ...current.address, city: event.target.value } } : current)} className={input} /></label><label className="text-sm font-semibold text-slate-700">State<input required value={selected.address.state} onChange={(event) => setSelected((current) => current ? { ...current, address: { ...current.address, state: event.target.value } } : current)} className={input} /></label><label className="text-sm font-semibold text-slate-700">PIN code<input required value={selected.address.postalCode} onChange={(event) => setSelected((current) => current ? { ...current, address: { ...current.address, postalCode: event.target.value } } : current)} className={input} /></label></div></div>}
    {message && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{message}</p>}
    <Save saving={saving} />
  </form>;
}

function LocationMapPicker({
  city,
  propertyName,
  selected,
  onPick,
  onBusy,
  onMessage,
}: {
  city?: string;
  propertyName: string;
  selected: PlaceSelection | null;
  onPick: (selection: PlaceSelection) => void;
  onBusy: (busy: boolean) => void;
  onMessage: (message: string) => void;
}) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [mapError, setMapError] = useState("");
  const [pinning, setPinning] = useState(false);

  const markerTitle = selected ? selected.name : propertyName;
  const center = selected ? { lat: selected.latitude, lng: selected.longitude } : defaultMapCenter;

  const moveMarker = (position: google.maps.LatLngLiteral) => {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter(position);
    map.setZoom(selected ? 17 : 15);

    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        map,
        position,
        title: markerTitle,
        draggable: true,
        animation: google.maps.Animation.DROP,
      });
      markerRef.current.addListener("dragend", () => {
        const position = markerRef.current?.getPosition();
        if (position) void pinFromLatLng({ lat: position.lat(), lng: position.lng() });
      });
      return;
    }

    markerRef.current.setPosition(position);
    markerRef.current.setTitle(markerTitle);
  };

  async function reverseGeocode(position: google.maps.LatLngLiteral) {
    setPinning(true);
    onBusy(true);
    onMessage("");
    try {
      const maps = await loadGoogleMaps();
      geocoderRef.current ??= new maps.Geocoder();
      const result = await new Promise<google.maps.GeocoderResult>((resolve, reject) => {
        geocoderRef.current?.geocode({ location: position }, (results, status) => {
          if (status === "OK" && results?.[0]) resolve(results[0]);
          else reject(new Error(status === "ZERO_RESULTS" ? "No address was found for this pinned location." : "Could not read the address for this pin."));
        });
      });
      onPick(selectionFromGeocode(result, position, propertyName));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "We could not use that pinned location.");
    } finally {
      setPinning(false);
      onBusy(false);
    }
  }

  function pinFromLatLng(position: google.maps.LatLngLiteral) {
    moveMarker(position);
    return reverseGeocode(position);
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      if (!mapHostRef.current) return;
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !mapHostRef.current) return;
        geocoderRef.current = new maps.Geocoder();
        const initialCenter = selected ? { lat: selected.latitude, lng: selected.longitude } : defaultMapCenter;
        const map = new maps.Map(mapHostRef.current, {
          center: initialCenter,
          zoom: selected ? 16 : 5,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          styles: [
            { featureType: "poi.business", stylers: [{ visibility: "off" }] },
            { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
          ],
        });
        mapRef.current = map;
        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (event.latLng) void pinFromLatLng({ lat: event.latLng.lat(), lng: event.latLng.lng() });
        });
        if (selected) moveMarker(initialCenter);
        else if (city) {
          geocoderRef.current.geocode({ address: city, componentRestrictions: { country: "IN" } }, (results, status) => {
            if (status === "OK" && results?.[0]?.geometry.location) {
              const position = { lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() };
              map.setCenter(position);
              map.setZoom(12);
            }
          });
        }
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "Map could not be loaded.");
      }
    }

    void initializeMap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selected) moveMarker({ lat: selected.latitude, lng: selected.longitude });
  }, [selected?.latitude, selected?.longitude]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      onMessage("Your browser does not support current-location detection. Click the map to pin manually.");
      return;
    }
    setPinning(true);
    navigator.geolocation.getCurrentPosition(
      (position) => void pinFromLatLng({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {
        setPinning(false);
        onMessage("We could not access your current location. You can still click the map to pin your property.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#e5e1d8] bg-white shadow-xs">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-extrabold text-[#071633]">Pin exact location on map</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Click the map or drag the pin. Address details fill automatically.</p>
        </div>
        <button type="button" onClick={useCurrentLocation} disabled={pinning} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d8c7a4] bg-[#fff9ed] px-3 py-2 text-xs font-extrabold text-[#8a5d10] transition hover:bg-[#fbf3df] disabled:cursor-not-allowed disabled:opacity-60">
          {pinning ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          Use my current location
        </button>
      </div>
      <div className="relative h-[300px] w-full bg-[#edf2f7] sm:h-[360px]">
        {mapError ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <MapPin className="h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-700">Map is unavailable</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{mapError} Search above still works.</p>
          </div>
        ) : (
          <div ref={mapHostRef} className="h-full w-full" aria-label="Map for choosing the property location" />
        )}
        {!selected && !mapError && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-white/95 p-3 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur">
            Search a place above, or click the map to place your property pin.
          </div>
        )}
      </div>
    </section>
  );
}

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function DetailsStep({ property, saving, onSave }: { property: any; saving: boolean; onSave: (patch: any) => Promise<boolean> }) {
  const [message, setMessage] = useState("");

  const submit = async (formData: FormData) => {
    const name = formValue(formData, "name");
    const description = formValue(formData, "description");
    const publicPhone = formValue(formData, "phone");
    const publicEmail = formValue(formData, "email");
    const checkInTime = formValue(formData, "checkin");
    const checkOutTime = formValue(formData, "checkout");
    const floors = Number(formData.get("floors") ?? 0);
    const totalPhysicalRooms = Number(formData.get("totalRooms") ?? 1);

    if (name.length < 2) {
      setMessage("Enter the property name.");
      return;
    }
    if (description.length < 20) {
      setMessage("Add a description of at least 20 characters so guests understand the property.");
      return;
    }
    if (!/^\+\d{6,15}$/.test(publicPhone)) {
      setMessage("Enter the public phone in international format, for example +919876543210.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)) {
      setMessage("Enter a valid public email address.");
      return;
    }
    if (!checkInTime || !checkOutTime) {
      setMessage("Choose both check-in and check-out times.");
      return;
    }
    if (!Number.isInteger(floors) || floors < 0 || floors > 200) {
      setMessage("Enter a valid floor count between 0 and 200.");
      return;
    }
    if (!Number.isInteger(totalPhysicalRooms) || totalPhysicalRooms < 1 || totalPhysicalRooms > 500) {
      setMessage("Enter the total rooms between 1 and 500.");
      return;
    }

    setMessage("");
    await onSave({
      name,
      description,
      publicPhone,
      publicEmail: publicEmail.toLowerCase(),
      checkInTime,
      checkOutTime,
      floors,
      totalPhysicalRooms,
    });
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
    >
      <Heading title="Property details" text="Add the information guests use to choose and contact your property." />
      <Field name="name" label="Property name" value={property.name} />
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
        Description
        <textarea
          required
          minLength={20}
          name="description"
          defaultValue={property.description}
          placeholder="Tell guests about the location, rooms, service, and what makes the stay comfortable."
          className={`${input} min-h-28 resize-y leading-relaxed`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="phone" label="Public phone" value={property.publicPhone} placeholder="+919876543210" inputMode="tel" />
        <Field name="email" label="Public email" value={property.publicEmail} type="email" placeholder="reservations@example.com" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="checkin" label="Check-in" value={property.checkInTime} type="time" />
        <Field name="checkout" label="Check-out" value={property.checkOutTime} type="time" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="floors" label="Floors" value={property.floors} type="number" />
        <Field name="totalRooms" label="Total rooms" value={property.totalPhysicalRooms} type="number" />
      </div>
      {message && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</p>}
      <Save saving={saving} />
    </form>
  );
}

const propertyTypeDetails: Record<string, { label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  hotel: { label: "Hotel", description: "Standard hotel with private rooms & services", icon: Hotel },
  apartment: { label: "Apartment", description: "Self-contained living unit with kitchen", icon: Building2 },
  villa: { label: "Villa", description: "Standalone luxury home with garden or pool", icon: Home },
  resort: { label: "Resort", description: "Full-service vacation retreat with leisure amenities", icon: Trees },
  hostel: { label: "Hostel", description: "Budget lodging with shared dorms or private rooms", icon: Users },
  guest_house: { label: "Guest House", description: "Informal, cozy lodging hosted locally", icon: BedDouble },
  homestay: { label: "Homestay", description: "Residential property offering local stay experiences", icon: Building },
  other: { label: "Other", description: "Unique stays, farmhouses, or boutique lodging", icon: Warehouse },
};

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-[#071633] sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

function Field({ name, label, value, type = "text", placeholder, inputMode }: { name: string; label: string; value?: any; type?: string; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 sm:text-xs">
      {label}
      <input required name={name} type={type} step={type === "number" ? "1" : undefined} min={type === "number" ? 0 : undefined} defaultValue={value ?? ""} placeholder={placeholder} inputMode={inputMode} className={input} />
    </label>
  );
}

function Save({ saving }: { saving: boolean }) {
  return (
    <button
      disabled={saving}
      className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#092442] px-5 py-3 text-sm font-extrabold text-white shadow-md transition-all hover:bg-[#061633] hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {saving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          <span>Saving updates...</span>
        </>
      ) : (
        <>
          <span>Save and continue</span>
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </button>
  );
}

function TypeStep({ selected, onSave, saving }: { selected: string; onSave: (type: string) => void; saving: boolean }) {
  const [type, setType] = useState(selected || "hotel");
  const types = ["hotel", "apartment", "villa", "resort", "hostel", "guest_house", "homestay", "other"];

  return (
    <>
      <Heading
        title="What kind of property is this?"
        text="Pick the category that best describes your property. This updates instantly and is saved when you continue."
      />
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {types.map((item) => {
          const info = propertyTypeDetails[item] || { label: item.replace("_", " "), description: "", icon: Hotel };
          const Icon = info.icon;
          const isSelected = type === item;

          return (
            <button
              type="button"
              onClick={() => setType(item)}
              key={item}
              className={`group relative flex flex-col justify-between rounded-2xl border p-4.5 text-left transition-all duration-200 ${
                isSelected
                  ? "border-[#092442] bg-[#092442] text-white shadow-lg ring-2 ring-[#092442]/20"
                  : "border-slate-200/90 bg-white text-slate-800 hover:border-amber-500/50 hover:bg-slate-50/80 hover:shadow-md"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                      isSelected
                        ? "bg-amber-400 text-[#092442]"
                        : "bg-slate-100 text-[#092442] group-hover:bg-amber-100 group-hover:text-amber-800"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {isSelected && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[#092442] shadow-xs">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <h3 className={`mt-3.5 text-base font-extrabold capitalize ${isSelected ? "text-white" : "text-[#092442]"}`}>
                  {info.label}
                </h3>
                <p className={`mt-1 text-xs leading-relaxed ${isSelected ? "text-slate-200" : "text-slate-500"}`}>
                  {info.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <button
        disabled={saving}
        onClick={() => onSave(type)}
        className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#092442] px-5 py-3 text-sm font-extrabold text-white shadow-md transition-all hover:bg-[#061633] hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            <span>Saving updates...</span>
          </>
        ) : (
          <>
            <span>Save and continue</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </>
  );
}

function RoomsRates({ propertyId, listing, request, onChanged, onContinue, saving }: { propertyId: string; listing: Listing; request: any; onChanged: () => Promise<void>; onContinue: () => Promise<void>; saving: boolean }) {
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
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Heading title="Rooms and rates" text="Create a room type, then give it a price and cancellation promise. A room becomes ready only when all three are saved." />
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={(event) => { event.preventDefault(); void add("room", new FormData(event.currentTarget)); }} className="rounded-2xl border border-slate-200 p-5">
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
        <form onSubmit={(event) => { event.preventDefault(); void add("policy", new FormData(event.currentTarget)); }} className="rounded-2xl border border-slate-200 p-5">
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
      {listing.roomTypes.length > 0 && <form onSubmit={(event) => { event.preventDefault(); void add("rate", new FormData(event.currentTarget)); }} className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold">3. Add a sellable rate</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Room type<select required name="roomTypeId" className={input}>{listing.roomTypes.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><Field name="rateName" label="Rate name" /><Field name="code" label="Rate code" /><Field name="price" label="Price per night (INR)" type="number" /></div><button disabled={busy} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Add rate</button></form>}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary title="Room types" count={listing.roomTypes.length} items={listing.roomTypes.map((room) => room.name)} />
        <Summary title="Policies" count={listing.policies.length} items={listing.policies.map((policy) => policy.name)} />
        <Summary title="Rates" count={listing.ratePlans.length} items={listing.ratePlans.map((rate) => rate.name)} />
      </div>
      {notice && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">{notice}</p>}
      <button type="button" disabled={saving || busy || !listing.roomTypes.length || !listing.policies.length || !listing.roomTypes.every((room) => listing.ratePlans.some((rate) => rate.roomTypeId === room.id && rate.cancellationPolicyId))} onClick={() => void onContinue()} className="mt-7 w-full rounded-xl bg-[#0b1f3a] p-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {!listing.roomTypes.length || !listing.policies.length || !listing.roomTypes.every((room) => listing.ratePlans.some((rate) => rate.roomTypeId === room.id && rate.cancellationPolicyId)) ? "Add a room, policy, and matching rate to continue" : saving ? "Saving…" : "Continue to facilities"}
      </button>
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
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const handleFiles = async (selectedFiles: File[]) => {
    if (!selectedFiles.length) return;
    const invalidFile = selectedFiles.find((file) => !allowedPropertyPhotoTypes.has(file.type) || file.size <= 0 || file.size > maxPropertyPhotoBytes);
    if (invalidFile) {
      setStatus(`“${invalidFile.name}” was not uploaded. Use a JPG, PNG, or WebP image no larger than 12 MB.`);
      return;
    }

    setUploading(true);
    setStatus(`Preparing ${selectedFiles.length} photo${selectedFiles.length > 1 ? "s" : ""}...`);
    let uploadedCount = 0;
    let uploadFailure: unknown = null;

    try {
      for (const [index, file] of selectedFiles.entries()) {
        setStatus(`Uploading photo ${index + 1} of ${selectedFiles.length}: ${file.name}`);
        const checksum = await sha256Hex(file);
        const signed = await postJson(`/api/partner/properties/${propertyId}/media/upload-url`, { fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum, category });
        await putFile(signed.uploadUrl, signed.headers, file);
        await postJson(`/api/partner/properties/${propertyId}/media/finalize`, { uploadId: signed.uploadId });
        uploadedCount += 1;
      }
    } catch (error) {
      uploadFailure = error;
    } finally {
      // A later file may fail after earlier files were finalized. Re-read the
      // listing so those successful uploads are immediately visible and never
      // look as though they were lost.
      if (uploadedCount > 0) {
        try {
          await onChanged();
        } catch {
          setStatus(`${uploadedCount} photo${uploadedCount === 1 ? "" : "s"} uploaded, but the gallery could not refresh. Reloading the page will show them.`);
        }
      }
      setUploading(false);
      if (uploadFailure) {
        const completed = uploadedCount ? `${uploadedCount} photo${uploadedCount === 1 ? "" : "s"} uploaded successfully. ` : "";
        setStatus(`${completed}${uploadErrorMessage(uploadFailure)}`);
      } else {
        setStatus(`${uploadedCount} photo${uploadedCount === 1 ? "" : "s"} uploaded. They are private and pending review.`);
      }
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
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <span className="text-base font-semibold text-slate-900">Choose JPG, PNG, or WebP images</span>
            <span className="mt-2 text-sm text-slate-500">Up to 12 MB each. You can upload multiple files at once.</span>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#092442] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Uploading photos…" : "Select photos"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                // FileList is owned by the browser and can be cleared when the
                // input is reset. Copy it before starting asynchronous work.
                const selectedFiles = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (!selectedFiles.length) {
                  setStatus("No photos were selected.");
                  return;
                }
                setSelectedFileNames(selectedFiles.map((file) => file.name));
                setStatus(`${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"} selected. Preparing upload…`);
                void handleFiles(selectedFiles);
              }}
            />
          </div>
          {selectedFileNames.length > 0 && (
            <p className="mt-3 truncate text-xs font-medium text-slate-600" title={selectedFileNames.join(", ")}>
              Selected: {selectedFileNames.slice(0, 2).join(", ")}{selectedFileNames.length > 2 ? ` +${selectedFileNames.length - 2} more` : ""}
            </p>
          )}
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

function Review({ listing, onSubmit, onFix }: { listing: Listing; onSubmit: () => Promise<void>; onFix: (step: number) => void }) {
  const docs = new Set(listing.documents.map((document) => document.documentType));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const roomIdsWithRates = new Set(listing.ratePlans.filter((rate) => rate.cancellationPolicyId).map((rate) => rate.roomTypeId));
  const rows: Array<[string, boolean, number]> = [
    ["Property details", Boolean(listing.property.description && listing.property.checkInTime && listing.property.checkOutTime && listing.property.publicPhone), 3],
    ["Confirmed location", Boolean(listing.property.address?.city && listing.property.googlePlaceId), 2],
    ["Facilities and policies", Boolean(listing.property.amenityIds?.length), 5],
    ["Rooms, prices and cancellation", listing.roomTypes.length > 0 && listing.policies.length > 0 && listing.roomTypes.every((room) => roomIdsWithRates.has(room.id)), 4],
    ["Six photos", listing.media.length >= 6, 6],
    ["Identity documents", ["pan", "government_id_front", "government_id_back"].every((item) => docs.has(item)), 7],
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
        {rows.map(([label, isComplete, target]) => <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><span className="font-medium">{label}</span>{isComplete ? <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700"><Check className="h-4 w-4" /> Complete</span> : <button type="button" onClick={() => onFix(target)} className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-[#0b1f3a] shadow-sm ring-1 ring-slate-200 hover:bg-slate-100">Fix</button>}</div>)}
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
