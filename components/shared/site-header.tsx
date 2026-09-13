"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";

type IconProps = {
  className?: string;
};

export type SiteHeaderNavItem = {
  label: string;
  href: string;
};

const TRAVELER_NAV_ITEMS: SiteHeaderNavItem[] = [
  { label: "Find Stays", href: "/search" },
  { label: "Deals", href: "/search" },
  { label: "For Business", href: "/join" },
  { label: "Help", href: "/help" },
];

const PARTNER_NAV_ITEMS: SiteHeaderNavItem[] = [
  { label: "Why list with us", href: "/partner" },
  { label: "How it works", href: "/join" },
  { label: "Help", href: "/help" },
];

/**
 * Shared brand mark used across every header variant so the logo never
 * drifts between pages.
 */
export function BrandMark({ tagline }: { tagline?: string }) {
  return (
    <span className="flex flex-col leading-none">
      <span className="flex items-center gap-2 text-[21px] font-bold tracking-[-0.03em]">
        <KeyIcon className="h-4 w-4 text-[var(--hk-gold-strong)]" />
        Helpkey
      </span>
      {tagline ? (
        <span className="mt-0.5 hidden text-[10px] font-medium leading-none text-white/75 sm:block">
          {tagline}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Single source of truth for the site header. Renders the traveler-facing
 * header (white, business/traveler audience toggle, auth-aware profile menu)
 * by default, or the partner header (navy, partner-specific nav) via
 * `variant="partner"`. Both variants share the same logo, typography scale,
 * and theme tokens so the header stays consistent across the app.
 */
export function SiteHeader({
  variant = "traveler",
  activeHref,
  onLoginClick,
  showAudienceToggle = true,
}: {
  variant?: "traveler" | "partner";
  activeHref?: string;
  onLoginClick?: () => void;
  showAudienceToggle?: boolean;
}) {
  if (variant === "partner") {
    return <PartnerHeader />;
  }

  return (
    <TravelerHeader
      activeHref={activeHref}
      onLoginClick={onLoginClick}
      showAudienceToggle={showAudienceToggle}
    />
  );
}

function TravelerHeader({
  activeHref,
  onLoginClick,
  showAudienceToggle,
}: {
  activeHref?: string;
  onLoginClick?: () => void;
  showAudienceToggle: boolean;
}) {
  const { appUser, loading, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen) return undefined;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setIsProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProfileMenuOpen]);

  const showUser = mounted && Boolean(appUser);
  const showLoading = mounted && loading;
  const isPartner = mounted && Boolean(appUser?.roles?.includes("partner"));
  const visibleNavItems = isPartner
    ? TRAVELER_NAV_ITEMS.filter((item) => item.label !== "For Business")
    : TRAVELER_NAV_ITEMS;
  const userLabel = appUser?.fullName.split(" ")[0] || appUser?.fullName || "Account";

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(196,198,206,0.7)] bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-6 lg:gap-8">
          <Link href="/" className="text-[var(--hk-navy-strong)]">
            <BrandMark />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {visibleNavItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`border-b-2 pb-1 text-[14px] font-medium ${
                  activeHref === item.href
                    ? "border-[var(--hk-navy-strong)] text-[var(--hk-navy-strong)]"
                    : "border-transparent text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {showAudienceToggle ? (
          <div className="hidden lg:flex">
            <div className="flex items-center rounded-full border border-[var(--hk-border-strong)] bg-[var(--hk-surface-soft)] p-1">
              <div className="flex items-center gap-2 rounded-full bg-[var(--hk-navy-strong)] px-4 py-2 text-[13px] text-white shadow-sm">
                <BriefcaseIcon className="h-4 w-4" />
                <span className="font-medium">Business &amp; Traveler</span>
              </div>
              <div className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] text-[var(--hk-ink)]">
                <UsersIcon className="h-4 w-4" />
                <span className="font-medium">Family &amp; Couples</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button className="hidden items-center gap-1 text-[14px] font-medium text-[var(--hk-ink)] sm:flex">
            <GlobeIcon className="h-5 w-5" />
            INR
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          {showUser ? (
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                className="flex items-center gap-2 rounded-full bg-[var(--hk-navy-strong)] px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-[var(--hk-navy-panel)]"
              >
                <UserCircleIcon className="h-5 w-5" />
                <span className="max-w-24 truncate sm:max-w-none">{userLabel}</span>
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${isProfileMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {isProfileMenuOpen && (
                <div
                  role="menu"
                  aria-label="Profile menu"
                  className="absolute right-0 top-[calc(100%+10px)] z-[60] w-72 overflow-hidden rounded-2xl border border-[var(--hk-border)] bg-white p-2 shadow-[0_18px_45px_rgba(15,31,56,0.18)]"
                >
                  <div className="border-b border-[var(--hk-border)] px-3 py-3">
                    <p className="truncate text-sm font-bold text-[var(--hk-navy-strong)]">{appUser?.fullName || "Your account"}</p>
                    <p className="mt-1 truncate text-xs text-[var(--hk-muted)]">{appUser?.email || appUser?.phoneNumber || "Helpkey traveler"}</p>
                  </div>
                  <div className="py-2">
                    <ProfileMenuLink href="/profile" onSelect={() => setIsProfileMenuOpen(false)} label="My profile" description="Personal details and preferences" />
                    <ProfileMenuLink href="/trips" onSelect={() => setIsProfileMenuOpen(false)} label="My bookings" description="Upcoming stays and past trips" />
                    <ProfileMenuLink href="/wishlist" onSelect={() => setIsProfileMenuOpen(false)} label="Saved stays" description="Your favorite properties" />
                    {appUser?.roles.includes("partner") && (
                      <ProfileMenuLink href="/partner/dashboard" onSelect={() => setIsProfileMenuOpen(false)} label="Partner dashboard" description="Manage your property listings" />
                    )}
                    {appUser?.roles.includes("admin") && (
                      <ProfileMenuLink href="/admin" onSelect={() => setIsProfileMenuOpen(false)} label="Admin console" description="Platform operations" />
                    )}
                  </div>
                  <div className="border-t border-[var(--hk-border)] pt-2">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        void logout();
                      }}
                      className="flex w-full items-center rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              disabled={showLoading}
              className="flex items-center gap-2 rounded-full bg-[var(--hk-navy-strong)] px-5 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-[var(--hk-navy-panel)] disabled:cursor-wait disabled:opacity-70"
            >
              <UserCircleIcon className="h-5 w-5" />
              Log in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function PartnerHeader() {
  return (
    <header className="bg-[var(--hk-navy-strong)] text-white shadow-[0_4px_20px_rgba(7,22,51,0.18)]">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="text-white">
          <BrandMark tagline="Hotels for a better tomorrow" />
        </Link>

        <Link href="/help" className="text-sm font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white lg:hidden">
          Help
        </Link>

        <nav aria-label="Partner navigation" className="hidden items-center gap-6 text-sm font-medium text-white/90 lg:flex">
          {PARTNER_NAV_ITEMS.map((item) => (
            <Link key={item.label} href={item.href} className="transition-colors hover:text-white">
              {item.label}
            </Link>
          ))}
          <span className="h-5 w-px bg-white/25" />
          <span className="text-white/75">Already a partner?</span>
          <Link
            href="/partner/dashboard"
            className="inline-flex items-center gap-2 font-bold text-[var(--hk-gold-light)] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--hk-gold-light)]"
          >
            Sign in <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

function ProfileMenuLink({
  href,
  label,
  description,
  onSelect,
}: {
  href: string;
  label: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="block rounded-xl px-3 py-2.5 text-left hover:bg-[var(--hk-surface-soft)]"
    >
      <p className="text-sm font-semibold text-[var(--hk-navy-strong)]">{label}</p>
      <p className="mt-0.5 text-xs text-[var(--hk-muted)]">{description}</p>
    </Link>
  );
}

function KeyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14.5 8.5a4.5 4.5 0 1 1-8.63 1.75A4.5 4.5 0 0 1 14.5 8.5ZM14.5 8.5H22m-3.5 0v3.25m-3.25-3.25V12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="8.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function GlobeIcon({ className }: IconProps) {
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

function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 8a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-5-2.2c.91-1.7 2.74-2.8 5-2.8s4.09 1.1 5 2.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BriefcaseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 7V5.75C8 4.78 8.78 4 9.75 4h4.5C15.22 4 16 4.78 16 5.75V7m-8 3.5h8m-12 7h16A1.5 1.5 0 0 0 21.5 16V8.5A1.5 1.5 0 0 0 20 7H4A1.5 1.5 0 0 0 2.5 8.5V16A1.5 1.5 0 0 0 4 17.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3m-8 6c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45v2h6v-2c0-2.66-4.33-4-7-4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12h14m-6-7 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
