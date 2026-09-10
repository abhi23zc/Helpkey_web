"use client";

import Link from "next/link";
import { useState } from "react";

type PropertyItem = {
  id: string;
  slug: string;
  name: string;
  city: string;
  locationSubtext: string;
  ratingScore: number;
  priceFormatted: string;
  image: string;
  stars: number;
};

const featuredByCity: Record<string, PropertyItem[]> = {
  Bangalore: [
    {
      id: "homeslice-sarjapur",
      slug: "homeslice-sarjapur",
      name: "HomeSlice Sarjapur",
      city: "Bangalore",
      locationSubtext: "Electronic City, Bangalore",
      ratingScore: 9.1,
      priceFormatted: "₹1,241.49",
      image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80",
      stars: 4,
    },
    {
      id: "icon-grand-bhagini",
      slug: "icon-grand-bhagini",
      name: "ICON GRAND HOTEL BY BHAGINI",
      city: "Bangalore",
      locationSubtext: "Whitefield, Bangalore",
      ratingScore: 8.5,
      priceFormatted: "₹3,205.71",
      image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80",
      stars: 4,
    },
    {
      id: "sliceinn-sylva",
      slug: "sliceinn-sylva",
      name: "Sliceinn Sylva, Wilson Garden, Bangalore",
      city: "Bangalore",
      locationSubtext: "Kormangala, Bangalore",
      ratingScore: 8.2,
      priceFormatted: "₹2,057.79",
      image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80",
      stars: 3,
    },
    {
      id: "move-inn-obs",
      slug: "move-inn-obs",
      name: "Move-Inn OBS Serviced Apartments Koramangala",
      city: "Bangalore",
      locationSubtext: "Koramangala, Bangalore",
      ratingScore: 9.1,
      priceFormatted: "₹3,205.12",
      image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=600&q=80",
      stars: 4,
    },
  ],
  Mumbai: [
    {
      id: "taj-lands-end",
      slug: "taj-lands-end",
      name: "The Oberoi Grand Marine",
      city: "Mumbai",
      locationSubtext: "Bandra West, Mumbai",
      ratingScore: 9.4,
      priceFormatted: "₹4,590.00",
      image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=600&q=80",
      stars: 5,
    },
    {
      id: "st-regis-mumbai",
      slug: "st-regis-mumbai",
      name: "The Regent Mumbai Central",
      city: "Mumbai",
      locationSubtext: "Lower Parel, Mumbai",
      ratingScore: 9.2,
      priceFormatted: "₹5,200.00",
      image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=600&q=80",
      stars: 5,
    },
    {
      id: "juhu-beach-suites",
      slug: "juhu-beach-suites",
      name: "Juhu Beachfront Executive Suites",
      city: "Mumbai",
      locationSubtext: "Juhu, Mumbai",
      ratingScore: 8.8,
      priceFormatted: "₹2,890.00",
      image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=80",
      stars: 4,
    },
  ],
  "New Delhi": [
    {
      id: "taj-palace-delhi",
      slug: "taj-palace-delhi",
      name: "Imperial Diplomatic Enclave",
      city: "New Delhi",
      locationSubtext: "Chanakyapuri, New Delhi",
      ratingScore: 9.3,
      priceFormatted: "₹3,950.00",
      image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=600&q=80",
      stars: 5,
    },
    {
      id: "aerocity-executive-hub",
      slug: "aerocity-executive-hub",
      name: "Aerocity Business Plaza & Suites",
      city: "New Delhi",
      locationSubtext: "Aerocity, New Delhi",
      ratingScore: 8.9,
      priceFormatted: "₹2,750.00",
      image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80",
      stars: 4,
    },
  ],
  Hyderabad: [
    {
      id: "hitec-city-suites",
      slug: "hitec-city-suites",
      name: "HITEC City Luxury Apartments",
      city: "Hyderabad",
      locationSubtext: "HITEC City, Hyderabad",
      ratingScore: 9.0,
      priceFormatted: "₹2,100.00",
      image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80",
      stars: 4,
    },
  ],
  Chennai: [
    {
      id: "omr-business-hotel",
      slug: "omr-business-hotel",
      name: "OMR IT Corridor Executive Hotel",
      city: "Chennai",
      locationSubtext: "OMR, Chennai",
      ratingScore: 8.7,
      priceFormatted: "₹1,850.00",
      image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80",
      stars: 4,
    },
  ],
};

