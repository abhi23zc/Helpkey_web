"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, MapPin, Navigation, Plus, Search, Star, Upload, X } from "lucide-react";
import { formatPaise, toPaise } from "@/lib/currency";
import { requestJson, putFile, putFileWithProgress, sha256Hex, uploadErrorMessage } from "@/lib/partner/upload-client";
import type { ListingMutations, ListingProperty, ListingResponse } from "./use-property-listing";

/** Minimum time a loading state stays visible so spinners never just flash. */
const MIN_VISIBLE_MS = 450;

/**
 * Runs an async task and guarantees it takes at least `MIN_VISIBLE_MS`, so any
 * button spinner bound to the pending state is perceptible even on very fast
 * (e.g. localhost) responses. Errors are re-thrown after the delay.
 */
async function withMinVisible<T>(task: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await task();
  } finally {
    const remaining = MIN_VISIBLE_MS - (Date.now() - start);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

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
  // `useFormStatus` reflects the true pending state of the enclosing <form>
  // action across the whole submit lifecycle, so the button always shows a
  // spinner even when our manual `saving` flag flips too quickly to notice.
  const { pending } = useFormStatus();
  const busy = saving || pending;
  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
      {saved && !error && !busy && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
        </p>
      )}
      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all disabled:opacity-60 disabled:cursor-progress">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}

type EditorProps = { propertyId: string; listing: ListingResponse; onSaved: () => void; mutations: ListingMutations; onBusyChange?: (busy: boolean) => void };

/**
 * Runs a save handler with loading/error/saved state. The handler may return a
 * value (typically the API response) which is forwarded to the caller so the
 * editor can merge the result into local state instead of refetching.
 */
function useSave(options?: { onSettled?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSaving(true);
    options?.onBusyChange?.(true);
    setError("");
    setSaved(false);
    try {
      const result = await withMinVisible(fn);
      setSaved(true);
      options?.onSettled?.();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
      return undefined;
    } finally {
      setSaving(false);
      options?.onBusyChange?.(false);
    }
  };

  return { saving, error, saved, run };
}

/* ---------- Basic Details ---------- */

export function BasicDetailsEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const p = listing.property;
  const { saving, error, saved, run } = useSave({ onBusyChange });

  const submit = (form: FormData) =>
    run(async () => {
      const fields = {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        publicPhone: String(form.get("publicPhone") ?? ""),
        publicEmail: String(form.get("publicEmail") ?? ""),
        checkInTime: String(form.get("checkInTime") ?? ""),
        checkOutTime: String(form.get("checkOutTime") ?? ""),
      };
      const res = await requestJson<{ property?: Partial<ListingProperty> }>(
        `/api/partner/properties/${propertyId}`,
        fields,
        "PATCH",
      );
      mutations.patchProperty({ ...fields, ...(res.property ?? {}) });
      onSaved();
    });

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

type AddressDraft = {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
};

type SelectedPlace = {
  googlePlaceId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  address: AddressDraft;
};

type GoogleLatLng = { lat: () => number; lng: () => number };
type GoogleLatLngLiteral = { lat: number; lng: number };
type GoogleBounds = unknown;
type GooglePlaceComponent = { long_name: string; short_name: string; types: string[] };
type GooglePlace = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  address_components?: GooglePlaceComponent[];
  geometry?: {
    location?: GoogleLatLng;
    viewport?: GoogleBounds;
  };
};
type GoogleListener = { remove: () => void };
type GoogleAutocomplete = {
  getPlace: () => GooglePlace;
  addListener: (eventName: "place_changed", callback: () => void) => GoogleListener;
};
type GoogleMap = {
  setCenter: (center: GoogleLatLngLiteral) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: GoogleBounds) => void;
};
type GoogleMarker = {
  setPosition: (position: GoogleLatLngLiteral) => void;
  setMap: (map: GoogleMap | null) => void;
};
type GoogleMapsNamespace = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    places: {
      Autocomplete: new (input: HTMLInputElement, options: Record<string, unknown>) => GoogleAutocomplete;
    };
    event: {
      clearInstanceListeners: (instance: unknown) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __helpkeyGoogleMapsPromise?: Promise<GoogleMapsNamespace>;
  }
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const INDIA_CENTER: GoogleLatLngLiteral = { lat: 20.5937, lng: 78.9629 };

