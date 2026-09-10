"use client";

import Link from "next/link";
import { useRef } from "react";

type PromoBanner = {
  id: string;
  title: string;
  imageUrl: string;
  href: string;
};

const promos: PromoBanner[] = [
  {
    id: "deals-page",
    title: "Grab All Your DEALS!",
    imageUrl: "https://cdn6.agoda.net/images/WebCampaign/dealspagebanner_hp_web/en-us.png",
    href: "/search?sort=price_low_to_high",
  },
  {
    id: "idfc-offer",
    title: "Extra 12% OFF with IDFC FIRST Bank",
    imageUrl: "https://cdn6.agoda.net/images/WebCampaign/RTA/2607_IDFC_hp/homeweb/en-us.png",
    href: "/search?amenity=business_ready",
  },
  {
    id: "singapore-season",
    title: "Singapore - Always In Season",
    imageUrl: "https://cdn6.agoda.net/images/WebCampaign/2026_Q3_SG_AlwaysInSeason/home_banner_web/en-us.png",
    href: "/search?destination=Singapore",
  },
  {
    id: "double-day",
    title: "Mega Savings Double Day Sale",
    imageUrl: "https://cdn6.agoda.net/images/WebCampaign/2026_Q3_SS_DoubleDay99/home_banner_web/en-us.png",
    href: "/search",
  },
  {
    id: "visit-malaysia",
    title: "Visit Malaysia - Exclusive Travel Offers",
    imageUrl: "https://cdn6.agoda.net/images/WebCampaign/2026_Q3_MY_VisitMalaysia/home_banner_web/en-us.png",
    href: "/search?destination=Malaysia",
  },
];

export function PromotionsCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const distance = 360;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--hk-ink)] sm:text-3xl">
            Accommodation Promotions
          </h2>
          <p className="mt-1 text-sm text-[var(--hk-muted)]">
            Exclusive bank offers, seasonal discounts, and instant promo savings.
          </p>
        </div>
        <Link
          href="/search"
          className="mt-2 text-xs font-bold text-[var(--hk-navy-strong)] hover:underline sm:mt-0"
        >
          View all deals &rarr;
        </Link>
      </div>

      {/* Carousel Container */}
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

        {/* Banners Scroll Row */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto pb-4 pt-1 no-scrollbar scroll-smooth"
        >
          {promos.map((promo) => (
            <Link
              key={promo.id}
              href={promo.href}
              className="group/banner relative flex h-[190px] w-[320px] shrink-0 overflow-hidden rounded-2xl border border-[rgba(196,198,206,0.5)] bg-slate-900 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:h-[210px] sm:w-[350px]"
            >
              {/* Banner Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={promo.imageUrl}
                alt={promo.title}
                className="h-full w-full object-cover transition-transform duration-700 group-hover/banner:scale-105"
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
