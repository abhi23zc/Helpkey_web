import Image from "next/image";
import Link from "next/link";

type IconProps = {
  className?: string;
};

type FavoriteStay = {
  name: string;
  city: string;
  image: string;
  price: string;
  href: string;
};

const tabs = [
  { label: "Business Stays", icon: BriefcaseIcon, active: true },
  { label: "Upcoming Trips", icon: PlaneTakeoffIcon },
  { label: "Dream Hotels", icon: StarBadgeIcon },
];

const stays: FavoriteStay[] = [
  {
    name: "The Ritz London",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD_hCkISEb2kvWg58Swoso4ZrgcbsamGX9XN9MLz1VM-nu6Hm7G2v_jGMsATKI1H5l2XXLLY2NiwAG3kfNZvaYyEOwlD0zjEXsmyBWZ0Os2GrgaE27LT-OV8nSB4uBlo6qbOB7Jl4lXX9WvxdOXVsWebR0yrbxukk7Oh-e200vjIICDuUIsR01RJ9Xv8K8TXlXwgoy56wT8bq_1PxLgaOvfQrdudNnJL1H0usaZs8FjGhblzcMWTMFZCA",
    price: "$545",
    href: "/hotels/the-balmoral-hotel",
  },
  {
    name: "The Balmoral Hotel",
    city: "Edinburgh",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBC2Afi0OUfTMMPcvfJ4Dbr121g6LX--XQmidcvohOQYQSnBrpvihecleCTisGAb7eUxZ7Mw6mzuG9fH87mSU0Ug1l2PUqRHM5u4niO1Si3SyVl-9r_IXOGDwTqNDe2o_R5gmep41zLHw6CCdqIHuQ82qsJqwiElKkRK6PskscGK56iBQagpJwRttC2t0ZF2jidlMi9r-y9Hqk-7EgqUWg13NcHar0noy-cE0oXBYbLtC_dgtZ0JtYC1g",
    price: "$495",
    href: "/hotels/the-balmoral-hotel",
  },
  {
    name: "The Midland Hotel",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAzNf4GjqcQ1_FCQ8F1IMHTUg-w9x5OKanAfjLNqLDu-z3QPg2I3_eHkNs6HZsCXsNtaD4_6lad6cMUQPmkM3jQuT3LOl7fb-T9z6S9zRKhOhIBtiV2spltmPsFWfzJThckEqgOKC0mcBC28Do-7MZdE0ATf3NzdGksYsnBXhBgeDYe8YSojP1QfEsky43zMDaBMHUMFEyNWox-OiuwfxnaeLcJcmv5wjcQwRk0pSgauIH6Tc0u8jHmZQ",
    price: "$445",
    href: "/hotels/the-balmoral-hotel",
  },
];

