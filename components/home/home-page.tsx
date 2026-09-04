"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { LoginModal } from "../auth/login-modal";

type IconProps = {
  className?: string;
};

type IconComponent = (props: IconProps) => React.JSX.Element;

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

type SearchChip = {
  label: string;
  icon: IconComponent;
  active?: boolean;
};

type SearchField = {
  label: string;
  value: string;
  icon: IconComponent;
  chevron?: boolean;
};

type RecommendedStay = {
  title: string;
  city: string;
  image: string;
  price: string;
  href: string;
  urgency?: string;
  freeCancellation?: boolean;
};

type Hub = {
  title: string;
  properties: string;
  image: string;
};

type Collection = {
  tag: string;
  title: string;
  description: string;
  image: string;
};

const navItems: NavItem[] = [
  { label: "Find Stays", href: "/search", active: true },
  { label: "Deals", href: "/search" },
  { label: "For Business", href: "/join" },
  { label: "Help", href: "/help" },
];

const searchFields: SearchField[] = [
  { label: "Search destination", value: "London", icon: PinIcon },
  { label: "Check in", value: "May 20, 2025", icon: CalendarIcon, chevron: true },
  { label: "Check out", value: "May 22, 2025", icon: CalendarIcon, chevron: true },
  { label: "Guests", value: "2 Guests", icon: UserIcon, chevron: true },
];

const businessSearchChips: SearchChip[] = [
  { label: "Business", icon: BriefcaseIcon, active: true },
  { label: "City Center", icon: CityIcon },
  { label: "Luxury", icon: DiamondIcon },
  { label: "Work Desk", icon: DeskIcon },
  { label: "Airport", icon: PlaneIcon },
  { label: "Fast Wi-Fi", icon: WifiIcon },
];

const recommendedStays: RecommendedStay[] = [
  {
    title: "The Balmoral Hotel",
    city: "Edinburgh",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDgPzK8J7VSquBgNArdb8Wk3CcUKrlZjhJqxPYwv-g5-tOQRipif1bDXufrbSx236G6HTTPguGQ0joErhVQPkU5C8hMkUtjfxOchXFLQfeX4EZHVQ2QBNd-SqTTCtr18yy6nUN6NXqTiJA5B8d0crzOtmBjkRkiYWc4aMlRIaCm2PeGemR3fM9RvHh3ZI0bZsenaLuiRb42iAQN2Its28VdRddym7mRYx0Kvf2U8ZRHe4iZEBH9KfmIBg",
    price: "$495",
    href: "/hotels/the-balmoral-hotel",
    urgency: "Only 2 rooms left on our site",
    freeCancellation: true,
  },
  {
    title: "The Ritz London",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBxFbje4bkps4lvdaP89BIMAMjw4Ka3cwkhvIU8zCShu4zz1IqE2M5oTm8tgJfzw9um1nFMfS_V2l1TxGBUd7cGyZ8FHiJXBz7Gdb9XOPIx3yN6uzKE9Qbzf1k9L3iHQJEGaqEOtJLWX6hRW_yg9us06Zfz4fdZAu6YKIZlwaa-vEQLLoFohGHUABvhG4WLIBofK7GdtYD8uzzkBM6ZFNLUPbfZuKnWL1MoRSsiPVVbITifSyA1Ei6prA",
    price: "$545",
    href: "/hotels/the-ritz-london",
    urgency: "In High Demand",
    freeCancellation: true,
  },
];

