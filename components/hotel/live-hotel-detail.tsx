"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bath,
  BedDouble,
  BriefcaseBusiness,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Dumbbell,
  Heart,
  Hotel,
  MapPin,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  Star,
  Users,
  Utensils,
  Wifi,
  X,
} from "lucide-react";
import { SiteHeader } from "@/components/shared/site-header";
import { LoginModal } from "@/components/auth/login-modal";
import { Reviews } from "@/components/hotel/hotel-reviews";
import { PublicMediaImage } from "@/components/shared/public-media-image";
import { staySearchFromParams, withStaySearch, type StaySearch } from "@/lib/customer/stay-search";

type PropertyImage = { id: string; imageUrl: string; imageSrcSet?: string; width?: number; height?: number; altText: string };
type ReviewSummary = {
  count: number;
  ratingSum: number;
  average: number;
  buckets: Record<"1" | "2" | "3" | "4" | "5", number>;
};
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
  images: PropertyImage[];
  reviewSummary: ReviewSummary | null;
};
type BookableRoom = {
  id: string;
  name: string;
  description: string;
  totalInventory: number;
  maxAdults: number;
  maxChildren: number;
  maxInfants?: number;
  roomSizeSqFt: number | null;
  bedConfigurations?: Array<{ bedType: string; count: number }>;
  imageUrl: string | null;
  rates: Array<{
    id: string;
    name: string;
    basePricePaise: number;
    paymentMode: "full" | "deposit" | "pay_at_property";
    taxBasisPoints?: number;
    customerFeePaise?: number;
    cancellation: { name: string; description: string } | null;
  }>;
};

const money = (value: number | null, currency: string) =>
  value === null
    ? "Price on request"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value / 100);

const defaults = [
  "Fast Wi-Fi",
  "Business Centre",
  "Fine Dining",
  "Fitness Centre",
  "Breakfast Available",
  "Laundry Service",
];

const pad = (n: number) => String(n).padStart(2, "0");
const readableDate = (dateStr: string) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(y, m - 1, d)
  );
};