export function WishlistPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <WishlistHeader />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-12 sm:px-6 lg:px-10 lg:py-14">
        <section className="mb-12 flex flex-col gap-6 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[40px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)] sm:text-[52px]">
              My Favorites
            </h1>
            <p className="mt-3 max-w-[640px] text-[17px] leading-7 text-[var(--hk-muted)]">
              Manage and compare your saved stays across all your lists.
            </p>
          </div>

          <button className="flex items-center justify-center gap-2 rounded-[12px] border border-[var(--hk-navy-strong)] bg-white px-6 py-3 text-[15px] font-semibold text-[var(--hk-navy-strong)] shadow-[var(--hk-shadow-soft)] md:min-w-[282px]">
            <CompareIcon className="h-5 w-5" />
            Compare saved stays
          </button>
        </section>

        <section className="mb-10 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.label}
                className={`flex shrink-0 items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold shadow-[var(--hk-shadow-soft)] ${
                  tab.active
                    ? "bg-[var(--hk-navy-strong)] text-white"
                    : "border border-[var(--hk-border)] bg-white text-[var(--hk-ink)]"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {tab.label}
              </button>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {stays.map((stay) => (
            <article
              key={stay.name}
              className="group flex flex-col overflow-hidden rounded-[20px] border border-transparent bg-white shadow-[var(--hk-shadow-soft)] transition-all hover:border-[var(--hk-border)] hover:shadow-[var(--hk-shadow-card)]"
            >
              <div className="relative h-64 overflow-hidden">
                <Image
                  src={stay.image}
                  alt={stay.name}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,20,44,0.38)] to-transparent" />
                <button
                  aria-label={`Remove ${stay.name} from favorites`}
                  className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/92 text-[#d82338] shadow-sm backdrop-blur"
                >
                  <HeartIcon className="h-7 w-7 fill-current" />
                </button>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <h2 className="line-clamp-1 text-[20px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)] sm:text-[22px]">
                    {stay.name}
                  </h2>
                  <div className="flex items-center gap-1 rounded-md bg-[var(--hk-surface-soft)] px-2 py-1">
                    <StarIcon className="h-4 w-4 fill-[var(--hk-gold-strong)] text-[var(--hk-gold-strong)]" />
                    <span className="text-[14px] font-semibold text-[var(--hk-navy-strong)]">
                      4.9
                    </span>
                  </div>
                </div>

                <p className="mb-4 flex items-center gap-1 text-[16px] text-[var(--hk-muted)]">
                  <PinIcon className="h-4 w-4" />
                  {stay.city}
                </p>

                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1 text-[13px] text-[var(--hk-success)]">
                    <VerifiedIcon className="h-4 w-4" />
                    Verified stay
                  </span>
                  <span className="h-4 w-px bg-[var(--hk-border)]" />
                  <span className="text-[13px] text-[var(--hk-muted)]">
                    Free cancellation
                  </span>
                </div>

                <div className="mt-auto flex items-end justify-between gap-4">
                  <p className="text-[var(--hk-navy-strong)]">
                    <span className="text-[26px] font-extrabold tracking-[-0.04em]">
                      {stay.price}
                    </span>
                    <span className="ml-1 text-[15px] text-[var(--hk-muted)]">/ night</span>
                  </p>
                  <Link
                    href={stay.href}
                    className="rounded-[10px] bg-[var(--hk-navy-strong)] px-5 py-3 text-[15px] font-semibold text-white"
                  >
                    Book Now
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
      <WishlistFooter />
    </div>
  );
}

function WishlistHeader() {
  const navItems = ["Find Stays", "Deals", "For Business", "Help"];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hk-border)] bg-[var(--hk-ivory)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3 text-[18px] font-bold text-black sm:text-[22px]">
          <KeyIcon className="h-5 w-5 text-[var(--hk-gold-strong)]" />
          Helpkey
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
              <Link
                key={item}
                href={
                  item === "Find Stays"
                    ? "/search"
                    : item === "Help"
                      ? "/help"
                      : "/profile"
                }
              className="text-[15px] font-medium text-[var(--hk-ink)] hover:text-black"
            >
              {item}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <button className="hidden items-center gap-1 text-[var(--hk-muted)] md:flex">
            <GlobeIcon className="h-5 w-5" />
            <span className="text-[14px] font-medium">USD</span>
          </button>
          <Link href="/wishlist" className="text-[var(--hk-navy-strong)]">
            <HeartIcon className="h-6 w-6" />
          </Link>
          <button className="text-[var(--hk-muted)] hover:text-black">
            <UserCircleIcon className="h-6 w-6" />
          </button>
          <button className="rounded-[12px] bg-[var(--hk-navy-strong)] px-4 py-3 text-[15px] font-semibold text-white shadow-[var(--hk-shadow-soft)]">
            Log in
          </button>
        </div>
      </div>
    </header>
  );
}

function WishlistFooter() {
  const links = [
    "Privacy Policy",
    "Terms of Service",
    "Cookie Policy",
    "Sustainability",
    "Careers",
    "Press",
  ];

  return (
    <footer className="mt-auto border-t border-[var(--hk-border)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-10">
        <div className="mb-8 flex flex-col items-center justify-between gap-6 border-b border-[var(--hk-border)] pb-8 md:flex-row">
          <Link href="/" className="flex items-center gap-3 text-[18px] font-bold text-black sm:text-[22px]">
            <KeyIcon className="h-5 w-5 text-[var(--hk-gold-strong)]" />
            Helpkey
          </Link>
          <div className="flex items-center gap-5 text-[var(--hk-muted)]">
            <GlobeIcon className="h-6 w-6" />
            <PlaneTakeoffIcon className="h-6 w-6" />
            <SupportIcon className="h-6 w-6" />
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-5 md:flex-row">
          <p className="text-[15px] text-[var(--hk-ink)]">
            © 2024 Helpkey International. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            {links.map((link) => (
              <Link
                key={link}
                href="/help"
                className="text-[12px] text-[var(--hk-muted)] hover:text-black"
              >
                {link}
              </Link>
            ))}
          </div>
        </div>
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

function PlaneTakeoffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m3 16.75 18-5.5M10.5 14 9 8.25m4.5 4.25 5 5M4.25 20.25h15.5"
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

function CompareIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 7h11M8 17h11M13 4l3 3-3 3M16 14l-3 3 3 3M3 12h8"
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

function VerifiedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m12 4.5 2.02 1.15 2.33-.33 1.15 2.02 2.02 1.15-.33 2.33L20.5 12l-1.31 1.18.33 2.33-2.02 1.15-1.15 2.02-2.33-.33L12 19.5l-2.02-1.15-2.33.33-1.15-2.02-2.02-1.15.33-2.33L3.5 12l1.31-1.18-.33-2.33 2.02-1.15 1.15-2.02 2.33.33L12 4.5Zm-2.38 7.25 1.77 1.77 3.24-3.52"
        stroke="currentColor"
        strokeWidth="1.6"
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
