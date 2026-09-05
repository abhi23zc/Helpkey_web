import Image from "next/image";
import Link from "next/link";

type IconProps = {
  className?: string;
};

type Booking = {
  hotel: string;
  city: string;
  image: string;
  total: string;
  totalLabel: string;
  checkIn: string;
  checkInTime: string;
  checkOut: string;
  checkOutTime: string;
  guests: string;
  confirmation: string;
  status: "Confirmed";
  hotelHref: string;
};

const tabs = ["Upcoming", "Past", "Cancelled"] as const;

const bookings: Booking[] = [
  {
    hotel: "The Balmoral Hotel",
    city: "Edinburgh, UK",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDMERPdoJNhOoeHHG-vVfy4W5jCM-Og6XvqBOatXFFn8SjNy_9dNlTuV4WD0Fg7lt0vX0Fm5q0cGXbE4JrDJdROTKbPZ32Tjm45aDyNa2v6Tw3uGDN8VPv0vwufo4HCv20J568YXKPlZosDROKlyARCy-FqA8qBD6NL5YPEhASC_R3rhcog9CPF-AT2nLD-G5ls3j3yhu6odFX55JnV76G0q4Ze7BI52uhWdQijltmIT1bKP7hHuaORnw",
    total: "₹1,485",
    totalLabel: "Total for 3 nights",
    checkIn: "Oct 12, 2024",
    checkInTime: "3:00 PM",
    checkOut: "Oct 15, 2024",
    checkOutTime: "11:00 AM",
    guests: "1 Adult",
    confirmation: "#HK-8924B",
    status: "Confirmed",
    hotelHref: "/hotels/the-balmoral-hotel",
  },
  {
    hotel: "The Ritz London",
    city: "London, UK",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAT5dxFsMqmozjD2fbybzad3gBdj8-CW4lCW6g-jU0M43xChj_RVxmd4WsifrO0DYHYxbsgshCZKYiDBrFggPVBCpSoQjOwgOJc_fR5Esi_Y8gc8R_4TwdbutTrqMunni_9fJf5NrLejZUuZdHIc_saLO79eHOL5nquhTUA8VvWzxDUgW79uTHF9-hPiDlbCXOf7fnhlrPk_1oboWrS8BQfsUxvwKYh_OU6UVne0Qarq3y9tG63duOXyQ",
    total: "₹1,090",
    totalLabel: "Total for 2 nights",
    checkIn: "Nov 05, 2024",
    checkInTime: "3:00 PM",
    checkOut: "Nov 07, 2024",
    checkOutTime: "12:00 PM",
    guests: "2 Adults",
    confirmation: "#HK-2195R",
    status: "Confirmed",
    hotelHref: "/hotels/the-balmoral-hotel",
  },
];