const hubs: Hub[] = [
  {
    title: "London",
    properties: "2,450 properties",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDLfUXozNTjqcgyEQf-R9V7jXi3XOfCwQzi4XAFFX0Jh-n99DIBAjBL9vIfvSZcBMu-rk7OBHwzlefP8AceKK3obEsQ023n7NxCZvUZYOH2_n14SDl_NySKfBGBP96Upl8i3444QK4pjrFQi8dfOi__RsTy5vkLegileXuukNhG6uXvYRKbluKovyjaj1XdduqElFFaJ42H7NZV_a_tlTBlTqceze83Zvv6ajTzRcIm1puKSEfdNtJZjA",
  },
  {
    title: "Paris",
    properties: "1,820 properties",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCwriV9SQM0PH0y98PYgC9ypPuoo6dmPILRxr52S9iI1veSI6CQGBIBy_9_UQslO2U6A4hEQjkJhVCudqsMU5JG-s-UeXfzVIlYSAZ0ji8SzCZomRC5wlWQiAC35RN1sswEHuG6s-rTo1RIJ51rAR44hDi8OHKwcDsL2IjQOQFw_O5tzB8WIBUu9RyT76ueYf3HaS27WFT3b9AOnr-b6TWZ5jWcnV5iYXQHvCR_2Jz02yHQ7txNQ23gIQ",
  },
  {
    title: "New York",
    properties: "3,100 properties",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBEF-dqr4rpJRgzTnPQMxz3fMolAID-fKybe8zd0vzUOgkISfKZ-Oun6peUtjXihkkjtZxVisId_Gd2WlTeioOz_nI1LiNAj6LYU-hWl30e6IgbuK8y6j4Fd9ALh3hBJBxnKjBqdyRHerN8hlTBCxTnl9F0jVlcXvFiVf4LTPMSKHiXO7xIG-iLfj20nhTGlG_rHgHRlc1Y6-iwFLP3m3vQlqol_RnYlx0AvtrSGqejZGwRcWI8Lqdjcg",
  },
  {
    title: "Tokyo",
    properties: "1,540 properties",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBTOR6jg7HLSGsLue9yYXIdKpatT0qGL0zbnDlBwvFDUxmasyAF_ewJIAIbZ2KUv6oJIJCORql2UVFKj-adhAKFbFS0CqFgasnfRNwP6REBf8InnOUO2os1F_KaF2wj9ckF5ialpWQNXkcr7JwcVBfB3HVQXBbCnxHo042YS4cqbLnIIAoMSblY4M2Ib6WtXfh9jvJ2A9v1Ofe1bV6pgTGHca4sEkNemG2vSjDJT7PBA-OB7gWgRWZVhw",
  },
];

const collections: Collection[] = [
  {
    tag: "Collection",
    title: "Business Essentials",
    description:
      "Hotels featuring ultra-fast Wi-Fi, 24/7 business centers, and fully-equipped meeting rooms.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA-NH71Pn0hJd0vWcr68bSZCy5Adl6STGc9PAJtkbMjScN1pUlrtCA3BtW7U99Mn-KC94Zn5sZP50DnQcO_1yoTYRwf0RqDaZD6IEooahcvaN7DCWyRAwexDMnFm2Cm8TztXFS6LOtMPFtVAsanSy9Hmymq1P3WGrSKseIc63Q4-9YJq9zBq8huTuT12Uc7N3yo8dG-Yu-_DHzS5aSozH2XH4jXSe1KxpqbUkTWZ4G6-Brh1dHZlUFPMg",
  },
  {
    tag: "Collection",
    title: "Luxury Escapes",
    description:
      "Unwind after hours in five-star suites with premium spa facilities and world-class dining.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAOFfM8cEEOkwT7HJKb_BE2S6EQ11_8EpodH5TabYUDsphOdDZ9eQ9Bq2Tvq75lFo2H-NPlg1biGJDPH_LCsA1-Dz4soTJDyjSXcb3QpVZSTSb_6n1gc99NPFGesVWVm2SiMxGwK3NJsP-kK5fNut0mMyjxNSd9muutOSeIK_VCUSnS-rZg9V816BJ5Ney2u7xaoXDV6uE860NVCLGrIfgUpL1HJYcp09qbOCFOZDoNC6sAjCnKyUIXtA",
  },
];

const footerColumns = {
  Company: ["About Us", "Careers", "Press & Media", "Sustainability"],
  Services: ["Helpkey for Business", "Travel Agents", "Meeting Spaces", "Concierge API"],
  Support: ["Help Center", "Contact Us", "Privacy Policy", "Terms of Service"],
};

export function HomePage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SiteHeader onLoginClick={() => setIsLoginOpen(true)} />
      <main>
        <HeroSection
          eyebrow="BUSINESS TRAVEL, MADE EASY"
          headline="Find your perfect business stay"
          subtitle="Premium hotels. Smart choices. Seamless stays."
        />
        <SearchPanel
          chips={businessSearchChips}
          loyaltyLead="Unlock Secret Corporate Rates:"
          loyaltyBody="Sign in or register to save up to 15% on premium stays."
          loyaltyCta="Sign In / Register"
          onLoginClick={() => setIsLoginOpen(true)}
        />
        <TrustSection />
        <RecommendedSection />
        <HubsSection />
        <CollectionsSection />
        <AppSection />
        <NewsletterSection />
      </main>
      <SiteFooter />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}

