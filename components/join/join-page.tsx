"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { LoginModal } from "@/components/auth/login-modal";
import { WorldMapGraphic } from "./world-map";

export function JoinPage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [propertyType, setPropertyType] = useState("Hotel");
  const [location, setLocation] = useState("");
  const [rooms, setRooms] = useState(1);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleStartListing = (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    setIsLoginOpen(true);
  };

  return (
    <div className="min-h-screen bg-[var(--hk-background-warm)] text-[var(--hk-ink)]">
      <Navbar onLoginClick={() => setIsLoginOpen(true)} />
      
      <main>
        <HeroSection
          propertyType={propertyType}
          location={location}
          rooms={rooms}
          onPropertyTypeChange={setPropertyType}
          onLocationChange={setLocation}
          onRoomsChange={setRooms}
          onStartListing={handleStartListing}
          onLoginClick={() => setIsLoginOpen(true)}
        />
        <GlobalReachSection onLoginClick={() => setIsLoginOpen(true)} />
        <TestimonialsSection />
        <SimpleToStartSection onLoginClick={() => setIsLoginOpen(true)} />
        <PaymentsSection onLoginClick={() => setIsLoginOpen(true)} />
        <TrustSection onLoginClick={() => setIsLoginOpen(true)} />
      </main>

      <Footer />

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}

/* ─────────────────────────────────── NAVBAR ─────────────────────────────────── */