export function MyBookingsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <BookingsHeader />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-12 sm:px-6 lg:px-10">
        <section className="mb-12">
          <h1 className="text-[40px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)] sm:text-[52px]">
            My Bookings
          </h1>
          <p className="mt-3 text-[17px] leading-7 text-[var(--hk-muted)]">
            Manage your upcoming stays and review past trips.
          </p>
        </section>

        <section className="mb-8">
          <div className="inline-flex rounded-full bg-[#e7ebfb] p-1">
            {tabs.map((tab, index) => (
              <button
                key={tab}
                className={`rounded-full px-6 py-2.5 text-[15px] font-semibold transition-colors ${
                  index === 0
                    ? "bg-[var(--hk-navy-strong)] text-white shadow-sm"
                    : "text-[var(--hk-ink)] hover:text-[var(--hk-navy-strong)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          {bookings.map((booking) => (
            <article
              key={booking.confirmation}
              className="rounded-[20px] border border-transparent bg-white p-6 shadow-[var(--hk-shadow-soft)] transition-all hover:border-[rgba(8,20,44,0.1)] hover:shadow-[var(--hk-shadow-card)]"
            >
              <div className="flex flex-col gap-6 md:flex-row">
                <div className="relative h-52 overflow-hidden rounded-[14px] md:h-auto md:w-[31%] lg:w-[25%]">
                  <Image
                    src={booking.image}
                    alt={booking.hotel}
                    fill
                    sizes="(max-width: 768px) 100vw, 30vw"
                    className="object-cover"
                  />
                  <div className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-white/92 px-3 py-1.5 backdrop-blur">
                    <CheckCircleIcon className="h-4 w-4 text-[var(--hk-success)]" />
                    <span className="text-[12px] font-bold text-[var(--hk-success)]">
                      {booking.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)] sm:text-[24px]">
                          {booking.hotel}
                        </h2>
                        <p className="mt-1 flex items-center gap-1 text-[16px] text-[var(--hk-muted)]">
                          <PinIcon className="h-4 w-4" />
                          {booking.city}
                        </p>
                      </div>

                      <div className="text-left lg:text-right">
                        <div className="text-[28px] font-extrabold tracking-[-0.04em] text-[var(--hk-navy-strong)]">
                          {booking.total}
                        </div>
                        <div className="text-[13px] text-[var(--hk-muted)]">
                          {booking.totalLabel}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-4 rounded-[12px] border border-[rgba(229,225,216,0.7)] bg-[var(--hk-ivory)] p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <BookingMeta
                        label="Check In"
                        value={booking.checkIn}
                        secondary={booking.checkInTime}
                      />
                      <BookingMeta
                        label="Check Out"
                        value={booking.checkOut}
                        secondary={booking.checkOutTime}
                      />
                      <BookingMeta label="Guests" value={booking.guests} />
                      <BookingMeta
                        label="Confirmation"
                        value={booking.confirmation}
                        strong
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <button className="flex items-center gap-2 rounded-[10px] border border-[var(--hk-navy-strong)] px-5 py-2.5 text-[14px] font-semibold text-[var(--hk-navy-strong)] hover:bg-[var(--hk-navy-strong)] hover:text-white">
                      <EditIcon className="h-4 w-4" />
                      Change Booking
                    </button>
                    <Link
                      href={booking.hotelHref}
                      className="flex items-center gap-2 rounded-[10px] border border-[var(--hk-border)] px-5 py-2.5 text-[14px] font-semibold text-[var(--hk-ink)] hover:border-[var(--hk-navy-strong)]"
                    >
                      <ReceiptIcon className="h-4 w-4" />
                      Get Receipt
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
      <BookingsFooter />
    </div>
  );
}

function BookingMeta({
  label,
  value,
  secondary,
  strong,
}: {
  label: string;
  value: string;
  secondary?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-[var(--hk-muted)]">
        {label}
      </div>
      <div
        className={`text-[15px] ${strong ? "font-semibold" : "font-medium"} text-[var(--hk-ink)]`}
      >
        {value}
      </div>
      {secondary ? (
        <div className="text-[13px] text-[var(--hk-muted)]">{secondary}</div>
      ) : null}
    </div>
  );
}

function BookingsHeader() {
  const navItems = ["Find Stays", "Deals", "For Business", "Help"];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hk-border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-3 text-[18px] font-bold text-[var(--hk-navy-strong)] sm:text-[22px]"
        >
          <KeyIcon className="h-5 w-5 text-[var(--hk-navy-strong)]" />
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
              className="text-[15px] font-medium text-[var(--hk-ink)] hover:text-[var(--hk-navy-strong)]"
            >
              {item}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-4 md:flex">
            <button className="text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]">
              <GlobeIcon className="h-6 w-6" />
            </button>
            <Link
              href="/wishlist"
              className="text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
            >
              <HeartIcon className="h-6 w-6" />
            </Link>
          </div>
          <button className="hidden items-center gap-1 text-[14px] text-[var(--hk-muted)] md:flex">
            INR
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-2 rounded-[12px] bg-[var(--hk-navy-strong)] px-4 py-3 text-[15px] font-semibold text-white">
            <UserCircleIcon className="h-5 w-5" />
            Log in
          </button>
        </div>
      </div>
    </header>
  );
}

function BookingsFooter() {
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
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-10">
        <div className="md:col-span-1">
          <Link
            href="/"
            className="flex items-center gap-3 text-[18px] font-bold text-[var(--hk-navy-strong)] sm:text-[22px]"
          >
            <KeyIcon className="h-5 w-5 text-[var(--hk-navy-strong)]" />
            Helpkey
          </Link>
          <p className="mt-4 text-[12px] text-[var(--hk-muted)]">
            © 2024 Helpkey International. All rights reserved.
          </p>
        </div>
        <div className="md:col-span-3 flex flex-wrap gap-x-8 gap-y-4 md:justify-end">
          {links.map((link) => (
            <Link
              key={link}
              href="/help"
              className="text-[15px] text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
            >
              {link}
            </Link>
          ))}
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

function EditIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Zm8-12 3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReceiptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 4.75h10A1.75 1.75 0 0 1 18.75 6.5v13l-2.75-1.75-2 1.75-2-1.75-2 1.75-2.75-1.75v-13A1.75 1.75 0 0 1 7 4.75Zm2.25 4h5.5m-5.5 3.5h5.5m-5.5 3.5h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
