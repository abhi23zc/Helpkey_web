import Image from "next/image";
import Link from "next/link";

type IconProps = {
  className?: string;
};

type IconComponent = (props: IconProps) => React.JSX.Element;

type Amenity = {
  label: string;
  icon: IconComponent;
};

type Room = {
  name: string;
  description: string;
  image: string;
  guests: string;
  price: string;
  tags: string[];
  note: string;
  featured?: boolean;
};

type Review = {
  initials: string;
  name: string;
  meta: string;
  body: string;
};

const galleryImages = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCOitDfyqSK41dm2AwbMHRNhcIYEEkl2A57SEOy4kzyZg3TnU3jEXB8Jl2JEJSzVo35CHFps-6J4mo0djDXben_tEzNLXTUyGo_SAGtO1GwyO_l0M-fC_9WIde6Rer1zQ2VW14pEnhzth33DFLBTS_wx1Q-nHibPfZB_j2Fs5pm42DUJMcINTwG9RocFdpbx-ntIX4TdYA3JfvRWN-wByW-IlaKfLTA_4sbkrut_65sUCkE3sDMV7Aj-Q",
    alt: "Luxury suite bedroom with city views",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCNvFZtVUWoGNVso5H364r7zj6SphkSQ2qxQm0NUcmIrwHbUuhYW7549TSSssnJl7QHcvcCSlDmJrCoLq2dft55iJ1b2nGln8km43elQiOvFB3AU6pKHDMBWyQzzyPqvq5HI41bbwlS_bIfn-E1_AlPNgGskCDA-FLRdl8QOa7OYNX4ddeZ52xh3mtHCCnFR8LgZjrT2l96Ey8QqzdWwHThtBR4RNsXn9hZCKWSVlfQEeaSKCJ76jlSqw",
    alt: "Hotel lobby",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAIIQhH0k4_fouih-zhAgd-LmtBR65sPaGqXIYtWwYPTamJHNktZ6SLBMqcUesS5a3z2lGYLXE5gNf_vM-U_eEdrFnfaZ8XUyZhJhpQv4GDysIJHmboDRH8f1DMRDQWJxzwIDnrHJwpRGu4StCDx_ncG8dKiZPoejo2NhxVtI85Khxp69sklhJo3uAOvbMOhQIBwsvYoCEWzTk1es6DrgxGTfuqif6YJT967NnGIXiwd5XR90oAhDwzLw",
    alt: "Luxury bathroom",
  },
];

const amenities: Amenity[] = [
  { label: "Fast Wi-Fi", icon: WifiIcon },
  { label: "Business Center", icon: BriefcaseIcon },
  { label: "Fine Dining", icon: DiningIcon },
  { label: "Fitness Center", icon: GymIcon },
  { label: "Breakfast Included", icon: CoffeeIcon },
  { label: "Laundry Service", icon: LaundryIcon },
];

const rooms: Room[] = [
  {
    name: "Deluxe King Room",
    description:
      "Elegant city views, king-size bed, Italian marble bathroom.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBmdXjgGGlADUsIJvj18XQQ27M5xT5MoOox4vH2ypobHpj4vbuypgSx9Pthy3D3slK3o2jCsgS_UqjvMQlCq-eJ5us-nOhAQUsKAWo5vNGPsFcjMmilKt4tVVPIPagIei5qnraeht8Qa9jM40D5k-EUcqMCxX2IOlC6zz8P9tCaX8ClzROgF3QdnaHAEOsxWEwyE4siBuRPG4l70tJ0GObAK7C-Fr1WSmn-cNH2dEtuSP1GJhPEW0E2lw",
    guests: "2 Guests",
    price: "$495",
    tags: ["35 sq m", "City View", "Bathtub"],
    note: "Free cancellation",
  },
  {
    name: "Executive Suite",
    description:
      "Separate living area, castle views, complimentary minibar, VIP lounge access.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD3OGKy5rHP8pAIwRHZaMQ-k4mPHrvtzxYql7j8PQRneokbmY8rhzeKAFmffRcGJwj6dTWwMtvBfQa7nZhGI0BlkQwQMtkx9fLkPBR21gaanReo83mzjZ3CWUPYLR72-R7aZW4Adva2j5FaIQ32hEkRmZF1NEZ-BbgvX4jia5YQRW_-Q4mEvWr8zZxcJaZJThIcLykOOVyhhxWlev2gruTDfYcFGQ_y8J-QNVKZjJBcKddRi5QoF4Q0KQ",
    guests: "2 Guests",
    price: "$850",
    tags: ["65 sq m", "Castle View", "Lounge Access"],
    note: "Non-refundable",
    featured: true,
  },
];

