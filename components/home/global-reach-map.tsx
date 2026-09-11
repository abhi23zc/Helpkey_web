import Link from "next/link";
import { WorldMapGraphic } from "@/components/join/world-map";

type MapPin = {
  id: string;
  city: string;
  country: string;
  xPercent: number; // Position on map 0-100%
  yPercent: number; // Position on map 0-100%
  image: string;
  staysCount: string;
};

const mapPins: MapPin[] = [
  {
    id: "london",
    city: "London",
    country: "United Kingdom",
    xPercent: 47,
    yPercent: 28,
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=150&q=80",
    staysCount: "2,450+ stays",
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
  },
  {
    id: "new-york",
    city: "New York",
    country: "United States",
    xPercent: 28,
    yPercent: 35,
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=150&q=80",
    staysCount: "4,100+ stays",
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
  },
  {
    id: "bangalore",
    city: "Bangalore",
    country: "India",
    xPercent: 69,
    yPercent: 52,
    image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=150&q=80",
    staysCount: "5,372+ stays",
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
  { name: "India", color: "bg-emerald-500", href: "/search?destination=India" },
  { name: "United States", color: "bg-sky-500", href: "/search?destination=US" },
  { name: "United Kingdom", color: "bg-amber-500", href: "/search?destination=UK" },
  { name: "UAE & Middle East", color: "bg-purple-500", href: "/search?destination=Dubai" },
  { name: "Singapore & SE Asia", color: "bg-rose-500", href: "/search?destination=Singapore" },
  { name: "Japan", color: "bg-indigo-500", href: "/search?destination=Japan" },
];

export function GlobalReachSection() {
  return (
    <section className="w-full mb-16 lg:mb-24" style={{ backgroundColor: "#fefeff61" }}>
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
          
          {/* Map Column */}
          <div className="relative min-h-[340px] sm:min-h-[420px] w-full lg:col-span-7 flex items-center justify-center">
            
            {/* World Map Dot Pattern + Landmass SVG Background */}
            <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
              <WorldMapGraphic className="h-full w-full object-contain text-[var(--hk-navy-strong)]" />
            </div>

            {/* Dotted Grid Background Texture */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(#0b1f3a 1.2px, transparent 1.2px)`,
                backgroundSize: "18px 18px",
              }}
            />

            {/* Static Floating City Pins Overlay */}
            <div className="relative h-full min-h-[320px] w-full sm:min-h-[380px]">
              {mapPins.map((pin) => (
                <div
                  key={pin.id}
                  style={{ left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                >
                  <div className="relative flex items-center justify-center rounded-full bg-white shadow-md">
                    <div className="relative h-8 w-8 overflow-hidden rounded-full border-2 border-white sm:h-10 sm:w-10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pin.image}
                        alt={pin.city}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* Info & Stats Column */}
          <div className="flex flex-col justify-center lg:col-span-5 lg:pl-4">
            
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-[var(--hk-ink)] sm:text-4xl">
              There&apos;s a Helpkey around. <span className="text-[var(--hk-ink)]">Always.</span>
            </h2>

            <p className="mt-3 text-base text-[var(--hk-muted)] leading-relaxed">
              More Destinations. More Ease. Transparent Corporate Rates.
            </p>

            {/* OYO Style Big Stats Row with Slash Separator */}
            <div className="mt-8 flex items-baseline gap-6 sm:gap-8">
              <div>
                <div className="text-4xl font-black text-[var(--hk-ink)] sm:text-5xl">50+</div>
                <div className="mt-1 text-sm font-medium text-[var(--hk-muted)]">Countries &amp; Regions</div>
              </div>

              {/* Slash Divider */}
              <div className="text-4xl font-light text-[var(--hk-border-strong)] sm:text-5xl">/</div>

              <div>
                <div className="text-4xl font-black text-[var(--hk-ink)] sm:text-5xl">174,000+</div>
                <div className="mt-1 text-sm font-medium text-[var(--hk-muted)]">Hotels &amp; Homes</div>
              </div>
            </div>

            {/* Country tags grid matching OYO dot bullet layout */}
            <div className="mt-10">
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 sm:grid-cols-3">
                {countryHighlights.map((c) => (
                  <Link
                    key={c.name}
                    href={c.href}
                    className="flex items-center gap-2.5 text-left text-sm font-bold text-[var(--hk-ink)] hover:text-[var(--hk-navy-strong)] transition-colors"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${c.color} shrink-0`} />
                    <span className="truncate">{c.name}</span>
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
