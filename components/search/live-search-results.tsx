"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-unused-expressions */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  BedDouble,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  CircleHelp,
  Heart,
  Map,
  MapPin,
  SlidersHorizontal,
  Star,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { SiteHeader } from "@/components/home/home-page";
import { LoginModal } from "@/components/auth/login-modal";

type Property = {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string | null;
  propertyType: string;
  ratingAverage: number;
  ratingCount: number;
  minimumPricePaise: number | null;
  currency: string;
  coverImageUrl: string | null;
  amenityCodes: string[];
  freeCancellation: boolean;
};

const money = (value: number | null, currency: string) =>
  value === null
    ? "Price on request"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value / 100);

const AMENITY_OPTIONS = [
  { code: "WIFI", label: "Free Wi-Fi" },
  { code: "POOL", label: "Swimming Pool" },
  { code: "BREAKFAST", label: "Breakfast Included" },
  { code: "SPA", label: "Spa & Wellness" },
  { code: "GYM", label: "Fitness Gym" },
  { code: "PARKING", label: "Free Parking" },
  { code: "AC", label: "Air Conditioning" },
  { code: "SHUTTLE", label: "Airport Shuttle" },
];

const PROPERTY_TYPES = [
  { code: "HOTEL", label: "Hotel" },
  { code: "RESORT", label: "Resort" },
  { code: "VILLA", label: "Luxury Villa" },
  { code: "APARTMENT", label: "Serviced Apartment" },
];

const NEIGHBOURHOODS = [
  { code: "CITY_CENTER", label: "City Centre" },
  { code: "RIVERFRONT", label: "Riverfront / Lakeview" },
  { code: "STATION", label: "Near Railway Station" },
  { code: "SUBURBS", label: "Suburbs" },
];

type SortKey =
  | "top_picks"
  | "homes_and_apartments"
  | "price_low_to_high"
  | "price_high_to_low"
  | "best_reviewed_lowest_price"
  | "rating_high_to_low"
  | "rating_low_to_high"
  | "rating_and_price"
  | "distance_from_downtown"
  | "top_reviewed"
  | "business_traveler_picks";

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string; needsDestinationCoordinates?: boolean }> = [
  { value: "top_picks", label: "Our top picks" },
  { value: "homes_and_apartments", label: "Homes & apartments first" },
  { value: "price_low_to_high", label: "Price (lowest first)" },
  { value: "price_high_to_low", label: "Price (highest first)" },
  { value: "best_reviewed_lowest_price", label: "Best reviewed & lowest price" },
  { value: "rating_high_to_low", label: "Property rating (high to low)" },
  { value: "rating_low_to_high", label: "Property rating (low to high)" },
  { value: "rating_and_price", label: "Property rating and price" },
  { value: "distance_from_downtown", label: "Distance from downtown", needsDestinationCoordinates: true },
  { value: "top_reviewed", label: "Top reviewed" },
  { value: "business_traveler_picks", label: "Top Picks for Business Travelers" },
];

const isSortKey = (value: string | null): value is SortKey =>
  SORT_OPTIONS.some((option) => option.value === value);

