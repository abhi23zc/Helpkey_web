"use client";
import Link from "next/link";
import { Heart, MapPin, Building2, Users, BedDouble, Check, BadgeCheck, Star } from "lucide-react";
import { PublicMediaImage } from "@/components/shared/public-media-image";
import type { CatalogProperty } from "@/lib/customer/catalog";
import { amenityLabel, canonicalAmenityKey } from "@/lib/customer/amenities";
import { cancellationLabel, formatMoney, guestScoreLabel } from "@/lib/customer/offer";

export function hotelHref(property: CatalogProperty, query = "", reserve = false) {
  const params = new URLSearchParams(query);
  for (const key of ["sort", "cursor", "limit", "amenity", "propertyType", "minRating", "minPricePaise", "maxPricePaise", "freeCancellation", "view"]) params.delete(key);
  if (property.offer) {
    params.set("roomTypeId", property.offer.roomTypeId);
    params.set("ratePlanId", property.offer.ratePlanId);
    params.set("searchTotalPaise", String(property.offer.totalPaise));
  }
  if (reserve) params.set("reserve", "1");
  return `/hotels/${encodeURIComponent(property.slug)}${params.size ? `?${params}` : ""}`;
}
const priority = ["wifi", "fast_wifi", "air_conditioning", "parking", "swimming_pool", "restaurant", "lift"];
export function StayCard({ property, query = "", saved, onSave, saving = false, accent = false }: {
  property: CatalogProperty; query?: string; saved: boolean; onSave: () => void; saving?: boolean; accent?: boolean;
}) {
  const offer = property.offer;
  const params = new URLSearchParams(query);
  const guestCount = Number(params.get("adults") ?? 2) + Number(params.get("children") ?? 0);
  const infants = Number(params.get("infants") ?? 0);
  const cancellation = offer ? cancellationLabel(offer.cancellation, offer.timezone) : null;
  const amenities = [...new Set((offer?.amenityCodes ?? property.propertyAmenityCodes ?? property.amenityCodes).map(canonicalAmenityKey))].sort((a, b) => {
    const ai = priority.indexOf(a), bi = priority.indexOf(b);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b);
  }).slice(0, 4);
  return <article data-hotel-id={property.id} className={`overflow-hidden rounded-2xl border bg-white shadow-[var(--hk-shadow-soft)] ${accent ? "border-[var(--hk-gold)]" : "border-[var(--hk-border)]"}`}>
    <div className="grid md:grid-cols-[250px_minmax(0,1fr)_180px]">
      <div className="relative min-h-52 bg-[var(--hk-surface-muted)]">
        {property.coverImageUrl ? <PublicMediaImage src={property.coverImageUrl} srcSet={property.coverImageSrcSet} alt={property.name} sizes="(min-width: 768px) 250px, 100vw" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><Building2 className="h-10 w-10 text-slate-400" /><span className="sr-only">Photo unavailable</span></div>}
        <button type="button" aria-label={`${saved ? "Unsave" : "Save"} ${property.name}`} aria-pressed={saved} disabled={saving} onClick={onSave} className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-[var(--hk-navy)] shadow-sm disabled:opacity-50"><Heart className={`h-4 w-4 ${saved ? "fill-red-500 text-red-500" : ""}`} /></button>
      </div>
      <div className="min-w-0 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><h2 className="text-lg font-bold leading-snug tracking-tight text-[var(--hk-ink)]"><Link href={hotelHref(property, query)} className="hover:underline">{property.name}</Link></h2><p className="mt-1 flex items-start gap-1 text-xs text-[var(--hk-muted)]"><MapPin className="h-3.5 w-3.5 shrink-0" />{[property.locality, property.city, property.state].filter(Boolean).join(", ") || "See hotel address"}</p></div>
          {property.ratingCount > 0 && property.ratingAverage > 0 && <span className="shrink-0 rounded bg-[var(--hk-navy)] px-2 py-1 text-xs font-bold text-white" aria-label={`Guest rating ${property.ratingAverage.toFixed(1)} out of 5`}>{property.ratingAverage.toFixed(1)}</span>}
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-[var(--hk-muted)]">{property.ratingCount > 0 ? <><Star aria-hidden="true" className="h-3 w-3 fill-[var(--hk-rating)] text-[var(--hk-rating)]" /><b className="text-[var(--hk-ink)]">{guestScoreLabel(property.ratingAverage)}</b><span>({property.ratingCount} {property.ratingCount === 1 ? "review" : "reviews"})</span></> : "No guest reviews yet"}</p>
        {amenities.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-b border-[var(--hk-border)] pb-3 text-xs text-[var(--hk-muted)]" aria-label="Amenities">{amenities.map(code => <li key={code} className="flex items-center gap-1"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5 text-[var(--hk-success)]" />{amenityLabel(code)}</li>)}</ul>}
        {offer && <div className="mt-3 space-y-3 text-xs">
          {(cancellation || offer.breakfastIncluded) && <div className="flex flex-wrap gap-x-4 gap-y-2">
            {cancellation && <p className="flex items-start gap-1 text-[var(--hk-success)]"><Check className="h-3.5 w-3.5 shrink-0" />{cancellation}</p>}
            {offer.breakfastIncluded && <p className="text-[var(--hk-success)]">Breakfast included</p>}
          </div>}
          {offer.roomName && <p className="font-semibold text-[var(--hk-ink)]">{offer.roomName}</p>}
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-2 text-[var(--hk-navy)]"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{guestCount} {guestCount === 1 ? "guest" : "guests"}{infants > 0 ? ` + ${infants} ${infants === 1 ? "infant" : "infants"}` : ""} · 1 room</span>{offer.beds.length > 0 && <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{offer.beds.map(bed => `${bed.count} ${bed.bedType.replaceAll("_", " ")} ${bed.count === 1 ? "bed" : "beds"}`).join(", ")}</span>}
          <p>{offer.bookingMode === "hourly" ? "Arrival" : "Check-in"} {new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: offer.timezone, timeZoneName: "short" }).format(new Date(offer.startAt))}</p></div>
        </div>}
      </div>
      <div className="flex flex-col justify-between border-t border-[var(--hk-border)] p-4 text-right md:border-l md:border-t-0">
        <div><span className="rounded bg-[var(--hk-surface-soft)] px-2 py-1 text-[10px] font-bold text-[var(--hk-success)]">{offer ? "Total stay price" : "Starting from"}</span><p className="mt-4 text-[26px] font-extrabold leading-tight text-[var(--hk-ink)]">{formatMoney(property.minimumPricePaise, property.currency)}</p>
          <p className="text-xs text-[var(--hk-muted)]">{offer ? offer.bookingMode === "hourly" ? `${offer.durationMinutes / 60} hours` : `${offer.nights} ${offer.nights === 1 ? "night" : "nights"}` : "Choose dates to check availability"}</p>
          {offer && <p className="mt-1 text-[10px] text-[var(--hk-muted)]">Includes taxes and fees</p>}
        </div>
        <div className="mt-4 grid gap-2"><Link href={hotelHref(property, query)} className="rounded-lg border border-[var(--hk-navy)] px-3 py-2 text-center text-xs font-bold text-[var(--hk-navy)] transition hover:bg-[var(--hk-surface-soft)]">View details</Link><Link href={hotelHref(property, query, true)} className="rounded-lg bg-[var(--hk-navy-strong)] px-3 py-2 text-center text-xs font-bold text-white">Choose room</Link></div>
      </div>
    </div>
  </article>;
}
