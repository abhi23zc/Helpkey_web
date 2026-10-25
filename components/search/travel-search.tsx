"use client";
import { Suspense } from "react";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Home,
  Landmark,
  MapPin,
  Minus,
  Navigation,
  Palmtree,
  Plus,
  Search,
  Sparkles,
  Trees,
  Users,
  X,
} from "lucide-react";
import { placesLibrary } from "@/lib/google/maps-loader";
import { formatStayDate } from "@/lib/customer/stay-search";

type HelpkeySuggestion = {
  label: string;
  city: string;
  slug: string | null;
  type: "property" | "city";
  imageUrl: string | null;
};
type GoogleSuggestion = {
  label: string;
  secondary: string;
  isHotel: boolean;
  prediction: any;
};
type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  city: string;
};
type Props = {
  initial?: URLSearchParams;
  amenities?: string[];
  compact?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
const readable = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
// Convert a 24h "HH:MM" string into a friendly 12-hour label, e.g. "10:00" -> "10:00 AM".
const readableTime = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m ?? 0)} ${period}`;
};
// Friendly duration label from minutes, e.g. 180 -> "3 hours".
const readableDuration = (minutes: number) => {
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
};
// Pre-computed option lists for the hourly-stay popover (avoids rebuilding on every render).
const TIME_OPTIONS = Array.from(
  { length: 96 },
  (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`,
);
const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => (i + 1) * 60);
const cityFromComponents = (components: any[]) =>
  components?.find((c) => c.types?.includes("locality"))?.longText ||
  components?.find((c) => c.types?.includes("administrative_area_level_2"))
    ?.longText ||
  "";

const DEFAULT_SUGGESTIONS = [
  {
    title: "Nearby",
    subtitle: "Find what's around you",
    badgeClass: "bg-[#EBF3FF] text-[#2563EB]",
    icon: Navigation,
    query: "Nearby",
  },
  {
    title: "Varanasi, Uttar Pradesh",
    subtitle: "Near you",
    badgeClass: "bg-[#FEE2E2] text-[#EF4444]",
    icon: Landmark,
    query: "Varanasi",
  },
  {
    title: "Lucknow, Uttar Pradesh",
    subtitle: "For its stunning architecture",
    badgeClass: "bg-[#F4F1EA] text-[#64748B]",
    icon: Building2,
    query: "Lucknow",
  },
  {
    title: "New Delhi, Delhi",
    subtitle: "For sights like India Gate",
    badgeClass: "bg-[#E6F4EA] text-[#16A34A]",
    icon: Trees,
    query: "New Delhi",
  },
  {
    title: "Noida, Uttar Pradesh",
    subtitle: "Popular destination",
    badgeClass: "bg-[#FCE7F3] text-[#EC4899]",
    icon: Building2,
    query: "Noida",
  },
  {
    title: "North Goa, Goa",
    subtitle: "Beaches and nightlife",
    badgeClass: "bg-[#FEF3C7] text-[#D97706]",
    icon: Palmtree,
    query: "Goa",
  },
];

type DestinationItem = {
  name: string;
  count: string;
  tags: string;
  image: string;
  query: string;
};

const DOMESTIC_DESTINATIONS: DestinationItem[] = [
  {
    name: "Hyderabad",
    count: "2,735",
    tags: "Sightseeing, food & culture",
    image:
      "https://images.unsplash.com/photo-1605379399642-870262d3d051?auto=format&fit=crop&w=160&q=80",
    query: "Hyderabad",
  },
  {
    name: "Mumbai",
    count: "4,177",
    tags: "Shopping, nightlife & dining",
    image:
      "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=160&q=80",
    query: "Mumbai",
  },
  {
    name: "Chennai",
    count: "2,832",
    tags: "Shopping, beaches & temples",
    image:
      "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=160&q=80",
    query: "Chennai",
  },
  {
    name: "New Delhi",
    count: "12,786",
    tags: "Sightseeing, heritage & shopping",
    image:
      "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=160&q=80",
    query: "New Delhi",
  },
  {
    name: "Goa",
    count: "9,254",
    tags: "Beaches, nightlife & resorts",
    image:
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=160&q=80",
    query: "Goa",
  },
  {
    name: "Bangalore",
    count: "5,372",
    tags: "Shopping, business & parks",
    image:
      "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=160&q=80",
    query: "Bangalore",
  },
];