function Navbar({ onLoginClick }: { onLoginClick: () => void }) {
  const { appUser, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b border-[rgba(196,198,206,0.7)] bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-8 lg:gap-12">
          <Link
            href="/"
            className="flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.03em] text-[var(--hk-primary-dark)]"
          >
            <KeyIcon className="h-5 w-5 text-[var(--hk-gold)]" />
            Helpkey
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link
              href="/join"
              className="border-b-2 border-[var(--hk-primary-dark)] pb-1 text-[14px] font-bold text-[var(--hk-primary-dark)]"
            >
              For Business
            </Link>
            <Link
              href="/"
              className="text-[14px] font-medium text-[var(--hk-muted)] transition-colors hover:text-[var(--hk-primary-dark)]"
            >
              Find Stays
            </Link>
            <Link
              href="/search"
              className="text-[14px] font-medium text-[var(--hk-muted)] transition-colors hover:text-[var(--hk-primary-dark)]"
            >
              Deals
            </Link>
            <Link
              href="/help"
              className="text-[14px] font-medium text-[var(--hk-muted)] transition-colors hover:text-[var(--hk-primary-dark)]"
            >
              Help
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-5 sm:gap-6">
          <div className="hidden items-center gap-4 text-[var(--hk-muted)] md:flex">
            <button className="transition-colors hover:text-[var(--hk-ink)]" aria-label="Select Language">
              <GlobeIcon className="h-5 w-5" />
            </button>
            <button className="transition-colors hover:text-[var(--hk-ink)]" aria-label="Favorites">
              <HeartIcon className="h-5 w-5" />
            </button>
            <span className="text-[14px] font-semibold">USD</span>
          </div>

          {appUser ? (
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-bold text-[var(--hk-primary-dark)]">
                Hi, {appUser.fullName.split(" ")[0]}
              </span>
              <button
                onClick={() => void logout()}
                className="rounded-lg border border-[var(--hk-border)] px-4 py-2 text-[13px] font-semibold text-[var(--hk-ink)] hover:bg-gray-50"
              >
                Log out
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onLoginClick}
                className="hidden text-[14px] font-bold text-[var(--hk-primary-dark)] hover:underline lg:block"
              >
                Already a partner? Sign in
              </button>
              <button
                onClick={onLoginClick}
                className="rounded-lg bg-[var(--hk-primary-dark)] px-5 py-2.5 text-[14px] font-bold text-white shadow-sm transition-all hover:bg-[var(--hk-primary)] hover:shadow-md"
              >
                Register for free
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────────────── HERO SECTION ─────────────────────────────────── */

function HeroSection({
  propertyType,
  location,
  rooms,
  onPropertyTypeChange,
  onLocationChange,
  onRoomsChange,
  onStartListing,
  onLoginClick,
}: {
  propertyType: string;
  location: string;
  rooms: number;
  onPropertyTypeChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onRoomsChange: (v: number) => void;
  onStartListing: (e: React.FormEvent) => void;
  onLoginClick: () => void;
}) {
  return (
    <section className="relative overflow-hidden bg-[var(--hk-primary-dark)] pb-20 pt-12 text-white lg:pb-28 lg:pt-20">
      {/* Background Image & Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBMFKIV2LK63Vo6ucUFglcR-pXa2HRvTNDYbcf_-RzIVvezRL8TBQBhsttmeBz7-Nk7H2wvP3-E09JQdVskfGCZBssk58Z23JFX9_5-x0vn1gqXMtXfau5ooVXTysZkpWnCHOQPibTtRwWmdLMDqgvUOpGoHATTZUaU4-_rri15L2XCyTvPHljjhedqGh2QcszBUOa0S0aPbgV-aNw1PHL1NVx_I9kf751fyHnBoGZ7sDIDAshAQnBa5w"
          alt="Luxury hotel room interior"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-25 mix-blend-luminosity"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--hk-primary-dark)] via-[var(--hk-primary-dark)]/90 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-10">
        {/* Left Column */}
        <div className="lg:col-span-7">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--hk-gold)]">
            LIST YOUR PROPERTY ON HELPKEY
          </p>
          <h1 className="mb-6 text-[38px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[48px] lg:text-[54px]">
            Earn more from every stay
          </h1>
          <p className="mb-8 max-w-2xl text-[17px] leading-relaxed text-white/85 sm:text-[19px]">
            Reach business travelers, families, couples, and tourists with a trusted hotel booking platform built for modern hosts.
          </p>

          <div className="mb-10 flex flex-wrap gap-4">
            <button
              onClick={onLoginClick}
              className="rounded-lg bg-[var(--hk-gold)] px-8 py-4 text-[15px] font-bold text-[var(--hk-primary-dark)] shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#e3c27b] hover:shadow-lg"
            >
              Register for free
            </button>
            <a
              href="#how-it-works"
              className="rounded-lg border border-white/40 bg-white/10 px-8 py-4 text-[15px] font-bold text-white transition-all hover:bg-white/20"
            >
              See how it works
            </a>
          </div>

          <ul className="space-y-3.5 text-[15px] font-medium text-white/90">
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-[var(--hk-success)]" />
              <span>Free to get started</span>
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-[var(--hk-success)]" />
              <span>Manage bookings from one dashboard</span>
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-[var(--hk-success)]" />
              <span>Flexible booking rules</span>
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-[var(--hk-success)]" />
              <span>Secure partner verification</span>
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-[var(--hk-success)]" />
              <span>Fast payouts after check-in</span>
            </li>
          </ul>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/20 bg-white p-8 text-[var(--hk-ink)] shadow-2xl backdrop-blur-md">
            <h2 className="mb-6 text-[24px] font-bold tracking-[-0.02em] text-[var(--hk-primary-dark)]">
              Get started now
            </h2>
            <form onSubmit={onStartListing} className="space-y-5">
              <div>
                <label className="mb-2 block text-[13px] font-semibold text-[var(--hk-ink)]">
                  Property type
                </label>
                <select
                  value={propertyType}
                  onChange={(e) => onPropertyTypeChange(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hk-border)] bg-[var(--hk-background-warm)] p-3.5 text-[15px] text-[var(--hk-ink)] outline-none transition-all focus:border-[var(--hk-primary-dark)] focus:ring-2 focus:ring-[rgba(11,31,58,0.1)]"
                >
                  <option value="Hotel">Hotel</option>
                  <option value="Apartment">Apartment</option>
                  <option value="Villa">Villa</option>
                  <option value="Resort">Resort</option>
                  <option value="Boutique Stay">Boutique Stay</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[13px] font-semibold text-[var(--hk-ink)]">
                  Property location
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => onLocationChange(e.target.value)}
                  placeholder="e.g. London, UK or Mumbai, India"
                  className="w-full rounded-lg border border-[var(--hk-border)] bg-[var(--hk-background-warm)] p-3.5 text-[15px] text-[var(--hk-ink)] outline-none transition-all placeholder:text-gray-400 focus:border-[var(--hk-primary-dark)] focus:ring-2 focus:ring-[rgba(11,31,58,0.1)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[13px] font-semibold text-[var(--hk-ink)]">
                  Number of rooms
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={rooms}
                  onChange={(e) => onRoomsChange(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-[var(--hk-border)] bg-[var(--hk-background-warm)] p-3.5 text-[15px] text-[var(--hk-ink)] outline-none transition-all focus:border-[var(--hk-primary-dark)] focus:ring-2 focus:ring-[rgba(11,31,58,0.1)]"
                />
              </div>

              <button
                type="submit"
                className="mt-4 w-full rounded-lg bg-[var(--hk-primary-dark)] py-4 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[var(--hk-primary)] hover:shadow-lg"
              >
                Start listing
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── GLOBAL REACH SECTION ─────────────────────────────────── */

function GlobalReachSection({ onLoginClick }: { onLoginClick: () => void }) {
  const stats = [
    {
      value: "1.8+ billion",
      description: "vacation rental guests since 2010.",
    },
    {
      value: "1 in every 3",
      description: "room nights booked in 2024 was a vacation rental.",
    },
    {
      value: "48% of nights",
      description: "booked were for international stays at the end of 2023.",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-white py-20 lg:py-28">
      {/* Background World Map Graphic */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.12]">
        <WorldMapGraphic className="h-full w-full max-w-[1200px] text-[var(--hk-primary-dark)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <h2 className="mb-14 text-left text-[32px] font-extrabold tracking-[-0.03em] text-[var(--hk-primary-dark)] sm:text-[42px] lg:text-[48px]">
          Reach a unique global customer base
        </h2>

        <div className="mb-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          {stats.map((stat, i) => (
            <div key={i} className="flex flex-col">
              <span className="text-[38px] font-extrabold tracking-tight text-[var(--hk-primary-dark)] sm:text-[46px] lg:text-[52px]">
                {stat.value}
              </span>
              <p className="mt-3 text-[16px] leading-relaxed text-[var(--hk-muted)] sm:text-[18px]">
                {stat.description}
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={onLoginClick}
          className="rounded-lg bg-[var(--hk-navy-strong)] px-8 py-4 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[var(--hk-primary)] hover:shadow-lg"
        >
          Reach new guests today
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── TESTIMONIALS SECTION ─────────────────────────────────── */

function TestimonialsSection() {
  const testimonials = [
    {
      quote: `"I was able to list within 15 minutes, and no more than two hours later, I had my first booking!"`,
      author: "Parley Rose",
      role: "UK-based host",
      featured: false,
    },
    {
      quote: `"Helpkey is the most straightforward platform to work with. Everything is clear. It's easy. And it frees us up to focus on the aspects that we can really add value to, like the guest experience."`,
      author: "Martin Fieldman",
      role: "Managing Director",
      featured: true,
    },
    {
      quote: `"Helpkey accounts for our largest share of guests and has helped get us where we are today."`,
      author: "Michel and Asja",
      role: "Owners",
      featured: false,
    },
  ];

  return (
    <section className="bg-white py-16 lg:py-24 border-t border-[var(--hk-border)]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <h2 className="mb-14 text-center text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-primary-dark)] sm:text-[38px]">
          What hosts like you say
        </h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {testimonials.map((item, i) => (
            <div
              key={i}
              className={`flex flex-col justify-between rounded-xl p-8 transition-all ${
                item.featured
                  ? "relative -translate-y-2 border-2 border-[var(--hk-primary-dark)] bg-white shadow-xl"
                  : "border border-[var(--hk-gold)] bg-white shadow-sm hover:shadow-md"
              }`}
            >
              <p className="mb-8 text-[16px] leading-relaxed text-[var(--hk-ink)] italic">
                {item.quote}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--hk-primary-dark)] text-white">
                  <UserAvatarIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[var(--hk-primary-dark)]">
                    {item.author}
                  </p>
                  <p className="text-[13px] text-[var(--hk-muted)]">{item.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── SIMPLE TO START SECTION ─────────────────────────────────── */

function SimpleToStartSection({ onLoginClick }: { onLoginClick: () => void }) {
  const steps = [
    {
      title: "Import your property details",
      description:
        "Seamlessly import your property information from other travel sites and avoid double-bookings with calendar sync.",
      icon: ImportExportIcon,
    },
    {
      title: "Start fast with review scores",
      description:
        "Your review scores from other travel sites are converted and displayed on your property page before your first guests leave reviews.",
      icon: StarBadgeIcon,
    },
    {
      title: "Stand out in the market",
      description:
        "The \"New to Helpkey\" label helps you stand out prominently in our search results.",
      icon: SearchSparkIcon,
    },
  ];

  return (
    <section id="how-it-works" className="relative overflow-hidden bg-[var(--hk-background-warm)] py-16 lg:py-24">
      {/* Background World Map Graphic */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.08]">
        <WorldMapGraphic className="h-full w-full max-w-[1200px] text-[var(--hk-primary-dark)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 text-center sm:px-6 lg:px-10">
        <h2 className="mb-14 text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-primary-dark)] sm:text-[38px]">
          Simple to start and stay ahead
        </h2>

        <div className="mb-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex flex-col items-center px-4 text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-md">
                  <Icon className="h-10 w-10 text-[var(--hk-gold)]" />
                </div>
                <h3 className="mb-3 text-[20px] font-bold text-[var(--hk-primary-dark)]">
                  {item.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-[var(--hk-muted)]">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        <button
          onClick={onLoginClick}
          className="rounded-lg bg-[var(--hk-primary-dark)] px-8 py-4 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[var(--hk-primary)] hover:shadow-lg"
        >
          Get started today
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── PAYMENTS SECTION ─────────────────────────────────── */

function PaymentsSection({ onLoginClick }: { onLoginClick: () => void }) {
  const points = [
    {
      title: "Payments made easy",
      desc: "We facilitate the payment process for you, freeing up your time to grow your business.",
    },
    {
      title: "Daily payouts in select markets",
      desc: "Get payouts faster! We'll send your payouts 24 hours after guests check out.",
    },
    {
      title: "Greater revenue security",
      desc: "Whenever guests complete prepaid reservations at your property and pay online, you're guaranteed payment.",
    },
    {
      title: "One-stop solution for multiple listings",
      desc: "Save time managing finances with group invoicing and reconciliation tools.",
    },
    {
      title: "More control over your cash flow",
      desc: "Choose payout method and timing based on regional availability.",
    },
    {
      title: "Reduced risk",
      desc: "We help you stay compliant with regulatory changes and reduce the risk of fraud and chargebacks.",
    },
  ];

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <h2 className="mb-14 max-w-3xl text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-primary-dark)] sm:text-[38px]">
          Take control of your finances with Payments by Helpkey
        </h2>

        <div className="mb-12 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
          {points.map((item, i) => (
            <div key={i} className="flex items-start gap-4">
              <CheckCircleIcon className="mt-1 h-6 w-6 shrink-0 text-[var(--hk-primary-dark)]" />
              <div>
                <h3 className="mb-1 text-[17px] font-bold text-[var(--hk-primary-dark)]">
                  {item.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-[var(--hk-muted)]">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onLoginClick}
          className="rounded-lg bg-[var(--hk-primary-dark)] px-8 py-4 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[var(--hk-primary)] hover:shadow-lg"
        >
          Start earning today
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── TRUST SECTION ─────────────────────────────────── */

function TrustSection({ onLoginClick }: { onLoginClick: () => void }) {
  const columns = [
    {
      title: "Your rental, your rules",
      items: [
        "Accept or decline bookings with Request to Book.",
        "Manage guests' expectations by setting up clear house rules.",
      ],
    },
    {
      title: "Get to know your guests",
      items: [
        "Communicate with your guests before accepting their stay with pre-booking messaging.",
        "Access guest travel history insights.",
      ],
    },
    {
      title: "Stay protected",
      items: [
        "Up to $1 million liability protection against claims from guests and neighbors at no extra cost.",
        "Selection of flexible damage protection options to choose from.",
      ],
    },
  ];

  return (
    <section className="bg-[var(--hk-background-warm)] py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <h2 className="mb-14 text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-primary-dark)] sm:text-[38px]">
          Host worry-free. We&apos;ve got your back
        </h2>

        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-3">
          {columns.map((col, i) => (
            <div key={i}>
              <h3 className="mb-6 text-[19px] font-bold text-[var(--hk-primary-dark)]">
                {col.title}
              </h3>
              <ul className="space-y-5">
                {col.items.map((text, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircleIcon className="mt-1 h-5 w-5 shrink-0 text-[var(--hk-primary-dark)]" />
                    <p className="text-[15px] leading-relaxed text-[var(--hk-muted)]">
                      {text}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <button
          onClick={onLoginClick}
          className="rounded-lg bg-[var(--hk-primary-dark)] px-8 py-4 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[var(--hk-primary)] hover:shadow-lg"
        >
          Host with us today
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── FOOTER ─────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-[rgba(196,198,206,0.7)] bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-4 py-14 sm:px-6 md:grid-cols-4 lg:px-10">
        <div>
          <Link
            href="/"
            className="flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.03em] text-[var(--hk-primary-dark)]"
          >
            <KeyIcon className="h-5 w-5 text-[var(--hk-gold)]" />
            Helpkey
          </Link>
          <p className="mt-4 text-[13px] text-[var(--hk-muted)]">
            © 2024 Helpkey International. All rights reserved.
          </p>
        </div>

        <div>
          <h4 className="mb-4 text-[15px] font-bold text-[var(--hk-primary-dark)]">Company</h4>
          <ul className="space-y-3 text-[14px] text-[var(--hk-muted)]">
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">About Us</a></li>
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Careers</a></li>
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Press</a></li>
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Sustainability</a></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-[15px] font-bold text-[var(--hk-primary-dark)]">Support</h4>
          <ul className="space-y-3 text-[14px] text-[var(--hk-muted)]">
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Help Center</a></li>
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Partner Support</a></li>
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Contact Us</a></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-[15px] font-bold text-[var(--hk-primary-dark)]">Legal</h4>
          <ul className="space-y-3 text-[14px] text-[var(--hk-muted)]">
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Terms of Service</a></li>
            <li><a href="#" className="hover:text-[var(--hk-primary-dark)]">Cookie Policy</a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────── ICONS ─────────────────────────────────── */

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14.5 8.5a4.5 4.5 0 1 1-8.63 1.75A4.5 4.5 0 0 1 14.5 8.5ZM14.5 8.5H22m-3.5 0v3.25m-3.25-3.25V12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="8.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.35 0 4.25-4.03 4.25-9S14.35 3 12 3 7.75 7.03 7.75 12 9.65 21 12 21Zm-8-9h16M5.56 6.75h12.88M5.56 17.25h12.88"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m12 20.5-1.1-1C5.7 14.8 3 12.3 3 8.95 3 6.44 4.96 4.5 7.45 4.5c1.42 0 2.79.66 3.67 1.82A4.63 4.63 0 0 1 14.8 4.5C17.3 4.5 19.25 6.44 19.25 8.95c0 3.36-2.7 5.84-7.9 10.56l-1.1 1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <path
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8.5 12.5L11 15L15.5 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserAvatarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.5-7 5v1h14v-1c0-2.5-3-5-7-5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ImportExportIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3v14m0 0l-4-4m4 4l4-4M17 21V7m0 0l-4 4m4-4l4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchSparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