function SiteHeader({ onLoginClick }: { onLoginClick: () => void }) {
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
  const userLabel = appUser?.fullName.split(" ")[0] || appUser?.fullName || "Account";

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(196,198,206,0.7)] bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-6 lg:gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-[21px] font-bold tracking-[-0.03em] text-[var(--hk-navy-strong)]"
          >
            <KeyIcon className="h-4 w-4 text-[var(--hk-gold-strong)]" />
            Helpkey
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`border-b-2 pb-1 text-[14px] font-medium ${
                  item.active
                    ? "border-[var(--hk-navy-strong)] text-[var(--hk-navy-strong)]"
                    : "border-transparent text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

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

        <div className="flex items-center gap-3">
          <button className="hidden items-center gap-1 text-[14px] font-medium text-[var(--hk-ink)] sm:flex">
            <GlobeIcon className="h-5 w-5" />
            USD
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
                <div role="menu" aria-label="Profile menu" className="absolute right-0 top-[calc(100%+10px)] z-[60] w-72 overflow-hidden rounded-2xl border border-[var(--hk-border)] bg-white p-2 shadow-[0_18px_45px_rgba(15,31,56,0.18)]">
                  <div className="border-b border-[var(--hk-border)] px-3 py-3">
                    <p className="truncate text-sm font-bold text-[var(--hk-navy-strong)]">{appUser?.fullName || "Your account"}</p>
                    <p className="mt-1 truncate text-xs text-[var(--hk-muted)]">{appUser?.email || appUser?.phoneNumber || "Helpkey traveler"}</p>
                  </div>
                  <div className="py-2">
                    <ProfileMenuLink href="/profile" onSelect={() => setIsProfileMenuOpen(false)} label="My profile" description="Personal details and preferences" />
                    <ProfileMenuLink href="/trips" onSelect={() => setIsProfileMenuOpen(false)} label="My bookings" description="Upcoming stays and past trips" />
                    <ProfileMenuLink href="/wishlist" onSelect={() => setIsProfileMenuOpen(false)} label="Saved stays" description="Your favorite properties" />
                    {appUser?.roles.includes("partner") && <ProfileMenuLink href="/partner/dashboard" onSelect={() => setIsProfileMenuOpen(false)} label="Partner dashboard" description="Manage your property listings" />}
                    {appUser?.roles.includes("admin") && <ProfileMenuLink href="/admin" onSelect={() => setIsProfileMenuOpen(false)} label="Admin console" description="Platform operations" />}
                  </div>
                  <div className="border-t border-[var(--hk-border)] pt-2">
                    <button type="button" role="menuitem" onClick={() => { setIsProfileMenuOpen(false); void logout(); }} className="flex w-full items-center rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
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

function ProfileMenuLink({ href, label, description, onSelect }: { href: string; label: string; description: string; onSelect: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onSelect} className="block rounded-xl px-3 py-2.5 hover:bg-[var(--hk-surface-soft)]">
      <span className="block text-sm font-semibold text-[var(--hk-navy-strong)]">{label}</span>
      <span className="mt-0.5 block text-xs text-[var(--hk-muted)]">{description}</span>
    </Link>
  );
}

function HeroSection({
  eyebrow,
  headline,
  subtitle,
}: {
  eyebrow: string;
  headline: string;
  subtitle: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="relative h-[480px] md:h-[560px]">
        <Image
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAn6KL5v1NYV9J9S3mFScL2n-4j6_0NXIQRndJn8zT6QNUqzxNj_lq4yFJqNwA60_2tVQJl6fYTD4s0CKxZtSOicR2hN0logWowiWq2WUwNRaPwVbKL2-0whbMadZZN2cQgoMW5JicZQTVqGkHYCLH_xSOaFFM87QfU1aoCVoxfh23o2vGe-LstLXMfK4yXGStbfRFoUih085duSxL5CuJ4lOGeRJtezdyZUV5ekNd_PqW796XinpY99A"
          alt="Luxury hotel suite with city skyline"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "var(--hk-hero-overlay-solid)" }}
        />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "var(--hk-hero-overlay-gradient)" }}
        />
        <div className="relative mx-auto flex h-full max-w-[1280px] items-center px-4 sm:px-6 lg:px-10">
          <div className="max-w-[560px] pb-20 pt-4">
            <p className="mb-6 text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--hk-gold)] drop-shadow-md sm:text-[13px]">
              {eyebrow}
            </p>
            <h1 className="text-[42px] font-bold leading-[1.05] tracking-[-0.04em] text-white drop-shadow-lg sm:text-[52px] lg:text-[64px]">
              {headline.split(" ").slice(0, -2).join(" ")}
              <br />
              {headline.split(" ").slice(-2).join(" ")}
            </h1>
            <p className="mt-8 text-[17px] leading-relaxed text-white/90 drop-shadow-md sm:text-[19px]">
              {subtitle}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function LoyaltyBanner({
  loyaltyLead,
  loyaltyBody,
  loyaltyCta,
  onLoginClick,
}: {
  loyaltyLead: string;
  loyaltyBody: string;
  loyaltyCta: string;
  onLoginClick: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col items-center justify-between gap-4 rounded-[12px] bg-[var(--hk-navy-strong)] px-6 py-4 shadow-lg sm:flex-row lg:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
          <StarIcon className="h-5 w-5 text-[var(--hk-rating)]" />
        </div>
        <p className="text-[14px] font-medium text-white sm:text-[15px]">
          <strong className="text-[var(--hk-rating)]">{loyaltyLead}</strong>{" "}
          {loyaltyBody}
        </p>
      </div>
      <button
        onClick={onLoginClick}
        className="whitespace-nowrap rounded-[8px] bg-white px-5 py-2.5 text-[13px] font-bold text-[var(--hk-navy-strong)] transition-colors hover:bg-gray-100"
      >
        {loyaltyCta}
      </button>
    </div>
  );
}

function SearchPanel({
  chips,
  loyaltyLead,
  loyaltyBody,
  loyaltyCta,
  onLoginClick,
}: {
  chips: SearchChip[];
  loyaltyLead: string;
  loyaltyBody: string;
  loyaltyCta: string;
  onLoginClick: () => void;
}) {
  const { appUser } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const showLoyalty = !mounted || !appUser;

  return (
    <section className="relative z-20 mx-auto -mt-32 mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      {showLoyalty ? (
        <LoyaltyBanner
          loyaltyLead={loyaltyLead}
          loyaltyBody={loyaltyBody}
          loyaltyCta={loyaltyCta}
          onLoginClick={onLoginClick}
        />
      ) : null}
      <div className="rounded-[16px] border border-white/40 bg-[rgba(255,255,255,0.95)] p-5 shadow-[0_8px_32px_rgba(11,31,58,0.08)] backdrop-blur-md sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {searchFields.map((field) => (
            <SearchFieldCard key={field.label} field={field} />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-[rgba(196,198,206,0.7)] pt-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-3">
            {chips.map((chip) => (
              <SearchChipButton key={chip.label} chip={chip} />
            ))}
          </div>
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-[12px] bg-[var(--hk-navy-strong)] px-10 py-4 text-[18px] font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-[var(--hk-primary)] hover:shadow-xl"
          >
            Search Hotels
          </Link>
        </div>
      </div>
    </section>
  );
}

function SearchFieldCard({ field }: { field: SearchField }) {
  const Icon = field.icon;

  return (
    <button className="rounded-[12px] border border-[rgba(196,198,206,0.7)] bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--hk-navy-strong)] hover:shadow-md">
      <span className="mb-1 block text-[12px] font-medium text-[var(--hk-muted)]">
        {field.label}
      </span>
      <span className="flex items-center gap-2 text-[15px] text-[var(--hk-ink)]">
        <Icon className="h-5 w-5 text-[var(--hk-navy-strong)] opacity-70" />
        <span>{field.value}</span>
        {field.chevron ? (
          <ChevronDownIcon className="ml-auto h-4 w-4 text-[var(--hk-muted)]" />
        ) : null}
      </span>
    </button>
  );
}

function SearchChipButton({ chip }: { chip: SearchChip }) {
  const Icon = chip.icon;

  return (
    <button
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium ${
        chip.active
          ? "border-[var(--hk-navy-strong)] bg-[var(--hk-navy-strong)] text-white shadow-sm"
          : "border-[var(--hk-border-strong)] bg-white text-[var(--hk-ink)] hover:border-[var(--hk-navy-strong)]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {chip.label}
    </button>
  );
}

function TrustSection() {
  const items = [
    {
      title: "Best Price Guarantee",
      description:
        "We match any lower price found online for the same premium stay.",
      icon: ShieldIcon,
    },
    {
      title: "Flexible Bookings",
      description:
        "Enjoy free cancellation on most of our corporate partner rooms.",
      icon: CalendarCheckIcon,
    },
    {
      title: "Executive Quality",
      description:
        "Every hotel is vetted for business-ready amenities and comfort.",
      icon: StarBadgeIcon,
    },
    {
      title: "24/7 Concierge",
      description:
        "Dedicated support around the clock for all your travel needs.",
      icon: SupportIcon,
    },
  ];

  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(196,198,206,0.55)] bg-white shadow-sm">
                <Icon className="h-8 w-8 text-[var(--hk-navy-strong)]" />
              </div>
              <h3 className="text-[18px] font-semibold text-[var(--hk-ink)]">
                {item.title}
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-[var(--hk-muted)]">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecommendedSection() {
  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-ink)] sm:text-[32px]">
            Recommended stays
          </h2>
          <p className="mt-2 text-[16px] text-[var(--hk-muted)]">
            Handpicked premium properties for your next trip.
          </p>
        </div>
        <Link
          href="/search"
          className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--hk-navy-strong)] hover:text-[var(--hk-gold-strong)]"
        >
          View all
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {recommendedStays.map((stay) => (
          <article
            key={stay.title}
            className="group flex flex-col overflow-hidden rounded-[16px] border border-[rgba(196,198,206,0.55)] bg-white shadow-sm transition-all hover:shadow-md sm:flex-row"
          >
            <div className="relative h-[240px] shrink-0 overflow-hidden sm:h-auto sm:w-[260px]">
              <Image
                src={stay.image}
                alt={stay.title}
                fill
                sizes="(max-width: 1024px) 100vw, 260px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute left-3 top-3 flex flex-col gap-2">
                {stay.urgency && (
                  <span className="inline-flex items-center rounded-[6px] bg-[#d92228] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                    {stay.urgency}
                  </span>
                )}
              </div>
              <button
                aria-label={`Save ${stay.title}`}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-colors hover:bg-white/40"
              >
                <HeartIcon className="h-5 w-5 drop-shadow-md" />
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[20px] font-bold leading-tight tracking-[-0.02em] text-[var(--hk-ink)]">
                    {stay.title}
                  </h3>
                  <div className="flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--hk-navy-strong)] px-2 py-1 text-white">
                    <span className="text-[14px] font-bold">4.9</span>
                  </div>
                </div>
                
                <p className="mt-1.5 flex items-center gap-1 text-[13px] text-[var(--hk-navy-strong)]">
                  <PinIcon className="h-3.5 w-3.5" />
                  <span className="font-medium underline decoration-[var(--hk-navy-strong)]/30 underline-offset-2 hover:decoration-[var(--hk-navy-strong)]">
                    {stay.city}
                  </span>
                  <span className="mx-1 text-[var(--hk-muted)]">•</span>
                  <span className="text-[var(--hk-muted)]">0.5 miles from center</span>
                </p>

                <div className="mt-4 flex flex-col gap-1.5 border-l-2 border-[var(--hk-success)] pl-3">
                  <span className="flex items-center gap-2 text-[12px] font-bold text-[var(--hk-success)]">
                    Verified stay
                  </span>
                  {stay.freeCancellation && (
                    <span className="flex items-center gap-2 text-[12px] font-bold text-[var(--hk-success)]">
                      Free cancellation
                    </span>
                  )}
                  <span className="flex items-center gap-2 text-[12px] font-bold text-[var(--hk-success)]">
                    No prepayment needed
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between border-t border-gray-100 pt-4">
                <div className="flex flex-col">
                  <span className="text-[11px] text-[var(--hk-muted)]">2 nights, 2 adults</span>
                  <span className="text-[24px] font-extrabold tracking-tight text-[var(--hk-ink)]">
                    {stay.price}
                  </span>
                  <span className="text-[11px] text-[var(--hk-muted)]">+US$52 taxes</span>
                </div>
                <Link
                  href={stay.href}
                  className="rounded-[8px] bg-[var(--hk-navy-strong)] px-5 py-2.5 text-[14px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-[var(--hk-primary)]"
                >
                  See availability
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HubsSection() {
  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="mb-8">
        <h2 className="text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-ink)] sm:text-[32px]">
          Top global hubs
        </h2>
        <p className="mt-2 text-[16px] text-[var(--hk-muted)]">
          Explore premium business stays in major financial and cultural centers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {hubs.map((hub) => (
          <Link
            key={hub.title}
            href="/search"
            className="group relative block h-72 overflow-hidden rounded-[16px]"
          >
            <Image
              src={hub.image}
              alt={hub.title}
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(11,31,58,0.92)] via-[rgba(11,31,58,0.24)] to-transparent" />
            <div className="absolute bottom-0 left-0 w-full p-6">
              <h3 className="text-[24px] font-bold text-white">{hub.title}</h3>
              <p className="mt-1 text-[14px] text-white/80">{hub.properties}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CollectionsSection() {
  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="mb-8">
        <h2 className="text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-ink)] sm:text-[32px]">
          Curated for you
        </h2>
        <p className="mt-2 text-[16px] text-[var(--hk-muted)]">
          Collections tailored to your specific travel style.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {collections.map((collection) => (
          <article
            key={collection.title}
            className="group relative h-[380px] overflow-hidden rounded-[16px]"
          >
            <Image
              src={collection.image}
              alt={collection.title}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-[rgba(11,31,58,0.4)] transition-colors group-hover:bg-[rgba(11,31,58,0.5)]" />
            <div className="absolute inset-0 flex flex-col justify-end p-8 sm:p-10">
              <span className="mb-4 inline-flex w-max rounded-full bg-[var(--hk-gold)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--hk-navy-strong)]">
                {collection.tag}
              </span>
              <h3 className="text-[30px] font-bold leading-tight text-white sm:text-[36px]">
                {collection.title}
              </h3>
              <p className="mt-3 max-w-[460px] text-[15px] leading-6 text-white/90">
                {collection.description}
              </p>
              <Link
                href="/search"
                className="mt-6 inline-flex w-max items-center rounded-[8px] bg-white px-6 py-3 text-[14px] font-semibold text-[var(--hk-navy-strong)] hover:bg-[#f8f7f3]"
              >
                Explore Collection
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AppSection() {
  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="overflow-hidden rounded-[24px] bg-[var(--hk-navy-panel)] md:grid md:grid-cols-2">
        <div className="p-8 sm:p-10 lg:p-16">
          <h2 className="text-[34px] font-bold leading-tight tracking-[-0.03em] text-white lg:text-[40px]">
            Book faster with
            <br />
            the Helpkey app
          </h2>
          <p className="mt-4 max-w-[460px] text-[16px] leading-7 text-white/80 sm:text-[18px]">
            Manage reservations, access exclusive mobile rates, and message
            concierge directly from your phone.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <StoreButton label="App Store" caption="Download on the" icon={AppleIcon} />
            <StoreButton label="Google Play" caption="Get it on" icon={PlayIcon} />
          </div>
        </div>

        <div className="relative min-h-[320px]">
          <Image
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDsGLsH_Ou4umKJiGmIZolQ64HMDdE1eAtnOiz1Pjc4x1Q7L2aiZYIAXSSKfF1aca565z1Y0lne1MslNBeO-KlMQgh8QZFbAc7uSrWct4IrO78hsNu8p1J3cHMY6oFbeNT77EO7ii9PyT-ehpcHxNOVVwFAe-UsVvALr_PpanaToDQ2GKywjuRta4IycGTkD4DQSp07_nZxhs-SvVmgaXIBpHkVyzOaVhrBExua15paJSdtpPmj4Xhm9A"
            alt="Helpkey mobile app preview"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover object-left-top opacity-80 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--hk-navy-panel)] to-transparent" />
        </div>
      </div>
    </section>
  );
}

function StoreButton({
  label,
  caption,
  icon: Icon,
}: {
  label: string;
  caption: string;
  icon: IconComponent;
}) {
  return (
    <button className="flex items-center justify-center gap-3 rounded-[12px] bg-white px-6 py-3 text-[var(--hk-navy-strong)] hover:bg-[#f8f7f3]">
      <Icon className="h-6 w-6" />
      <span className="text-left">
        <span className="block text-[10px] font-semibold uppercase leading-none">
          {caption}
        </span>
        <span className="block text-[14px] font-bold leading-tight">{label}</span>
      </span>
    </button>
  );
}

function NewsletterSection() {
  return (
    <section className="mx-auto mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="mx-auto max-w-4xl rounded-[16px] border border-[rgba(196,198,206,0.55)] bg-white p-8 text-center shadow-[0_4px_20px_rgba(11,31,58,0.02)] sm:p-10">
        <MailIcon className="mx-auto mb-4 h-10 w-10 text-[var(--hk-gold-strong)]" />
        <h2 className="text-[30px] font-bold tracking-[-0.03em] text-[var(--hk-ink)] sm:text-[32px]">
          Get exclusive executive deals
        </h2>
        <p className="mx-auto mt-3 max-w-[560px] text-[16px] leading-7 text-[var(--hk-muted)]">
          Sign up for our newsletter and receive insider access to unpublished
          corporate rates and travel tips.
        </p>
        <form className="mx-auto mt-8 flex max-w-md flex-col gap-4 sm:flex-row">
          <input
            type="email"
            placeholder="Your business email"
            className="flex-1 rounded-[8px] border border-[var(--hk-border-strong)] bg-[var(--hk-ivory)] px-4 py-3 text-[15px] text-[var(--hk-ink)] outline-none focus:border-[var(--hk-navy-strong)] focus:ring-2 focus:ring-[rgba(11,31,58,0.12)]"
          />
          <button
            type="submit"
            className="rounded-[8px] bg-[var(--hk-navy-strong)] px-8 py-3 text-[14px] font-semibold text-white hover:bg-[var(--hk-navy-panel)]"
          >
            Subscribe
          </button>
        </form>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[rgba(196,198,206,0.7)] bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-5 lg:px-10">
        <div className="lg:col-span-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-[21px] font-bold tracking-[-0.03em] text-[var(--hk-navy-strong)]"
          >
            <KeyIcon className="h-4 w-4 text-[var(--hk-gold-strong)]" />
            Helpkey
          </Link>
          <p className="mt-6 max-w-[360px] text-[15px] leading-7 text-[var(--hk-muted)]">
            Premium business travel solutions for the modern executive. Find,
            book, and manage your corporate stays with ease.
          </p>
          <div className="mt-6 flex gap-4">
            <FooterIconButton icon={ShareIcon} />
            <FooterIconButton icon={GlobeIcon} />
            <FooterIconButton icon={BriefcaseIcon} />
          </div>
        </div>

        {Object.entries(footerColumns).map(([title, links]) => (
          <div key={title}>
            <h4 className="mb-6 text-[16px] font-bold text-[var(--hk-ink)]">
              {title}
            </h4>
            <div className="flex flex-col gap-4">
              {links.map((link) => (
                <Link
                  key={link}
                  href="/help"
                  className="text-[14px] text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
                >
                  {link}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[rgba(196,198,206,0.7)] py-6">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row lg:px-10">
          <p className="text-[12px] text-[var(--hk-muted)]">
            © 2024 Helpkey International. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/help" className="text-[12px] text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]">
              Cookie Settings
            </Link>
            <Link href="/help" className="text-[12px] text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]">
              Site Map
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterIconButton({ icon: Icon }: { icon: IconComponent }) {
  return (
    <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hk-surface-soft)] text-[var(--hk-navy-strong)] transition-colors hover:bg-[var(--hk-navy-strong)] hover:text-white">
      <Icon className="h-5 w-5" />
    </button>
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
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
        d="M7.75 12a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM16.25 10.75a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-11 7.25v-.63c0-2.28 1.85-4.12 4.13-4.12h1.74c2.28 0 4.13 1.84 4.13 4.12V18m.5-.75c.37-.73 1.13-1.25 2.01-1.25h.74c1.24 0 2.25 1 2.25 2.25V18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 20s6-5.27 6-10a6 6 0 1 0-12 0c0 4.73 6 10 6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 3.75v3m9-3v3M4.5 9.25h15m-13.25 10h11.5A1.75 1.75 0 0 0 19.5 17.5V7.25A1.75 1.75 0 0 0 17.75 5.5H6.25A1.75 1.75 0 0 0 4.5 7.25V17.5c0 .97.78 1.75 1.75 1.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 12a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM5.5 19.25A6.5 6.5 0 0 1 12 14.5a6.5 6.5 0 0 1 6.5 4.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CityIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 19.25h14.5M6 19V9.25c0-.69.56-1.25 1.25-1.25h3.5c.69 0 1.25.56 1.25 1.25V19m0-7h6V19m0-11.5V19m-8-7h1m-1 3h1m6-1h1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DiamondIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m12 19.5 7-8-3-5H8l-3 5 7 8Zm0 0-4-8m4 8 4-8m-8 0h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeskIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 10.5h15m-12.5 0V18m9-7.5V18M8 18h8M7 6h10c.55 0 1 .45 1 1v3.5H6V7c0-.55.45-1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlaneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m3 13.25 18-4.5-8 6.25v4l-2.25-2v-2.44L3 13.25Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WifiIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 9.75a13.1 13.1 0 0 1 17 0M6.75 13a8.2 8.2 0 0 1 10.5 0M10 16.25a3.35 3.35 0 0 1 4 0M12 19.25h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({ className }: IconProps) {
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

function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="m10 2.5 2.1 4.25 4.7.68-3.4 3.3.8 4.67L10 13.2l-4.2 2.2.8-4.67-3.4-3.3 4.7-.68L10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.75 6.5 6v5.25c0 4.22 2.38 8.09 5.5 9 3.12-.91 5.5-4.78 5.5-9V6L12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 12 1.75 1.75L14.75 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarCheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3.75v2.5m10-2.5v2.5M4.5 8.5h15m-13 11.75h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 6.25h-11A1.5 1.5 0 0 0 5 7.75v11a1.5 1.5 0 0 0 1.5 1.5Zm2.25-5 1.75 1.75 4-4.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarBadgeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 4.5 14 8l3.75.55L15 11.2l.65 3.8L12 13.2 8.35 15l.65-3.8-2.75-2.65L10 8l2-3.5Zm-6.5 11.25 1.8 1.8M16.7 17.55l1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SupportIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 11.75a7 7 0 1 1 14 0V15a2 2 0 0 1-2 2h-1.25v-4.5H19m-14 0h3.25V17H7a2 2 0 0 1-2-2v-3.25Zm7 8.25h2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 10h11m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M15 8.75a3.25 3.25 0 1 0-3.18-4m3.18 4-6 3.5m0 0a3.25 3.25 0 1 0 0 5.5m0-5.5 6 3.5m0 0a3.25 3.25 0 1 0 .22-5.74"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 7.75A1.75 1.75 0 0 1 5.75 6h12.5A1.75 1.75 0 0 1 20 7.75v8.5A1.75 1.75 0 0 1 18.25 18H5.75A1.75 1.75 0 0 1 4 16.25v-8.5Zm1.5.25L12 12.5 18.5 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AppleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14.2 5.2c.8-1 1.3-2.3 1.2-3.7-1.2.1-2.6.8-3.4 1.8-.8.9-1.4 2.3-1.2 3.6 1.3.1 2.6-.7 3.4-1.7Zm3.7 11.1c-.5 1.1-.8 1.5-1.4 2.5-.8 1.3-2 2.9-3.4 2.9-1.3 0-1.6-.8-3.3-.8-1.7 0-2 .8-3.3.8-1.4 0-2.5-1.4-3.4-2.7-2.4-3.7-2.7-8.1-1.2-10.4 1.1-1.6 2.8-2.6 4.4-2.6 1.7 0 2.8.9 4.2.9 1.4 0 2.2-.9 4.2-.9 1.4 0 2.9.7 4 2-.3.2-2.4 1.4-2.4 4.2 0 3.4 3 4.6 3.1 4.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5.5 4.75c-.57.3-.93.9-.93 1.54v11.42c0 .65.36 1.25.93 1.54l10.58-5.71a1.75 1.75 0 0 0 0-3.08L5.5 4.75Z"
        fill="currentColor"
      />
    </svg>
  );
}
