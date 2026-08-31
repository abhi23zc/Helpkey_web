import Image from "next/image";
import Link from "next/link";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

type FilterItem = {
  label: string;
  icon: IconComponent;
  active?: boolean;
};

type Stay = {
  name: string;
  city: string;
  image: string;
  price: string;
};

type TrustItem = {
  title: string;
  description: string;
  icon: IconComponent;
};

type IconProps = {
  className?: string;
};

type IconComponent = (props: IconProps) => React.JSX.Element;

const navItems: NavItem[] = [
  { label: "Find Stays", href: "/search", active: true },
  { label: "Deals", href: "/search" },
  { label: "For Business", href: "/profile" },
  { label: "Help", href: "/help" },
];

const filters: FilterItem[] = [
  { label: "Business", icon: BriefcaseIcon, active: true },
  { label: "City Center", icon: CityIcon },
  { label: "Luxury", icon: DiamondIcon },
  { label: "Work Desk", icon: DeskIcon },
  { label: "Airport", icon: PlaneIcon },
  { label: "Fast Wi-Fi", icon: WifiIcon },
];

const stays: Stay[] = [
  {
    name: "The Balmoral Hotel",
    city: "Edinburgh",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDgPzK8J7VSquBgNArdb8Wk3CcUKrlZjhJqxPYwv-g5-tOQRipif1bDXufrbSx236G6HTTPguGQ0joErhVQPkU5C8hMkUtjfxOchXFLQfeX4EZHVQ2QBNd-SqTTCtr18yy6nUN6NXqTiJA5B8d0crzOtmBjkRkiYWc4aMlRIaCm2PeGemR3fM9RvHh3ZI0bZsenaLuiRb42iAQN2Its28VdRddym7mRYx0Kvf2U8ZRHe4iZEBH9KfmIBg",
    price: "$495",
  },
  {
    name: "The Ritz London",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBxFbje4bkps4lvdaP89BIMAMjw4Ka3cwkhvIU8zCShu4zz1IqE2M5oTm8tgJfzw9um1nFMfS_V2l1TxGBUd7cGyZ8FHiJXBz7Gdb9XOPIx3yN6uzKE9Qbzf1k9L3iHQJEGaqEOtJLWX6hRW_yg9us06Zfz4fdZAu6YKIZlwaa-vEQLLoFohGHUABvhG4WLIBofK7GdtYD8uzzkBM6ZFNLUPbfZuKnWL1MoRSsiPVVbITifSyA1Ei6prA",
    price: "$545",
  },
];

const trustItems: TrustItem[] = [
  {
    title: "Best Price Guarantee",
    description: "We match any lower price",
    icon: ShieldIcon,
  },
  {
    title: "Free Cancellation",
    description: "On most rooms",
    icon: CalendarCheckIcon,
  },
  {
    title: "Verified Stays",
    description: "Trusted hotels, every time",
    icon: StarBadgeIcon,
  },
  {
    title: "24/7 Support",
    description: "We're here to help",
    icon: SupportIcon,
  },
];

const footerColumns = [
  ["Privacy Policy", "Terms of Service"],
  ["Cookie Policy", "Sustainability"],
  ["Careers", "Press"],
];