function loadGoogleMaps(): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps is only available in the browser."));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (window.__helpkeyGoogleMapsPromise) return window.__helpkeyGoogleMapsPromise;
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("Google Maps API key is missing."));

  window.__helpkeyGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-helpkey-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", () => window.google ? resolve(window.google) : reject(new Error("Google Maps failed to load.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.helpkeyGoogleMaps = "true";
    script.onload = () => window.google ? resolve(window.google) : reject(new Error("Google Maps failed to load."));
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });

  return window.__helpkeyGoogleMapsPromise;
}

function componentValue(components: GooglePlaceComponent[] | undefined, types: string[], short = false): string {
  const component = components?.find((item) => types.some((type) => item.types.includes(type)));
  return component ? (short ? component.short_name : component.long_name) : "";
}

function addressFromPlace(place: GooglePlace): AddressDraft {
  const streetNumber = componentValue(place.address_components, ["street_number"]);
  const route = componentValue(place.address_components, ["route"]);
  const premise = componentValue(place.address_components, ["premise", "establishment"]);
  const sublocality = componentValue(place.address_components, ["sublocality_level_1", "sublocality"]);
  const city = componentValue(place.address_components, ["locality", "administrative_area_level_3", "postal_town"]);
  const state = componentValue(place.address_components, ["administrative_area_level_1"]);
  const postalCode = componentValue(place.address_components, ["postal_code"]);
  const lineParts = [premise || place.name, [streetNumber, route].filter(Boolean).join(" "), sublocality].filter(Boolean);

  return {
    line1: lineParts.join(", ") || place.formatted_address || "",
    city,
    state,
    postalCode,
  };
}

function existingPlaceFromProperty(property: ListingProperty): SelectedPlace | null {
  if (
    !property.googlePlaceId ||
    typeof property.latitude !== "number" ||
    typeof property.longitude !== "number"
  ) {
    return null;
  }

  return {
    googlePlaceId: property.googlePlaceId,
    name: property.name,
    formattedAddress: [property.address?.line1, property.address?.city, property.address?.state, property.address?.postalCode].filter(Boolean).join(", "),
    latitude: property.latitude,
    longitude: property.longitude,
    address: {
      line1: property.address?.line1 ?? "",
      city: property.address?.city ?? "",
      state: property.address?.state ?? "",
      postalCode: property.address?.postalCode ?? "",
    },
  };
}

