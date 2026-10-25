"use client";
import {
  formatMoney,
  cancellationLabel,
} from "@/lib/customer/offer";
import { useSavedHotels } from "@/components/wishlist/use-saved-hotels";

import Link from "next/link";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Bath,
  BedDouble,
  BriefcaseBusiness,
  Calendar,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Dumbbell,
  Heart,
  HelpCircle,
  Hotel,
  Images,
  MapPin,
  Share2,
  ShieldCheck,
  Star,
  Tv,
  Users,
  Utensils,
  Wifi,
  Wind,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/shared/site-header";
import { GuestCounterRow } from "@/components/booking/guest-counter-row";
const HotelGalleryDialog = lazy(() => import("@/components/hotel/hotel-gallery-dialog").then(module => ({ default: module.HotelGalleryDialog })));
const LoginModal = lazy(() => import("@/components/auth/login-modal").then(module => ({ default: module.LoginModal })));
import { Reviews } from "@/components/hotel/hotel-reviews";
import { PublicMediaImage } from "@/components/shared/public-media-image";
import {
  availabilityParams,
  normalizedStay,
  type StaySearch,
} from "@/lib/customer/stay-search";
import { canonicalAmenityKey, amenityLabel } from "@/lib/customer/amenities";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { buildTimeOptions } from "@/components/shared/form-controls";
import { HotelLocation } from "@/components/hotel/hotel-location";
import { GuestRules } from "@/components/hotel/guest-rules";
import type { CatalogDetailProperty } from "@/lib/customer/catalog";
import { localParts } from "@/lib/booking/domain";
import { checkoutInputFromSearchParams } from "@/lib/booking/checkout";

import { useHotelStay } from "@/components/hotel/use-hotel-stay";
import { availabilityRemaining, rememberAvailability, type Availability, type BookableRoom, type HourlyDurationOption } from "@/lib/customer/hotel-availability";

type Property = CatalogDetailProperty;
const money = formatMoney;
const formatHours = (minutes: number) =>
  `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`;

const pad = (n: number) => String(n).padStart(2, "0");
const readableDate = (dateStr: string) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
};