const reviews: Review[] = [
  {
    initials: "SJ",
    name: "Sarah Jenkins",
    meta: "Business traveler • Oct 2024",
    body: `"Impeccable service. The business center was exactly what I needed, and the concierge arranged my meetings flawlessly. The room was quiet, perfectly appointed, and the bed was incredibly comfortable."`,
  },
  {
    initials: "MR",
    name: "Michael Roberts",
    meta: "Leisure • Sep 2024",
    body: `"A true 5-star experience. The views of the castle from our suite were breathtaking. Dining at their Michelin-starred restaurant was the highlight of our trip. Will absolutely return."`,
  },
];

export function HotelDetailPage({ hotelId }: { hotelId: string }) {
  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <DetailHeader />
      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10">
        <Breadcrumbs />
        <HotelHero />
        <div className="mb-16 grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="space-y-12 lg:col-span-2">
            <AboutSection />
            <AmenitiesSection />
            <RoomsSection hotelId={hotelId} />
            <ReviewsSection />
          </div>
          <BookingSidebar />
        </div>
      </main>
      <DetailFooter />
    </div>
  );
}

function DetailHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hk-border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2 text-[18px] font-bold text-black sm:text-[22px]">
            <HotelIcon className="h-5 w-5 text-[var(--hk-gold-strong)]" />
            Helpkey
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link href="/search" className="text-[13px] font-medium text-[var(--hk-muted)] hover:text-black">
              Find Stays
            </Link>
            <Link href="/search" className="text-[13px] font-medium text-[var(--hk-muted)] hover:text-black">
              Deals
            </Link>
            <Link href="/profile" className="text-[13px] font-medium text-[var(--hk-muted)] hover:text-black">
              For Business
            </Link>
            <Link href="/help" className="text-[13px] font-medium text-[var(--hk-muted)] hover:text-black">
              Help
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 md:flex">
            <button className="text-[var(--hk-muted)] hover:text-black">
              <GlobeIcon className="h-5 w-5" />
            </button>
            <span className="text-[13px] text-[var(--hk-muted)]">USD</span>
            <button className="text-[var(--hk-muted)] hover:text-black">
              <HeartIcon className="h-5 w-5" />
            </button>
          </div>
          <Link href="/profile" className="flex items-center gap-2 rounded-[10px] border border-[var(--hk-navy-strong)] px-4 py-2 text-[13px] font-semibold text-[var(--hk-navy-strong)]">
            <UserCircleIcon className="h-5 w-5" />
            Log in
          </Link>
        </div>
      </div>
    </header>
  );
}

function Breadcrumbs() {
  const items = ["Home", "United Kingdom", "Edinburgh"];

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-[12px] text-[var(--hk-muted)]">
      {items.map((item) => (
        <div key={item} className="flex items-center gap-2">
          <Link href={item === "Home" ? "/" : "#"} className="hover:text-black">
            {item}
          </Link>
          <ChevronRightIcon className="h-4 w-4" />
        </div>
      ))}
      <span className="font-medium text-[var(--hk-navy-strong)]">The Balmoral Hotel</span>
    </nav>
  );
}