export function LocationEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const p = listing.property;
  const { saving, error, saved, run } = useSave({ onBusyChange });
  const searchRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GoogleMap | null>(null);
  const markerInstance = useRef<GoogleMarker | null>(null);
  const [mapsStatus, setMapsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapsError, setMapsError] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(() => existingPlaceFromProperty(p));
  const [address, setAddress] = useState<AddressDraft>(() => existingPlaceFromProperty(p)?.address ?? {
    line1: p.address?.line1 ?? "",
    city: p.address?.city ?? "",
    state: p.address?.state ?? "",
    postalCode: p.address?.postalCode ?? "",
  });

  const selectedPosition = useMemo<GoogleLatLngLiteral | null>(() => {
    if (selectedPlace) return { lat: selectedPlace.latitude, lng: selectedPlace.longitude };
    if (typeof p.latitude === "number" && typeof p.longitude === "number") return { lat: p.latitude, lng: p.longitude };
    return null;
  }, [p.latitude, p.longitude, selectedPlace]);

  useEffect(() => {
    let cancelled = false;
    let autocomplete: GoogleAutocomplete | null = null;

    const setup = async () => {
      if (!mapRef.current || !searchRef.current) return;
      setMapsStatus("loading");
      setMapsError("");

      try {
        const google = await loadGoogleMaps();
        if (cancelled || !mapRef.current || !searchRef.current) return;

        const center = selectedPosition ?? INDIA_CENTER;
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center,
          zoom: selectedPosition ? 15 : 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });

        markerInstance.current = new google.maps.Marker({
          map: selectedPosition ? mapInstance.current : null,
          position: selectedPosition ?? INDIA_CENTER,
          title: p.name,
        });

        autocomplete = new google.maps.places.Autocomplete(searchRef.current, {
          componentRestrictions: { country: "in" },
          fields: ["place_id", "name", "formatted_address", "geometry", "address_components"],
          types: ["establishment", "geocode"],
        });

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          const location = place?.geometry?.location;
          if (!place?.place_id || !location) {
            setMapsError("Select a result from Google suggestions so we can confirm the map location.");
            return;
          }

          const nextPosition = { lat: location.lat(), lng: location.lng() };
          const nextAddress = addressFromPlace(place);
          const nextPlace: SelectedPlace = {
            googlePlaceId: place.place_id,
            name: place.name ?? p.name,
            formattedAddress: place.formatted_address ?? nextAddress.line1,
            latitude: nextPosition.lat,
            longitude: nextPosition.lng,
            address: nextAddress,
          };

          setSelectedPlace(nextPlace);
          setAddress(nextAddress);
          setMapsError("");
          mapInstance.current?.setCenter(nextPosition);
          mapInstance.current?.setZoom(16);
          if (place.geometry?.viewport) mapInstance.current?.fitBounds(place.geometry.viewport);
          markerInstance.current?.setMap(mapInstance.current);
          markerInstance.current?.setPosition(nextPosition);
        });

        setMapsStatus("ready");
      } catch (cause) {
        setMapsStatus("error");
        setMapsError(cause instanceof Error ? cause.message : "Google Maps failed to load.");
      }
    };

    void setup();
    return () => {
      cancelled = true;
      if (autocomplete && window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(autocomplete);
    };
  // Initialize Google Maps and autocomplete once for this editor. The selected
  // location is updated by the effect below; re-running this setup on every
  // selection makes Google Maps rebuild DOM nodes that React also manages and
  // can trigger a `removeChild` runtime error when the editor closes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setup intentionally runs once; location updates are handled below.
  }, [p.name]);

  useEffect(() => {
    if (!mapInstance.current || !markerInstance.current || !selectedPosition) return;
    mapInstance.current.setCenter(selectedPosition);
    markerInstance.current.setMap(mapInstance.current);
    markerInstance.current.setPosition(selectedPosition);
  }, [selectedPosition]);

  const submit = () =>
    run(async () => {
      if (!selectedPlace) throw new Error("Search and select your property from Google Maps first.");
      if (!address.line1.trim() || !address.city.trim() || !address.state.trim() || !address.postalCode.trim()) {
        throw new Error("Complete the visible address fields before saving.");
      }

      const nextAddress = {
        line1: address.line1.trim(),
        line2: null,
        landmark: null,
        city: address.city.trim(),
        district: null,
        state: address.state.trim(),
        postalCode: address.postalCode.trim(),
        countryCode: "IN" as const,
      };
      const timezone = p.timezone || "Asia/Kolkata";

      await requestJson(`/api/partner/properties/${propertyId}`, {
        googlePlaceId: selectedPlace.googlePlaceId,
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
        timezone,
        address: nextAddress,
      }, "PATCH");

      mutations.patchProperty({
        googlePlaceId: selectedPlace.googlePlaceId,
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
        timezone,
        address: {
          line1: nextAddress.line1,
          city: nextAddress.city,
          state: nextAddress.state,
          postalCode: nextAddress.postalCode,
          countryCode: "IN",
        },
      });
      onSaved();
    });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#E6E2DA] bg-[#FCFBF8] p-4">
        <label className="block text-xs font-bold text-[#06142B]">
          Search your hotel or property
          <span className="relative mt-2 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Start typing property name, address, or landmark"
              className="h-12 w-full rounded-xl border border-[#E6E2DA] bg-white pl-10 pr-3 text-sm font-semibold text-[#06142B] outline-none transition-colors placeholder:text-slate-400 focus:border-[#D8B46A] focus:ring-2 focus:ring-[#D8B46A]/20"
            />
          </span>
        </label>
        <p className="mt-2 text-xs font-medium text-slate-500">
          Select a result from Google. We use the exact map point privately for bookings and admin verification.
        </p>
      </div>

      {mapsError && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{mapsError === "Google Maps API key is missing." ? "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment and restart the dev server." : mapsError}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-[0_8px_24px_rgba(6,20,43,0.05)]">
        <div className="relative h-[280px] w-full bg-[#F7F4EE]">
          {/* Google Maps owns this element's children; keep the React mount
              point empty so its DOM mutations never conflict with React. */}
          <div ref={mapRef} className="h-full w-full" aria-label="Google map location preview" />
          {mapsStatus !== "ready" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-500">
              {mapsStatus === "loading" ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading Google Maps…</span>
              ) : (
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> Map preview will appear here</span>
              )}
            </div>
          )}
        </div>
        <div className="border-t border-[#E6E2DA] p-4">
          {selectedPlace ? (
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FBF3DF] text-[#9a6b18]">
                <Navigation className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#06142B]">{selectedPlace.name}</p>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{selectedPlace.formattedAddress || address.line1}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#06142B]">No confirmed location yet</p>
                <p className="mt-1 text-xs font-medium text-slate-500">Search and select your property to place the map pin.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <form action={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-700 md:col-span-2">
            Address shown to guests
            <input value={address.line1} onChange={(event) => setAddress((current) => ({ ...current, line1: event.target.value }))} required minLength={2} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            City
            <input value={address.city} onChange={(event) => setAddress((current) => ({ ...current, city: event.target.value }))} required minLength={2} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            State
            <input value={address.state} onChange={(event) => setAddress((current) => ({ ...current, state: event.target.value }))} required minLength={2} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            PIN code
            <input value={address.postalCode} onChange={(event) => setAddress((current) => ({ ...current, postalCode: event.target.value }))} required minLength={4} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Country
            <input value="India" readOnly className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`} />
          </label>
        </div>
        <SaveBar saving={saving} error={error} saved={saved} label="Save confirmed location" />
      </form>

      <div className="rounded-2xl border border-[#E6E2DA] bg-white p-4">
        <p className="text-xs font-bold text-[#06142B]">What guests will see</p>
        <p className="mt-1 text-sm font-semibold text-slate-700">{address.line1 || "Address not set"}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-500">
          {[address.city, address.state, address.postalCode, "India"].filter(Boolean).join(", ")}
        </p>
      </div>
    </div>
  );
}

/* ---------- Amenities ---------- */

const AMENITY_OPTIONS = ["Wi-Fi", "Parking", "Restaurant", "Air conditioning", "Lift", "Power backup", "Room service", "Hot water", "Spa", "Gym", "Swimming pool", "Airport transfer"];

export function AmenitiesEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const [selected, setSelected] = useState<string[]>(listing.property.amenityIds ?? []);
  const { saving, error, saved, run } = useSave({ onBusyChange });

  const toggle = (option: string) =>
    setSelected((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));

  const submit = () =>
    run(async () => {
      const childrenPolicy = listing.property.childrenPolicy ?? { allowed: true };
      const petPolicy = listing.property.petPolicy ?? { allowed: false };
      const smokingPolicy = listing.property.smokingPolicy ?? { allowed: false };
      await requestJson(`/api/partner/properties/${propertyId}`, {
        amenityIds: selected,
        childrenPolicy,
        petPolicy,
        smokingPolicy,
        identityRequirements: { governmentIdRequired: true },
      }, "PATCH");
      mutations.patchProperty({ amenityIds: selected, childrenPolicy, petPolicy, smokingPolicy });
      onSaved();
    });

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

export function PoliciesEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const { saving, error, saved, run } = useSave({ onBusyChange });

  const submit = (form: FormData) =>
    run(async () => {
      const res = await requestJson<{ policy: { id: string; name: string } }>(
        `/api/partner/properties/${propertyId}/cancellation-policies`,
        {
          name: form.get("name"),
          description: form.get("description"),
          refundableUntilHours: Number(form.get("hours")),
          cancellationFeePercent: Number(form.get("fee")),
        },
      );
      if (res.policy) mutations.addPolicy({ id: res.policy.id, name: res.policy.name });
      onSaved();
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

export function RoomsEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const room = useSave({ onBusyChange });
  const rate = useSave({ onBusyChange });

  const submitRoom = (form: FormData) =>
    room.run(async () => {
      const res = await requestJson<{ roomType: ListingResponse["roomTypes"][number] }>(
        `/api/partner/properties/${propertyId}/room-types`,
        {
          name: form.get("name"),
          description: form.get("description"),
          totalInventory: Number(form.get("inventory")),
          maxAdults: Number(form.get("adults")),
          maxChildren: 0,
          maxInfants: 0,
          bedConfigurations: [{ bedType: "double", count: 1 }],
        },
      );
      if (res.roomType) mutations.addRoomType(res.roomType);
      onSaved();
    });

  const submitRate = (form: FormData) =>
    rate.run(async () => {
      if (!listing.policies[0]) throw new Error("Add a cancellation policy first.");
      const res = await requestJson<{ ratePlan: ListingResponse["ratePlans"][number] }>(
        `/api/partner/properties/${propertyId}/rate-plans`,
        {
          roomTypeId: form.get("roomTypeId"),
          name: form.get("rateName"),
          code: String(form.get("code")).toUpperCase(),
          basePricePaise: toPaise(Number(form.get("price"))),
          cancellationPolicyId: listing.policies[0].id,
          paymentMode: "full",
        },
      );
      if (res.ratePlan) mutations.addRatePlan(res.ratePlan);
      onSaved();
    });

  return (
    <div className="space-y-6">
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

type LocalPhotoStatus = "queued" | "uploading" | "processing" | "uploaded" | "failed";
type LocalPhoto = {
  id: string;
  file: File;
  category: (typeof PHOTO_CATEGORIES)[number]["value"];
  previewUrl: string;
  status: LocalPhotoStatus;
  progress: number;
  error?: string;
};

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_CATEGORY_LABELS = Object.fromEntries(PHOTO_CATEGORIES.map((item) => [item.value, item.label])) as Record<(typeof PHOTO_CATEGORIES)[number]["value"], string>;

export function PhotosEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const [category, setCategory] = useState<(typeof PHOTO_CATEGORIES)[number]["value"]>("exterior");
  const [queue, setQueue] = useState<LocalPhoto[]>([]);
  const [notice, setNotice] = useState("");
  const [activeUploads, setActiveUploads] = useState(0);
  const [coverPendingId, setCoverPendingId] = useState<string | null>(null);

  useEffect(() => {
    onBusyChange?.(activeUploads > 0 || coverPendingId !== null);
  }, [activeUploads, coverPendingId, onBusyChange]);

  const photos = listing.media.filter((m) => m.kind === "property_image");
  const groupedPhotos = useMemo(() => {
    return PHOTO_CATEGORIES.map((photoCategory) => ({
      ...photoCategory,
      photos: photos.filter((photo) => photo.category === photoCategory.value),
    })).filter((group) => group.photos.length > 0);
  }, [photos]);

  const updateQueueItem = (id: string, patch: Partial<LocalPhoto>) =>
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const uploadOne = async (item: LocalPhoto): Promise<boolean> => {
    updateQueueItem(item.id, { status: "uploading", progress: 1, error: undefined });
    setActiveUploads((count) => count + 1);
    try {
      const checksum = await sha256Hex(item.file);
      const signed = await requestJson<{ uploadId: string; uploadUrl: string; headers: Record<string, string> }>(
        `/api/partner/properties/${propertyId}/media/upload-url`,
        { fileName: item.file.name, mimeType: item.file.type, sizeBytes: item.file.size, checksum, category: item.category },
      );
      await putFileWithProgress(signed.uploadUrl, signed.headers, item.file, (progress) => updateQueueItem(item.id, { progress }));
      updateQueueItem(item.id, { status: "processing", progress: 100 });
      const finalized = await requestJson<{ mediaId: string; media?: ListingResponse["media"][number]; coverMediaId?: string | null }>(
        `/api/partner/properties/${propertyId}/media/finalize`,
        { uploadId: signed.uploadId },
      );
      if (finalized.media) mutations.addMedia(finalized.media, finalized.coverMediaId ?? undefined);
      updateQueueItem(item.id, { status: "uploaded", progress: 100 });
      window.setTimeout(() => {
        URL.revokeObjectURL(item.previewUrl);
        setQueue((current) => current.filter((queued) => queued.id !== item.id));
      }, 900);
      return true;
    } catch (cause) {
      updateQueueItem(item.id, { status: "failed", error: uploadErrorMessage(cause), progress: 0 });
      return false;
    } finally {
      setActiveUploads((count) => Math.max(0, count - 1));
    }
  };

  const runQueue = async (items: LocalPhoto[]) => {
    let cursor = 0;
    const results: boolean[] = [];
    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        results.push(await uploadOne(item));
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
    const uploaded = results.filter(Boolean).length;
    const failed = results.length - uploaded;
    if (uploaded > 0) onSaved();
    setNotice(failed ? `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded, ${failed} failed. Retry the failed files.` : `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded. They stay private until Helpkey approves them.`);
  };

  const handleFiles = (files: File[]) => {
    if (!files.length) return;
    const nextItems: LocalPhoto[] = files.map((file, index) => {
      const valid = ACCEPTED_PHOTO_TYPES.has(file.type) && file.size <= MAX_PHOTO_BYTES;
      return {
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        category,
        previewUrl: URL.createObjectURL(file),
        status: valid ? "queued" : "failed",
        progress: 0,
        error: valid ? undefined : "Use JPG, PNG, or WebP images up to 12 MB.",
      };
    });
    setQueue((current) => [...current, ...nextItems]);
    const validItems = nextItems.filter((item) => item.status === "queued");
    if (validItems.length) void runQueue(validItems);
  };

  const retry = (item: LocalPhoto) => {
    updateQueueItem(item.id, { status: "queued", progress: 0, error: undefined });
    void runQueue([{ ...item, status: "queued", progress: 0, error: undefined }]);
  };

  const removeLocal = (item: LocalPhoto) => {
    URL.revokeObjectURL(item.previewUrl);
    setQueue((current) => current.filter((queued) => queued.id !== item.id));
  };

  const setCover = async (mediaId: string) => {
    if (coverPendingId) return;
    setCoverPendingId(mediaId);
    mutations.setCoverMedia(mediaId);
    try {
      await withMinVisible(() =>
        requestJson(`/api/partner/properties/${propertyId}/media/${mediaId}`, { makeCover: true }, "PATCH"),
      );
    } catch {
      // Reconcile from the server if the cover change did not persist.
      mutations.reload();
    } finally {
      setCoverPendingId(null);
    }
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
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          disabled={activeUploads > 0}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            handleFiles(files);
          }}
        />
      </label>

      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}

      {queue.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-[#061224]">New photos</p>
            {activeUploads > 0 && <p className="text-[11px] font-semibold text-slate-500">Uploading {activeUploads} at a time</p>}
          </div>
          {queue.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-2">
              <img src={item.previewUrl} alt={item.file.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#061224]">{item.file.name}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a6b18]">{PHOTO_CATEGORY_LABELS[item.category]}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${item.status === "failed" ? "bg-rose-500" : item.status === "uploaded" ? "bg-emerald-500" : "bg-[#c89b3c]"}`} style={{ width: `${item.progress}%` }} /></div>
                <p className={`mt-1 text-[10px] font-semibold ${item.status === "failed" ? "text-rose-600" : item.status === "uploaded" ? "text-emerald-600" : "text-slate-500"}`}>
                  {item.status === "queued" ? "Queued" : item.status === "uploading" ? `Uploading ${item.progress}%` : item.status === "processing" ? "Saving photo…" : item.status === "uploaded" ? "Uploaded" : item.error}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {item.status === "failed" && <button type="button" onClick={() => retry(item)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-[#061224]">Retry</button>}
                {(item.status === "failed" || item.status === "queued") && <button type="button" onClick={() => removeLocal(item)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${item.file.name}`}><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-slate-500">{photos.length} / 6 photos</span>
        {photos.length >= 6 ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Enough photos</span> : <span className="text-amber-600">Add {6 - photos.length} more</span>}
      </div>

      {groupedPhotos.map((group) => (
        <section key={group.value} className="space-y-2" aria-label={`${group.label} photos`}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{group.label}</p>
            <span className="text-[11px] font-semibold text-slate-400">{group.photos.length} photo{group.photos.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {group.photos.map((photo) => (
              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {photo.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.imageUrl} alt={photo.altText || `${group.label} property photo`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center"><ImageIcon className="h-4 w-4 text-slate-300" /></div>
                )}
                {photo.isCover ? (
                  <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-[#c89b3c] px-1.5 py-0.5 text-[8px] font-bold text-[#061224]"><Star className="h-2.5 w-2.5 fill-current" /> Cover</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setCover(photo.id)}
                    disabled={coverPendingId !== null}
                    className={`absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-md bg-slate-900/80 py-0.5 text-[9px] font-bold text-white transition-opacity disabled:cursor-not-allowed ${
                      coverPendingId === photo.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {coverPendingId === photo.id ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Setting…</> : "Set cover"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
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

export function SafetyEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const documentSet = new Set(listing.documents.map((d) => d.documentType));

  useEffect(() => {
    onBusyChange?.(uploading !== null);
  }, [uploading, onBusyChange]);

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
      const finalized = await requestJson<{ documentId: string; document?: { id: string; documentType?: string; status?: string } }>(
        `/api/partner/properties/${propertyId}/kyc/finalize`,
        { uploadId: signed.uploadId },
      );
      if (finalized.document) mutations.addDocument(finalized.document);
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
