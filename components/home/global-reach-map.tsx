"use client";

import Link from "next/link";
import { useState } from "react";

type MapPin = {
  id: string;
  city: string;
  country: string;
  xPercent: number; // Position on map 0-100%
  yPercent: number; // Position on map 0-100%
  image: string;
  staysCount: string;
  popular?: boolean;
};

const mapPins: MapPin[] = [
  {
    id: "london",
    city: "London",
    country: "UK",
    xPercent: 47,
    yPercent: 28,
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=150&q=80",
    staysCount: "2,450+ stays",
    popular: true,
  },
  {
    id: "paris",
    city: "Paris",
    country: "France",
    xPercent: 49,
    yPercent: 33,
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=150&q=80",
    staysCount: "1,820+ stays",
  },
  {
    id: "dubai",
    city: "Dubai",
    country: "UAE",
    xPercent: 62,
    yPercent: 44,
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=150&q=80",
    staysCount: "3,120+ stays",
    popular: true,
  },
  {
    id: "new-york",
    city: "New York",
    country: "US",
    xPercent: 28,
    yPercent: 35,
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=150&q=80",
    staysCount: "4,100+ stays",
    popular: true,
  },
  {
    id: "tokyo",
    city: "Tokyo",
    country: "Japan",
    xPercent: 84,
    yPercent: 38,
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=150&q=80",
    staysCount: "2,150+ stays",
  },
  {
    id: "mumbai",
    city: "Mumbai",
    country: "India",
    xPercent: 68,
    yPercent: 48,
    image: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=150&q=80",
    staysCount: "4,177+ stays",
    popular: true,
  },
  {
    id: "bangalore",
    city: "Bangalore",
    country: "India",
    xPercent: 69,
    yPercent: 52,
    image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=150&q=80",
    staysCount: "5,372+ stays",
    popular: true,
  },
  {
    id: "singapore",
    city: "Singapore",
    country: "Singapore",
    xPercent: 77,
    yPercent: 58,
    image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=150&q=80",
    staysCount: "1,430+ stays",
  },
  {
    id: "rio",
    city: "Rio de Janeiro",
    country: "Brazil",
    xPercent: 36,
    yPercent: 72,
    image: "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=150&q=80",
    staysCount: "980+ stays",
  },
];

const countryHighlights = [
  { name: "India", count: "12,000+ stays", color: "bg-emerald-500", href: "/search?destination=India" },
  { name: "United States", count: "25,000+ stays", color: "bg-sky-500", href: "/search?destination=US" },
  { name: "United Kingdom", count: "8,500+ stays", color: "bg-purple-500", href: "/search?destination=UK" },
  { name: "UAE & Middle East", count: "6,200+ stays", color: "bg-amber-500", href: "/search?destination=Dubai" },
  { name: "Singapore & SE Asia", count: "11,400+ stays", color: "bg-rose-500", href: "/search?destination=Singapore" },
  { name: "Japan", count: "5,100+ stays", color: "bg-indigo-500", href: "/search?destination=Japan" },
];