const citiesList = ["Bangalore", "Mumbai", "New Delhi", "Hyderabad", "Chennai"];

export function FeaturedStaysTabs() {
  const [selectedCity, setSelectedCity] = useState("Bangalore");
  const properties = featuredByCity[selectedCity] || [];

  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      {/* Section Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--hk-ink)] sm:text-3xl">
          Featured homes recommended for you
        </h2>
      </div>

      {/* City Tabs Bar (Helpkey Midnight Navy underline selector) */}
      <div className="mb-6 flex items-center justify-between border-b border-[rgba(196,198,206,0.6)]">
        <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
          {citiesList.map((city) => {
            const isActive = selectedCity === city;
            return (
              <button
                key={city}
                type="button"
                onClick={() => setSelectedCity(city)}
                className={`relative pb-3 text-sm font-bold transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-[var(--hk-navy-strong)] border-b-2 border-[var(--hk-navy-strong)]"
                    : "text-[var(--hk-muted)] hover:text-[var(--hk-ink)]"
                }`}
              >
                {city}
              </button>
            );
          })}
        </div>

        <Link
          href={`/search?destination=${encodeURIComponent(selectedCity)}`}
          className="hidden text-sm font-bold text-[var(--hk-navy-strong)] hover:text-[var(--hk-gold-strong)] sm:flex items-center gap-1"
        >
          See more ({selectedCity}) properties &gt;
        </Link>
      </div>

      {/* Property Cards Grid (Helpkey Theme styled clean cards) */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {properties.map((stay) => (
          <Link
            key={stay.id}
            href={`/hotels/${stay.slug}`}
            className="group flex flex-col transition-all"
          >
            {/* Image Container with Midnight Navy Rating Score Badge */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stay.image}
                alt={stay.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Helpkey Midnight Navy Rating Score Badge */}
              <div className="absolute top-2.5 right-2.5 rounded-md bg-[var(--hk-navy-strong)] px-2 py-0.5 text-xs font-extrabold text-white shadow-md">
                {stay.ratingScore.toFixed(1)}
              </div>
            </div>

            {/* Title & Details */}
            <div className="mt-3 flex flex-col">
              <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--hk-ink)] group-hover:text-[var(--hk-navy-strong)] transition-colors">
                {stay.name}
              </h3>

              {/* Rating Stars & Location Pin */}
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <span className="text-[var(--hk-rating)] tracking-tighter">
                  {"★".repeat(stay.stars)}
                </span>
                <svg className="h-3.5 w-3.5 text-[var(--hk-navy-strong)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold text-[var(--hk-navy-strong)] hover:underline">
                  {stay.locationSubtext}
                </span>
              </div>

              {/* Fee Subtext */}
              <div className="mt-2 text-[11px] font-medium text-[var(--hk-muted)]">
                Per night before taxes and fees
              </div>

              {/* Price Line (Midnight Navy Theme Primary) */}
              <div className="mt-0.5 text-[18px] font-extrabold text-[var(--hk-navy-strong)]">
                {stay.priceFormatted}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Mobile Link for See More */}
      <div className="mt-6 text-center sm:hidden">
        <Link
          href={`/search?destination=${encodeURIComponent(selectedCity)}`}
          className="text-xs font-bold text-[var(--hk-navy-strong)] underline"
        >
          See more ({selectedCity}) properties &gt;
        </Link>
      </div>
    </section>
  );
}
