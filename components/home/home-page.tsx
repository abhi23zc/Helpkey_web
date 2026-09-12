"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { TravelSearch } from "@/components/search/travel-search";
import { PublicMediaImage } from "@/components/shared/public-media-image";
import { SiteHeader } from "@/components/shared/site-header";
import { LoginModal } from "../auth/login-modal";
import { GlobalReachSection } from "./global-reach-map";
import { DestinationsCarousel } from "./destinations-carousel";
import { FeaturedStaysTabs } from "./featured-stays-tabs";
import { PromotionsCarousel } from "./promotions-carousel";
import { WorldMapGraphic } from "../join/world-map";

type IconProps = {
  className?: string;
};

type IconComponent = (props: IconProps) => React.JSX.Element;

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

type LiveProperty = {
  id: string;
  slug: string;
  name: string;
  city: string;
  ratingAverage: number;
  minimumPricePaise: number | null;
  currency: string;
  coverImageUrl: string | null;
  coverImageSrcSet?: string;
  freeCancellation: boolean;
};

type HomeCatalog = {
  recommendations: LiveProperty[];
  cities: Array<{ city: string; propertyCount: number }>;
};

const isoDate = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const formatPrice = (price: number | null, currency: string) =>
  price === null ? "Price on request" : new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(price / 100);

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
    price: "₹495",
    href: "/hotels/the-balmoral-hotel",
    urgency: "Only 2 rooms left on our site",
    freeCancellation: true,
  },
  {
    title: "The Ritz London",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBxFbje4bkps4lvdaP89BIMAMjw4Ka3cwkhvIU8zCShu4zz1IqE2M5oTm8tgJfzw9um1nFMfS_V2l1TxGBUd7cGyZ8FHiJXBz7Gdb9XOPIx3yN6uzKE9Qbzf1k9L3iHQJEGaqEOtJLWX6hRW_yg9us06Zfz4fdZAu6YKIZlwaa-vEQLLoFohGHUABvhG4WLIBofK7GdtYD8uzzkBM6ZFNLUPbfZuKnWL1MoRSsiPVVbITifSyA1Ei6prA",
    price: "₹545",
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
      "/images/business-essentials.png",
  },
  {
    tag: "Collection",
    title: "Luxury Escapes",
    description:
      "Unwind after hours in five-star suites with premium spa facilities and world-class dining.",
    image:
      "/images/luxury-escapes.png",
  },
];

const footerColumns = {
  Company: ["About Us", "Careers", "Press & Media", "Sustainability"],
  Services: ["Helpkey for Business", "Travel Agents", "Meeting Spaces", "Concierge API"],
  Support: ["Help Center", "Contact Us", "Privacy Policy", "Terms of Service"],
};

export function HomePage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [catalog, setCatalog] = useState<HomeCatalog | null>(null);

  useEffect(() => {
    void fetch("/api/home", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<HomeCatalog> : null)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SiteHeader activeHref="/search" onLoginClick={() => setIsLoginOpen(true)} />
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
        
        {/* Agoda-style Destinations Carousel */}
        <DestinationsCarousel />

        {/* Agoda-style Featured Stays with City Tabs & Rating Badges */}
        <FeaturedStaysTabs />

        {/* Agoda-style Accommodation Promotions Banner Carousel */}
        <PromotionsCarousel />

        {/* OYO-style Global Reach Map & Live Stats */}
        <GlobalReachSection />

        <CollectionsSection />
        <AppSection />
        <NewsletterSection />
      </main>
      <SiteFooter />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
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
          src="/images/hero-bg.png"
          alt="Find your perfect business stay"
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
    <section className="relative z-30 mx-auto -mt-32 mb-16 max-w-[1280px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      {showLoyalty ? (
        <LoyaltyBanner
          loyaltyLead={loyaltyLead}
          loyaltyBody={loyaltyBody}
          loyaltyCta={loyaltyCta}
          onLoginClick={onLoginClick}
        />
      ) : null}
      <TravelSearch />
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

function SearchChipButton({ chip, active, onClick }: { chip: SearchChip; active: boolean; onClick: () => void }) {
  const Icon = chip.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium ${
        active
          ? "border-[var(--hk-navy-strong)] bg-[var(--hk-navy-strong)] text-white shadow-sm"
          : "border-[var(--hk-border-strong)] bg-white text-[var(--hk-ink)] hover:border-[var(--hk-navy-strong)]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {chip.label}
    </button>
  );
}



function HubsSection({ cities }: { cities: Array<{ city: string; propertyCount: number }> }) {
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
        {cities.map((hub) => (
          <Link
            key={hub.city}
            href={`/search?destination=${encodeURIComponent(hub.city)}`}
            className="group relative flex h-72 overflow-hidden rounded-[16px] bg-[var(--hk-navy-strong)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(214,179,106,0.55),transparent_55%)]" />
            <div className="relative mt-auto w-full p-6">
              <h3 className="text-[24px] font-bold text-white">{hub.city}</h3>
              <p className="mt-1 text-[14px] text-white/80">{hub.propertyCount} {hub.propertyCount === 1 ? "property" : "properties"}</p>
            </div>
          </Link>
        ))}
        {!cities.length && <p className="rounded-[16px] border border-dashed border-[var(--hk-border-strong)] bg-white p-8 text-center text-sm text-[var(--hk-muted)] sm:col-span-2 lg:col-span-4">Cities will appear as soon as properties are available.</p>}
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
                href={collection.title === "Business Essentials" ? "/search?amenity=business_ready" : "/search?amenity=luxury"}
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
      <div className="relative overflow-hidden rounded-[24px] shadow-lg border border-[#0b1f3a]/10 bg-[#071633]">
        <Image
          src="/images/helpkey-app-banner.jpeg"
          alt="Your Stay, Right When You Need It. Save stays, keep booking details close, and get help whenever plans change."
          width={1920}
          height={640}
          unoptimized
          quality={100}
          className="w-full h-auto object-cover rounded-[24px]"
          priority
        />
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