export function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SiteHeader />
      <main>
        <HeroSection />
        <SearchPanel />
        <RecommendedSection />
        <TrustSection />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hk-border)] bg-[var(--hk-surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-[18px] font-bold text-black sm:text-[22px]"
          >
            <KeyIcon className="h-4 w-4 text-[var(--hk-gold-strong)] sm:h-5 sm:w-5" />
            <span>Helpkey</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`border-b-2 pb-1 text-[15px] font-medium ${
                  item.active
                    ? "border-black text-black"
                    : "border-transparent text-[var(--hk-ink)] hover:text-black"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden rounded-full border border-[var(--hk-border-strong)] bg-[var(--hk-surface-soft)] p-1 lg:flex">
          <button className="flex items-center gap-2 rounded-full bg-[var(--hk-navy)] px-5 py-3 text-[15px] font-semibold text-white shadow-sm">
            <BriefcaseIcon className="h-4 w-4" />
            Business &amp; Traveler
          </button>
          <button className="flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium text-[var(--hk-ink)] hover:bg-white">
            <UsersIcon className="h-4 w-4" />
            Family &amp; Couples
          </button>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
        <Link href="/profile" className="flex items-center gap-2 text-[15px] font-medium text-black">
          <GlobeIcon className="h-5 w-5" />
          <span>USD</span>
          <ChevronDownIcon className="h-4 w-4" />
        </Link>
          <Link href="/profile" className="flex items-center gap-2 rounded-full border border-[var(--hk-border-strong)] bg-[var(--hk-surface)] px-4 py-3 text-[15px] font-medium text-black hover:border-[var(--hk-navy)]">
            <UserCircleIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Log in</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative h-[620px] w-full bg-[var(--hk-navy-panel)]">
        <Image
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAn6KL5v1NYV9J9S3mFScL2n-4j6_0NXIQRndJn8zT6QNUqzxNj_lq4yFJqNwA60_2tVQJl6fYTD4s0CKxZtSOicR2hN0logWowiWq2WUwNRaPwVbKL2-0whbMadZZN2cQgoMW5JicZQTVqGkHYCLH_xSOaFFM87QfU1aoCVoxfh23o2vGe-LstLXMfK4yXGStbfRFoUih085duSxL5CuJ4lOGeRJtezdyZUV5ekNd_PqW796XinpY99A"
          alt="Luxury hotel suite overlooking a city skyline at dusk"
          fill
          priority
          className="object-cover opacity-30 mix-blend-screen"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,20,44,0.94)_0%,rgba(8,20,44,0.9)_48%,rgba(8,20,44,0.55)_72%,rgba(8,20,44,0.2)_100%)]" />
        <div className="relative mx-auto flex h-full max-w-[1280px] items-center px-4 sm:px-6 lg:px-10">
          <div className="max-w-[540px] pt-10">
            <p className="mb-6 text-[14px] font-semibold uppercase tracking-[0.16em] text-[var(--hk-gold)]">
              Business travel, made easy
            </p>
            <h1 className="max-w-[500px] text-[48px] leading-[1.08] font-extrabold tracking-[-0.04em] text-white sm:text-[64px]">
              Find your perfect business stay
            </h1>
            <p className="mt-8 text-[20px] leading-[1.6] text-[#e2e7f2]">
              Premium hotels. Smart choices. Seamless stays.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchPanel() {
  const fields = [
    { label: "Search destination", value: "London", icon: PinIcon },
    {
      label: "Check in",
      value: "May 20, 2025",
      icon: CalendarIcon,
      chevron: true,
    },
    {
      label: "Check out",
      value: "May 22, 2025",
      icon: CalendarIcon,
      chevron: true,
    },
    { label: "Guests", value: "2 Guests", icon: UserIcon, chevron: true },
  ];

  return (
    <section className="relative z-10 mx-auto -mt-[94px] max-w-[1280px] px-4 sm:px-6 lg:px-10">
      <div className="rounded-[18px] border border-[rgba(188,195,209,0.7)] bg-[rgba(255,255,255,0.9)] p-6 shadow-[0_4px_20px_rgba(11,31,58,0.04)] backdrop-blur-md">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {fields.map((field) => {
            const Icon = field.icon;

            return (
              <button
                key={field.label}
                className="flex min-h-[92px] flex-col rounded-[10px] border border-[var(--hk-border-strong)] bg-white px-4 py-3 text-left shadow-sm hover:border-[var(--hk-navy)]"
              >
                <span className="text-[14px] text-[var(--hk-muted)]">{field.label}</span>
                <span className="mt-2 flex items-center gap-3 text-[17px] font-medium text-[var(--hk-ink)]">
                  <Icon className="h-[22px] w-[22px] text-[var(--hk-navy)]" />
                  <span>{field.value}</span>
                  {field.chevron ? (
                    <ChevronDownIcon className="ml-auto h-4 w-4 text-[var(--hk-muted)]" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-6 border-t border-[var(--hk-border)] pt-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-3">
            {filters.map((filter) => {
              const Icon = filter.icon;

              return (
                <button
                  key={filter.label}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-[15px] font-medium ${
                    filter.active
                      ? "border-[var(--hk-navy)] bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]"
                      : "border-[var(--hk-border-strong)] bg-white text-[var(--hk-ink)] hover:border-[var(--hk-navy)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {filter.label}
                </button>
              );
            })}
          </div>

          <Link href="/search" className="rounded-[10px] bg-[var(--hk-navy-strong)] px-8 py-4 text-[17px] font-semibold text-white shadow-[0_8px_18px_rgba(8,20,44,0.18)] hover:bg-[var(--hk-navy)]">
            Search Hotels
          </Link>
        </div>
      </div>
    </section>
  );
}

function RecommendedSection() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-20 pt-18 sm:px-6 lg:px-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <h2 className="text-[34px] font-extrabold tracking-[-0.03em] text-[var(--hk-ink)]">
          Recommended stays
        </h2>
        <Link
          href="/search"
          className="flex items-center gap-1 text-[15px] font-medium text-black hover:underline"
        >
          View all
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {stays.map((stay) => (
          <article
            key={stay.name}
            className="group flex flex-col overflow-hidden rounded-[20px] border border-[rgba(188,195,209,0.7)] bg-white shadow-[var(--hk-shadow-soft)] transition-shadow hover:shadow-[var(--hk-shadow-card)] sm:flex-row"
          >
            <div className="relative h-[230px] sm:h-auto sm:w-[40%]">
              <Image
                src={stay.image}
                alt={stay.name}
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <button
                aria-label={`Save ${stay.name}`}
                className="absolute right-4 top-4 text-white"
              >
                <HeartIcon className="h-7 w-7 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-between p-6">
              <div>
                <h3 className="text-[24px] font-semibold tracking-[-0.02em] text-black">
                  {stay.name}
                </h3>
                <p className="mt-2 flex items-center gap-1 text-[15px] text-[var(--hk-muted)]">
                  <PinIcon className="h-4 w-4 text-black" />
                  {stay.city}
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <div className="flex items-center gap-0.5 text-[var(--hk-gold-strong)]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <StarIcon key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <span className="text-[15px] font-semibold text-black">4.9</span>
                </div>

                <div className="mt-5 flex items-center gap-4 text-[14px]">
                  <span className="flex items-center gap-1.5 text-[var(--hk-success)]">
                    <CheckCircleIcon className="h-4 w-4" />
                    Verified stay
                  </span>
                  <span className="h-4 w-px bg-[var(--hk-border)]" />
                  <span className="text-[var(--hk-muted)]">Free cancellation</span>
                </div>
              </div>

              <div className="mt-7 flex items-end justify-between gap-4">
                <p className="text-black">
                  <span className="text-[31px] font-extrabold tracking-[-0.03em]">
                    {stay.price}
                  </span>
                  <span className="ml-1 text-[16px] text-[var(--hk-muted)]">/night</span>
                </p>
                <Link href="/hotels/the-balmoral-hotel" className="rounded-[10px] bg-[var(--hk-navy-strong)] px-6 py-3 text-[15px] font-semibold text-white hover:bg-[var(--hk-navy)]">
                  Book Now
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-16 sm:px-6 lg:px-10">
      <div className="rounded-[20px] border border-[rgba(188,195,209,0.7)] bg-white px-6 py-8 shadow-[0_4px_20px_rgba(11,31,58,0.02)] sm:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {trustItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className={`flex items-start gap-4 ${
                  index > 0 ? "lg:border-l lg:border-[rgba(188,195,209,0.55)] lg:pl-10" : ""
                }`}
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]">
                  <Icon className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-black">{item.title}</h3>
                  <p className="mt-1 text-[15px] text-[var(--hk-muted)]">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-2 border-t border-[var(--hk-border)] bg-[var(--hk-surface)]">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-10">
        <div>
          <Link href="/" className="flex items-center gap-2 text-[24px] font-bold text-black">
            <KeyIcon className="h-5 w-5 text-[var(--hk-gold-strong)]" />
            Helpkey
          </Link>
          <p className="mt-4 text-[14px] text-[var(--hk-muted)]">
            © 2024 Helpkey International. All rights reserved.
          </p>
        </div>

        {footerColumns.map((column) => (
          <div key={column[0]} className="flex flex-col gap-4">
            {column.map((label) => (
              <Link
                key={label}
                href={label === "Privacy Policy" || label === "Terms of Service" || label === "Cookie Policy" || label === "Sustainability" || label === "Careers" || label === "Press" ? "/help" : "/"}
                className="text-[15px] text-[var(--hk-ink)] hover:text-black"
              >
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
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

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 10h10.5m0 0-4-4m4 4-4 4"
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
        d="m12 20.25-.94-.85C5.75 14.6 2.5 11.64 2.5 8a4.75 4.75 0 0 1 8.2-3.27L12 6.02l1.3-1.29A4.75 4.75 0 0 1 21.5 8c0 3.64-3.25 6.6-8.56 11.4l-.94.85Z"
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
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="m10 2.3 2.14 4.34 4.79.7-3.46 3.37.81 4.77L10 13.23 5.72 15.5l.82-4.77L3.07 7.34l4.79-.7L10 2.3Z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.25-9 2.25 2.25 4.5-4.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 20.5c4.5-2.05 6.5-5.15 6.5-9.63V6.5L12 3.75 5.5 6.5v4.37c0 4.48 2 7.58 6.5 9.63Zm-2.12-8.38 1.62 1.63 2.87-3.13"
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
        d="M7.5 3.75v3m9-3v3M4.5 9.25h15m-13 10h11a2 2 0 0 0 2-2v-10a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Zm2.5-5.25 1.75 1.75 3.75-4"
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
        d="m12 4.5 1.9 3.85 4.25.62-3.08 3 .73 4.23L12 14.2l-3.8 2 .73-4.23-3.08-3 4.25-.62L12 4.5Zm7.5 7.75v1.5m-15-1.5v1.5m12.9 4.65 1.05 1.05M5.55 6.55 6.6 7.6"
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
        d="M5.5 12a6.5 6.5 0 1 1 13 0v3.25a1.75 1.75 0 0 1-1.75 1.75H15m-9.5-4.75h2.25V17H6.5A1.75 1.75 0 0 1 4.75 15.25v-1.5c0-.97.78-1.75 1.75-1.75Zm13 0h-2.25V17h1.25a1.75 1.75 0 0 0 1.75-1.75v-1.5c0-.97-.78-1.75-1.75-1.75ZM10 19.25h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