const INTERNATIONAL_DESTINATIONS: DestinationItem[] = [
  {
    name: "Dubai",
    count: "19,464",
    tags: "Shopping, luxury & architecture",
    image:
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=160&q=80",
    query: "Dubai",
  },
  {
    name: "Bangkok",
    count: "12,048",
    tags: "Shopping, temples & street food",
    image:
      "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=160&q=80",
    query: "Bangkok",
  },
  {
    name: "Pattaya",
    count: "11,909",
    tags: "Nightlife, beaches & resorts",
    image:
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=160&q=80",
    query: "Pattaya",
  },
  {
    name: "London",
    count: "8,420",
    tags: "History, museums & theatre",
    image:
      "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=160&q=80",
    query: "London",
  },
  {
    name: "Paris",
    count: "7,150",
    tags: "Romance, art & fashion",
    image:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=160&q=80",
    query: "Paris",
  },
  {
    name: "Tokyo",
    count: "6,920",
    tags: "Culture, food & tech",
    image:
      "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=160&q=80",
    query: "Tokyo",
  },
];

// Shared look for the joined search bar: one rounded card, icon + label/value
// cells separated by thin dividers, inset dark Search button.
const BAR =
  "grid rounded-[20px] border border-[rgba(196,198,206,0.6)] bg-white shadow-[0_8px_30px_rgba(11,31,58,0.08)] md:grid-cols-[1.45fr_1fr_1fr_1fr_auto]";
const CELL =
  "flex h-full w-full items-center gap-3 border-b border-[rgba(196,198,206,0.6)] px-5 py-3.5 text-left transition-colors md:border-b-0 md:border-r";
const CELL_ICON = "h-5 w-5 shrink-0 text-slate-600";
const CELL_LABEL =
  "block text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-slate-500";
const CELL_VALUE =
  "truncate text-[15px] font-semibold leading-tight text-[var(--hk-ink)]";

export function TravelSearch(props: Props) {
  return (
    <Suspense
      fallback={
        <div
          aria-label="Loading stay search"
          className="h-24 animate-pulse rounded-2xl bg-slate-100"
        />
      }
    >
      <TravelSearchContent {...props} />
    </Suspense>
  );
}

