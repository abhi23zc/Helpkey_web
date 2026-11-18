"use client";

import { GuestPolicyFields } from "@/components/partner/guest-policy-fields";
import { publicGuestPolicies } from "@/lib/partner/guest-policies";

import Link from "next/link";
import { eligiblePricing } from "@/lib/booking/duration-pricing";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, ArrowRight, ArrowUpRight, BedDouble, CheckCircle2, ChevronDown, ChevronUp, Loader2, MapPin, Navigation, Plus, Search, Shield } from "lucide-react";
import { requestJson, uploadErrorMessage, uploadKycDocument } from "@/lib/partner/upload-client";
import { mapsLibrary, markerLibrary, placesLibrary } from "@/lib/google/maps-loader";
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
      {!required && <span className="ml-1 text-slate-400">(optional)</span>}
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

export function SaveBar({ saving, error, saved, label = "Save & Continue" }: { saving: boolean; error?: string; saved?: boolean; label?: string }) {
  // `useFormStatus` reflects the true pending state of the enclosing <form>
  // action across the whole submit lifecycle, so the button always shows a
  // spinner even when our manual `saving` flag flips too quickly to notice.
  const { pending } = useFormStatus();
  const busy = saving || pending;
  return (
    <div className="space-y-2 pt-2">
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}
      {saved && !error && !busy && (
        <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved successfully
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all disabled:opacity-60 disabled:cursor-progress"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        <span>{busy ? "Saving…" : label}</span>
        {!busy && <ArrowRight className="h-4 w-4" />}
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
  const { error, run } = useSave({ onBusyChange });

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
    <form id="listing-editor-form" action={submit} className="space-y-4">
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
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}
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

type GoogleLatLngLiteral = { lat: number; lng: number };
type PartnerSuggestion = { label: string; secondary: string; prediction: google.maps.places.PlacePrediction };
const INDIA_CENTER: GoogleLatLngLiteral = { lat: 20.5937, lng: 78.9629 };

function componentValue(components: google.maps.places.AddressComponent[] | undefined, types: string[], short = false): string {
  const component = components?.find((item) => types.some((type) => item.types.includes(type)));
  return component ? (short ? component.shortText ?? "" : component.longText ?? "") : "";
}

function addressFromPlace(place: google.maps.places.Place): AddressDraft {
  const streetNumber = componentValue(place.addressComponents, ["street_number"]);
  const route = componentValue(place.addressComponents, ["route"]);
  const premise = componentValue(place.addressComponents, ["premise", "establishment"]);
  const sublocality = componentValue(place.addressComponents, ["sublocality_level_1", "sublocality"]);
  const city = componentValue(place.addressComponents, ["locality", "administrative_area_level_3", "postal_town"]);
  const state = componentValue(place.addressComponents, ["administrative_area_level_1"]);
  const postalCode = componentValue(place.addressComponents, ["postal_code"]);
  const lineParts = [premise || place.displayName, [streetNumber, route].filter(Boolean).join(" "), sublocality].filter(Boolean);

  return {
    line1: lineParts.join(", ") || place.formattedAddress || "",
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
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;
  const mapConfigError = !mapId ? "Map preview needs NEXT_PUBLIC_GOOGLE_MAP_ID. Search and location selection still work, but configure a production Map ID to show the pin." : "";
  const { error, run } = useSave({ onBusyChange });
  const searchRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerInstance = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const suggestionRequest = useRef(0);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [mapsStatus, setMapsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapsError, setMapsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PartnerSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
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

    const setup = async () => {
      if (!mapRef.current) return;
      setMapsStatus("loading");

      try {
        const [maps, marker] = await Promise.all([mapsLibrary(), markerLibrary()]);
        if (cancelled || !mapRef.current) return;
        const center = selectedPosition ?? INDIA_CENTER;
        mapInstance.current = new maps.Map(mapRef.current, {
          center,
          zoom: selectedPosition ? 15 : 5,
          mapId: mapId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });

        markerInstance.current = new marker.AdvancedMarkerElement({
          map: selectedPosition ? mapInstance.current : null,
          position: selectedPosition ?? INDIA_CENTER,
          title: p.name,
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
      if (markerInstance.current) markerInstance.current.map = null;
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
    markerInstance.current.map = mapInstance.current;
    markerInstance.current.position = selectedPosition;
  }, [selectedPosition]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      suggestionRequest.current += 1;
      sessionToken.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    const requestId = ++suggestionRequest.current;
    setSuggestionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await placesLibrary();
        sessionToken.current ??= new AutocompleteSessionToken();
        const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedRegionCodes: ["IN"],
          sessionToken: sessionToken.current,
        });
        if (requestId !== suggestionRequest.current) return;
        setSuggestions(results
          .map((item) => item.placePrediction)
          .filter((prediction): prediction is google.maps.places.PlacePrediction => Boolean(prediction))
          .map((prediction) => ({
            label: prediction.text.toString(),
            secondary: prediction.secondaryText?.toString() ?? "",
            prediction,
          })));
      } catch (cause) {
        if (requestId === suggestionRequest.current) {
          setSuggestions([]);
          setMapsError(cause instanceof Error ? cause.message : "Google place suggestions are unavailable.");
        }
      } finally {
        if (requestId === suggestionRequest.current) setSuggestionsLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectSuggestion = async (item: PartnerSuggestion) => {
    try {
      setSuggestionsLoading(true);
      const place = item.prediction.toPlace();
      await place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location", "addressComponents", "viewport"] });
      const location = place.location;
      if (!place.id || !location) throw new Error("Choose a Google result with a confirmed location.");
      const nextPosition = { lat: location.lat(), lng: location.lng() };
      const nextAddress = addressFromPlace(place);
      const nextPlace: SelectedPlace = {
        googlePlaceId: place.id,
        name: place.displayName ?? p.name,
        formattedAddress: place.formattedAddress ?? nextAddress.line1,
        latitude: nextPosition.lat,
        longitude: nextPosition.lng,
        address: nextAddress,
      };
      setSelectedPlace(nextPlace);
      setAddress(nextAddress);
      setSearchQuery(nextPlace.name);
      setSuggestions([]);
      setMapsError("");
      mapInstance.current?.setCenter(nextPosition);
      mapInstance.current?.setZoom(16);
      if (place.viewport) mapInstance.current?.fitBounds(place.viewport);
      if (markerInstance.current && mapInstance.current) {
        markerInstance.current.map = mapInstance.current;
        markerInstance.current.position = nextPosition;
      }
    } catch (cause) {
      setMapsError(cause instanceof Error ? cause.message : "Could not use that Google location.");
    } finally {
      sessionToken.current = null;
      setSuggestionsLoading(false);
    }
  };

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
              value={searchQuery}
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="partner-place-suggestions"
              aria-autocomplete="list"
              placeholder="Start typing property name, address, or landmark"
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setActiveSuggestion(-1);
                setMapsError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSuggestions([]);
                  setActiveSuggestion(-1);
                } else if (event.key === "ArrowDown" && suggestions.length > 0) {
                  event.preventDefault();
                  setActiveSuggestion((current) => Math.min(current + 1, suggestions.length - 1));
                } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                  event.preventDefault();
                  setActiveSuggestion((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter" && activeSuggestion >= 0) {
                  event.preventDefault();
                  void selectSuggestion(suggestions[activeSuggestion]);
                }
              }}
              className="h-12 w-full rounded-xl border border-[#E6E2DA] bg-white pl-10 pr-3 text-sm font-semibold text-[#06142B] outline-none transition-colors placeholder:text-slate-400 focus:border-[#D8B46A] focus:ring-2 focus:ring-[#D8B46A]/20"
            />
            {(suggestionsLoading || suggestions.length > 0) && (
              <div id="partner-place-suggestions" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[#E6E2DA] bg-white p-1.5 shadow-lg">
                {suggestionsLoading && <p className="px-3 py-2 text-xs font-medium text-slate-500">Finding places…</p>}
                {suggestions.map((item, index) => (
                  <button
                    key={`${item.label}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeSuggestion === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void selectSuggestion(item)}
                    className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${activeSuggestion === index ? "bg-amber-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="block truncate text-sm font-semibold text-[#06142B]">{item.label}</span>
                    {item.secondary && <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{item.secondary}</span>}
                  </button>
                ))}
              </div>
            )}
          </span>
        </label>
        <p className="mt-2 text-xs font-medium text-slate-500">
          Select a result from Google. We use the exact map point privately for bookings and admin verification.
        </p>
      </div>

      {(mapConfigError || mapsError) && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{mapConfigError || mapsError}</span>
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

      <form id="listing-editor-form" action={submit} className="space-y-4">
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
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}
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
  const { error, run } = useSave({ onBusyChange });

  const toggle = (option: string) =>
    setSelected((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));

  const submit = () =>
    run(async () => {
      await requestJson(`/api/partner/properties/${propertyId}`, { amenityIds: selected }, "PATCH");
      mutations.patchProperty({ amenityIds: selected });
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
      <form id="listing-editor-form" action={submit}>
        {error && <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}
      </form>
    </div>
  );
}

/* ---------- Policies (cancellation) ---------- */

export function PoliciesEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: EditorProps) {
  const { saving, error, run } = useSave({ onBusyChange });

  const [guestPolicies, setGuestPolicies] = useState(() => publicGuestPolicies(listing.property));

  // Cancellation policy form state
  const [showCancellationSection, setShowCancellationSection] = useState(listing.policies.length === 0);
  const [showAddPolicy, setShowAddPolicy] = useState(listing.policies.length === 0);
  const [preset, setPreset] = useState<"flexible" | "moderate" | "non_refundable" | "custom">("flexible");
  const [policyName, setPolicyName] = useState("Flexible (24h)");
  const [policyDesc, setPolicyDesc] = useState("Free cancellation up to 24 hours before check-in. 100% fee thereafter.");
  const [hours, setHours] = useState("24");
  const [fee, setFee] = useState("100");
  const [policyAdded, setPolicyAdded] = useState(false);

  const applyPreset = (type: "flexible" | "moderate" | "non_refundable" | "custom") => {
    setPreset(type);
    if (type === "flexible") {
      setPolicyName("Flexible (24h)");
      setPolicyDesc("Free cancellation up to 24 hours before check-in. 100% fee thereafter.");
      setHours("24");
      setFee("100");
    } else if (type === "moderate") {
      setPolicyName("Moderate (48h)");
      setPolicyDesc("Free cancellation up to 48 hours before check-in. 100% fee thereafter.");
      setHours("48");
      setFee("100");
    } else if (type === "non_refundable") {
      setPolicyName("Non-Refundable");
      setPolicyDesc("Non-refundable booking. Full charges apply upon cancellation.");
      setHours("0");
      setFee("100");
    } else {
      setPolicyName("");
      setPolicyDesc("");
      setHours("24");
      setFee("100");
    }
  };

  const saveGuestPolicies = () => run(async () => {
    await requestJson(`/api/partner/properties/${propertyId}`, guestPolicies, "PATCH");
    mutations.patchProperty(guestPolicies);
    onSaved();
  });

  const submitPolicy = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const res = await requestJson<{ policy: { id: string; name: string } }>(
        `/api/partner/properties/${propertyId}/cancellation-policies`,
        {
          name: policyName,
          description: policyDesc,
          refundableUntilHours: Number(hours),
          cancellationFeePercent: Number(fee),
        },
      );
      if (res.policy) mutations.addPolicy({ id: res.policy.id, name: res.policy.name });
      setPolicyAdded(true);
      setShowAddPolicy(false);
      onSaved();
    });
  };

  return (
    <div className="space-y-6">
      <form id="listing-editor-form" action={saveGuestPolicies} className="space-y-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[#061224]">Guest & House Policies</h3>
        </div>

        <GuestPolicyFields value={guestPolicies} onChange={setGuestPolicies} disabled={saving} />

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}
      </form>

      {/* Cancellation Policies Section (Accordion / Collapsible) */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setShowCancellationSection((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 sm:py-3.5 text-left hover:bg-slate-50/60 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#061224] border border-slate-200/60">
              <Shield className="h-5 w-5 text-[#c89b3c]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-[#061224] leading-snug">
                Cancellation Policies
              </h3>
              <p className="text-xs sm:text-sm font-normal text-slate-500 leading-normal mt-0.5 truncate">
                {listing.policies.length > 0
                  ? `${listing.policies.length} active policy (${listing.policies.map((p) => p.name || "Standard").join(", ")})`
                  : "Add at least one policy to assign to your rooms"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 ml-3">
            {listing.policies.length > 0 ? (
              <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-2.5 py-1">
                {listing.policies.length} Active
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-2.5 py-1">
                Required
              </span>
            )}
            <div className="grid h-8 w-8 place-items-center rounded-lg text-slate-400">
              {showCancellationSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </button>

        {showCancellationSection && (
          <div className="p-4 sm:p-5 pt-3 border-t border-slate-100 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs sm:text-sm font-medium text-slate-500">
                Cancellation terms assigned to your room rate plans.
              </p>

              <button
                type="button"
                onClick={() => {
                  setShowAddPolicy((prev) => !prev);
                  setPolicyAdded(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs sm:text-sm font-bold text-[#061224] hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5 text-[#c89b3c]" />
                <span>{showAddPolicy ? "Cancel" : "Add Cancellation Policy"}</span>
              </button>
            </div>

            {policyAdded && (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs sm:text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Cancellation policy added successfully!
              </p>
            )}

            {/* Existing Policy Cards */}
            {listing.policies.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {listing.policies.map((policy) => (
                  <div
                    key={policy.id}
                    className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-bold text-[#061224] truncate">
                        {policy.name ?? policy.id}
                      </span>
                      <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 shrink-0">
                        Active
                      </span>
                    </div>
                    {policy.description && (
                      <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed font-normal">
                        {policy.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold text-slate-500">
                      {policy.refundableUntilHours !== undefined && (
                        <span className="rounded-md bg-slate-100 px-2.5 py-1">
                          {policy.refundableUntilHours > 0
                            ? `Refundable up to ${policy.refundableUntilHours}h before`
                            : "Non-refundable"}
                        </span>
                      )}
                      {policy.cancellationFeePercent !== undefined && (
                        <span className="rounded-md bg-slate-100 px-2.5 py-1">
                          Fee: {policy.cancellationFeePercent}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4 text-center space-y-1">
                <p className="text-xs sm:text-sm font-bold text-amber-900">No cancellation policy added yet</p>
                <p className="text-xs text-amber-700 font-medium">
                  You need at least one cancellation policy to assign to your rooms. Use the form below to add one.
                </p>
              </div>
            )}

            {/* Add Policy Form */}
            {showAddPolicy && (
              <form
                onSubmit={submitPolicy}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4 shadow-2xs"
              >
                <div>
                  <p className="text-sm sm:text-base font-bold text-[#061224]">Add a new cancellation policy</p>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    Choose a common preset or customize terms.
                  </p>
                </div>

                {/* Presets */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "flexible", label: "Flexible (24 hrs)" },
                    { id: "moderate", label: "Moderate (48 hrs)" },
                    { id: "non_refundable", label: "Non-Refundable" },
                    { id: "custom", label: "Custom Terms" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => applyPreset(item.id as typeof preset)}
                      className={`rounded-xl px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold border transition-all ${
                        preset === item.id
                          ? "border-[#c89b3c] bg-white text-[#9a6b18] shadow-2xs"
                          : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3.5">
                  <label className="block text-xs sm:text-sm font-bold text-slate-700">
                    Policy name
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={policyName}
                      onChange={(e) => setPolicyName(e.target.value)}
                      placeholder="e.g. Flexible"
                      className={inputClass}
                    />
                  </label>

                  <label className="block text-xs sm:text-sm font-bold text-slate-700">
                    Policy details
                    <textarea
                      required
                      rows={2}
                      minLength={10}
                      value={policyDesc}
                      onChange={(e) => setPolicyDesc(e.target.value)}
                      placeholder="e.g. Free cancellation up to 24 hours before check-in."
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-[#c89b3c]"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <label className="block text-xs sm:text-sm font-bold text-slate-700">
                      Refundable until (hours before check-in)
                      <input
                        type="number"
                        min={0}
                        required
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                        className={inputClass}
                      />
                    </label>

                    <label className="block text-xs sm:text-sm font-bold text-slate-700">
                      Cancellation fee (%)
                      <input
                        type="number"
                        min={0}
                        max={100}
                        required
                        value={fee}
                        onChange={(e) => setFee(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddPolicy(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#061224] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    <span>Add Policy</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- Rooms & rates ---------- */

export function RoomsEditor({ listing }: EditorProps) {
  const activeRooms = useMemo(() => {
    return listing.roomTypes.filter((r) => !["paused", "archived"].includes(r.status ?? "active"));
  }, [listing.roomTypes]);

  const activeRates = useMemo(() => {
    return listing.ratePlans.filter((r) => r.status === "active");
  }, [listing.ratePlans]);

  const roomsWithRate = useMemo(() => {
    const sellable = new Set(activeRooms.map((r) => r.id));
    return new Set(
      activeRates
        .filter((r) => sellable.has(r.roomTypeId) && r.cancellationPolicyId && eligiblePricing(r))
        .map((r) => r.roomTypeId),
    );
  }, [activeRooms, activeRates]);

  const allRoomsReady = activeRooms.length > 0 && roomsWithRate.size === activeRooms.length;

  return (
    <div className="space-y-6">
      {/* Configured Room Types List */}
      {listing.roomTypes.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Configured Room Types ({listing.roomTypes.length})
            </p>
            <span className="text-xs font-semibold text-slate-500">
              {roomsWithRate.size} of {listing.roomTypes.length} sellable
            </span>
          </div>

          <div className="space-y-2.5">
            {listing.roomTypes.map((rt) => {
              const rates = listing.ratePlans.filter((r) => r.roomTypeId === rt.id && r.status === "active");
              const hasRate = rates.length > 0 && rates.some((r) => eligiblePricing(r) && r.cancellationPolicyId);
              const roomPhotos = listing.media.filter((m) => m.kind === "property_image" && m.roomTypeId === rt.id);
              const coverImg = roomPhotos.find((p) => p.isCover)?.imageUrl || roomPhotos[0]?.imageUrl || null;

              return (
                <div
                  key={rt.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-slate-300"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
                      {coverImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverImg} alt={rt.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-slate-400">
                          <BedDouble className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-[#06142B] truncate">{rt.name}</h4>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {rt.inventory} unit{rt.inventory === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Max {rt.maxAdults} adult{rt.maxAdults === 1 ? "" : "s"} · {rt.bedConfigurations?.[0]?.bedType ? `${rt.bedConfigurations[0].bedType} bed` : "Double bed"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {hasRate ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            {rates.map((r) => (r.pricingModel === "duration" ? "Hourly stays" : `₹${(r.basePricePaise / 100).toLocaleString("en-IN")}/night`)).join(", ")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                            <AlertTriangle className="h-3 w-3" />
                            No rate plan assigned
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Link
                      href="/partner/rooms?section=types"
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                    >
                      <span>Manage in Rooms</span>
                      <ArrowUpRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[200px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-2xs border border-slate-200">
              <BedDouble className="h-6 w-6" />
            </div>
            <h4 className="mt-3 text-sm font-bold text-[#06142B]">No room types configured yet</h4>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Configure your room types, physical inventory, and pricing in the Rooms workspace.
            </p>
            <div className="mt-4">
              <Link
                href="/partner/rooms?section=types"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition"
              >
                <span>Set Up Rooms in Rooms Workspace</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Validation Status & Continue Button */}
      <div className="pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs">
          {allRoomsReady ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> All room types have active rates and policies configured.
            </span>
          ) : (
            <span className="text-amber-800 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              {activeRooms.length === 0
                ? "Configure at least one room type to proceed."
                : "Every active room type must have at least one rate plan."}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Photos ---------- */

export { PhotosEditor } from "./photos-editor";

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
      const finalized = await uploadKycDocument(propertyId, documentType as "pan" | "government_id_front" | "government_id_back" | "gst", file);
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
