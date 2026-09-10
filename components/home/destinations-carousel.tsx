"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type DestinationItem = {
  id: string;
  name: string;
  category: "india" | "international";
  accommodations: string;
  image: string;
  badge?: string;
};

const destinations: DestinationItem[] = [
  {
    id: "bangalore",
    name: "Bangalore",
    category: "india",
    accommodations: "5,372 accommodations",
    image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=600&q=80",
    badge: "Tech Hub",
  },
  {
    id: "mumbai",
    name: "Mumbai",
    category: "india",
    accommodations: "4,177 accommodations",
    image: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=600&q=80",
    badge: "Financial Capital",
  },
  {
    id: "new-delhi",
    name: "New Delhi",
    category: "india",
    accommodations: "12,786 accommodations",
    image: "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "dubai",
    name: "Dubai",
    category: "international",
    accommodations: "19,464 accommodations",
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=600&q=80",
    badge: "Trending",
  },
  {
    id: "bangkok",
    name: "Bangkok",
    category: "international",
    accommodations: "12,048 accommodations",
    image: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "hyderabad",
    name: "Hyderabad",
    category: "india",
    accommodations: "2,735 accommodations",
    image: "https://images.unsplash.com/photo-1605379399642-870262d3d051?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "london",
    name: "London",
    category: "international",
    accommodations: "8,920 accommodations",
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=600&q=80",
    badge: "Top Pick",
  },
  {
    id: "singapore",
    name: "Singapore",
    category: "international",
    accommodations: "4,510 accommodations",
    image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "chennai",
    name: "Chennai",
    category: "india",
    accommodations: "2,832 accommodations",
    image: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=600&q=80",
  },
];

export function DestinationsCarousel() {
  const [filter, setFilter] = useState<"all" | "india" | "international">("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredItems = destinations.filter(
    (item) => filter === "all" || item.category === filter
  );

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const distance = 320;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      {/* Header & Controls */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--hk-ink)] sm:text-3xl">
            Popular destinations
          </h2>
          <p className="mt-1 text-sm text-[var(--hk-muted)]">
            Handpicked business hubs &amp; leisure cities with verified stays.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(["all", "india", "international"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${
                filter === tab
                  ? "bg-[var(--hk-navy-strong)] text-white shadow-sm"
                  : "bg-white text-[var(--hk-ink)] border border-[rgba(196,198,206,0.6)] hover:border-[var(--hk-navy-strong)]"
              }`}
            >
              {tab === "all" && "All Destinations"}
              {tab === "india" && "Top Destinations in India"}
              {tab === "international" && "Outside India"}
            </button>
          ))}
        </div>
      </div>

      {/* Carousel Wrapper */}
      <div className="relative group">
        {/* Navigation Arrow Left */}
        <button
          type="button"
          onClick={() => handleScroll("left")}
          aria-label="Scroll left"
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--hk-navy-strong)] shadow-lg backdrop-blur-md transition-all hover:bg-white hover:scale-110 active:scale-95 border border-gray-100"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Navigation Arrow Right */}
        <button
          type="button"
          onClick={() => handleScroll("right")}
          aria-label="Scroll right"
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--hk-navy-strong)] shadow-lg backdrop-blur-md transition-all hover:bg-white hover:scale-110 active:scale-95 border border-gray-100"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Cards Scroll Container */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto pb-4 pt-1 no-scrollbar scroll-smooth"
        >
          {filteredItems.map((item) => (
            <Link
              key={item.id}
              href={`/search?destination=${encodeURIComponent(item.name)}`}
              className="group/card relative flex h-[280px] w-[210px] shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-slate-900 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl sm:h-[320px] sm:w-[230px]"
            >
              {/* Background Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={item.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-110"
              />
              
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              {/* Badge if present */}
              {item.badge && (
                <span className="absolute top-3 left-3 rounded-full bg-[var(--hk-gold-light)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--hk-navy-strong)] shadow-md">
                  {item.badge}
                </span>
              )}

              {/* Text content */}
              <div className="relative z-10 p-4 text-white">
                <h3 className="text-xl font-bold tracking-tight text-white group-hover/card:text-[var(--hk-gold-light)] transition-colors">
                  {item.name}
                </h3>
                <p className="mt-1 text-xs text-white/80 font-medium">
                  {item.accommodations}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
