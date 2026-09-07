"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @typescript-eslint/no-unused-expressions */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
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

type HelpkeySuggestion = { label: string; city: string; slug: string | null; type: "property" | "city" };
type GoogleSuggestion = { label: string; secondary: string; prediction: any };
type Place = { id: string; name: string; address: string; lat: number; lng: number; city: string };
type Props = { initial?: URLSearchParams; amenities?: string[]; compact?: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
const readable = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`));
const cityFromComponents = (components: any[]) =>
  components?.find((c) => c.types?.includes("locality"))?.longText ||
  components?.find((c) => c.types?.includes("administrative_area_level_2"))?.longText ||
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

export function TravelSearch({ initial, amenities = [], compact = false }: Props) {
  const router = useRouter();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  const [destination, setDestination] = useState(initial?.get("destination") ?? "");
  const [checkIn, setCheckIn] = useState(initial?.get("checkIn") ?? plusDays(1));
  const [checkOut, setCheckOut] = useState(initial?.get("checkOut") ?? plusDays(2));
  const [adults, setAdults] = useState(Number(initial?.get("adults") ?? 2));
  const [children, setChildren] = useState(Number(initial?.get("children") ?? 0));
  const [infants, setInfants] = useState(Number(initial?.get("infants") ?? 0));

  const [helpkey, setHelpkey] = useState<HelpkeySuggestion[]>([]);
  const [google, setGoogle] = useState<GoogleSuggestion[]>([]);
  const [open, setOpen] = useState<"destination" | "dates" | "guests" | null>(null);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [place, setPlace] = useState<Place | null>(null);

  const token = useRef<any>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (destination.trim().length < 2 || place) {
      setHelpkey([]);
      setGoogle([]);
      return;
    }
    const id = ++request.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(destination)}`);
        const data = await response.json();
        if (id !== request.current) return;
        setHelpkey(data.suggestions ?? []);

        const { AutocompleteSuggestion, AutocompleteSessionToken } = (await placesLibrary()) as any;
        token.current ??= new AutocompleteSessionToken();
        const result = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: destination,
          includedRegionCodes: ["IN"],
          includedPrimaryTypes: ["(cities)"],
          sessionToken: token.current,
        });
        if (id === request.current) {
          setGoogle(
            (result.suggestions ?? [])
              .map((item: any) => ({
                label: item.placePrediction?.text?.text ?? "",
                secondary: item.placePrediction?.secondaryText?.text ?? "",
                prediction: item.placePrediction,
              }))
              .filter((item: GoogleSuggestion) => item.label)
          );
        }
      } catch {
        /* Helpkey suggestions remain usable when Maps is unavailable. */
      } finally {
        if (id === request.current) setLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [destination, place]);

  const chooseHelpkey = (item: HelpkeySuggestion) => {
    setDestination(item.type === "property" ? item.label : item.city);
    setPlace(null);
    setOpen(null);
  };

  const chooseGoogle = async (item: GoogleSuggestion) => {
    try {
      setLoading(true);
      const placeResult = item.prediction.toPlace();
      await placeResult.fetchFields({
        fields: ["id", "displayName", "formattedAddress", "location", "addressComponents"],
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
      setError("Could not use that location. Please choose another suggestion.");
    } finally {
      token.current = null;
      setLoading(false);
    }
  };

  const options = [
    ...helpkey.map((x) => ({ kind: "h" as const, value: x })),
    ...google.map((x) => ({ kind: "g" as const, value: x })),
  ];

  const search = () => {
    if (!checkIn || !checkOut || checkOut <= checkIn) return setError("Choose a check-out date after check-in.");
    const p = new URLSearchParams(initial?.toString());
    p.set("checkIn", checkIn);
    p.set("checkOut", checkOut);
    p.set("adults", String(Math.max(1, adults)));
    p.set("children", String(Math.max(0, children)));
    p.set("infants", String(Math.max(0, infants)));
    if (destination.trim()) p.set("destination", destination.trim());
    else p.delete("destination");
    amenities.forEach((x) => p.append("amenity", x));
    if (place) {
      p.set("placeId", place.id);
      p.set("placeName", place.name);
      p.set("placeAddress", place.address);
      p.set("placeLat", String(place.lat));
      p.set("placeLng", String(place.lng));
    }
    router.push(`/search?${p}`);
  };

  const pickDate = (day: string) => {
    if (!checkIn || checkOut || day <= checkIn) {
      setCheckIn(day);
      setCheckOut("");
    } else {
      setCheckOut(day);
      setOpen(null);
    }
  };

  const isSearching = destination.trim().length >= 2;

  return (
    <div
      ref={root}
      className={
        compact
          ? "relative"
          : "relative rounded-[20px] border border-white/70 bg-white/95 p-4 shadow-[0_12px_40px_rgba(11,31,58,0.14)] backdrop-blur-md sm:p-5"
      }
    >
      <div className="grid gap-3 md:grid-cols-[1.15fr_1.1fr_1fr_auto]">
        {/* DESTINATION FIELD */}
        <div className="relative">
          <div
            onClick={() => {
              setOpen("destination");
              inputRef.current?.focus();
            }}
            className={`group relative flex w-full flex-col justify-center rounded-[14px] border px-4 py-3 text-left transition-all cursor-text ${
              open === "destination"
                ? "border-[var(--hk-navy-strong)] bg-white ring-2 ring-[var(--hk-navy-strong)]/15 shadow-sm"
                : "border-[rgba(196,198,206,0.72)] bg-white hover:border-[var(--hk-navy-strong)]"
            }`}
          >
            <label
              htmlFor="destination-input"
              className="block text-[10px] font-bold tracking-wider text-[var(--hk-muted)] uppercase cursor-pointer"
            >
              DESTINATION
            </label>
            <div className="mt-0.5 flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-[var(--hk-navy-strong)]/80" />
              <input
                ref={inputRef}
                id="destination-input"
                type="text"
                value={destination}
                onFocus={() => setOpen("destination")}
                onChange={(e) => {
                  setPlace(null);
                  setDestination(e.target.value);
                  setActive(-1);
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
                  } else if (!isSearching && DEFAULT_SUGGESTIONS.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActive((x) => Math.min(x + 1, DEFAULT_SUGGESTIONS.length - 1));
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((x) => Math.max(x - 1, 0));
                    }
                    if (e.key === "Enter" && active >= 0) {
                      e.preventDefault();
                      const def = DEFAULT_SUGGESTIONS[active];
                      setDestination(def.query);
                      setOpen(null);
                    }
                  }
                }}
                placeholder="City or property"
                className="w-full bg-transparent text-[15px] font-semibold text-[var(--hk-ink)] placeholder:text-[var(--hk-muted)]/70 outline-none"
              />
              {destination && (
                <button
                  type="button"
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

          {/* SUGGESTIONS POPOVER */}
          {open === "destination" && (
            <div
              id={listId}
              role="listbox"
              className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-slate-100/80 bg-white p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-top-2 duration-150"
            >
              {!isSearching ? (
                /* DEFAULT SUGGESTED DESTINATIONS */
                <div>
                  <h4 className="px-1 pb-2 text.xs font-semibold text-slate-800">
                    Suggested destinations
                  </h4>
                  <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
                    {DEFAULT_SUGGESTIONS.map((item, idx) => {
                      const IconComp = item.icon;
                      return (
                        <button
                          type="button"
                          key={item.title}
                          role="option"
                          aria-selected={active === idx}
                          onClick={() => {
                            if (item.title === "Nearby" && navigator.geolocation) {
                              navigator.geolocation.getCurrentPosition(
                                () => {
                                  setDestination("Nearby");
                                  setOpen(null);
                                },
                                () => {
                                  setDestination("Nearby");
                                  setOpen(null);
                                }
                              );
                            } else {
                              setDestination(item.query);
                              setOpen(null);
                            }
                          }}
                          className={`flex w-full items-center gap-3.5 rounded-[16px] p-2 text-left transition-colors ${
                            active === idx ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${item.badgeClass}`}>
                            <IconComp className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-slate-900 tracking-tight">{item.title}</p>
                            <p className="truncate text-[13px] font-normal text-slate-500 mt-0.5">{item.subtitle}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* DYNAMIC SEARCH RESULTS MATCHING REFERENCE IMAGE 2 */
                <div>
                  {loading && <p className="px-2 py-3 text-xs font-medium text-slate-500">Finding destinations…</p>}
                  
                  <div className="max-h-[310px] space-y-1 overflow-y-auto pr-1">
                    {helpkey.map((item, i) => (
                      <button
                        role="option"
                        type="button"
                        aria-selected={active === i}
                        key={`${item.type}-${item.label}`}
                        onClick={() => chooseHelpkey(item)}
                        className={`flex w-full items-center gap-3.5 rounded-[16px] p-2 text-left transition-colors ${
                          active === i ? "bg-slate-100" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#F4F4F6] text-slate-800">
                          <Building2 className="h-5 w-5" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-slate-900 tracking-tight">{item.label}</p>
                          <p className="truncate text-[13px] font-normal text-slate-500 mt-0.5">
                            {item.city ? `${item.city} · ` : ""}{item.type === "property" ? "Hotel" : "Destination"}
                          </p>
                        </div>
                      </button>
                    ))}

                    {google.map((item, i) => {
                      const isNeighborhood = item.secondary?.toLowerCase().includes("neighbourhood") || item.secondary?.toLowerCase().includes("locality");
                      const IconComponent = isNeighborhood ? Home : MapPin;
                      return (
                        <button
                          role="option"
                          type="button"
                          aria-selected={active === i + helpkey.length}
                          key={`${item.label}-${i}`}
                          onClick={() => void chooseGoogle(item)}
                          className={`flex w-full items-center gap-3.5 rounded-[16px] p-2 text-left transition-colors ${
                            active === i + helpkey.length ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#F4F4F6] text-slate-800">
                            <IconComponent className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-slate-900 tracking-tight">{item.label}</p>
                            <p className="truncate text-[13px] font-normal text-slate-500 mt-0.5">{item.secondary || "Destination"}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {!loading && !options.length && (
                    <p className="px-2 py-4 text-center text-xs font-medium text-slate-500">
                      No exact match found. Press Search to explore stays in &quot;{destination}&quot;.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* DATES FIELD */}
        <div className="relative">
          <button
            type="button"
            aria-expanded={open === "dates"}
            onClick={() => setOpen(open === "dates" ? null : "dates")}
            className={`group relative flex w-full flex-col justify-center rounded-[14px] border px-4 py-3 text-left transition-all ${
              open === "dates"
                ? "border-[var(--hk-navy-strong)] bg-white ring-2 ring-[var(--hk-navy-strong)]/15 shadow-sm"
                : "border-[rgba(196,198,206,0.72)] bg-white hover:border-[var(--hk-navy-strong)]"
            }`}
          >
            <span className="block text-[10px] font-bold tracking-wider text-[var(--hk-muted)] uppercase">
              DATES
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold text-[var(--hk-ink)]">
              <Calendar className="h-4 w-4 shrink-0 text-[var(--hk-navy-strong)]/80" />
              <span className="truncate">
                {checkIn && checkOut ? `${readable(checkIn)} – ${readable(checkOut)}` : "Select dates"}
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

        {/* GUESTS FIELD */}
        <div className="relative">
          <button
            type="button"
            aria-expanded={open === "guests"}
            onClick={() => setOpen(open === "guests" ? null : "guests")}
            className={`group relative flex w-full flex-col justify-center rounded-[14px] border px-4 py-3 text-left transition-all ${
              open === "guests"
                ? "border-[var(--hk-navy-strong)] bg-white ring-2 ring-[var(--hk-navy-strong)]/15 shadow-sm"
                : "border-[rgba(196,198,206,0.72)] bg-white hover:border-[var(--hk-navy-strong)]"
            }`}
          >
            <span className="block text-[10px] font-bold tracking-wider text-[var(--hk-muted)] uppercase">
              GUESTS
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold text-[var(--hk-ink)] truncate">
              <Users className="h-4 w-4 shrink-0 text-[var(--hk-navy-strong)]/80" />
              <span className="truncate">
                {adults} adult{adults !== 1 ? "s" : ""}
                {children ? `, ${children} child${children !== 1 ? "ren" : ""}` : ""}
                {infants ? `, ${infants} infant${infants !== 1 ? "s" : ""}` : ""}
              </span>
            </span>
          </button>
          {open === "guests" && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_20px_45px_rgba(11,31,58,0.18)]">
              <Counter label="Adults" note="Ages 13+" value={adults} min={1} max={12} onChange={setAdults} />
              <Counter label="Children" note="Ages 2–12" value={children} min={0} max={10} onChange={setChildren} />
              <Counter label="Infants" note="Under 2" value={infants} min={0} max={10} onChange={setInfants} />
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

        {/* SEARCH BUTTON */}
        <button
          type="button"
          onClick={search}
          className="flex items-center justify-center gap-2 rounded-[14px] bg-[var(--hk-navy-strong)] px-6 py-3.5 font-bold text-white shadow-md transition-all hover:bg-[var(--hk-primary)] hover:shadow-lg active:scale-[0.99]"
        >
          <Search className="h-4 w-4" />
          <span>Search hotels</span>
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
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
        <span className="w-4 text-center font-bold text-sm text-slate-800">{value}</span>
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
  const months = [month, new Date(month.getFullYear(), month.getMonth() + 1, 1)];

  return (
    <div
      role="dialog"
      aria-label="Choose travel dates"
      className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(44rem,calc(100vw-2rem))] rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_45px_rgba(11,31,58,0.18)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Previous month"
          className="rounded-full p-1.5 hover:bg-slate-100 text-slate-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <b className="text-sm font-bold text-slate-800">Select check-in, then check-out</b>
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
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
          const between = checkIn && checkOut && key > checkIn && key < checkOut;

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