function HotelHero() {
  return (
    <section className="mb-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)] sm:text-[38px] lg:text-[48px]">
            The Balmoral Hotel
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[14px]">
            <span className="flex items-center gap-1 text-[var(--hk-muted)]">
              <PinIcon className="h-4 w-4" />
              1 Princes St, Edinburgh EH2 2EQ
            </span>
            <span className="flex items-center gap-1">
              <span className="flex items-center gap-0.5 text-[var(--hk-gold-strong)]">
                {Array.from({ length: 5 }).map((_, index) => (
                  <StarIcon key={index} className="h-4 w-4 fill-current" />
                ))}
              </span>
              <span className="ml-1 font-semibold text-[var(--hk-navy-strong)]">4.9</span>
              <span className="text-[12px] text-[var(--hk-muted)]">(428 reviews)</span>
            </span>
            <span className="flex items-center gap-1 text-[13px] font-medium text-[var(--hk-success)]">
              <VerifiedIcon className="h-4 w-4" />
              Verified Stay
            </span>
          </div>
        </div>

        <div className="flex w-full gap-3 md:w-auto">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-[var(--hk-border)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--hk-navy-strong)] shadow-[var(--hk-shadow-soft)] md:flex-none">
            <ShareIcon className="h-5 w-5" />
            Share
          </button>
          <button className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-[var(--hk-border)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--hk-navy-strong)] shadow-[var(--hk-shadow-soft)] md:flex-none">
            <HeartIcon className="h-5 w-5" />
            Save
          </button>
        </div>
      </div>

      <div className="grid h-auto grid-cols-1 gap-4 md:h-[500px] md:grid-cols-4 md:grid-rows-2">
        <div className="relative overflow-hidden rounded-[20px] shadow-[var(--hk-shadow-soft)] md:col-span-3 md:row-span-2">
          <Image
            src={galleryImages[0].src}
            alt={galleryImages[0].alt}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 75vw"
            className="object-cover"
          />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-[11px] text-white">
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">Hotel Detail</span>
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">Room details</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-white px-3 py-2 text-[10px] text-[var(--hk-muted)]">
            <span>Booking, full-frame</span>
            <span className="rounded bg-[#1699a8] px-5 py-1 font-medium text-white">Booking</span>
          </div>
        </div>

        <div className="relative hidden overflow-hidden rounded-[20px] shadow-[var(--hk-shadow-soft)] md:block">
          <Image
            src={galleryImages[1].src}
            alt={galleryImages[1].alt}
            fill
            sizes="25vw"
            className="object-cover"
          />
        </div>
        <div className="relative hidden overflow-hidden rounded-[20px] shadow-[var(--hk-shadow-soft)] md:block">
          <Image
            src={galleryImages[2].src}
            alt={galleryImages[2].alt}
            fill
            sizes="25vw"
            className="object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[18px] font-semibold text-white">
            +24 Photos
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section>
      <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
        About this stay
      </h2>
      <p className="max-w-[760px] text-[16px] leading-8 text-[var(--hk-muted)]">
        Experience the epitome of Scottish luxury at The Balmoral. Located at
        Edinburgh&apos;s most prestigious address, No. 1 Princes Street, our
        landmark hotel offers breathtaking views of Edinburgh Castle. Perfectly
        tailored for the discerning business traveler, we provide seamless
        connectivity, sophisticated meeting spaces, and unmatched personal
        service to ensure your stay is as productive as it is comfortable.
      </p>
    </section>
  );
}