function TravelSearchContent({
  initial,
  amenities = [],
  compact = false,
}: Props) {
  const router = useRouter();
  // Tracks the in-flight navigation so the Search button can show a spinner.
  const [isNavigating, startNavigation] = useTransition();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  const [destination, setDestination] = useState(
    initial?.get("destination") ?? "",
  );
  const [checkIn, setCheckIn] = useState(
    initial?.get("checkIn") ?? plusDays(1),
  );
  const [checkOut, setCheckOut] = useState(
    initial?.get("checkOut") ?? plusDays(2),
  );
  const [adults, setAdults] = useState(Number(initial?.get("adults") ?? 2));
  const [children, setChildren] = useState(
    Number(initial?.get("children") ?? 0),
  );
  const [infants, setInfants] = useState(Number(initial?.get("infants") ?? 0));
  const searchParams = useSearchParams();
  const [stayType, setStayType] = useState<"overnight" | "dayuse">(
    initial?.get("bookingMode") === "hourly" ||
      searchParams?.get("bookingMode") === "hourly"
      ? "dayuse"
      : "overnight",
  );

  useEffect(() => {
    const mode =
      searchParams?.get("bookingMode") ?? initial?.get("bookingMode");
    if (mode === "hourly") {
      setStayType("dayuse");
    } else if (mode === "overnight") {
      setStayType("overnight");
    }
  }, [searchParams, initial]);

  const [arrivalTime, setArrivalTime] = useState(
    initial?.get("arrivalTime") ?? "10:00",
  );
  const [durationMinutes, setDurationMinutes] = useState(
    Number(initial?.get("durationMinutes") ?? 180),
  );
  const [google, setGoogle] = useState<GoogleSuggestion[]>([]);
  const [open, setOpen] = useState<
    | "destination"
    | "dates"
    | "checkIn"
    | "checkOut"
    | "guests"
    | "dayDate"
    | "dayTime"
    | null
  >(null);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState("");
  const [mapsError, setMapsError] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);
  // Separate from suggestion loading: covers resolving a picked Google place.
  const [resolving, setResolving] = useState(false);
  // Debounced term shared by both suggestion sources; updated 280ms after typing.
  const [term, setTerm] = useState("");

  const token = useRef<any>(null);

  const scrollToConsole = useCallback(() => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      if (!root.current) return;
      const headerHeight = 76;
      const padding = 16;
      const rect = root.current.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - headerHeight - padding;

      if (Math.abs(rect.top - (headerHeight + padding)) > 15) {
        window.scrollTo({
          top: Math.max(0, targetY),
          behavior: "smooth",
        });
      }
    });
  }, []);

  useEffect(() => {
    if (open) {
      scrollToConsole();
    }
  }, [open, scrollToConsole]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    // Debounce keystrokes into `term`; clear suggestions when the field is too
    // short or a concrete place is already selected.
    if (destination.trim().length < 2 || place) {
      setTerm("");
      return;
    }
    const value = destination.trim();
    const timer = setTimeout(() => setTerm(value), 280);
    return () => clearTimeout(timer);
  }, [destination, place]);

  // Helpkey suggestions via react-query: shared caching, dedupe, and automatic
  // request cancellation replace the previous manual fetch + request-id guard.
  const destinationOpen = open === "destination";
  const helpkeyQuery = useQuery({
    queryKey: queryKeys.suggestions(term),
    queryFn: ({ signal }) =>
      apiFetch<{ suggestions?: HelpkeySuggestion[] }>(
        `/api/search/suggestions?q=${encodeURIComponent(term)}`,
        { signal },
      ),
    enabled: destinationOpen && term.length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const helpkey =
    destinationOpen && term.length >= 2 ? (helpkeyQuery.data?.suggestions ?? []) : [];

  useEffect(() => {
    // Google Places autocomplete stays on the Maps JS SDK (not our API), keyed on
    // the same debounced term. A monotonic id guards against out-of-order results.
    if (!destinationOpen || !term) {
      setGoogle([]);
      return;
    }
    const id = ++request.current;
    let cancelled = false;
    (async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await placesLibrary()) as any;
        token.current ??= new AutocompleteSessionToken();
        const result =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: term,
            includedRegionCodes: ["IN"],
            includedPrimaryTypes: [
              "locality",
              "sublocality",
              "administrative_area_level_2",
              "lodging",
            ],
            sessionToken: token.current,
          });
        if (cancelled || id !== request.current) return;
        setGoogle(
          (result.suggestions ?? [])
            .map((item: any) => {
              const prediction = item.placePrediction;
              const types = prediction?.types ?? [];
              return {
                label: prediction?.text?.text ?? "",
                secondary: prediction?.secondaryText?.text ?? "",
                isHotel: types.includes("lodging"),
                prediction,
              };
            })
            .filter((item: GoogleSuggestion) => item.label && item.prediction),
        );
        setMapsError("");
      } catch {
        if (cancelled || id !== request.current) return;
        setGoogle([]);
        setMapsError(
          "Google location suggestions are temporarily unavailable. You can still search Helpkey stays or enter a destination.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinationOpen, term]);

  const loading = (destinationOpen && helpkeyQuery.isFetching && term.length >= 2) || resolving;

  const chooseHelpkey = (item: HelpkeySuggestion) => {
    // A property suggestion is a specific hotel, not a destination string —
    // sending its name through the city-based search would match nothing (it
    // isn't a normalizedCity value). Go straight to the hotel page instead.
    if (item.type === "property" && item.slug) {
      const p = new URLSearchParams(initial?.toString());
      p.delete("destination");
      p.delete("placeId");
      p.delete("placeName");
      p.delete("placeAddress");
      p.delete("placeLat");
      p.delete("placeLng");
      if (checkIn) p.set("checkIn", checkIn);
      p.set("bookingMode", stayType === "dayuse" ? "hourly" : "overnight");
      if (stayType === "dayuse") {
        p.delete("checkOut");
        p.set("arrivalTime", arrivalTime);
        p.set("durationMinutes", String(durationMinutes));
      } else {
        if (checkOut) p.set("checkOut", checkOut);
        p.delete("arrivalTime");
        p.delete("durationMinutes");
      }
      p.set("adults", String(Math.max(1, adults)));
      p.set("children", String(Math.max(0, children)));
      p.set("infants", String(Math.max(0, infants)));
      setOpen(null);
      router.push(`/hotels/${item.slug}${p.toString() ? `?${p}` : ""}`);
      return;
    }
    setDestination(item.type === "property" ? item.label : item.city);
    setPlace(null);
    setOpen(null);
  };

  const chooseGoogle = async (item: GoogleSuggestion) => {
    try {
      setResolving(true);
      const placeResult = item.prediction.toPlace();
      await placeResult.fetchFields({
        fields: [
          "id",
          "displayName",
          "formattedAddress",
          "location",
          "addressComponents",
        ],
      });
      const selected = {
        id: placeResult.id,
        name: placeResult.displayName ?? item.label,
        address: placeResult.formattedAddress ?? "",
        lat: placeResult.location?.lat?.() ?? 0,
        lng: placeResult.location?.lng?.() ?? 0,
        city: cityFromComponents(placeResult.addressComponents) || item.label,
      };
      setPlace(selected);
      setDestination(selected.city);
      setOpen(null);
    } catch {
      setError(
        "Could not use that location. Please choose another suggestion.",
      );
    } finally {
      token.current = null;
      setResolving(false);
    }
  };

  const options = [
    ...helpkey.map((x) => ({ kind: "h" as const, value: x })),
    ...google.map((x) => ({ kind: "g" as const, value: x })),
  ];

  const useNearbyLocation = () => {
    if (locating) return;
    if (!navigator.geolocation) {
      setError(
        "Location is not available in this browser. Enter a destination instead.",
      );
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Feed the real coordinates through the same `place` channel Google uses
        // so search() serializes placeLat/placeLng and enables distance sorting.
        setPlace({
          id: "",
          name: "Nearby stays",
          address: "Your current location",
          lat: latitude,
          lng: longitude,
          city: "Nearby",
        });
        setDestination("Nearby stays");
        setActive(-1);
        setOpen(null);
        setLocating(false);
      },
      () => {
        setError(
          "We couldn't access your location. Allow location access or enter a destination.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const search = () => {
    if (
      !checkIn ||
      (stayType === "overnight" && (!checkOut || checkOut <= checkIn))
    )
      return setError("Choose a check-out date after check-in.");
    const p = new URLSearchParams(initial?.toString());
    p.set("checkIn", checkIn);
    p.set("bookingMode", stayType === "dayuse" ? "hourly" : "overnight");
    if (stayType === "dayuse") {
      p.delete("checkOut");
      p.set("arrivalTime", arrivalTime);
      p.set("durationMinutes", String(durationMinutes));
    } else {
      p.set("checkOut", checkOut);
      p.delete("arrivalTime");
      p.delete("durationMinutes");
    }
    p.set("adults", String(Math.max(1, adults)));
    p.set("children", String(Math.max(0, children)));
    p.set("infants", String(Math.max(0, infants)));
    // A coordinate-only "Nearby" search has a place with lat/lng but no placeId;
    // its label must not be sent as a city filter (which would match nothing).
    const coordinatesOnly = Boolean(place && !place.id);
    if (destination.trim() && !coordinatesOnly)
      p.set("destination", destination.trim());
    else p.delete("destination");
    amenities.forEach((x) => p.append("amenity", x));
    if (place) {
      if (place.id) p.set("placeId", place.id);
      p.set("placeName", place.name);
      p.set("placeAddress", place.address);
      p.set("placeLat", String(place.lat));
      p.set("placeLng", String(place.lng));
      // With coordinates and no city text, rank by proximity to the location.
      if (coordinatesOnly && !p.get("sort"))
        p.set("sort", "distance_from_downtown");
    }
    setError("");
    setOpen(null);
    startNavigation(() => router.push(`/search?${p}`));
  };

  const pickDate = (day: string) => {
    if (open === "checkIn") {
      setCheckIn(day);
      if (checkOut && day >= checkOut) {
        setCheckOut("");
      }
      setOpen("checkOut");
    } else if (open === "checkOut") {
      if (!checkIn || day <= checkIn) {
        setCheckIn(day);
        setCheckOut("");
        setOpen("checkOut");
      } else {
        setCheckOut(day);
        setOpen(null);
      }
    } else {
      if (!checkIn || checkOut || day <= checkIn) {
        setCheckIn(day);
        setCheckOut("");
      } else {
        setCheckOut(day);
        setOpen(null);
      }
    }
  };

  const isSearching = destination.trim().length >= 2;

  const destinationField = (
    <div className="relative">
      <div
        onClick={() => {
          setOpen("destination");
          inputRef.current?.focus();
          scrollToConsole();
        }}
        className={`${CELL} cursor-text md:rounded-l-[20px] ${open === "destination" ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
      >
        <MapPin className={CELL_ICON} />
        <div className="flex min-w-0 flex-1 flex-col">
          <label
            htmlFor="destination-input"
            className={`${CELL_LABEL} cursor-pointer`}
          >
            Destination
          </label>
          <input
            ref={inputRef}
            id="destination-input"
            type="text"
            value={destination}
            onFocus={() => {
              setOpen("destination");
              scrollToConsole();
            }}
            onChange={(e) => {
              setPlace(null);
              setDestination(e.target.value);
              setActive(-1);
              setMapsError("");
              if (open !== "destination") setOpen("destination");
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(null);
              if (isSearching && options.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((x) => Math.min(x + 1, options.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((x) => Math.max(x - 1, 0));
                }
                if (e.key === "Enter" && active >= 0) {
                  e.preventDefault();
                  const o = options[active];
                  if (o.kind === "h") chooseHelpkey(o.value);
                  else void chooseGoogle(o.value);
                }
              }
            }}
            placeholder="Enter a destination or property"
            className="w-full truncate bg-transparent text-[15px] font-semibold leading-tight text-[var(--hk-ink)] outline-none placeholder:font-medium placeholder:text-[var(--hk-muted)]/70"
          />
        </div>
        {destination && open === "destination" && (
          <button
            type="button"
            aria-label="Clear destination"
            onClick={(e) => {
              e.stopPropagation();
              setDestination("");
              setPlace(null);
              inputRef.current?.focus();
            }}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const guestsField = (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open === "guests"}
        onClick={() => {
          const next = open === "guests" ? null : "guests";
          setOpen(next);
          if (next) scrollToConsole();
        }}
        className={`${CELL} ${open === "guests" ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
      >
        <Users className={CELL_ICON} />
        <span className="flex min-w-0 flex-col">
          <span className={CELL_LABEL}>Guests</span>
          <span className={CELL_VALUE}>
            {adults} adult{adults !== 1 ? "s" : ""}
            {children
              ? `, ${children} child${children !== 1 ? "ren" : ""}`
              : ""}
            {infants ? `, ${infants} infant${infants !== 1 ? "s" : ""}` : ""}
          </span>
        </span>
      </button>
      {open === "guests" && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_20px_45px_rgba(11,31,58,0.18)]">
          <Counter
            label="Adults"
            note="Ages 13+"
            value={adults}
            min={1}
            max={12}
            onChange={setAdults}
          />
          <Counter
            label="Children"
            note="Ages 2–12"
            value={children}
            min={0}
            max={10}
            onChange={setChildren}
          />
          <Counter
            label="Infants"
            note="Under 2"
            value={infants}
            min={0}
            max={10}
            onChange={setInfants}
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mt-4 w-full rounded-[12px] bg-[var(--hk-navy-strong)] py-2.5 text-sm font-bold text-white transition hover:bg-[var(--hk-primary)]"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* AGODA-STYLE FADED BACKDROP OVERLAY */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-[3px] transition-opacity duration-300 animate-in fade-in"
          onClick={() => setOpen(null)}
        />
      )}

      <div
        ref={root}
        className={
          compact
            ? `relative ${open ? "z-[70]" : ""}`
            : `relative transition-all duration-300 rounded-[24px] bg-white p-4 sm:p-6 mt-10 ${
                open
                  ? "z-[70] shadow-[0_30px_90px_rgba(15,23,42,0.32)] ring-2 ring-[var(--hk-navy-strong)]/20 scale-[1.015] -translate-y-2"
                  : "z-20 border border-white/80 shadow-[0_12px_40px_rgba(11,31,58,0.14)]"
              }`
        }
      >
        <div className={BAR}>
          {destinationField}
          {stayType === "dayuse" ? (
            <>
              {/* ARRIVAL DATE */}
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={open === "dayDate"}
                  onClick={() => {
                    const next = open === "dayDate" ? null : "dayDate";
                    setOpen(next);
                    if (next) scrollToConsole();
                  }}
                  className={`${CELL} ${open === "dayDate" ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
                >
                  <Calendar className={CELL_ICON} />
                  <span className="flex min-w-0 flex-col">
                    <span className={CELL_LABEL}>Arrival date</span>
                    <span className={CELL_VALUE}>
                      {checkIn ? formatStayDate(checkIn) : "Select date"}
                    </span>
                  </span>
                </button>
                {open === "dayDate" && (
                  <DayDatePopover
                    value={checkIn}
                    onPick={(day) => {
                      setCheckIn(day);
                      setOpen(null);
                    }}
                  />
                )}
              </div>

              {/* TIME & DURATION */}
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={open === "dayTime"}
                  onClick={() => {
                    const next = open === "dayTime" ? null : "dayTime";
                    setOpen(next);
                    if (next) scrollToConsole();
                  }}
                  className={`${CELL} ${open === "dayTime" ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
                >
                  <Clock className={CELL_ICON} />
                  <span className="flex min-w-0 flex-col">
                    <span className={CELL_LABEL}>Time &amp; duration</span>
                    <span className={CELL_VALUE}>
                      {readableTime(arrivalTime)} ·{" "}
                      {readableDuration(durationMinutes)}
                    </span>
                  </span>
                </button>
                {open === "dayTime" && (
                  <TimeDurationPopover
                    arrivalTime={arrivalTime}
                    durationMinutes={durationMinutes}
                    selectedDate={checkIn}
                    onArrivalChange={setArrivalTime}
                    onDurationChange={setDurationMinutes}
                    onDone={() => setOpen(null)}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              {/* CHECK-IN (opens the shared range calendar) */}
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={open === "dates"}
                  onClick={() => {
                    const next = open === "dates" ? null : "dates";
                    setOpen(next);
                    if (next) scrollToConsole();
                  }}
                  className={`${CELL} ${open === "dates" ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
                >
                  <Calendar className={CELL_ICON} />
                  <span className="flex min-w-0 flex-col">
                    <span className={CELL_LABEL}>Check-in</span>
                    <span className={CELL_VALUE}>
                      {checkIn ? readable(checkIn) : "Select date"}
                    </span>
                  </span>
                </button>
                {open === "dates" && (
                  <CalendarPopover
                    checkIn={checkIn}
                    checkOut={checkOut}
                    onPick={pickDate}
                    onClear={() => {
                      setCheckIn("");
                      setCheckOut("");
                    }}
                  />
                )}
              </div>

              {/* CHECK-OUT (same calendar) */}
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={open === "dates"}
                  onClick={() => {
                    const next = open === "dates" ? null : "dates";
                    setOpen(next);
                    if (next) scrollToConsole();
                  }}
                  className={`${CELL} ${open === "dates" ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
                >
                  <Calendar className={CELL_ICON} />
                  <span className="flex min-w-0 flex-col">
                    <span className={CELL_LABEL}>Check-out</span>
                    <span className={CELL_VALUE}>
                      {checkOut ? readable(checkOut) : "Select date"}
                    </span>
                  </span>
                </button>
              </div>
            </>
          )}

          {guestsField}

          {/* SEARCH BUTTON */}
          <div className="flex items-center p-3 md:p-2.5">
            <button
              type="button"
              onClick={search}
              disabled={isNavigating}
              aria-busy={isNavigating}
              className="flex h-full min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-[12px] bg-[var(--hk-navy-strong)] px-7 text-[15px] font-bold text-white transition-colors hover:bg-[var(--hk-primary)] disabled:cursor-wait disabled:opacity-80"
            >
              {isNavigating && (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden="true"
                />
              )}
              <span>{isNavigating ? "Searching…" : "Search hotels"}</span>
            </button>
          </div>
        </div>

        {/* FULL-WIDTH DESTINATION POPOVER ATTACHED TO ROOT CARD (AGODA STYLE) */}
        {open === "destination" && (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+12px)] z-[80] w-full overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-6 sm:p-7 shadow-[0_30px_80px_rgba(15,23,42,0.24)] animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {!isSearching ? (
              /* DEFAULT AGODA-STYLE 2-COLUMN DESTINATIONS GRID WITH REAL PHOTOS */
              <div>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      Popular Destinations
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Explore top cities in India and worldwide with verified
                      stays
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={useNearbyLocation}
                    disabled={locating}
                    className="flex items-center gap-2 rounded-full bg-blue-50/90 border border-blue-200/60 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 transition"
                  >
                    <Navigation
                      className={`h-4 w-4 ${locating ? "animate-spin" : ""}`}
                    />
                    <span>{locating ? "Locating…" : "Find Nearby Stays"}</span>
                  </button>
                </div>

                <div className="grid gap-8 md:grid-cols-2">
                  {/* DOMESTIC DESTINATIONS */}
                  <div>
                    <h4 className="mb-3.5 text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
                      Popular cities in India
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {DOMESTIC_DESTINATIONS.map((item) => (
                        <button
                          type="button"
                          key={item.name}
                          onClick={() => {
                            setDestination(item.query);
                            setOpen(null);
                          }}
                          className="flex items-center gap-3.5 rounded-[18px] p-2.5 text-left transition-all hover:bg-slate-50 border border-slate-100/80 hover:border-slate-200/90 group hover:shadow-xs"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-12 shrink-0 rounded-[12px] object-cover shadow-xs group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-bold text-slate-900 leading-snug truncate">
                              {item.name}{" "}
                              <span className="text-[12px] font-semibold text-slate-400">
                                ({item.count})
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate leading-tight font-medium">
                              {item.tags}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* INTERNATIONAL DESTINATIONS */}
                  <div className="border-t border-slate-100 pt-6 md:border-t-0 md:border-l md:border-slate-100 md:pl-8 md:pt-0">
                    <h4 className="mb-3.5 text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
                      International destinations
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {INTERNATIONAL_DESTINATIONS.map((item) => (
                        <button
                          type="button"
                          key={item.name}
                          onClick={() => {
                            setDestination(item.query);
                            setOpen(null);
                          }}
                          className="flex items-center gap-3.5 rounded-[18px] p-2.5 text-left transition-all hover:bg-slate-50 border border-slate-100/80 hover:border-slate-200/90 group hover:shadow-xs"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-12 shrink-0 rounded-[12px] object-cover shadow-xs group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-bold text-slate-900 leading-snug truncate">
                              {item.name}{" "}
                              <span className="text-[12px] font-semibold text-slate-400">
                                ({item.count})
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate leading-tight font-medium">
                              {item.tags}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* DYNAMIC SEARCH RESULTS */
              <div>
                {loading && (
                  <p className="px-2 py-3 text-xs font-medium text-slate-500">
                    Finding destinations…
                  </p>
                )}

                <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
                  {helpkey.length > 0 && (
                    <div className="border-b border-slate-100 pb-3.5">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          <span>Stays on Helpkey</span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {helpkey.length}
                          </span>
                        </p>
                        {helpkey.length > 2 && (
                          <span className="text-[10px] font-medium text-slate-400">
                            Scroll for more →
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2.5 overflow-x-auto pb-1 pt-0.5 px-0.5 [scrollbar-width:thin]">
                        {helpkey.map((item, i) => (
                          <button
                            role="option"
                            type="button"
                            aria-selected={active === i}
                            key={`${item.type}-${item.label}`}
                            onClick={() => chooseHelpkey(item)}
                            className={`group relative flex w-[210px] shrink-0 items-center gap-2.5 rounded-[14px] border p-2 text-left transition-all ${
                              active === i
                                ? "border-[var(--hk-navy-strong)] bg-slate-100 shadow-xs"
                                : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-xs"
                            }`}
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-slate-100 text-slate-700">
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- CDN thumbnail, not a static asset.
                                <img
                                  src={item.imageUrl}
                                  alt=""
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                  loading="lazy"
                                />
                              ) : (
                                <Building2
                                  className="h-5 w-5 text-slate-600"
                                  strokeWidth={1.75}
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-bold text-slate-900 tracking-tight leading-tight">
                                {item.label}
                              </p>
                              <p className="truncate text-[11px] font-medium text-slate-500 mt-0.5">
                                {item.city ? `${item.city} · ` : ""}
                                {item.type === "property"
                                  ? "Hotel"
                                  : "Destination"}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {google.length > 0 && (
                    <div className="space-y-1">
                      <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Places in India
                      </p>
                      {google.map((item, i) => {
                        const isNeighborhood =
                          item.secondary
                            ?.toLowerCase()
                            .includes("neighbourhood") ||
                          item.secondary?.toLowerCase().includes("locality");
                        const IconComponent = item.isHotel
                          ? Building2
                          : isNeighborhood
                            ? Home
                            : MapPin;
                        return (
                          <button
                            role="option"
                            type="button"
                            aria-selected={active === i + helpkey.length}
                            key={`${item.label}-${i}`}
                            onClick={() => void chooseGoogle(item)}
                            className={`flex w-full items-center gap-3.5 rounded-[16px] p-2.5 text-left transition-colors ${
                              active === i + helpkey.length
                                ? "bg-slate-100"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#F4F4F6] text-slate-800">
                              <IconComponent
                                className="h-5 w-5"
                                strokeWidth={1.75}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-slate-900 tracking-tight">
                                {item.label}
                              </p>
                              <p className="truncate text-[13px] font-normal text-slate-500 mt-0.5">
                                {item.secondary ||
                                  (item.isHotel ? "Hotel" : "Destination")}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {mapsError && (
                  <p className="mx-1 mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {mapsError}
                  </p>
                )}
                {!loading && !options.length && (
                  <p className="px-2 py-4 text-center text-xs font-medium text-slate-500">
                    No suggested stay or destination found. Press Search to
                    explore stays in &quot;{destination}&quot;.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </>
  );
}

function Counter({
  label,
  note,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  note: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <div>
        <b className="block text-sm font-bold text-slate-800">{label}</b>
        <span className="text-xs text-slate-500">{note}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-4 text-center font-bold text-sm text-slate-800">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CalendarPopover({
  checkIn,
  checkOut,
  onPick,
  onClear,
}: {
  checkIn: string;
  checkOut: string;
  onPick: (date: string) => void;
  onClear: () => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const today = plusDays(0);
  const max = plusDays(365);
  const months = [
    month,
    new Date(month.getFullYear(), month.getMonth() + 1, 1),
  ];

  return (
    <div
      role="dialog"
      aria-label="Choose travel dates"
      className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(44rem,calc(100vw-2rem))] rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_45px_rgba(11,31,58,0.18)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          aria-label="Previous month"
          className="rounded-full p-1.5 hover:bg-slate-100 text-slate-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <b className="text-sm font-bold text-slate-800">
          Select check-in, then check-out
        </b>
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          aria-label="Next month"
          className="rounded-full p-1.5 hover:bg-slate-100 text-slate-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {months.map((m) => (
          <Month
            key={m.toISOString()}
            month={m}
            today={today}
            max={max}
            checkIn={checkIn}
            checkOut={checkOut}
            onPick={onPick}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-right">
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-bold text-slate-600 underline hover:text-slate-900"
        >
          Clear dates
        </button>
      </div>
    </div>
  );
}

function Month({ month, today, max, checkIn, checkOut, onPick }: any) {
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  return (
    <div>
      <p className="mb-3 text-center font-bold text-sm text-slate-800">
        {month.toLocaleString("en-IN", { month: "long", year: "numeric" })}
      </p>
      <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold text-slate-400">
        {"SMTWTFS".split("").map((x, i) => (
          <span key={i}>{x}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const key = `${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(i + 1)}`;
          const disabled = key < today || key > max;
          const selected = key === checkIn || key === checkOut;
          const between =
            checkIn && checkOut && key > checkIn && key < checkOut;

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(key)}
              className={`h-8 rounded-full text-xs font-semibold transition disabled:text-slate-300 disabled:hover:bg-transparent ${
                selected
                  ? "bg-[var(--hk-navy-strong)] text-white"
                  : between
                    ? "bg-slate-100 text-slate-900 rounded-none"
                    : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Single-date calendar used by hourly stays (one arrival day, no range).
function DayDatePopover({
  value,
  onPick,
}: {
  value: string;
  onPick: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = value ? new Date(`${value}T00:00:00`) : new Date();
    d.setDate(1);
    return d;
  });
  const today = plusDays(0);
  const max = plusDays(365);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  return (
    <div
      role="dialog"
      aria-label="Choose arrival date"
      className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_45px_rgba(11,31,58,0.18)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          aria-label="Previous month"
          className="rounded-full p-1.5 hover:bg-slate-100 text-slate-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <b className="text-sm font-bold text-slate-800">
          {month.toLocaleString("en-IN", { month: "long", year: "numeric" })}
        </b>
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          aria-label="Next month"
          className="rounded-full p-1.5 hover:bg-slate-100 text-slate-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold text-slate-400">
        {"SMTWTFS".split("").map((x, i) => (
          <span key={i}>{x}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const key = `${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(i + 1)}`;
          const disabled = key < today || key > max;
          const selected = key === value;

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(key)}
              className={`h-9 rounded-full text-xs font-semibold transition disabled:text-slate-300 disabled:hover:bg-transparent ${
                selected
                  ? "bg-[var(--hk-navy-strong)] text-white"
                  : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Combined arrival-time + duration picker for hourly stays.
// Two-step flow: the guest picks an arrival time first, then the duration options
// appear. When the arrival date is today, times already in the past are hidden.
function TimeDurationPopover({
  arrivalTime,
  durationMinutes,
  selectedDate,
  onArrivalChange,
  onDurationChange,
  onDone,
}: {
  arrivalTime: string;
  durationMinutes: number;
  selectedDate: string;
  onArrivalChange: (time: string) => void;
  onDurationChange: (minutes: number) => void;
  onDone: () => void;
}) {
  // Tracks whether the guest has committed to a time and should now see durations.
  const [step, setStep] = useState<"time" | "duration">("time");

  // When the arrival date is today, drop any slot that has already passed so the
  // guest can't choose an impossible arrival. A small buffer avoids near-now slots.
  const availableTimes = useMemo(() => {
    const isToday = selectedDate === plusDays(0);
    if (!isToday) return TIME_OPTIONS;
    const now = new Date();
    const minMinutes = now.getHours() * 60 + now.getMinutes() + 15; // 15-min lead time
    return TIME_OPTIONS.filter((time) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m >= minMinutes;
    });
  }, [selectedDate]);

  // Keep the selected arrival time valid: if it's no longer available (date is
  // today and the slot passed), snap to the first available slot.
  useEffect(() => {
    if (availableTimes.length === 0) return;
    if (!availableTimes.includes(arrivalTime))
      onArrivalChange(availableTimes[0]);
  }, [availableTimes, arrivalTime, onArrivalChange]);

  return (
    <div
      role="dialog"
      aria-label="Choose arrival time and duration"
      className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(24rem,calc(100vw-2rem))] rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_45px_rgba(11,31,58,0.18)]"
    >
      {/* STEP INDICATOR
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
            step === "time" ? "bg-[var(--hk-navy-strong)] text-white" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {step === "duration" ? "✓" : "1"}
        </span>
        <span className="text-[13px] font-bold text-slate-700">Arrival time</span>
        <span className="mx-1 h-px flex-1 bg-slate-200" />
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
            step === "duration" ? "bg-[var(--hk-navy-strong)] text-white" : "bg-slate-100 text-slate-400"
          }`}
        >
          2
        </span>
        <span className={`text-[13px] font-bold ${step === "duration" ? "text-slate-700" : "text-slate-400"}`}>Duration</span>
      </div> */}

      {step === "time" ? (
        /* STEP 1 — ARRIVAL TIME */
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500">
            <Clock className="h-3.5 w-3.5" /> Choose arrival time
          </p>
          {availableTimes.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-3 text-xs font-medium text-amber-800">
              No arrival times left for today. Please pick a later date.
            </p>
          ) : (
            <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
              {availableTimes.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => {
                    onArrivalChange(time);
                    setStep("duration");
                  }}
                  className={`rounded-[10px] px-1 py-2 text-[12px] font-semibold transition ${
                    arrivalTime === time
                      ? "bg-[var(--hk-navy-strong)] text-white shadow-sm"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {readableTime(time)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* STEP 2 — DURATION */
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500">
              <Clock className="h-3.5 w-3.5" /> How long?
            </p>
            <button
              type="button"
              onClick={() => setStep("time")}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
            >
              <ChevronLeft className="h-3 w-3" />
              {readableTime(arrivalTime)}
            </button>
          </div>
          <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {DURATION_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => onDurationChange(minutes)}
                className={`rounded-[10px] px-1 py-2 text-[12px] font-semibold transition ${
                  durationMinutes === minutes
                    ? "bg-[var(--hk-navy-strong)] text-white shadow-sm"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {minutes / 60}h
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onDone}
            className="mt-4 w-full rounded-[12px] bg-[var(--hk-navy-strong)] py-2.5 text-sm font-bold text-white transition hover:bg-[var(--hk-primary)]"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