function formatHotelTime(timeStr?: string | null, fallback = "12:00 PM") {
  if (!timeStr || timeStr === "00:00") return fallback;
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return timeStr;
  const m = parts[1] || "00";
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m} ${period}`;
}

export function LiveHotelDetail({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const propertyQuery = useQuery({
    queryKey: queryKeys.property(slug),
    queryFn: ({ signal }) =>
      apiFetch<{ property: Property }>(
        `/api/properties/${encodeURIComponent(slug)}`,
        { signal },
      ),
    staleTime: 60_000,
  });
  const controller = useHotelStay(propertyQuery.data?.property.timezone ?? "Asia/Kolkata");
  const { stay } = controller;
  const queryClient = useQueryClient();
  const availability = useMemo(() => availabilityParams(controller.requested), [controller.requested]);
  const roomsQuery = useQuery({
    queryKey: queryKeys.bookable(slug, Object.fromEntries(availability)),
    queryFn: async ({ signal }) => {
      const started = performance.now();
      const response = await apiFetch<Availability>(
        `/api/properties/${encodeURIComponent(slug)}/bookable?${availability}`, { signal },
      );
      return rememberAvailability(response, performance.now() - started);
    },
    enabled: controller.requested !== null && stay !== null && !controller.pending,
    // Response identity carries its monotonic deadline through cache reuse.
    structuralSharing: false,
    staleTime: (query) => query.state.data
      ? Math.max(0, availabilityRemaining(query.state.data) + Date.now() - query.state.dataUpdatedAt)
      : 0,
    placeholderData: keepPreviousData,
    retry: (count, error) => error instanceof ApiClientError && error.code === "SEARCH_CHANGED" && count < 1,
    retryDelay: 0,
  });
  const [retainedRooms, setRetainedRooms] = useState<Availability>();
  useEffect(() => {
    if (roomsQuery.data && !roomsQuery.isPlaceholderData) {
      // Retain browseable room descriptions after errors, without updating during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRetainedRooms(roomsQuery.data);
    }
  }, [roomsQuery.data, roomsQuery.isPlaceholderData]);
  const displayedRooms = roomsQuery.data ?? retainedRooms;
  const [expiredResult, setExpiredResult] = useState<Availability>();
  const expired = !!roomsQuery.data && (expiredResult === roomsQuery.data || availabilityRemaining(roomsQuery.data) <= 0);
  const refreshRooms = useCallback(() => {
    if (!controller.pending && stay && !roomsQuery.isFetching) void roomsQuery.refetch();
  }, [controller.pending, stay, roomsQuery]);
  useEffect(() => {
    const result = roomsQuery.data;
    if (!result || roomsQuery.isPlaceholderData) return;
    const timer = setTimeout(() => setExpiredResult(result), availabilityRemaining(result));
    return () => clearTimeout(timer);
  }, [roomsQuery.data, roomsQuery.isPlaceholderData]);
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible" && availabilityRemaining(roomsQuery.data) <= 0) refreshRooms();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [roomsQuery.data, refreshRooms]);
  // Disable old work as soon as the draft changes, including the debounce window.
  useEffect(() => {
    if (controller.pending || !stay) void queryClient.cancelQueries({ queryKey: queryKeys.bookable(slug, Object.fromEntries(availability)) });
  }, [controller.pending, stay, queryClient, slug, availability]);
  const checking = !!stay && (controller.pending || roomsQuery.isFetching || roomsQuery.isPlaceholderData);
  const pricesUnavailable = checking || !stay || roomsQuery.isError;
  const offersCurrent = !!stay && !checking && !roomsQuery.isError && !!roomsQuery.data && !expired;
  const [shareMessage, setShareMessage] = useState("");
  const share = async () => {
    const url = new URL(
      `/hotels/${encodeURIComponent(slug)}`,
      window.location.origin,
    ).href;
    try {
      if (navigator.share)
        await navigator.share({
          title: propertyQuery.data?.property.name,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Hotel link copied.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("Hotel link copied.");
      } catch {
        setShareMessage(
          "Unable to share this hotel. Copy the page address to share it.",
        );
      }
    }
  };
  const property = propertyQuery.data?.property ?? null;
  const rooms = displayedRooms?.rooms ?? [];
  const roomsLoading = roomsQuery.isLoading;
  const error = propertyQuery.error;
  const stayKey = JSON.stringify(normalizedStay(stay));
  const [selection, setSelection] = useState<{
    stayKey: string;
    choice: string;
    signature: string;
  } | null>(null);
  const selectedChoice = selection?.stayKey === stayKey ? selection.choice : "";
  const acceptedOffer =
    selection?.stayKey === stayKey ? selection.signature : "";
  const signature = (choice: string) => {
    const [roomId, rateId] = choice.split(":");
    const rate = rooms
      .find((room) => room.id === roomId)
      ?.rates.find((rate) => rate.id === rateId);
    return rate
      ? JSON.stringify([
          choice,
          rate.totalPaise,
          rate.payableNowPaise,
          rate.balanceDuePaise,
          rate.startAt,
          rate.endAt,
          rate.cancellationTerms,
          rate.breakfastIncluded,
        ])
      : "";
  };
  const setSelectedChoice = (choice: string) => {
    if (pricesUnavailable) return;
    setSelection({ stayKey, choice, signature: signature(choice) });
    const [roomId, rateId] = choice.split(":");
    const rate = rooms
      .find((room) => room.id === roomId)
      ?.rates.find((rate) => rate.id === rateId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("roomTypeId", roomId);
    params.set("ratePlanId", rateId);
    params.delete("room");
    params.delete("rate");
    if (rate?.totalPaise != null)
      params.set("searchTotalPaise", String(rate.totalPaise));
    else params.delete("searchTotalPaise");
    window.history.replaceState(
      null,
      "",
      `/hotels/${encodeURIComponent(slug)}?${params}`,
    );
  };

  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const favorites = useSavedHotels(property ? [property.id] : [], () =>
    setIsLoginOpen(true),
  );
  const saved = !!property && favorites.savedIds.has(property.id);

  useEffect(() => {
    if (searchParams.get("reserve") !== "1") return;
    document
      .getElementById("reserve")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchParams]);

  if (error)
    return (
      <main className="mx-auto max-w-3xl p-12 text-center">
        <h1 className="text-2xl font-bold">
          {error instanceof ApiClientError && error.status === 404
            ? "Property unavailable"
            : "Unable to load this property"}
        </h1>
        <p className="mt-3 text-[var(--hk-muted)]">
          {error instanceof ApiClientError && error.status === 404
            ? "This stay is not currently available to book."
            : "There was a temporary problem loading this stay."}
        </p>
        <button
          onClick={() => void propertyQuery.refetch()}
          className="mt-4 block w-full underline"
        >
          Try again
        </button>
        <Link
          href="/search"
          className="mt-6 inline-block rounded-lg bg-[var(--hk-navy-strong)] px-5 py-3 text-sm font-bold text-white"
        >
          Browse stays
        </Link>
      </main>
    );

  if (!property)
    return (
      <main
        className="min-h-screen bg-[var(--hk-ivory)] px-4 py-8 sm:px-6 lg:px-10"
        aria-label="Loading property"
      >
        <div className="mx-auto max-w-[1280px] animate-pulse space-y-6">
          <div className="h-4 w-48 rounded bg-slate-200" />
          <div className="h-12 w-2/5 rounded bg-slate-200" />
          <div className="grid gap-3 [grid-auto-rows:130px] sm:grid-cols-3 lg:[grid-auto-rows:175px]">
            <div className="col-span-2 row-span-2 rounded-2xl bg-slate-200" />
            <div className="rounded-2xl bg-slate-200" />
            <div className="rounded-2xl bg-slate-200" />
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="h-8 w-52 rounded bg-slate-200" />
              <div className="h-44 rounded-2xl bg-slate-200" />
            </div>
            <div className="h-96 rounded-2xl bg-slate-200" />
          </div>
        </div>
      </main>
    );

  const rating = property.ratingAverage;
  const linkedRoom = searchParams.get("roomTypeId") ?? searchParams.get("room");
  const linkedRateId =
    searchParams.get("ratePlanId") ?? searchParams.get("rate");
  const linkedMode = linkedRateId
    ? displayedRooms?.ratePlanModes?.[linkedRateId]
    : undefined;
  const linkedChoice =
    linkedRoom &&
    linkedRateId &&
    (!linkedMode || linkedMode === (stay?.bookingMode ?? "overnight"))
      ? `${linkedRoom}:${linkedRateId}`
      : "";
  const preferredChoice = selectedChoice || linkedChoice;
  const linkedRate = rooms
    .flatMap((room) => room.rates.map((rate) => ({ room, rate })))
    .find(({ room, rate }) => `${room.id}:${rate.id}` === linkedChoice)?.rate;
  const effectiveSelectedChoice = rooms.some((room) =>
    room.rates.some((rate) => `${room.id}:${rate.id}` === preferredChoice),
  )
    ? preferredChoice
    : "";
  const offerChanged =
    !!preferredChoice &&
    offersCurrent &&
    roomsQuery.isSuccess &&
    (!effectiveSelectedChoice ||
      (acceptedOffer
        ? acceptedOffer !== signature(preferredChoice)
        : !!linkedChoice &&
          (!linkedRate ||
            (searchParams.has("searchTotalPaise") &&
              linkedRate.totalPaise !==
                Number(searchParams.get("searchTotalPaise"))))));
  const reviewCount = property.ratingCount;
  const location = `${property.city}${property.state ? `, ${property.state}` : ""}`;
  const chosenRate = rooms
    .flatMap((room) =>
      room.rates.map((rate) => ({ choice: `${room.id}:${rate.id}`, rate })),
    )
    .find((item) => item.choice === effectiveSelectedChoice)?.rate;
  const mobilePrice = stay?.checkIn
    ? chosenRate?.totalPaise != null && !offerChanged
      ? `${money(chosenRate.totalPaise, property.currency)} total`
      : "Choose a room to see total"
    : `From ${money(property.minimumPricePaise, property.currency)} per night`;

  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SiteHeader availableStayTypes={property.bookingModes.map(mode => mode === "hourly" ? "dayuse" : "overnight")} onLoginClick={() => setIsLoginOpen(true)} stayType={controller.draft.bookingMode === "hourly" ? "dayuse" : "overnight"}
        onStayTypeChange={(mode) => controller.switchMode(mode === "dayuse" ? "hourly" : "overnight")} />
      {/* Floating status notifications */}
      <div className="fixed top-20 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {shareMessage && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[var(--hk-navy)] px-4 py-2.5 text-xs font-semibold text-white shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <Check className="h-4 w-4 text-[var(--hk-gold-light)]" />
            <span>{shareMessage}</span>
          </div>
        )}
        {checking && rooms.length > 0 && (
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 backdrop-blur-md px-3.5 py-2 text-xs font-medium text-[var(--hk-navy)] shadow-lg animate-in fade-in duration-200"
          >
            <span className="h-2 w-2 rounded-full bg-[var(--hk-gold)] animate-pulse" />
            <span>Updating availability…</span>
          </div>
        )}
      </div>

      <main className="mx-auto max-w-[1280px] px-4 py-7 pb-28 lg:pb-7 sm:px-6 lg:px-10">
        {!stay && (
          <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">
            Check your dates and guest counts, then apply a valid stay below.
          </p>
        )}
        {favorites.error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {favorites.error}
          </p>
        )}
        {offerChanged && (
          <p
            role="status"
            className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900"
          >
            The room or price from your search has changed. Review the current
            room options and price before continuing.
          </p>
        )}
        {roomsQuery.error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {roomsQuery.error instanceof ApiClientError &&
            roomsQuery.error.status === 404
              ? "This property is no longer available."
              : roomsQuery.error instanceof ApiClientError &&
                  roomsQuery.error.status === 422
                ? "Check your dates and guest counts."
                : "Unable to update rooms right now."}{" "}
            <button
              type="button"
              onClick={() => void roomsQuery.refetch()}
              className="underline"
            >
              Try again
            </button>
          </p>
        )}
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex flex-wrap items-center gap-2 text-xs text-[var(--hk-muted)]"
        >
          <Link
            href="/"
            className="hover:text-[var(--hk-navy)] transition-colors"
          >
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <Link
            href={`/search${searchParams.toString() ? `?${searchParams}` : ""}`}
            className="hover:text-[var(--hk-navy)] transition-colors"
          >
            Search results
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <Link
            href={`/search?destination=${encodeURIComponent(property.city)}`}
            className="hover:text-[var(--hk-navy)] transition-colors"
          >
            {property.city}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          <span className="font-semibold text-[var(--hk-navy)] truncate max-w-xs">
            {property.name}
          </span>
        </nav>

        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--hk-surface-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--hk-navy)] uppercase tracking-wide">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--hk-navy)]" />
                Verified Stay
              </span>
              {property.propertyType && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 capitalize">
                  {property.propertyType}
                </span>
              )}
              {property.bookingModes?.includes("hourly") && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  <Clock className="h-3 w-3" />
                  Hourly Stays Available
                </span>
              )}
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--hk-navy)] sm:text-4xl lg:text-5xl">
              {property.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <a
                href="#location"
                className="flex items-center gap-1 text-[var(--hk-muted)] hover:text-[var(--hk-navy)] transition underline-offset-2 hover:underline"
              >
                <MapPin className="h-4 w-4 text-[var(--hk-navy)] shrink-0" />
                <span>{location}</span>
              </a>
              <span className="text-slate-300">•</span>
              {reviewCount > 0 && rating > 0 ? (
                <a
                  href="#reviews"
                  className="inline-flex items-center gap-1.5 font-semibold text-[var(--hk-navy)] hover:text-[var(--hk-gold)] transition"
                >
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--hk-navy)] px-2 py-0.5 text-xs font-bold text-white shadow-2xs">
                    <Star className="h-3 w-3 fill-[var(--hk-gold-light)] text-[var(--hk-gold-light)]" />
                    {rating.toFixed(1)}
                  </span>
                  <span className="text-[var(--hk-muted)] underline-offset-2 hover:underline">
                    ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
                  </span>
                </a>
              ) : (
                <a
                  href="#reviews"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--hk-muted)] hover:text-[var(--hk-navy)]"
                >
                  <Star className="h-3.5 w-3.5 text-slate-300" />
                  No reviews yet
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-end">
            <button
              type="button"
              onClick={() => void share()}
              className="group flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hk-navy)] shadow-xs hover:border-[var(--hk-navy)] hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              <Share2 className="h-4 w-4 transition-transform group-hover:scale-110" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={() => property && favorites.toggle(property.id)}
              disabled={favorites.busy}
              aria-pressed={saved}
              className={`group flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-xs active:scale-[0.98] transition-all ${
                saved
                  ? "border-amber-300 bg-amber-50/70 text-amber-900"
                  : "border-slate-200 bg-white text-[var(--hk-navy)] hover:border-[var(--hk-navy)] hover:bg-slate-50"
              }`}
            >
              <Heart
                className={`h-4 w-4 transition-transform group-hover:scale-110 ${
                  saved
                    ? "fill-[var(--hk-gold-strong)] text-[var(--hk-gold-strong)]"
                    : ""
                }`}
              />
              <span>{saved ? "Saved" : "Save"}</span>
            </button>
          </div>
        </div>

        <Gallery property={property} />

        <div className="mt-8 grid gap-10 lg:grid-cols-3">
          <div className="space-y-14 lg:col-span-2">
            <HotelOverview property={property} />

            <section
              id="rooms"
              className="scroll-mt-24"
              aria-busy={checking}
            >
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-bold text-[var(--hk-navy)]">
                  Available rooms
                </h2>
                <span className="text-sm text-[var(--hk-muted)]">
                  Select a room to continue
                </span>
              </div>
              <div className="mt-6 space-y-5">
                {roomsLoading && (
                  <div className="min-h-48 rounded-xl border border-slate-200 bg-white p-6" role="status">
                    <p className="text-sm text-[var(--hk-muted)]">Loading available rooms...</p>
                    <div aria-hidden="true" className="mt-4 space-y-4 animate-pulse motion-reduce:animate-none"><div className="h-7 w-2/3 rounded bg-slate-100" /><div className="h-16 rounded bg-slate-100" /></div>
                  </div>
                )}
                {!roomsLoading && !roomsQuery.error && rooms.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--hk-border-strong)] bg-white p-6 text-sm text-[var(--hk-muted)]">
                    {property.childrenPolicy?.allowed === false &&
                    (stay?.children ?? 0) + (stay?.infants ?? 0) > 0
                      ? "This property does not allow children or infants. Choose another property or update your guests."
                      : "No rooms match this stay and guest count. Try different dates or guests."}
                  </div>
                )}
                {rooms.map((room) => {
                  const preferredRate = room.rates.find(
                    (rate) =>
                      `${room.id}:${rate.id}` === effectiveSelectedChoice,
                  );
                  const cheapest =
                    preferredRate ??
                    room.rates.reduce(
                      (min, rate) =>
                        (rate.totalPaise ?? rate.basePricePaise) <
                        (min.totalPaise ?? min.basePricePaise)
                          ? rate
                          : min,
                      room.rates[0],
                    );
                  const choice = `${room.id}:${cheapest.id}`;
                  return (
                    <div key={room.id} className="space-y-2">
                      <RoomCard
                        key={room.id}
                        title={room.name}
                        description={
                          room.description ||
                          "See room amenities and booking terms below."
                        }
                        tags={
                          [
                            room.roomSizeSqFt
                              ? `${room.roomSizeSqFt} sq ft`
                              : null,
                            `${room.maxOccupancy} guests`,
                            ...(room.bedConfigurations ?? [])
                              .slice(0, 1)
                              .map(
                                (bed) =>
                                  `${bed.count} ${bed.bedType.replaceAll("_", " ")} ${bed.count === 1 ? "bed" : "beds"}`,
                              ),
                            ...room.amenityCodes.map(amenityLabel),
                            room.maxInfants
                              ? `Up to ${room.maxInfants} ${room.maxInfants === 1 ? "infant" : "infants"}`
                              : null,
                          ].filter(Boolean) as string[]
                        }
                        price={pricesUnavailable ? null : cheapest.totalPaise ?? cheapest.basePricePaise}
                        checking={checking}
                        disabled={pricesUnavailable}
                        from={!stay?.checkIn}
                        priceLabel={
                          stay?.bookingMode === "hourly"
                            ? `for ${formatHours(stay.durationMinutes ?? 0)}`
                            : stay?.checkIn && cheapest.nights
                              ? `for ${cheapest.nights} ${cheapest.nights === 1 ? "night" : "nights"}`
                              : "per night"
                        }
                        currency={property.currency}
                        image={room.imageUrl}
                        imageSrcSet={room.imageSrcSet}
                        imageWidth={room.imageWidth}
                        imageHeight={room.imageHeight}
                        selected={
                          !offerChanged &&
                          effectiveSelectedChoice.startsWith(`${room.id}:`)
                        }
                        onSelect={() => setSelectedChoice(choice)}
                        cancellation={
                          !pricesUnavailable && cheapest.cancellationTerms
                            ? cancellationLabel(
                                cheapest.cancellationTerms,
                                property.timezone ?? "Asia/Kolkata",
                              )
                            : null
                        }
                        breakfastIncluded={!pricesUnavailable && cheapest.breakfastIncluded === true}
                        guests={room.maxOccupancy}
                        premium={false}
                      />
                      {!pricesUnavailable && room.rates.length > 1 && (
                        <details className="group mt-3 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-2xs transition-all">
                          <summary className="flex cursor-pointer items-center justify-between text-sm font-bold text-[var(--hk-navy)] select-none">
                            <span className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--hk-navy)] text-[10px] font-extrabold text-white">
                                {room.rates.length}
                              </span>
                              <span>View {room.rates.length} rates</span>
                            </span>
                            <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 group-open:text-[var(--hk-navy)]">
                              <span className="hidden sm:inline">
                                Compare options
                              </span>
                              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                            </span>
                          </summary>
                          <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3">
                            {room.rates.map((rate) => {
                              const isSelected =
                                effectiveSelectedChoice ===
                                `${room.id}:${rate.id}`;
                              return (
                                <button
                                  key={rate.id}
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() =>
                                    setSelectedChoice(`${room.id}:${rate.id}`)
                                  }
                                  className={`group/rate block w-full rounded-xl border p-3.5 text-left transition-all ${
                                    isSelected
                                      ? "border-[var(--hk-navy)] bg-slate-50 ring-2 ring-[var(--hk-navy)]/15 shadow-xs"
                                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <b className="text-sm sm:text-base font-bold text-[var(--hk-navy)]">
                                        {rate.name} ·{" "}
                                        {!stay?.checkIn && "From "}
                                        {money(
                                          rate.totalPaise ??
                                            rate.basePricePaise,
                                          property.currency,
                                        )}
                                      </b>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {rate.paymentMode === "deposit"
                                          ? rate.totalPaise != null
                                            ? `Pay now ${money(rate.payableNowPaise ?? null, property.currency)}; balance ${money(rate.balanceDuePaise ?? null, property.currency)}`
                                            : "Deposit payment; choose dates for exact amounts"
                                          : rate.paymentMode ===
                                              "pay_at_property"
                                            ? "Pay at property"
                                            : "Pay online"}
                                      </p>
                                    </div>
                                    <span
                                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                        isSelected
                                          ? "bg-[var(--hk-navy)] text-white shadow-2xs"
                                          : "bg-slate-100 text-slate-600 group-hover/rate:bg-slate-200"
                                      }`}
                                    >
                                      {isSelected ? "Selected" : "Select"}
                                    </span>
                                  </div>
                                  {(rate.cancellation ||
                                    rate.cancellationTerms ||
                                    rate.breakfastIncluded) && (
                                    <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2 text-xs">
                                      {rate.cancellation && (
                                        <p className="flex items-center gap-1.5 font-medium text-emerald-700">
                                          <Check className="h-3.5 w-3.5 stroke-[2.5] text-emerald-600 shrink-0" />
                                          <span>
                                            {rate.cancellation.name}:{" "}
                                            {rate.cancellation.description}
                                          </span>
                                        </p>
                                      )}
                                      {rate.cancellationTerms && (
                                        <p className="text-slate-500">
                                          {cancellationLabel(
                                            rate.cancellationTerms,
                                            property.timezone,
                                          )}
                                        </p>
                                      )}
                                      {rate.breakfastIncluded && (
                                        <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
                                          <Coffee className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                          Breakfast included
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <HotelLocation property={property} />
            <HotelPolicies property={property} />
            <Reviews property={property} />
          </div>

          <BookingCard
            offersCurrent={offersCurrent && !offerChanged}
            onRefresh={() => void refreshRooms()}
            property={property}
            rating={rating}
            rooms={rooms}
            hourlyDurations={displayedRooms?.hourlyDurations ?? []}
            selectedChoice={effectiveSelectedChoice}
            onChoiceChange={setSelectedChoice}
            initialStay={controller.draft}
            onStayChange={controller.update}
            onModeChange={controller.switchMode}
            checking={checking}
            expired={expired}
            failed={roomsQuery.isError}
            invalid={!stay}
            canReserve={() => offersCurrent && availabilityRemaining(roomsQuery.data) > 0}
          />
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-slate-200/90 bg-white/95 backdrop-blur-md px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] shadow-xl lg:hidden">
        <div className="min-w-0">
          <span className="block text-sm sm:text-base font-extrabold text-[var(--hk-navy)] truncate">
            {checking ? "Checking availability…" : pricesUnavailable ? "Choose a valid stay" : mobilePrice}
          </span>
          <span className="block text-[11px] text-slate-400">
            {stay?.checkIn
              ? "Taxes & fees included"
              : "Select stay dates for final total"}
          </span>
        </div>
        <a
          href="#reserve"
          className="shrink-0 rounded-xl bg-[var(--hk-navy)] px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-slate-800 active:scale-95 transition"
        >
          Choose room
        </a>
      </div>
      {isLoginOpen && <Suspense fallback={null}><LoginModal
        isOpen={isLoginOpen}
        onClose={() => {
          setIsLoginOpen(false);
          favorites.cancelPending();
        }}
        onSuccess={() => {
          setIsLoginOpen(false);
          favorites.resumePending();
        }}
      /></Suspense>}
    </div>
  );
}

const Gallery = memo(function Gallery({ property }: { property: Property }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeGallery = useCallback(() => setActiveIndex(null), []);
  const images = useMemo(() => property.images.length
    ? property.images
    : property.coverImageUrl
      ? [
          {
            id: "cover",
            imageUrl: property.coverImageUrl,
            imageSrcSet: property.coverImageSrcSet,
            altText: property.name,
          },
        ]
      : [], [property]);
  if (!images.length)
    return (
      <section
        aria-label="Property photos"
        className="flex h-72 items-center justify-center rounded-2xl bg-[var(--hk-surface-muted)] text-[var(--hk-muted)]"
      >
        <span className="flex items-center gap-2">
          <Hotel className="h-9 w-9" /> Photo unavailable
        </span>
      </section>
    );

  return (
    <>
      <section
        aria-label="Property photos"
        className="grid grid-cols-2 gap-3 [grid-auto-rows:130px] sm:grid-cols-3 sm:[grid-auto-rows:160px] lg:grid-cols-4 lg:[grid-auto-rows:175px]"
      >
        {images.slice(0, 5).map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`group relative overflow-hidden rounded-2xl bg-[var(--hk-surface-muted)] text-left shadow-[var(--hk-shadow-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hk-navy)] ${
              index === 0 ? "col-span-2 row-span-2" : "hidden sm:block"
            }`}
          >
            <PublicMediaImage
              src={image.imageUrl}
              srcSet={image.imageSrcSet}
              alt={image.altText || `${property.name} photo ${index + 1}`}
              sizes={
                index === 0
                  ? "(min-width: 1280px) 600px, (min-width: 1024px) 50vw, (min-width: 640px) 67vw, 100vw"
                  : "(min-width: 1280px) 294px, (min-width: 1024px) 25vw, 33vw"
              }
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
            {index === 0 && (
              <span className="absolute bottom-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-xl bg-white/95 backdrop-blur-md px-3.5 py-2 text-xs font-bold text-[var(--hk-navy)] shadow-md border border-white/60 transition group-hover:bg-white group-hover:shadow-lg">
                <Images className="h-3.5 w-3.5 text-[var(--hk-navy)]" />
                View all {images.length}{" "}
                {images.length === 1 ? "photo" : "photos"}
              </span>
            )}
          </button>
        ))}
      </section>

      {activeIndex !== null && <Suspense fallback={<div role="status" className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/95 text-white"><button onClick={() => setActiveIndex(null)}>Loading photos… · Close</button></div>}>
        <HotelGalleryDialog images={images} activeIndex={activeIndex} propertyName={property.name} onIndexChange={setActiveIndex} onClose={closeGallery} />
      </Suspense>}
    </>
  );
});

const HotelPolicies = memo(function HotelPolicies({ property }: { property: Property }) {
  return (
            <section id="policies" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-bold text-[var(--hk-navy)]">
                Good to know
              </h2>
              <p className="text-sm font-medium text-slate-700">
                Check-in from{" "}
                <span className="font-semibold text-[var(--hk-navy)]">
                  {formatHotelTime(property.checkInTime, "12:00 PM")}
                </span>{" "}
                · Check-out until{" "}
                <span className="font-semibold text-[var(--hk-navy)]">
                  {formatHotelTime(property.checkOutTime, "11:00 AM")}
                </span>
              </p>
              <GuestRules property={property} />
              <p className="text-xs text-[var(--hk-muted)]">
                Cancellation and payment terms depend on your selected rate.
              </p>
            </section>
  );
});

const HotelOverview = memo(function HotelOverview({ property }: { property: Property }) {
  const amenities = property.propertyAmenityCodes ?? [];
  return <>
            <section id="overview" className="scroll-mt-24 space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--hk-navy)]">
                About this stay
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-slate-600 font-normal">
                {property.description ||
                  "A description has not been provided for this property."}
              </p>
            </section>

            <section id="amenities" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--hk-navy)]">
                Premium amenities
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-8 pt-1">
                {amenities.map((amenity) => (
                  <Amenity key={amenity} code={amenity} />
                ))}
                {!amenities.length && (
                  <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-white p-6 text-sm text-[var(--hk-muted)]">
                    Amenities are not listed for this stay.
                  </div>
                )}
              </div>
            </section>

  </>;
});

function Amenity({ code }: { code: string }) {
  const icons: Record<string, typeof Wifi> = {
    wifi: Wifi,
    fast_wifi: Wifi,
    restaurant: Utensils,
    dining: Utensils,
    gym: Dumbbell,
    fitness_center: Dumbbell,
    breakfast: Coffee,
    coffee: Coffee,
    hot_water: Bath,
    geyser: Bath,
    business_center: BriefcaseBusiness,
    air_conditioning: Wind,
    ac: Wind,
    power_backup: Zap,
    generator: Zap,
    room_service: Utensils,
    lift: ArrowUpDown,
    elevator: ArrowUpDown,
    parking: Car,
    free_parking: Car,
    cctv: ShieldCheck,
    security: ShieldCheck,
    tv: Tv,
    smart_tv: Tv,
    housekeeping: HelpCircle,
  };
  const key = canonicalAmenityKey(code);
  const Icon = icons[key] ?? Hotel;
  const label = amenityLabel(code);
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9edff] text-[#0b1f3a]">
        <Icon className="h-4.5 w-4.5 stroke-[1.8]" />
      </span>
      <span className="text-sm font-medium text-slate-800">{label}</span>
    </div>
  );
}

function RoomCard({
  title,
  description,
  tags,
  price,
  currency,
  image,
  imageSrcSet,
  imageWidth,
  imageHeight,
  checking,
  disabled,
  selected,
  onSelect,
  cancellation,
  breakfastIncluded,
  guests,
  premium = false,
  priceLabel = "per night",
  from = false,
}: {
  title: string;
  description: string;
  tags: string[];
  price: number | null;
  currency: string;
  image: string | null;
  imageSrcSet?: string;
  imageWidth?: number;
  imageHeight?: number;
  checking: boolean;
  disabled: boolean;
  selected: boolean;
  onSelect: () => void;
  cancellation?: string | null;
  breakfastIncluded?: boolean;
  guests: number;
  premium?: boolean;
  priceLabel?: string;
  from?: boolean;
}) {
  return (
    <article
      className={`relative flex cursor-pointer flex-col gap-5 rounded-2xl border p-5 transition-all md:flex-row ${
        selected
          ? "border-[var(--hk-navy)] ring-2 ring-[var(--hk-navy)]/20 bg-slate-50/70 shadow-md"
          : premium
            ? "border-amber-300 bg-white hover:border-[var(--hk-navy)]/60 hover:shadow-md"
            : "border-slate-200/90 bg-white hover:border-slate-400 hover:shadow-md"
      }`}
    >
      {premium && (
        <span className="absolute right-0 top-0 rounded-tr-2xl rounded-bl-xl bg-[var(--hk-navy)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm">
          PREMIUM
        </span>
      )}
      <div className="h-48 overflow-hidden rounded-xl bg-slate-100 md:w-1/3 md:shrink-0 relative">
        {image ? (
          <PublicMediaImage
            src={image}
            srcSet={imageSrcSet}
            width={imageWidth}
            height={imageHeight}
            sizes="(min-width: 1024px) 240px, (min-width: 768px) 30vw, 100vw"
            alt={title}
            className="h-full w-full object-cover transition duration-300 hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-radial from-slate-100 to-slate-200">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <BedDouble className="h-4 w-4" /> Photo unavailable
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <div className="flex justify-between items-start gap-3">
            <h3 className="text-lg sm:text-xl font-bold text-[var(--hk-navy)]">
              {title}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 shrink-0">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              Up to {guests} guests
            </span>
          </div>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-500">
            {description}
          </p>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-slate-100/90 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-xl sm:text-2xl font-black text-[var(--hk-navy)]">
              {from && "From "}
              {checking ? <span aria-label="Checking room price" className="inline-block h-7 w-24 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" /> : money(price, currency)}{" "}
              <span className="text-xs font-normal text-slate-400">
                {priceLabel}
              </span>
            </p>
            {cancellation ? (
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5 stroke-[3]" />
                {cancellation}
              </p>
            ) : (
              <p className="mt-1 text-xs font-medium text-slate-400">
                See cancellation terms
              </p>
            )}
            {breakfastIncluded && (
              <p className="mt-1 text-xs font-semibold text-emerald-700">
                Breakfast included
              </p>
            )}
          </div>

          <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={`inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-xs font-bold transition-all shadow-xs active:scale-[0.98] ${
              selected
                ? "bg-[var(--hk-navy)] text-white ring-2 ring-[var(--hk-navy)]/20 shadow-sm"
                : "border border-slate-300 bg-white text-slate-800 hover:border-[var(--hk-navy)] hover:text-[var(--hk-navy)] hover:bg-slate-50"
            }`}
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </div>
    </article>
  );
}

function BookingCard({
  offersCurrent,
  onRefresh,
  hourlyDurations,
  property,
  rating,
  rooms,
  selectedChoice,
  onChoiceChange,
  initialStay,
  onStayChange,
  onModeChange,
  checking,
  expired,
  failed,
  invalid,
  canReserve,
}: {
  offersCurrent: boolean;
  onRefresh: () => void;
  property: Property;
  rating: number;
  rooms: BookableRoom[];
  hourlyDurations: HourlyDurationOption[];
  selectedChoice: string;
  onChoiceChange: (value: string) => void;
  initialStay: StaySearch | null;
  onStayChange: (value: Partial<StaySearch>, debounce?: boolean) => void;
  onModeChange: (mode: "overnight" | "hourly") => void;
  checking: boolean;
  expired: boolean;
  failed: boolean;
  invalid: boolean;
  canReserve: () => boolean;
}) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const today = localParts(currentTime, property.timezone ?? "Asia/Kolkata").date;
  const hourly = initialStay?.bookingMode === "hourly";
  const checkIn = initialStay?.checkIn ?? "";
  const checkOut = initialStay?.checkOut ?? "";
  const adults = initialStay?.adults ?? 2;
  const children = initialStay?.children ?? 0;
  const infants = initialStay?.infants ?? 0;
  const arrivalTime = initialStay?.arrivalTime ?? "10:00";
  const durationMinutes = initialStay?.durationMinutes ?? 180;
  const [openPopover, setOpenPopover] = useState<
    "calendar" | "guests" | "rooms" | null
  >(null);
  const arrivalTimeOptions = useMemo(() => {
    const options = buildTimeOptions(15);
    if (checkIn !== today) return options;

    const currentLocalTime = localParts(
      currentTime,
      property.timezone ?? "Asia/Kolkata",
    ).time;
    return options.filter((option) => option.value > currentLocalTime);
  }, [checkIn, currentTime, property.timezone, today]);
  const displayedArrivalTime = arrivalTimeOptions.some(
    (option) => option.value === arrivalTime,
  )
    ? arrivalTime
    : (arrivalTimeOptions[0]?.value ?? "");

  const [roomId, rateId] = selectedChoice.split(":");
  const selectedRoom = rooms.find((room) => room.id === roomId);
  const selected = selectedRoom?.rates.find((rate) => rate.id === rateId);
  const durationRows = hourlyDurations
    .filter((option) => !selectedRoom || option.roomTypeId === roomId)
    .flatMap((option) => option.prices);
  const durationOptions = [...new Set(durationRows.map((row) => row.hours))]
    .sort((a, b) => a - b)
    .map((hours) => ({
      hours,
      pricePaise: Math.min(
        ...durationRows
          .filter((row) => row.hours === hours)
          .map((row) => row.pricePaise),
      ),
    }));
  const guestCount = adults + children;
  const capacityOk = selectedRoom
    ? adults <= selectedRoom.maxAdults &&
      children <= selectedRoom.maxChildren &&
      infants <= (selectedRoom.maxInfants ?? 10) &&
      guestCount <= selectedRoom.maxOccupancy
    : false;
  const valid = Boolean(
    offersCurrent &&
    (!hourly ||
      (arrivalTime === initialStay?.arrivalTime &&
        durationMinutes === initialStay?.durationMinutes)) &&
    selected?.totalPaise != null &&
    selected.validUntil &&
    checkIn === initialStay?.checkIn &&
    (hourly || checkOut === initialStay?.checkOut) &&
    adults === initialStay?.adults &&
    children === initialStay?.children &&
    infants === initialStay?.infants &&
    checkIn >= today &&
    (initialStay?.bookingMode === "hourly"
      ? Boolean(
          initialStay.arrivalTime &&
          initialStay.durationMinutes &&
          arrivalTimeOptions.some(
            (option) => option.value === initialStay.arrivalTime,
          ),
        )
      : checkOut > checkIn) &&
    adults > 0 &&
    capacityOk,
  );
  const query = new URLSearchParams({
    ...(initialStay?.bookingMode === "hourly"
      ? {
          bookingMode: "hourly",
          arrivalTime: initialStay.arrivalTime ?? "",
          durationMinutes: String(initialStay.durationMinutes ?? ""),
        }
      : {}),
    property: property.slug,
    room: roomId ?? "",
    rate: rateId ?? "",
    checkIn,
    ...(initialStay?.bookingMode === "hourly" ? {} : { checkOut }),
    adults: String(adults),
    children: String(children),
    infants: String(infants),
  }).toString();
  const checkoutInput = useMemo(
    () =>
      checkoutInputFromSearchParams(
        Object.fromEntries(new URLSearchParams(query)),
      ),
    [query],
  );

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenPopover(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!openPopover) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPopover(null);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [openPopover]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hourly || checkIn !== today || !arrivalTimeOptions.length || arrivalTimeOptions.some(option => option.value === arrivalTime)) return;
    onStayChange({ arrivalTime: arrivalTimeOptions[0].value }, true);
  }, [hourly, checkIn, today, arrivalTimeOptions, arrivalTime, onStayChange]);

  const persistStay = onStayChange;
  const switchMode = onModeChange;

  return (
    <aside
      id="reserve"
      className="relative min-w-0 scroll-mt-28"
      ref={containerRef}
    >
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
        {property.bookingModes?.includes("hourly") && (
          <div
            role="group"
            aria-label="Stay type"
            className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {(["overnight", "hourly"] as const)
              .filter((mode) => property.bookingModes?.includes(mode))
              .map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={(hourly ? "hourly" : "overnight") === mode}
                  onClick={() => switchMode(mode)}
                  className={`rounded-lg px-3 py-2 text-xs font-bold ${(hourly ? "hourly" : "overnight") === mode ? "bg-[var(--hk-navy)] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                >
                  {mode === "hourly" ? "Hourly stay" : "Overnight stay"}
                </button>
              ))}
          </div>
        )}

        {/* Header Price & Rating */}
        <div className="flex items-end justify-between border-b border-slate-100 pb-5">
          <div>
            <span aria-busy={checking} className="inline-flex min-h-10 items-center text-3xl font-bold text-[#0F172A]">
              {checking ? <span aria-label="Checking price" className="text-sm font-medium text-slate-500">Checking price…</span> : invalid || failed ? "Price unavailable" : <>
              {initialStay?.checkIn && !selected
                ? "Choose a room"
                : selected
                  ? `${!initialStay?.checkIn ? "From " : ""}${money(selected.totalPaise ?? selected.basePricePaise, property.currency)}`
                  : `${!initialStay?.checkIn ? "From " : ""}${money(property.minimumPricePaise, property.currency)}`}</>}
            </span>
            {!checking && (!initialStay?.checkIn || selected) && (
              <span className="text-sm font-normal text-slate-500">
                {" "}
                {hourly
                  ? `for ${formatHours(initialStay?.durationMinutes ?? 0)}`
                  : initialStay?.checkIn
                    ? `for ${selected?.nights ?? 0} ${selected?.nights === 1 ? "night" : "nights"}`
                    : "per night"}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-sm font-bold text-[#0F172A]">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            {property.ratingCount ? rating.toFixed(1) : "No reviews yet"}
          </span>
        </div>

        {!initialStay?.checkIn && (
          <p className="mt-3 text-xs text-[var(--hk-muted)]">
            Choose dates to check availability and the final total.
          </p>
        )}
        {/* Custom Datepicker Fields */}
        {hourly && !checking && !hourlyDurations.length && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
            Hourly prices are not configured for these guests yet. Try an
            overnight stay.
          </p>
        )}
        {hourly && (
          <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
            <label className="block">
              Arrival date
              <input
                aria-label="Arrival date"
                type="date"
                min={today}
                value={checkIn}
                onChange={(event) => {
                  persistStay({
                    checkIn: event.target.value,
                    checkOut: undefined,
                  }, true);
                }}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Local arrival time
                <select
                  aria-label="Local arrival time"
                  value={displayedArrivalTime}
                  onChange={(event) => {
                    persistStay({
                      arrivalTime: event.target.value,
                      durationMinutes,
                    }, true);
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  disabled={!arrivalTimeOptions.length}
                >
                  {arrivalTimeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Guest duration
                <select
                  aria-label="Guest duration"
                  value={durationMinutes}
                  onChange={(event) => {
                    persistStay({
                      durationMinutes: Number(event.target.value),
                      arrivalTime,
                    }, true);
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {!durationOptions.some(
                    (row) => row.hours * 60 === initialStay?.durationMinutes,
                  ) && (
                    <option value={initialStay?.durationMinutes ?? 180}>
                      Choose a priced duration
                    </option>
                  )}
                  {durationOptions.map((row) => (
                    <option key={row.hours} value={row.hours * 60}>
                      {row.hours} {row.hours === 1 ? "hour" : "hours"}{!checking ? ` · from ${money(row.pricePaise, property.currency)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {checkIn === today && !arrivalTimeOptions.length && (
              <p className="text-amber-700">
                No arrival times remain today. Please choose a later date.
              </p>
            )}
          </div>
        )}
        {!hourly && (
          <div className="relative mt-5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setOpenPopover((prev) =>
                    prev === "calendar" ? null : "calendar",
                  )
                }
                className={`rounded-xl border p-3 text-left transition-all ${
                  openPopover === "calendar"
                    ? "border-[var(--hk-navy)] ring-2 ring-[var(--hk-navy)]/10 bg-white"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Check-in
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs md:text-sm font-semibold text-[var(--hk-navy)]">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">
                    {checkIn ? readableDate(checkIn) : "Select date"}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setOpenPopover((prev) =>
                    prev === "calendar" ? null : "calendar",
                  )
                }
                className={`rounded-xl border p-3 text-left transition-all ${
                  openPopover === "calendar"
                    ? "border-[var(--hk-navy)] ring-2 ring-[var(--hk-navy)]/10 bg-white"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Check-out
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs md:text-sm font-semibold text-[var(--hk-navy)]">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">
                    {initialStay?.bookingMode === "hourly" && selected?.endAt
                      ? new Date(selected.endAt).toLocaleString("en-IN", {
                          timeZone: property.timezone ?? "Asia/Kolkata",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : checkOut
                        ? readableDate(checkOut)
                        : "Select date"}
                  </span>
                </span>
              </button>
            </div>

            {/* Calendar Popover Drawer */}
            {openPopover === "calendar" && (
              <CalendarPopoverModal
                checkIn={checkIn}
                checkOut={checkOut}
                today={today}
                onPick={(day) => {
                  if (!checkIn || checkOut || day <= checkIn) {
                    persistStay({ checkIn: day, checkOut: undefined });
                  } else {
                    persistStay({ checkOut: day });
                    setOpenPopover(null);
                  }
                }}
                onClear={() => {
                  persistStay({ checkIn: undefined, checkOut: undefined });
                }}
                onClose={() => setOpenPopover(null)}
              />
            )}
          </div>
        )}

        {/* Custom Guests Popover */}
        <div className="relative mt-2">
          <button
            type="button"
            onClick={() =>
              setOpenPopover((prev) => (prev === "guests" ? null : "guests"))
            }
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              openPopover === "guests"
                ? "border-[var(--hk-navy)] ring-2 ring-[var(--hk-navy)]/10 bg-white"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Guests
            </span>
            <span className="mt-1 flex items-center justify-between text-xs md:text-sm font-semibold text-[var(--hk-navy)]">
              <span className="flex flex-wrap items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {adults} Adult{adults !== 1 ? "s" : ""}, {children} Child
                {children !== 1 ? "ren" : ""}, {infants} Infant
                {infants === 1 ? "" : "s"}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${
                  openPopover === "guests" ? "rotate-180" : ""
                }`}
              />
            </span>
          </button>

          {openPopover === "guests" && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-in fade-in duration-150">
              <GuestCounterRow
                label="Adults"
                note="Age 13+"
                value={adults}
                min={1}
                max={12}
                onChange={(value) => {
                  persistStay({ adults: value }, true);
                }}
              />
              <GuestCounterRow
                label="Children"
                note="Ages 2–12"
                value={children}
                min={0}
                max={10}
                onChange={(value) => {
                  persistStay({ children: value }, true);
                }}
              />
              <GuestCounterRow
                label="Infants"
                note="Under 2"
                value={infants}
                min={0}
                max={10}
                onChange={(value) => {
                  persistStay({ infants: value }, true);
                }}
              />
            </div>
          )}
        </div>

        {/* Custom Room & Rate Selector */}
        <div className="relative mt-2">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
            Room and rate
          </span>
          <button
            type="button"
            onClick={() =>
              setOpenPopover((prev) => (prev === "rooms" ? null : "rooms"))
            }
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              openPopover === "rooms"
                ? "border-[var(--hk-navy)] ring-2 ring-[var(--hk-navy)]/10 bg-white"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="flex items-center justify-between text-xs md:text-sm font-semibold text-[var(--hk-navy)]">
              <span className="truncate">
                {selected
                  ? `${selectedRoom?.name} · ${selected.name}${checking ? "" : ` · ${money(selected.totalPaise ?? selected.basePricePaise, property.currency)}`}`
                  : "Select a room & rate"}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  openPopover === "rooms" ? "rotate-180" : ""
                }`}
              />
            </span>
          </button>

          {openPopover === "rooms" && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl animate-in fade-in duration-150 space-y-1">
              {rooms.flatMap((room) =>
                room.rates.map((rate) => {
                  const val = `${room.id}:${rate.id}`;
                  const isSelected = selectedChoice === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={checking || invalid || failed}
                      onClick={() => {
                        onChoiceChange(val);
                        setOpenPopover(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition ${
                        isSelected
                          ? "bg-slate-100 font-bold text-[var(--hk-navy)]"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold text-[var(--hk-navy)]">
                          {room.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {rate.name}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-[var(--hk-navy)]">
                        {checking ? "Checking…" : money(
                          rate.totalPaise ?? rate.basePricePaise,
                          property.currency,
                        )}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>
          )}
        </div>

        {selectedRoom && !capacityOk && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            This room supports up to {selectedRoom.maxAdults} adult
            {selectedRoom.maxAdults === 1 ? "" : "s"} and{" "}
            {selectedRoom.maxChildren} child
            {selectedRoom.maxChildren === 1 ? "" : "ren"}.
          </p>
        )}

        {valid ? (
          <Link
            href={`/booking/checkout?${query}`}
            onClick={(event) => {
              if (!selected?.validUntil || !canReserve()) {
                event.preventDefault();
                onRefresh();
                return;
              }
              if (checkoutInput) {
                void queryClient.prefetchQuery({
                  queryKey: queryKeys.checkoutQuote(checkoutInput),
                  queryFn: ({ signal }) =>
                    apiFetch<{ quote: unknown }>("/api/bookings/quote", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(checkoutInput),
                      signal,
                    }),
                  staleTime: 5 * 60_000,
                });
              }
            }}
            className="mt-5 block rounded-xl bg-[var(--hk-navy)] py-3.5 text-center text-sm font-bold text-white shadow-md hover:bg-slate-800 transition active:scale-[0.99]"
          >
            Reserve this room
          </Link>
        ) : (
          <button
            type="button"
            disabled={checking || invalid || (!expired && !failed)}
            onClick={onRefresh}
            className="mt-5 w-full rounded-xl bg-slate-200 py-3.5 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {checking ? "Checking availability…" : invalid ? "Choose valid dates" : failed ? "Retry availability" : expired ? "Refresh availability" : !checkIn ? "Choose dates" : !rooms.length ? "No matching rooms" : "Select a room"}
          </button>
        )}

        <div className="mt-5 border-t border-slate-100 text-xs text-slate-500 space-y-1.5">
          {!checking && !invalid && !failed && selected?.cancellationTerms &&
            cancellationLabel(
              selected.cancellationTerms,
              property.timezone ?? "Asia/Kolkata",
            ) && (
              <p className="text-emerald-700 font-medium">
                {cancellationLabel(
                  selected.cancellationTerms,
                  property.timezone ?? "Asia/Kolkata",
                )}
              </p>
            )}
          {!checking && !invalid && !failed && selected?.breakfastIncluded && (
            <p className="text-emerald-700 font-medium">Breakfast included</p>
          )}
          {!checking && !invalid && !failed && selected?.cancellation && (
            <p className="text-slate-600">
              {selected.cancellation.name}: {selected.cancellation.description}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function CalendarPopoverModal({
  today,
  checkIn,
  checkOut,
  onPick,
  onClear,
  onClose,
}: {
  today: string;
  checkIn: string;
  checkOut: string;
  onPick: (date: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(`${checkIn || today}T00:00:00`);
    d.setDate(1);
    return d;
  });

  const todayStr = today;
  const year = currentMonth.getFullYear();
  const monthIdx = currentMonth.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const leadingBlankDays = new Date(year, monthIdx, 1).getDay();

  return (
    <div
      role="dialog"
      aria-label="Choose stay dates"
      className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(300px,calc(100vw-6rem))] sm:w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-in fade-in duration-150"
    >
      {/* Month Navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentMonth(new Date(year, monthIdx - 1, 1))}
          aria-label="Previous month"
          className="rounded-full p-1 text-slate-500 hover:bg-slate-100 transition"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <b className="text-xs font-bold text-[var(--hk-navy)]">
          {currentMonth.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </b>
        <button
          type="button"
          onClick={() => setCurrentMonth(new Date(year, monthIdx + 1, 1))}
          aria-label="Next month"
          className="rounded-full p-1 text-slate-500 hover:bg-slate-100 transition"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1.5 grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 uppercase">
        {"SMTWTFS".split("").map((day, idx) => (
          <span key={idx}>{day}</span>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {Array.from({ length: leadingBlankDays }).map((_, idx) => (
          <span key={`blank-${idx}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const dayNum = idx + 1;
          const dateStr = `${year}-${pad(monthIdx + 1)}-${pad(dayNum)}`;
          const isDisabled = dateStr < todayStr;
          const isCheckIn = dateStr === checkIn;
          const isCheckOut = dateStr === checkOut;
          const isSelected = isCheckIn || isCheckOut;
          const isBetween =
            checkIn && checkOut && dateStr > checkIn && dateStr < checkOut;

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => onPick(dateStr)}
              className={`h-7 w-7 mx-auto flex items-center justify-center text-xs font-semibold rounded-full transition disabled:opacity-25 disabled:hover:bg-transparent ${
                isSelected
                  ? "bg-[var(--hk-navy)] text-white shadow-sm font-bold"
                  : isBetween
                    ? "bg-slate-100 text-[var(--hk-navy)] rounded-none"
                    : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      {/* Footer controls */}
      <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-slate-400 hover:text-slate-600 underline"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-[var(--hk-navy)] px-3 py-1 text-xs font-bold text-white hover:bg-slate-800 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