export function GlobalReachSection() {
  const [activePin, setActivePin] = useState<MapPin | null>(mapPins[5]); // Default to Mumbai/India pin

  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-24 lg:px-10">
      <div className="overflow-hidden rounded-3xl border border-[rgba(196,198,206,0.6)] bg-gradient-to-b from-white via-[var(--hk-ivory)] to-white p-6 shadow-sm sm:p-10 lg:p-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          
          {/* Map Column */}
          <div className="relative min-h-[320px] rounded-2xl bg-[var(--hk-surface-soft)]/50 p-4 sm:min-h-[400px] lg:col-span-7">
            {/* World Map Dot Pattern Background */}
            <div className="absolute inset-0 opacity-25" style={{
              backgroundImage: `radial-gradient(#0b1f3a 1.2px, transparent 1.2px)`,
              backgroundSize: '18px 18px'
            }} />

            <div className="absolute top-4 left-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-bold text-[var(--hk-navy-strong)] shadow-sm backdrop-blur-md">
              📍 Live Global Network
            </div>

            {/* Pins overlay */}
            <div className="relative h-full min-h-[300px] w-full sm:min-h-[360px]">
              {mapPins.map((pin) => {
                const isActive = activePin?.id === pin.id;
                return (
                  <div
                    key={pin.id}
                    style={{ left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                  >
                    <button
                      type="button"
                      onClick={() => setActivePin(pin)}
                      onMouseEnter={() => setActivePin(pin)}
                      className={`group relative flex items-center justify-center rounded-full p-1 transition-all ${
                        isActive
                          ? "scale-125 z-30 ring-4 ring-[var(--hk-gold-strong)] ring-offset-2 bg-white"
                          : "scale-100 z-20 hover:scale-110 bg-white/90 shadow-md"
                      }`}
                    >
                      <div className="relative h-8 w-8 overflow-hidden rounded-full sm:h-10 sm:w-10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pin.image}
                          alt={pin.city}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      
                      {/* Pulse animation for active */}
                      {isActive && (
                        <span className="absolute -inset-1 animate-ping rounded-full bg-[var(--hk-gold-strong)]/30" />
                      )}
                    </button>

                    {/* Tooltip Popup on active */}
                    {isActive && (
                      <div className="absolute bottom-full left-1/2 mb-2 z-40 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[var(--hk-navy-strong)] p-3 text-white shadow-xl animate-shake">
                        <p className="text-xs font-bold text-[var(--hk-gold-light)]">{pin.country}</p>
                        <p className="text-sm font-extrabold">{pin.city}</p>
                        <p className="text-[11px] text-white/80">{pin.staysCount}</p>
                        <Link
                          href={`/search?destination=${encodeURIComponent(pin.city)}`}
                          className="mt-1 block text-[11px] font-bold text-white underline hover:text-[var(--hk-gold-light)]"
                        >
                          Explore Stays &rarr;
                        </Link>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--hk-navy-strong)]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Info & Stats Column */}
          <div className="flex flex-col justify-center lg:col-span-5">
            <span className="mb-3 inline-flex w-max items-center gap-2 rounded-full bg-[var(--hk-gold-light)]/40 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[var(--hk-gold-strong)]">
              Global Presence
            </span>

            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-[var(--hk-ink)] sm:text-4xl">
              There&apos;s a Helpkey around. <span className="text-[var(--hk-navy-strong)] underline decoration-[var(--hk-gold-light)] underline-offset-4">Always.</span>
            </h2>

            <p className="mt-4 text-base text-[var(--hk-muted)] leading-relaxed">
              More destinations. Smart executive amenities. Transparent corporate pricing everywhere you travel.
            </p>

            {/* Big Stats Row (OYO style 35+ / 174,000+ format) */}
            <div className="mt-8 flex items-center gap-6 border-y border-[rgba(196,198,206,0.6)] py-6">
              <div>
                <div className="text-3xl font-black text-[var(--hk-navy-strong)] sm:text-4xl">50+</div>
                <div className="mt-1 text-xs font-semibold text-[var(--hk-muted)]">Countries &amp; Regions</div>
              </div>
              <div className="h-10 w-[1px] bg-[rgba(196,198,206,0.6)]" />
              <div>
                <div className="text-3xl font-black text-[var(--hk-navy-strong)] sm:text-4xl">174,000+</div>
                <div className="mt-1 text-xs font-semibold text-[var(--hk-muted)]">Hotels &amp; Homes</div>
              </div>
            </div>

            {/* Popular country tags grid */}
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--hk-muted)] mb-3">Popular Destinations</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {countryHighlights.map((c) => (
                  <Link
                    key={c.name}
                    href={c.href}
                    className="group flex items-center gap-2 rounded-xl border border-[rgba(196,198,206,0.5)] bg-white px-3 py-2 text-xs font-semibold text-[var(--hk-ink)] transition-all hover:border-[var(--hk-navy-strong)] hover:shadow-sm"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${c.color} shrink-0`} />
                    <span className="truncate group-hover:text-[var(--hk-navy-strong)]">{c.name}</span>
                  </Link>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