export function LiveHotelDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stay = useMemo(() => staySearchFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<BookableRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string>("");
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    void fetch(`/api/properties/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { property?: Property; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load property.");
        setProperty(body.property ?? null);
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Unable to load property.")
      );
  }, [slug]);

  useEffect(() => {
    if (searchParams.get("reserve") !== "1") return;
    document.getElementById("reserve")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchParams]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setRoomsLoading(true);
      const availability = new URLSearchParams();
      if (stay?.checkIn && stay.checkOut) {
        availability.set("checkIn", stay.checkIn);
        availability.set("checkOut", stay.checkOut);
        availability.set("adults", String(stay.adults));
        availability.set("children", String(stay.children));
        availability.set("infants", String(stay.infants));
      }
      return fetch(`/api/properties/${encodeURIComponent(slug)}/bookable?${availability}`, {
        cache: "no-store",
      }).then(async (response) => {
        const body = (await response.json()) as { rooms?: BookableRoom[] };
        const next = response.ok ? body.rooms ?? [] : [];
        setRooms(next);
        setSelectedChoice(
          (current) =>
            current || (next[0]?.rates[0] ? `${next[0].id}:${next[0].rates[0].id}` : "")
        );
      });
    })
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, [slug, stay]);

  if (error)
    return (
      <main className="mx-auto max-w-3xl p-12 text-center">
        <h1 className="text-2xl font-bold">Property unavailable</h1>
        <p className="mt-3 text-[var(--hk-muted)]">
          This stay is not currently available to book.
        </p>
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
      <main className="min-h-screen bg-[var(--hk-ivory)] px-4 py-8 sm:px-6 lg:px-10" aria-label="Loading property">
        <div className="mx-auto max-w-[1280px] animate-pulse space-y-6">
          <div className="h-4 w-48 rounded bg-slate-200" />
          <div className="h-12 w-2/5 rounded bg-slate-200" />
          <div className="grid gap-3 [grid-auto-rows:130px] sm:grid-cols-3 lg:[grid-auto-rows:175px]"><div className="col-span-2 row-span-2 rounded-2xl bg-slate-200" /><div className="rounded-2xl bg-slate-200" /><div className="rounded-2xl bg-slate-200" /></div>
          <div className="grid gap-8 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><div className="h-8 w-52 rounded bg-slate-200" /><div className="h-44 rounded-2xl bg-slate-200" /></div><div className="h-96 rounded-2xl bg-slate-200" /></div>
        </div>
      </main>
    );

  const rating = property.ratingAverage;
  const reviewCount = property.ratingCount;
  const location = `${property.city}${property.state ? `, ${property.state}` : ""}`;
  const amenities = property.amenityCodes.length
    ? property.amenityCodes.map((item) =>
        item.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
      )
    : defaults;

  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SiteHeader onLoginClick={() => setIsLoginOpen(true)} />
      <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6 lg:px-10">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-xs text-[var(--hk-muted)]"
        >
          <Link href="/">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/search${searchParams.toString() ? `?${searchParams}` : ""}`}>Search results</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/search?destination=${encodeURIComponent(property.city)}`}>
            {property.city}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-[var(--hk-navy)]">{property.name}</span>
        </nav>

        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>

          
            <h1 className=" text-4xl font-bold tracking-tight text-[var(--hk-navy)] md:text-5xl">
              {property.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="flex items-center gap-1 text-[var(--hk-muted)]">
                <MapPin className="h-4 w-4" />
                {location}
              </span>
              {rating > 0 && (
                <span className="flex items-center gap-1">
                  <span className="tracking-[0.08em] text-[var(--hk-gold-strong)]">
                    ★★★★★
                  </span>
                  <b>{rating.toFixed(1)}</b>
                  <span className="text-[var(--hk-muted)]">({reviewCount} reviews)</span>
                </span>
              )}
              <span className="flex items-center gap-1 font-semibold text-[var(--hk-success)]">
                <ShieldCheck className="h-4 w-4" />
                Verified Stay
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--hk-border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--hk-navy)] shadow-[var(--hk-shadow-soft)] md:flex-none">
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <button
              onClick={() => setSaved((value) => !value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-[var(--hk-shadow-soft)] md:flex-none ${
                saved
                  ? "border-[var(--hk-gold)] bg-[#fff8e8] text-[var(--hk-navy)]"
                  : "border-[var(--hk-border-strong)] bg-white text-[var(--hk-navy)]"
              }`}
            >
              <Heart
                className={`h-4 w-4 ${saved ? "fill-[var(--hk-gold-strong)]" : ""}`}
              />
              {saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        <Gallery property={property} />

        <div className="mt-10 grid gap-10 lg:grid-cols-3">
          <div className="space-y-14 lg:col-span-2">
            <section>
              <h2 className="text-2xl font-bold text-[var(--hk-navy)]">
                About this stay
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-[var(--hk-muted)]">
                Discover thoughtful hospitality at {property.name}. Located in the heart
                of {location}, this premium stay combines comfortable rooms, reliable
                service, and the practical details that make every business or leisure trip
                feel effortless.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-[var(--hk-navy)]">
                Premium amenities
              </h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
                {amenities.slice(0, 6).map((amenity, index) => (
                  <Amenity key={amenity} label={amenity} index={index} />
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[var(--hk-navy)]">
                  Available rooms
                </h2>
                <span className="text-sm text-[var(--hk-muted)]">
                  Select a room to continue
                </span>
              </div>
              <div className="mt-6 space-y-5">
                {roomsLoading && (
                  <div className="rounded-xl border border-[var(--hk-border)] bg-white p-6 text-sm text-[var(--hk-muted)]">
                    Loading available rooms...
                  </div>
                )}
                {!roomsLoading && rooms.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--hk-border-strong)] bg-white p-6 text-sm text-[var(--hk-muted)]">
                    No rooms are bookable right now. Please check back later.
                  </div>
                )}
                {rooms.map((room, index) => {
                  const cheapest = room.rates.reduce(
                    (min, rate) =>
                      rate.basePricePaise < min.basePricePaise ? rate : min,
                    room.rates[0]
                  );
                  const choice = `${room.id}:${cheapest.id}`;
                  return (
                    <RoomCard
                      key={room.id}
                      title={room.name}
                      description={
                        room.description ||
                        "Comfortable private room with Helpkey verified hospitality."
                      }
                      tags={
                        [
                          room.roomSizeSqFt ? `${room.roomSizeSqFt} sq ft` : null,
                          `${room.maxAdults + room.maxChildren} guests`,
                          ...(room.bedConfigurations ?? [])
                            .slice(0, 1)
                            .map(
                              (bed) =>
                                `${bed.count} ${bed.bedType.replaceAll("_", " ")} bed`
                            ),
                        ].filter(Boolean) as string[]
                      }
                      price={cheapest.basePricePaise}
                      currency={property.currency}
                      image={room.imageUrl || property.coverImageUrl}
                      selected={selectedChoice.startsWith(`${room.id}:`)}
                      onSelect={() => setSelectedChoice(choice)}
                      cancellation={Boolean(cheapest.cancellation)}
                      premium={index === 0 && rooms.length > 1}
                    />
                  );
                })}
              </div>
            </section>

            <Reviews property={property} onLogin={() => setIsLoginOpen(true)} />
          </div>

          <BookingCard
            key={searchParams.toString()}
            property={property}
            rating={rating}
            rooms={rooms}
            selectedChoice={selectedChoice}
            onChoiceChange={setSelectedChoice}
            initialStay={stay}
            onStayChange={(next) => router.replace(`/hotels/${slug}?${withStaySearch(new URLSearchParams(searchParams.toString()), next)}`, { scroll: false })}
          />
        </div>
      </main>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}