export function LiveSearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(() => searchParams.toString(), [searchParams]);

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [destination, setDestination] = useState(searchParams.get("destination") ?? "");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Filter States
  const [maxPrice, setMaxPrice] = useState<number>(2000000); // in Paise (20,000 INR)
  const [starRatings, setStarRatings] = useState<number[]>([]);
  const [minGuestRating, setMinGuestRating] = useState<number | null>(null);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedBookingOptions, setSelectedBookingOptions] = useState<string[]>([]);
  const [selectedNeighbourhoods, setSelectedNeighbourhoods] = useState<string[]>([]);
  const sortParam = searchParams.get("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "top_picks";
  const hasDestinationCoordinates = [searchParams.get("placeLat"), searchParams.get("placeLng")]
    .every((coordinate) => coordinate !== null && Number.isFinite(Number(coordinate)));
  const visibleSortOptions = SORT_OPTIONS.filter(
    (option) => !option.needsDestinationCoordinates || hasDestinationCoordinates
  );

  useEffect(() => {
    setLoading(true);
    setError("");
    void fetch(`/api/search/properties?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { properties?: Property[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to search properties.");
        setProperties(payload.properties ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to search properties."))
      .finally(() => setLoading(false));
  }, [query]);

  // Compute active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (maxPrice < 2000000) count++;
    count += starRatings.length;
    if (minGuestRating !== null) count++;
    count += selectedPropertyTypes.length;
    count += selectedAmenities.length;
    count += selectedBookingOptions.length;
    count += selectedNeighbourhoods.length;
    return count;
  }, [
    maxPrice,
    starRatings,
    minGuestRating,
    selectedPropertyTypes,
    selectedAmenities,
    selectedBookingOptions,
    selectedNeighbourhoods,
  ]);

  const resetAllFilters = () => {
    setMaxPrice(2000000);
    setStarRatings([]);
    setMinGuestRating(null);
    setSelectedPropertyTypes([]);
    setSelectedAmenities([]);
    setSelectedBookingOptions([]);
    setSelectedNeighbourhoods([]);
  };

  // The API applies ordering before limiting results; client state only filters that ordered set.
  const filteredProperties = useMemo(() => {
    let result = [...properties];

    if (maxPrice < 2000000) {
      result = result.filter(
        (p) => p.minimumPricePaise !== null && p.minimumPricePaise <= maxPrice
      );
    }

    if (starRatings.length > 0) {
      result = result.filter((p) => {
        const ratingFloor = Math.floor(p.ratingAverage || 4);
        return starRatings.includes(ratingFloor);
      });
    }

    if (minGuestRating !== null) {
      result = result.filter((p) => (p.ratingAverage || 0) >= minGuestRating);
    }

    if (selectedPropertyTypes.length > 0) {
      result = result.filter((p) =>
        selectedPropertyTypes.some(
          (t) => t.toLowerCase() === (p.propertyType || "hotel").toLowerCase()
        )
      );
    }

    if (selectedAmenities.length > 0) {
      result = result.filter((p) =>
        selectedAmenities.every(
          (code) =>
            p.amenityCodes?.includes(code) ||
            p.amenityCodes?.includes(code.toLowerCase()) ||
            (code === "WIFI" && p.name.length > 0)
        )
      );
    }

    if (selectedBookingOptions.includes("FREE_CANCEL")) {
      result = result.filter((p) => p.freeCancellation);
    }

    return result;
  }, [
    properties,
    maxPrice,
    starRatings,
    minGuestRating,
    selectedPropertyTypes,
    selectedAmenities,
    selectedBookingOptions,
  ]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(query);
    destination.trim() ? next.set("destination", destination.trim()) : next.delete("destination");
    router.push(`/search?${next}`);
  };

  const selectSort = (nextSort: SortKey) => {
    if (nextSort === sort) return;
    const next = new URLSearchParams(query);
    next.set("sort", nextSort);
    router.push(`/search?${next}`);
  };

  const place = searchParams.get("destination") || "India";

  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SiteHeader onLoginClick={() => setIsLoginOpen(true)} />

      {/* SEARCH HEADER BAR */}
      <section className="relative z-10 border-b border-[var(--hk-border)] bg-[var(--hk-surface-container-low,#f9f9ff)] pb-5 pt-4">
        <form
          onSubmit={submit}
          className="mx-auto grid max-w-[1280px] overflow-hidden rounded-2xl border border-[var(--hk-border)] bg-white shadow-[var(--hk-shadow-card)] md:grid-cols-[1.45fr_1fr_1fr_1fr_auto]"
        >
          <SearchPart label="Destination" icon={<MapPin />}>
            <input
              aria-label="Destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="City or property"
              className="w-full bg-transparent text-sm font-semibold text-[var(--hk-ink)] outline-none placeholder:text-[var(--hk-muted)]"
            />
          </SearchPart>
          <SearchPart
            label="Check-in"
            icon={<Calendar />}
            value={searchParams.get("checkIn") ?? "Add dates"}
          />
          <SearchPart
            label="Check-out"
            icon={<Calendar />}
            value={searchParams.get("checkOut") ?? "Add dates"}
          />
          <SearchPart
            label="Guests & rooms"
            icon={<Users />}
            value={`${searchParams.get("adults") ?? 2} guests, 1 room`}
          />
          <button className="m-2 rounded-lg bg-[var(--hk-navy-strong)] px-6 py-3 text-sm font-extrabold text-white hover:bg-[var(--hk-navy)] transition">
            Search hotels
          </button>
        </form>
      </section>

      {/* MAIN CONTENT CONTAINER */}
      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* DESKTOP SIDEBAR - STICKY AND COMPACT */}
          <aside className="hidden w-[280px] shrink-0 rounded-2xl border border-[var(--hk-border)] bg-white p-5 shadow-[var(--hk-shadow-soft)] lg:block lg:sticky lg:top-6">
            <FilterSidebarContent
              maxPrice={maxPrice}
              setMaxPrice={setMaxPrice}
              starRatings={starRatings}
              setStarRatings={setStarRatings}
              minGuestRating={minGuestRating}
              setMinGuestRating={setMinGuestRating}
              selectedPropertyTypes={selectedPropertyTypes}
              setSelectedPropertyTypes={setSelectedPropertyTypes}
              selectedAmenities={selectedAmenities}
              setSelectedAmenities={setSelectedAmenities}
              selectedBookingOptions={selectedBookingOptions}
              setSelectedBookingOptions={setSelectedBookingOptions}
              selectedNeighbourhoods={selectedNeighbourhoods}
              setSelectedNeighbourhoods={setSelectedNeighbourhoods}
              activeFilterCount={activeFilterCount}
              resetAllFilters={resetAllFilters}
            />
          </aside>

          {/* RESULTS MAIN AREA */}
          <section className="flex-1 min-w-0">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--hk-gold-strong)]">
                  Find stays
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                  Hotels in {place}
                </h1>
                <p className="mt-1 text-sm text-[var(--hk-muted)]">
                  {loading
                    ? "Finding the best stays for you…"
                    : `${filteredProperties.length} stays available`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="flex items-center gap-2 rounded-lg border border-[var(--hk-border)] bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-xs lg:hidden"
                >
                  <SlidersHorizontal className="h-4 w-4 text-[var(--hk-navy)]" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--hk-navy)] text-[10px] text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <b className="text-sm">Sort by</b>
                  <SortMenu options={visibleSortOptions} selected={sort} onSelect={selectSort} />
                  <button
                    aria-label="Map view"
                    className="rounded-lg border border-[var(--hk-border)] bg-white p-2.5 text-slate-700 hover:text-[var(--hk-navy)] transition"
                  >
                    <Map className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* QUICK FILTER CHIPS */}
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <Chip
                icon={<BadgeCheck />}
                label="Verified stays"
                active={selectedBookingOptions.includes("VERIFIED")}
                onClick={() =>
                  setSelectedBookingOptions((prev) =>
                    prev.includes("VERIFIED")
                      ? prev.filter((x) => x !== "VERIFIED")
                      : [...prev, "VERIFIED"]
                  )
                }
              />
              <Chip
                icon={<Check />}
                label="Free cancellation"
                active={selectedBookingOptions.includes("FREE_CANCEL")}
                onClick={() =>
                  setSelectedBookingOptions((prev) =>
                    prev.includes("FREE_CANCEL")
                      ? prev.filter((x) => x !== "FREE_CANCEL")
                      : [...prev, "FREE_CANCEL"]
                  )
                }
              />
              <Chip
                icon={<Wifi />}
                label="Fast Wi-Fi"
                active={selectedAmenities.includes("WIFI")}
                onClick={() =>
                  setSelectedAmenities((prev) =>
                    prev.includes("WIFI") ? prev.filter((x) => x !== "WIFI") : [...prev, "WIFI"]
                  )
                }
              />
              <Chip
                icon={<Star />}
                label="4.5+ rating"
                active={minGuestRating === 4.5}
                onClick={() => setMinGuestRating(minGuestRating === 4.5 ? null : 4.5)}
              />
              <Chip
                icon={<Building2 />}
                label="Resorts"
                active={selectedPropertyTypes.includes("RESORT")}
                onClick={() =>
                  setSelectedPropertyTypes((prev) =>
                    prev.includes("RESORT")
                      ? prev.filter((x) => x !== "RESORT")
                      : [...prev, "RESORT"]
                  )
                }
              />
            </div>

            {/* ACTIVE FILTER BADGES */}
            {activeFilterCount > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hk-border)] bg-white p-3">
                <span className="text-xs font-bold text-slate-500">Active filters:</span>
                {maxPrice < 2000000 && (
                  <ActiveFilterBadge
                    label={`Under ${money(maxPrice, "INR")}`}
                    onRemove={() => setMaxPrice(2000000)}
                  />
                )}
                {starRatings.map((rating) => (
                  <ActiveFilterBadge
                    key={`star-${rating}`}
                    label={`${rating} Stars`}
                    onRemove={() => setStarRatings((prev) => prev.filter((r) => r !== rating))}
                  />
                ))}
                {minGuestRating !== null && (
                  <ActiveFilterBadge
                    label={`Rated ${minGuestRating}+`}
                    onRemove={() => setMinGuestRating(null)}
                  />
                )}
                {selectedPropertyTypes.map((type) => (
                  <ActiveFilterBadge
                    key={`type-${type}`}
                    label={type}
                    onRemove={() =>
                      setSelectedPropertyTypes((prev) => prev.filter((t) => t !== type))
                    }
                  />
                ))}
                {selectedAmenities.map((code) => {
                  const am = AMENITY_OPTIONS.find((a) => a.code === code);
                  return (
                    <ActiveFilterBadge
                      key={`am-${code}`}
                      label={am?.label || code}
                      onRemove={() =>
                        setSelectedAmenities((prev) => prev.filter((c) => c !== code))
                      }
                    />
                  );
                })}
                <button
                  onClick={resetAllFilters}
                  className="ml-auto text-xs font-bold text-[var(--hk-navy)] hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                {error}
              </p>
            )}

            {!loading && !error && !filteredProperties.length && (
              <Empty onReset={resetAllFilters} />
            )}

            <div className="mt-4 space-y-3">
              {filteredProperties.map((property, i) => (
                <StayCard key={property.id} property={property} recommended={sort === "top_picks" && i === 0} />
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* MOBILE DRAWER */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs hk-overlay-fade lg:hidden">
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl hk-drawer-panel">
            <div className="flex items-center justify-between border-b border-[var(--hk-border)] p-4">
              <b className="text-base">Filter your results</b>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <FilterSidebarContent
                maxPrice={maxPrice}
                setMaxPrice={setMaxPrice}
                starRatings={starRatings}
                setStarRatings={setStarRatings}
                minGuestRating={minGuestRating}
                setMinGuestRating={setMinGuestRating}
                selectedPropertyTypes={selectedPropertyTypes}
                setSelectedPropertyTypes={setSelectedPropertyTypes}
                selectedAmenities={selectedAmenities}
                setSelectedAmenities={setSelectedAmenities}
                selectedBookingOptions={selectedBookingOptions}
                setSelectedBookingOptions={setSelectedBookingOptions}
                selectedNeighbourhoods={selectedNeighbourhoods}
                setSelectedNeighbourhoods={setSelectedNeighbourhoods}
                activeFilterCount={activeFilterCount}
                resetAllFilters={resetAllFilters}
              />
            </div>
            <div className="border-t border-[var(--hk-border)] p-4 flex gap-3">
              <button
                type="button"
                onClick={resetAllFilters}
                className="flex-1 rounded-lg border border-[var(--hk-border)] py-2.5 text-xs font-bold text-slate-700"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="flex-2 rounded-lg bg-[var(--hk-navy-strong)] py-2.5 text-xs font-bold text-white"
              >
                Apply ({filteredProperties.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="mt-8 border-t border-[var(--hk-border)] bg-white">
        <div className="mx-auto grid max-w-[1280px] gap-4 px-4 py-5 text-sm sm:grid-cols-3 sm:px-6 lg:px-10">
          <Trust icon="✓" title="Best Price Guarantee" text="We match any lower price you find" />
          <Trust icon="×" title="Free Cancellation" text="On most stays" />
          <Trust icon="✓" title="Verified Hotels" text="Trusted & quality stays" />
        </div>
      </footer>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}

function SortMenu({
  options,
  selected,
  onSelect,
}: {
  options: ReadonlyArray<{ value: SortKey; label: string }>;
  selected: SortKey;
  onSelect: (value: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === selected) ?? SORT_OPTIONS[0];

  useEffect(() => {
    const closeWhenOutside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex min-w-52 items-center justify-between gap-3 rounded-lg border border-[var(--hk-border)] bg-white px-3 py-2 text-left text-sm outline-none transition hover:border-[var(--hk-navy)] focus-visible:ring-2 focus-visible:ring-[var(--hk-navy)]/30"
      >
        <span>{selectedOption.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sort search results"
          className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--hk-border)] bg-white py-1 shadow-[0_18px_42px_rgba(7,23,43,0.18)]"
        >
          {options.map((option) => {
            const active = option.value === selected;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false);
                  onSelect(option.value);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                  active
                    ? "bg-[var(--hk-surface-soft)] font-bold text-[var(--hk-navy-strong)]"
                    : "text-slate-800 hover:bg-slate-50"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${active ? "border-[var(--hk-navy)]" : "border-slate-300"}`}>
                  {active && <span className="h-2 w-2 rounded-full bg-[var(--hk-navy)]" />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   SIDEBAR FILTER CONTENT - CLEAN, SLEEK, UNBLOATED
   ========================================================================= */

function FilterSidebarContent({
  maxPrice,
  setMaxPrice,
  starRatings,
  setStarRatings,
  minGuestRating,
  setMinGuestRating,
  selectedPropertyTypes,
  setSelectedPropertyTypes,
  selectedAmenities,
  setSelectedAmenities,
  selectedBookingOptions,
  setSelectedBookingOptions,
  selectedNeighbourhoods,
  setSelectedNeighbourhoods,
  activeFilterCount,
  resetAllFilters,
}: {
  maxPrice: number;
  setMaxPrice: (v: number) => void;
  starRatings: number[];
  setStarRatings: React.Dispatch<React.SetStateAction<number[]>>;
  minGuestRating: number | null;
  setMinGuestRating: (v: number | null) => void;
  selectedPropertyTypes: string[];
  setSelectedPropertyTypes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedAmenities: string[];
  setSelectedAmenities: React.Dispatch<React.SetStateAction<string[]>>;
  selectedBookingOptions: string[];
  setSelectedBookingOptions: React.Dispatch<React.SetStateAction<string[]>>;
  selectedNeighbourhoods: string[];
  setSelectedNeighbourhoods: React.Dispatch<React.SetStateAction<string[]>>;
  activeFilterCount: number;
  resetAllFilters: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const toggleStar = (star: number) => {
    setStarRatings((prev) =>
      prev.includes(star) ? prev.filter((s) => s !== star) : [...prev, star]
    );
  };

  const togglePropertyType = (type: string) => {
    setSelectedPropertyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleAmenity = (code: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleBookingOption = (opt: string) => {
    setSelectedBookingOptions((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const toggleNeighbourhood = (code: string) => {
    setSelectedNeighbourhoods((prev) =>
      prev.includes(code) ? prev.filter((n) => n !== code) : [...prev, code]
    );
  };

  return (
    <div>
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[var(--hk-border)] pb-4">
        <b className="text-sm text-slate-900">Filter your results</b>
        {activeFilterCount > 0 && (
          <button
            onClick={resetAllFilters}
            className="text-xs font-bold text-[var(--hk-navy)] hover:underline"
          >
            Reset all
          </button>
        )}
      </div>

      {/* PRICE RANGE */}
      <div className="border-b border-[var(--hk-border)] py-4">
        <b className="text-xs text-slate-900">Price per night</b>
        <div className="mt-2 flex justify-between text-xs text-[var(--hk-muted)]">
          <span>₹0</span>
          <span>{money(maxPrice, "INR")}+</span>
        </div>
        <input
          type="range"
          aria-label="Maximum price"
          min="100000"
          max="2000000"
          step="100000"
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="mt-3 w-full accent-[var(--hk-navy)] cursor-pointer"
        />
      </div>

      {/* STAR RATING */}
      <div className="border-b border-[var(--hk-border)] py-4">
        <b className="text-xs text-slate-900">Star rating</b>
        <div className="mt-3 space-y-3">
          {[5, 4, 3, 2].map((n) => {
            const checked = starRatings.includes(n);
            return (
              <label
                key={n}
                onClick={() => toggleStar(n)}
                className="flex items-center justify-between text-xs cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    className="accent-[var(--hk-navy)] cursor-pointer"
                  />
                  <span>{n} stars</span>
                </div>
                <span className="text-[var(--hk-gold-strong)] tracking-wide">★★★★★</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* GUEST RATING */}
      <div className="border-b border-[var(--hk-border)] py-4">
        <b className="text-xs text-slate-900">Guest rating</b>
        <div className="mt-3 space-y-3">
          {[
            { val: 4.5, label: "4.5+ Exceptional" },
            { val: 4.0, label: "4.0+ Very good" },
            { val: 3.5, label: "3.5+ Good" },
          ].map((item) => {
            const checked = minGuestRating === item.val;
            return (
              <label
                key={item.val}
                onClick={() => setMinGuestRating(checked ? null : item.val)}
                className="flex items-center gap-2 text-xs cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {}}
                  className="accent-[var(--hk-navy)] cursor-pointer"
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* PROPERTY TYPE ACCORDION */}
      <div className="border-b border-[var(--hk-border)] py-4">
        <button
          type="button"
          onClick={() => setOpen(open === "Property type" ? null : "Property type")}
          className="flex w-full items-center justify-between text-xs font-bold text-slate-900"
        >
          <span>Property type</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              open === "Property type" ? "rotate-180" : ""
            }`}
          />
        </button>
        {open === "Property type" && (
          <div className="mt-3 space-y-2.5">
            {PROPERTY_TYPES.map((pt) => (
              <label
                key={pt.code}
                onClick={() => togglePropertyType(pt.label)}
                className="flex items-center gap-2 text-xs cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={selectedPropertyTypes.includes(pt.label)}
                  onChange={() => {}}
                  className="accent-[var(--hk-navy)] cursor-pointer"
                />
                <span>{pt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* POPULAR AMENITIES ACCORDION */}
      <div className="border-b border-[var(--hk-border)] py-4">
        <button
          type="button"
          onClick={() => setOpen(open === "Popular amenities" ? null : "Popular amenities")}
          className="flex w-full items-center justify-between text-xs font-bold text-slate-900"
        >
          <span>Popular amenities</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              open === "Popular amenities" ? "rotate-180" : ""
            }`}
          />
        </button>
        {open === "Popular amenities" && (
          <div className="mt-3 space-y-2.5">
            {AMENITY_OPTIONS.map((item) => (
              <label
                key={item.code}
                onClick={() => toggleAmenity(item.code)}
                className="flex items-center gap-2 text-xs cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={selectedAmenities.includes(item.code)}
                  onChange={() => {}}
                  className="accent-[var(--hk-navy)] cursor-pointer"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* BOOKING OPTIONS ACCORDION */}
      <div className="border-b border-[var(--hk-border)] py-4">
        <button
          type="button"
          onClick={() => setOpen(open === "Booking options" ? null : "Booking options")}
          className="flex w-full items-center justify-between text-xs font-bold text-slate-900"
        >
          <span>Booking options</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              open === "Booking options" ? "rotate-180" : ""
            }`}
          />
        </button>
        {open === "Booking options" && (
          <div className="mt-3 space-y-2.5">
            <label
              onClick={() => toggleBookingOption("FREE_CANCEL")}
              className="flex items-center gap-2 text-xs cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={selectedBookingOptions.includes("FREE_CANCEL")}
                onChange={() => {}}
                className="accent-[var(--hk-navy)] cursor-pointer"
              />
              <span>Free cancellation</span>
            </label>
            <label
              onClick={() => toggleBookingOption("VERIFIED")}
              className="flex items-center gap-2 text-xs cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={selectedBookingOptions.includes("VERIFIED")}
                onChange={() => {}}
                className="accent-[var(--hk-navy)] cursor-pointer"
              />
              <span>Verified stay</span>
            </label>
          </div>
        )}
      </div>

      {/* NEIGHBOURHOOD ACCORDION */}
      <div className="border-b border-[var(--hk-border)] py-4 last:border-0">
        <button
          type="button"
          onClick={() => setOpen(open === "Neighbourhood" ? null : "Neighbourhood")}
          className="flex w-full items-center justify-between text-xs font-bold text-slate-900"
        >
          <span>Neighbourhood</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              open === "Neighbourhood" ? "rotate-180" : ""
            }`}
          />
        </button>
        {open === "Neighbourhood" && (
          <div className="mt-3 space-y-2.5">
            {NEIGHBOURHOODS.map((n) => (
              <label
                key={n.code}
                onClick={() => toggleNeighbourhood(n.code)}
                className="flex items-center gap-2 text-xs cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={selectedNeighbourhoods.includes(n.code)}
                  onChange={() => {}}
                  className="accent-[var(--hk-navy)] cursor-pointer"
                />
                <span>{n.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   HELPER UI COMPONENTS
   ========================================================================= */

function ActiveFilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--hk-surface-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--hk-ink)] border border-[var(--hk-border)]">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full text-slate-400 hover:text-slate-700 transition"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function Chip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
        active
          ? "border-[var(--hk-navy)] bg-[var(--hk-navy)] text-white"
          : "border-[var(--hk-border)] bg-white hover:border-[var(--hk-navy)] text-slate-800"
      }`}
    >
      <span
        className={`[&>svg]:h-4 [&>svg]:w-4 ${
          active ? "text-white" : "text-[var(--hk-success)]"
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function SearchPart({
  label,
  icon,
  value,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 items-center gap-3 border-b border-[var(--hk-border)] px-5 py-4 text-[var(--hk-ink)] last:border-b-0 md:border-b-0 md:border-r">
      <span className="shrink-0 text-[var(--hk-navy)]/70 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--hk-muted)]">
          {label}
        </span>
        {children ?? <span className="block truncate text-sm font-semibold">{value}</span>}
      </span>
    </label>
  );
}

function Trust({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--hk-navy)] font-bold text-[var(--hk-navy)]">
        {icon}
      </span>
      <p>
        <b className="block text-xs">{title}</b>
        <span className="text-xs text-[var(--hk-muted)]">{text}</span>
      </p>
    </div>
  );
}

function Empty({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-[var(--hk-border-strong)] bg-white p-12 text-center">
      <h2 className="text-lg font-bold">No stays match this search</h2>
      <p className="mt-2 text-sm text-[var(--hk-muted)]">
        Try another destination or remove a filter.
      </p>
      <button
        onClick={onReset}
        className="mt-4 rounded-lg bg-[var(--hk-navy-strong)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--hk-navy)] transition"
      >
        Reset all filters
      </button>
    </div>
  );
}

function StayCard({ property, recommended }: { property: Property; recommended: boolean }) {
  const rating = property.ratingAverage;
  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-[var(--hk-shadow-soft)] ${
        recommended ? "border-[var(--hk-gold)]" : "border-[var(--hk-border)]"
      }`}
    >
      <div className="grid md:grid-cols-[250px_minmax(0,1fr)_180px]">
        <div className="relative min-h-52 bg-[var(--hk-surface-muted)]">
          {property.coverImageUrl ? (
            <img
              src={property.coverImageUrl}
              alt={property.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Building2 className="h-9 w-9 text-[var(--hk-muted)]" />
            </div>
          )}
          {recommended && (
            <span className="absolute left-0 top-0 bg-[var(--hk-gold)] px-3 py-1 text-[10px] font-extrabold text-[var(--hk-primary-dark)]">
              RECOMMENDED
            </span>
          )}
          <button
            aria-label={`Save ${property.name}`}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-2"
          >
            <Heart className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0 p-4">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{property.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--hk-muted)]">
                <MapPin className="h-3.5 w-3.5" />
                {property.city}
                {property.state ? `, ${property.state}` : ""} · City centre
              </p>
            </div>
            {rating > 0 && <span className="rounded bg-[var(--hk-navy)] px-2 py-1 text-xs font-bold text-white h-fit">
              {rating.toFixed(1)}
            </span>}
          </div>

          {rating > 0 ? <div className="mt-2 text-xs">
            <span className="tracking-wide text-[var(--hk-gold-strong)]">★★★★★</span>{" "}
            <b>{rating >= 4.5 ? "Exceptional" : "Very good"}</b>{" "}
            <span className="text-[var(--hk-muted)]">
              ({property.ratingCount || "New"} reviews)
            </span>
          </div> : <p className="mt-2 text-xs text-[var(--hk-muted)]">New to Helpkey</p>}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-b border-[var(--hk-border)] pb-3 text-xs text-[var(--hk-muted)]">
            <span className="flex items-center gap-1">
              <Wifi className="h-3.5 w-3.5" />
              Wi-Fi
            </span>
            <span>Air conditioning</span>
            <span>Restaurant</span>
            <span>Gym</span>
            <span>Parking</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <span className="flex items-center gap-1 text-[var(--hk-success)]">
              <BadgeCheck className="h-3.5 w-3.5" />
              Verified stay
            </span>
            {property.freeCancellation && (
              <span className="flex items-center gap-1 text-[var(--hk-success)]">
                <Check className="h-3.5 w-3.5" />
                Free cancellation
              </span>
            )}
            <span>Breakfast available</span>
          </div>

          <div className="mt-3 flex justify-between text-xs">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />2 guests
            </span>
            <span className="flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" />1 king bed
            </span>
            <span>Check-in 3:00 PM</span>
          </div>
        </div>

        <div className="flex flex-col justify-between border-t border-[var(--hk-border)] p-4 text-right md:border-l md:border-t-0">
          <div>
            <span className="rounded bg-[var(--hk-surface-soft)] px-2 py-1 text-[10px] font-bold text-[var(--hk-success)]">
              Great value
            </span>
            <p className="mt-4 text-2xl font-extrabold">
              {money(property.minimumPricePaise, property.currency)}
            </p>
            <p className="text-xs font-semibold">per night</p>
            <p className="mt-1 text-[10px] text-[var(--hk-muted)]">
              Taxes included <CircleHelp className="inline h-3 w-3" />
            </p>
          </div>

          <div className="mt-4 grid gap-2">
            <Link
              href={`/hotels/${property.slug}`}
              className="rounded-lg border border-[var(--hk-navy)] px-3 py-2 text-center text-xs font-bold text-[var(--hk-navy)] hover:bg-[var(--hk-surface-soft)] transition"
            >
              View details
            </Link>
            <Link
              href={`/hotels/${property.slug}`}
              className="rounded-lg bg-[var(--hk-navy-strong)] px-3 py-2 text-center text-xs font-bold text-white hover:bg-[var(--hk-navy)] transition"
            >
              Book now
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