function AmenitiesSection() {
  return (
    <section>
      <h2 className="mb-6 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
        Premium Amenities
      </h2>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
        {amenities.map((amenity) => {
          const Icon = amenity.icon;
          return (
            <div key={amenity.label} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hk-surface-soft)] text-[var(--hk-navy-strong)]">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[14px] font-medium text-black">{amenity.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoomsSection({ hotelId }: { hotelId: string }) {
  return (
    <section>
      <h2 className="mb-6 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
        Available Rooms
      </h2>
      <div className="space-y-6">
        {rooms.map((room) => (
          <article
            key={room.name}
            className={`relative flex flex-col gap-6 overflow-hidden rounded-[20px] border bg-white p-6 shadow-[var(--hk-shadow-soft)] transition-shadow hover:shadow-[var(--hk-shadow-card)] md:flex-row ${
              room.featured
                ? "border-[rgba(213,171,84,0.45)]"
                : "border-[var(--hk-border)]"
            }`}
          >
            {room.featured ? (
              <div className="absolute right-0 top-0 rounded-bl-lg bg-[var(--hk-gold)] px-3 py-1 text-[11px] font-bold text-[#261a00]">
                Premium
              </div>
            ) : null}
            <div className="relative h-48 w-full overflow-hidden rounded-[12px] md:w-1/3">
              <Image
                src={room.image}
                alt={room.name}
                fill
                sizes="(max-width: 768px) 100vw, 25vw"
                className="object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <div className="mb-2 flex items-start justify-between gap-4">
                  <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
                    {room.name}
                  </h3>
                  <span className="flex items-center gap-1 text-[12px] text-[var(--hk-muted)]">
                    <UserIcon className="h-4 w-4" />
                    {room.guests}
                  </span>
                </div>
                <p className="mb-4 text-[15px] text-[var(--hk-muted)]">{room.description}</p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {room.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`rounded-md px-2 py-1 text-[11px] ${
                        room.featured
                          ? "border border-[rgba(213,171,84,0.25)] bg-[rgba(213,171,84,0.12)] text-[var(--hk-gold-strong)]"
                          : "bg-[var(--hk-surface-soft)] text-[var(--hk-navy-strong)]"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-4 border-t border-[var(--hk-border)] pt-4">
                <div>
                  <div className="text-[28px] font-extrabold tracking-[-0.04em] text-[var(--hk-navy-strong)]">
                    {room.price}
                    <span className="ml-1 text-[16px] font-normal text-[var(--hk-muted)]">
                      / night
                    </span>
                  </div>
                  <div
                    className={`mt-1 flex items-center gap-1 text-[12px] ${
                      room.note === "Free cancellation"
                        ? "text-[var(--hk-success)]"
                        : "text-[var(--hk-muted)]"
                    }`}
                  >
                    {room.note === "Free cancellation" ? (
                      <CheckIcon className="h-3.5 w-3.5" />
                    ) : null}
                    {room.note}
                  </div>
                </div>
                <Link
                  href={`/booking/summary?hotel=${hotelId}&room=${encodeURIComponent(room.name)}`}
                  className="rounded-[10px] bg-[var(--hk-navy-strong)] px-6 py-3 text-[14px] font-semibold text-white"
                >
                  Select
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewsSection() {
  const scoreBars = [
    { label: "Cleanliness", score: "5.0", width: "100%" },
    { label: "Service", score: "4.9", width: "98%" },
    { label: "Location", score: "5.0", width: "100%" },
    { label: "Value", score: "4.7", width: "94%" },
  ];

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
          Guest Reviews
        </h2>
        <Link href="/trips" className="flex items-center gap-1 text-[13px] font-medium text-[var(--hk-navy-strong)] hover:underline">
          Read all 428 reviews
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-8 rounded-[20px] border border-[var(--hk-border)] bg-white p-8 shadow-[var(--hk-shadow-soft)] md:flex-row md:items-center">
        <div className="text-center md:border-r md:border-[var(--hk-border)] md:pr-8">
          <div className="text-[44px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)]">
            4.9
          </div>
          <div className="mb-2 flex items-center justify-center gap-0.5 text-[var(--hk-gold-strong)]">
            {Array.from({ length: 5 }).map((_, index) => (
              <StarIcon key={index} className="h-4 w-4 fill-current" />
            ))}
          </div>
          <div className="text-[12px] text-[var(--hk-muted)]">Exceptional</div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          {scoreBars.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span>{item.label}</span>
                <span className="font-medium text-[var(--hk-navy-strong)]">{item.score}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--hk-surface-soft)]">
                <div
                  className="h-full rounded-full bg-[var(--hk-navy-strong)]"
                  style={{ width: item.width }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {reviews.map((review) => (
          <article
            key={review.name}
            className="rounded-[14px] border border-[var(--hk-border)] bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hk-navy-panel)] text-[12px] font-bold text-white">
                {review.initials}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[var(--hk-navy-strong)]">
                  {review.name}
                </div>
                <div className="text-[11px] text-[var(--hk-muted)]">{review.meta}</div>
              </div>
            </div>
            <p className="text-[14px] leading-7 text-[var(--hk-muted)]">{review.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BookingSidebar() {
  return (
    <aside className="lg:col-span-1">
      <div className="rounded-[20px] border border-[var(--hk-border)] bg-white p-6 shadow-[var(--hk-shadow-card)] lg:sticky lg:top-24">
        <div className="mb-6 flex items-end justify-between border-b border-[var(--hk-border)] pb-6">
          <div>
            <span className="text-[32px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)]">
              $495
            </span>
            <span className="text-[16px] text-[var(--hk-muted)]">/ night</span>
          </div>
          <div className="flex items-center gap-1 text-[13px] font-medium text-[var(--hk-navy-strong)]">
            <StarIcon className="h-4 w-4 fill-[var(--hk-gold-strong)] text-[var(--hk-gold-strong)]" />
            4.9
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BookingField label="Check-in" value="May 20, 2025" />
            <BookingField label="Check-out" value="May 22, 2025" />
          </div>
          <div className="flex items-center justify-between rounded-[10px] border border-[var(--hk-border)] p-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--hk-muted)]">
                Guests
              </div>
              <div className="text-[13px] font-medium text-[var(--hk-navy-strong)]">
                1 Room, 2 Guests
              </div>
            </div>
            <ChevronDownIcon className="h-4 w-4 text-[var(--hk-muted)]" />
          </div>
        </div>

        <div className="mb-6 space-y-3 text-[15px] text-[var(--hk-muted)]">
          <div className="flex justify-between">
            <span>$495 x 2 nights</span>
            <span>$990</span>
          </div>
          <div className="flex justify-between">
            <span>Taxes &amp; Fees</span>
            <span>$115</span>
          </div>
          <div className="flex justify-between border-t border-[var(--hk-border)] pt-3 text-[18px] font-semibold text-[var(--hk-navy-strong)]">
            <span>Total</span>
            <span>$1,105</span>
          </div>
        </div>

        <Link
          href="/booking/summary"
          className="block w-full rounded-[14px] bg-[var(--hk-navy-strong)] py-4 text-center text-[18px] font-semibold text-white"
        >
          Reserve Now
        </Link>
        <p className="mt-4 text-center text-[11px] text-[var(--hk-muted)]">
          You won&apos;t be charged yet
        </p>
      </div>
    </aside>
  );
}

function BookingField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--hk-border)] p-3">
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--hk-muted)]">
        {label}
      </div>
      <div className="text-[13px] font-medium text-[var(--hk-navy-strong)]">{value}</div>
    </div>
  );
}

function DetailFooter() {
  const columns = [
    {
      title: "Company",
      links: ["About Us", "Careers", "Press", "Sustainability"],
    },
    {
      title: "Support",
      links: ["Help Center", "Contact Us", "Cancellation Options"],
    },
    {
      title: "Legal",
      links: ["Terms of Service", "Privacy Policy", "Cookie Policy"],
    },
  ];

  return (
    <footer className="border-t border-[var(--hk-border)] bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-10">
        <div>
          <Link href="/" className="flex items-center gap-2 text-[16px] font-bold text-[var(--hk-navy-strong)]">
            <HotelIcon className="h-4 w-4 text-[var(--hk-gold-strong)]" />
            Helpkey
          </Link>
          <p className="mt-4 text-[12px] text-[var(--hk-muted)]">
            Premium business travel, made effortless.
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <h4 className="mb-2 text-[13px] font-semibold text-[var(--hk-navy-strong)]">
              {column.title}
            </h4>
            {column.links.map((link) => (
              <Link key={link} href={link === "Help Center" || link === "Contact Us" || link === "Cancellation Options" ? "/help" : "/help"} className="text-[14px] text-[var(--hk-muted)] hover:text-black">
                {link}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--hk-border)]">
        <div className="mx-auto max-w-[1280px] px-4 py-5 text-[11px] text-[var(--hk-muted)] sm:px-6 lg:px-10">
          © 2024 Helpkey International. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function HotelIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 18.5V9.75A2.25 2.25 0 0 1 6.75 7.5h10.5a2.25 2.25 0 0 1 2.25 2.25v8.75M4.5 13.5h15M7.5 10.5h1m7.5 0h1M7 18.5V5.75A1.75 1.75 0 0 1 8.75 4h6.5A1.75 1.75 0 0 1 17 5.75V18.5"
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

function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="m10 2.3 2.14 4.34 4.79.7-3.46 3.37.81 4.77L10 13.23 5.72 15.5l.82-4.77L3.07 7.34l4.79-.7L10 2.3Z" />
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

function ShareIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8.75 12a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8.75 12Zm6.5 4.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm0-10.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM11 8.25l2-1.5m-2 7 2-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="m7.5 5 5 5-5 5"
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

function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="m4.5 10.5 3.25 3.25 7.75-8"
        stroke="currentColor"
        strokeWidth="2"
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

function DiningIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 4.5v10m0-6.5h4.5V4.5m-4.5 9.75h4.5m5.5-9.75v7.25m0 0c0 1.52 1.23 2.75 2.75 2.75H19m-5-2.75V19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GymIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m4.5 18.5 15-13m-11.5 0 3 3m5.5 5.5 3 3m-12-3 3 3m5.5-12 3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoffeeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 8.5h9.5a2.5 2.5 0 0 1 0 5H15v.25A3.25 3.25 0 0 1 11.75 17h-2.5A3.25 3.25 0 0 1 6 13.75V8.5Zm1.75-3.75v2m3-2v2m3-2v2M5 19.25h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LaundryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.25 4.5h11.5A1.75 1.75 0 0 1 19.5 6.25v11.5a1.75 1.75 0 0 1-1.75 1.75H6.25A1.75 1.75 0 0 1 4.5 17.75V6.25A1.75 1.75 0 0 1 6.25 4.5Zm5.75 11a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm3.75-8.75h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