function Gallery({ property }: { property: Property }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const images = property.images.length
    ? property.images
    : property.coverImageUrl
      ? [{ id: "cover", imageUrl: property.coverImageUrl, altText: property.name }]
      : [];
  const activeImage = activeIndex === null ? null : images[activeIndex];

  useEffect(() => {
    if (activeIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft")
        setActiveIndex((current) =>
          current === null ? null : (current - 1 + images.length) % images.length
        );
      if (event.key === "ArrowRight")
        setActiveIndex((current) =>
          current === null ? null : (current + 1) % images.length
        );
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, images.length]);

  if (!images.length)
    return (
      <section
        aria-label="Property photos"
        className="flex h-72 items-center justify-center rounded-2xl bg-[var(--hk-surface-muted)] text-[var(--hk-muted)]"
      >
        <Hotel className="h-9 w-9" />
      </section>
    );

  return (
    <>
      <section
        aria-label="Property photos"
        className="grid grid-cols-2 gap-3 [grid-auto-rows:130px] sm:grid-cols-3 sm:[grid-auto-rows:160px] lg:grid-cols-4 lg:[grid-auto-rows:175px]"
      >
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`group relative overflow-hidden rounded-2xl bg-[var(--hk-surface-muted)] text-left shadow-[var(--hk-shadow-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hk-navy)] ${
              index === 0 ? "col-span-2 row-span-2" : ""
            }`}
          >
            <PublicMediaImage
              src={image.imageUrl}
              srcSet={image.imageSrcSet}
              alt={image.altText || `${property.name} photo ${index + 1}`}
              sizes={index === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
              loading={index === 0 ? "eager" : "lazy"}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
            {index === 0 && (
              <span className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-2 text-xs font-bold text-[var(--hk-navy)] shadow-sm">
                View all {images.length} photos
              </span>
            )}
          </button>
        ))}
      </section>

      {activeImage && activeIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${property.name} photo gallery`}
          className="fixed inset-0 z-[60] flex flex-col bg-[rgba(4,15,31,0.94)] p-4 text-white sm:p-6"
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <p className="text-sm font-semibold">
              {activeIndex + 1} of {images.length}
            </p>
            <button
              type="button"
              onClick={() => setActiveIndex(null)}
              aria-label="Close photo gallery"
              className="rounded-full p-2 transition hover:bg-white/15"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center py-4">
            <PublicMediaImage
              src={activeImage.imageUrl}
              srcSet={activeImage.imageSrcSet}
              alt={activeImage.altText || property.name}
              sizes="100vw"
              loading="eager"
              className="max-h-full max-w-full rounded-xl object-contain"
            />
            <button
              type="button"
              onClick={() =>
                setActiveIndex((activeIndex - 1 + images.length) % images.length)
              }
              aria-label="Previous photo"
              className="absolute left-0 rounded-full bg-black/45 p-3 transition hover:bg-black/70"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveIndex((activeIndex + 1) % images.length)
              }
              aria-label="Next photo"
              className="absolute right-0 rounded-full bg-black/45 p-3 transition hover:bg-black/70"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto py-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show photo ${index + 1}`}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 ${
                  index === activeIndex
                    ? "border-white"
                    : "border-transparent opacity-65 hover:opacity-100"
                }`}
              >
                <PublicMediaImage
                  src={image.imageUrl}
                  srcSet={image.imageSrcSet}
                  alt=""
                  sizes="80px"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Amenity({ label, index }: { label: string; index: number }) {
  const icons = [Wifi, BriefcaseBusiness, Utensils, Dumbbell, Coffee, Bath];
  const Icon = icons[index % icons.length];
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
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
  selected,
  onSelect,
  cancellation,
  premium = false,
}: {
  title: string;
  description: string;
  tags: string[];
  price: number | null;
  currency: string;
  image: string | null;
  selected: boolean;
  onSelect: () => void;
  cancellation?: boolean;
  premium?: boolean;
}) {
  return (
    <article
      onClick={onSelect}
      className={`relative flex cursor-pointer flex-col gap-5 rounded-2xl border p-5 transition-all md:flex-row ${
        selected
          ? "border-[#0F172A] ring-2 ring-[#0F172A]/15 bg-slate-50/80 shadow-md"
          : premium
            ? "border-slate-300 bg-white hover:border-[#0F172A]/60 hover:shadow-md"
            : "border-slate-200 bg-white hover:border-slate-400 hover:shadow-md"
      }`}
    >
      {premium && (
        <span className="absolute right-0 top-0 rounded-tr-2xl rounded-bl-xl bg-[#0F172A] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm">
          PREMIUM
        </span>
      )}
      <div className="h-48 overflow-hidden rounded-xl bg-slate-100 md:w-1/3 md:shrink-0">
        {image ? (
          <img src={image} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BedDouble className="text-slate-400" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <div className="flex justify-between gap-3">
            <h3 className="text-xl font-bold text-[#0F172A]">{title}</h3>
            <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
              <Users className="h-3.5 w-3.5" />2 guests
            </span>
          </div>
          <p className="mt-2 text-xs md:text-sm leading-relaxed text-slate-500">
            {description}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-[#0F172A]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-2xl font-extrabold text-[#0F172A]">
              {money(price, currency)}{" "}
              <span className="text-xs font-normal text-slate-400">/ night</span>
            </p>
            {cancellation ? (
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5 stroke-[3]" />
                Free cancellation
              </p>
            ) : (
              <p className="mt-1 text-xs font-medium text-slate-400">
                Non-refundable
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-[#0F172A] px-5 py-2.5 text-xs font-bold text-white transition-all shadow-sm hover:bg-slate-800 active:scale-[0.98]"
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </div>
    </article>
  );
}

function BookingCard({
  property,
  rating,
  rooms,
  selectedChoice,
  onChoiceChange,
  initialStay,
  onStayChange,
}: {
  property: Property;
  rating: number;
  rooms: BookableRoom[];
  selectedChoice: string;
  onChoiceChange: (value: string) => void;
  initialStay: StaySearch | null;
  onStayChange: (value: StaySearch) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState(initialStay?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(initialStay?.checkOut ?? "");
  const [adults, setAdults] = useState(initialStay?.adults ?? 2);
  const [children, setChildren] = useState(initialStay?.children ?? 0);
  const [infants] = useState(initialStay?.infants ?? 0);
  const [openPopover, setOpenPopover] = useState<"calendar" | "guests" | "rooms" | null>(
    null
  );

  const [roomId, rateId] = selectedChoice.split(":");
  const selectedRoom = rooms.find((room) => room.id === roomId);
  const selected = selectedRoom?.rates.find((rate) => rate.id === rateId);
  const guestCount = adults + children;
  const capacityOk = selectedRoom
    ? adults <= selectedRoom.maxAdults &&
      children <= selectedRoom.maxChildren &&
      guestCount <= selectedRoom.maxAdults + selectedRoom.maxChildren
    : false;
  const valid = Boolean(
    selected && checkIn >= today && checkOut > checkIn && adults > 0 && capacityOk
  );
  const query = new URLSearchParams({
    property: property.slug,
    room: roomId ?? "",
    rate: rateId ?? "",
    checkIn,
    checkOut,
    adults: String(adults),
    children: String(children),
    infants: "0",
  }).toString();

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const persistStay = (next: Partial<StaySearch>) => {
    const value = { checkIn, checkOut, adults, children, infants, ...next };
    if ((value.checkIn && value.checkOut && value.checkOut > value.checkIn) || (!value.checkIn && !value.checkOut)) onStayChange(value);
  };

  return (
    <aside id="reserve" className="relative scroll-mt-28" ref={containerRef}>
      <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Header Price & Rating */}
        <div className="flex items-end justify-between border-b border-slate-100 pb-5">
          <div>
            <span className="text-3xl font-bold text-[#0F172A]">
              {selected
                ? money(selected.basePricePaise, property.currency)
                : money(property.minimumPricePaise, property.currency)}
            </span>
            <span className="text-sm font-normal text-slate-500"> / night</span>
          </div>
          <span className="flex items-center gap-1 text-sm font-bold text-[#0F172A]">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)}
          </span>
        </div>

        {/* Custom Datepicker Fields */}
        <div className="relative mt-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setOpenPopover((prev) => (prev === "calendar" ? null : "calendar"))
              }
              className={`rounded-xl border p-3 text-left transition-all ${
                openPopover === "calendar"
                  ? "border-[#0F172A] ring-2 ring-[#0F172A]/10 bg-white"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Check-in
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs md:text-sm font-semibold text-[#0F172A]">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">
                  {checkIn ? readableDate(checkIn) : "Select date"}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setOpenPopover((prev) => (prev === "calendar" ? null : "calendar"))
              }
              className={`rounded-xl border p-3 text-left transition-all ${
                openPopover === "calendar"
                  ? "border-[#0F172A] ring-2 ring-[#0F172A]/10 bg-white"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Check-out
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs md:text-sm font-semibold text-[#0F172A]">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">
                  {checkOut ? readableDate(checkOut) : "Select date"}
                </span>
              </span>
            </button>
          </div>

          {/* Calendar Popover Drawer */}
          {openPopover === "calendar" && (
            <CalendarPopoverModal
              checkIn={checkIn}
              checkOut={checkOut}
              onPick={(day) => {
                if (!checkIn || checkOut || day <= checkIn) {
                  setCheckIn(day);
                  setCheckOut("");
                } else {
                  setCheckOut(day);
                  persistStay({ checkOut: day });
                  setOpenPopover(null);
                }
              }}
              onClear={() => {
                setCheckIn("");
                setCheckOut("");
                persistStay({ checkIn: undefined, checkOut: undefined });
              }}
              onClose={() => setOpenPopover(null)}
            />
          )}
        </div>

        {/* Custom Guests Popover */}
        <div className="relative mt-2">
          <button
            type="button"
            onClick={() =>
              setOpenPopover((prev) => (prev === "guests" ? null : "guests"))
            }
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              openPopover === "guests"
                ? "border-[#0F172A] ring-2 ring-[#0F172A]/10 bg-white"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Guests
            </span>
            <span className="mt-1 flex items-center justify-between text-xs md:text-sm font-semibold text-[#0F172A]">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {adults} Adult{adults !== 1 ? "s" : ""}, {children} Child
                {children !== 1 ? "ren" : ""}
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
                max={selectedRoom ? selectedRoom.maxAdults : 10}
                onChange={(value) => { setAdults(value); persistStay({ adults: value }); }}
              />
              <GuestCounterRow
                label="Children"
                note="Ages 0–12"
                value={children}
                min={0}
                max={selectedRoom ? selectedRoom.maxChildren : 6}
                onChange={(value) => { setChildren(value); persistStay({ children: value }); }}
              />
              <button
                type="button"
                onClick={() => setOpenPopover(null)}
                className="mt-3 w-full rounded-xl bg-[#0F172A] py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                Apply
              </button>
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
                ? "border-[#0F172A] ring-2 ring-[#0F172A]/10 bg-white"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="flex items-center justify-between text-xs md:text-sm font-semibold text-[#0F172A]">
              <span className="truncate">
                {selected
                  ? `${selectedRoom?.name} · ${selected.name} · ${money(selected.basePricePaise, property.currency)}`
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
                      onClick={() => {
                        onChoiceChange(val);
                        setOpenPopover(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition ${
                        isSelected
                          ? "bg-slate-100 font-bold text-[#0F172A]"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold text-[#0F172A]">{room.name}</p>
                        <p className="text-[11px] text-slate-500">{rate.name}</p>
                      </div>
                      <span className="text-xs font-bold text-[#0F172A]">
                        {money(rate.basePricePaise, property.currency)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {selectedRoom && !capacityOk && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            This room supports up to {selectedRoom.maxAdults} adult
            {selectedRoom.maxAdults === 1 ? "" : "s"} and {selectedRoom.maxChildren}{" "}
            child{selectedRoom.maxChildren === 1 ? "" : "ren"}.
          </p>
        )}

        <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-500">
          <p className="font-semibold text-[#0F172A]">
            {selected?.paymentMode === "pay_at_property"
              ? "Pay at property"
              : selected?.paymentMode === "deposit"
                ? "Deposit due today"
                : "Secure online payment"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Taxes, fees, and cancellation terms are shown before confirmation.
          </p>
          {selected?.cancellation && (
            <p className="mt-2 text-xs font-medium text-emerald-600">
              {selected.cancellation.name}
            </p>
          )}
        </div>

        {valid ? (
          <Link
            href={`/booking/checkout?${query}`}
            className="mt-6 block rounded-xl bg-[#0F172A] py-4 text-center text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Reserve this room
          </Link>
        ) : (
          <button
            disabled
            className="mt-6 w-full rounded-xl bg-slate-200 py-4 text-sm font-bold text-slate-400 cursor-not-allowed"
          >
            Choose valid dates and a room
          </button>
        )}
        <p className="mt-3 text-center text-xs text-slate-400">
          You won&apos;t be charged until confirmation
        </p>
      </div>
    </aside>
  );
}

function GuestCounterRow({
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
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div>
        <b className="block text-xs font-bold text-[#0F172A]">{label}</b>
        <span className="text-[11px] text-slate-400">{note}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-4 text-center font-bold text-xs text-[#0F172A]">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function CalendarPopoverModal({
  checkIn,
  checkOut,
  onPick,
  onClear,
  onClose,
}: {
  checkIn: string;
  checkOut: string;
  onPick: (date: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const year = currentMonth.getFullYear();
  const monthIdx = currentMonth.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const leadingBlankDays = new Date(year, monthIdx, 1).getDay();

  return (
    <div
      role="dialog"
      aria-label="Choose stay dates"
      className="absolute right-0 top-[calc(100%+6px)] z-50 w-[300px] sm:w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-in fade-in duration-150"
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
        <b className="text-xs font-bold text-[#0F172A]">
          {currentMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
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
                  ? "bg-[#0F172A] text-white shadow-sm font-bold"
                  : isBetween
                    ? "bg-slate-100 text-[#0F172A] rounded-none"
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
          className="rounded-lg bg-[#0F172A] px-3 py-1 text-xs font-bold text-white hover:bg-slate-800 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
