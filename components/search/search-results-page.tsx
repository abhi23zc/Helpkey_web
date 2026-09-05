import Image from "next/image";
import Link from "next/link";

type IconProps = {
  className?: string;
};

type IconComponent = (props: IconProps) => React.JSX.Element;

type ResultCard = {
  name: string;
  city: string;
  image: string;
  price: string;
  saved?: boolean;
  selected?: boolean;
};

type GalleryItem = {
  image: string;
  alt: string;
};

const results: ResultCard[] = [
  {
    name: "The Ritz London",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD3RfipC3H7aHSdFi5cvzJ3y6-EBdrfXPGgNlK88vrDzXp3VH5bfQscCEXV53f7Cc4msWZZLu2WQ2vwpMvb2bdDuW9kXhLYlGN6TL8BWrR8ymuCjnaxBLUshs_Zhr2K9dIh_HHu2SrFs0d_ArVJFJ4nYC0ZMRL3VcCiNlnlgtQcuEAACWsJqsefOJHxe67l0OiNZ_rizfl_JcLjYlpxQpyzkAzLYYto-HntqhpGBBpqK2TAMulV6_8nTA",
    price: "₹545",
  },
  {
    name: "The Balmoral Hotel",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDRzAvjEAtd0n_1tQSusTPbQvL43lOtz86zakyY-Ojij22aDVynv0OAPgRUdQTJSJsluARomCDPCGV_90WoHa2DpIcsHH32F9GvOWJfKrducxyN0uIU-jaQPIKY9JCZKX9msyIwHgOd0NdnPhjRWdBAqi4hANGn1GOeyr1WI-aMYg6WMIyC07gRLMeP7jWmsZsbhzmU9UtzQnN42roOgQIv0bZnmMbkEjCGzKTZz_c2lrQLtWmhW92dEA",
    price: "₹495",
    saved: true,
    selected: true,
  },
  {
    name: "The Midland Hotel",
    city: "London",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDfLTIEgEw89Hf7EF_6hs4TR7M-cWk48cG8IV2r9fmmWUIgLRP_OP9sa7my2fjeIyiJcyBI8EyvNRIbBKk_IqNswfATvE6J30NiL8SdWmZIRKEjAUQFt4rgqyXNQDhGkZ5IYTwBGBcOVjSRCEv22CHEg-lv3Zpyz4k6aoDVmZliX_7jyPPDmF2XiHbO4ooj7dD1xD3MosapGQOc3DgqYRENxVIo146Phscxy5txKJyR7EPZbgsZmIE0Wg",
    price: "₹445",
  },
];

const gallery: GalleryItem[] = [
  {
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAMldx_I-l5IbG6I8iZ6t-tIz-t6DpelFimBBlhxh6m-Max34aMXcGa7JVE4i9-xWf4V6Djl31X7kQBsGpgqgsYP9d7wWFsWYDj6dHU31-jLSI4rA5MQ3QdwjE59wakEcD5epoaGkjkHOS7Nuexd4pxns-hvq8iJMv71TjcemRvHpGSH1fDUaHwTZjb4-jTp_VBk89zKLzlX5IHYWPcJecQZwyb416UWw3CIQKpVhDHRw3DKA06VsHjrg",
    alt: "Luxury suite with a London skyline view",
  },
  {
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDhtS_GdYW9Wyho6R-2sdDzNr9fhJFafuVQdr3rfMDQ9D3jgY520g19MS_yaIt4hEVG5hBcor5gZgIdF_THlBCpzVkS7wBwbYcdWj5rM320GICRd9iW-WUZUEiLY8gPVsKxlGo3uDyMbikjJTodblo-4b5dPpmDnw55W8UizS5oO-E3UoIdl8m6RNVJVtsIWnI6SjY-BHrIX58gniZaHEnx-sq6k5L4nMVvn0BQ4m-LWpVb8B2ivEnNKg",
    alt: "Sitting area",
  },
  {
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDE_i0dtCw74jUX9E9JZsaAAyjUJ0u3Lh51pSAWUmIA-ZX5K3C6KHy8cAwzc6FmEHKZYDY379KSO5siiSkb84d6_MFxrV-HBB6-YHnSQv2TSrDXQ5JFaSaiASWSeYs1_siqjtI9rapB0NBAA5ACJfMuKbazBOAfJCoaGlTBMcSDLif-V3U3iM8HqtB8uSozzeMmu3wEp8cwd-eFIDvJI07zD5Bg_5XCKHHpuB38YPxpCZdRT-LGPAoGjQ",
    alt: "Indoor pool",
  },
  {
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAALs0kl-0yyGoq0o8vv0vSJUyLkTZwA7Mqi-ZTDsCLC5XPyFXPMIOrzo3IbWHaBrKvAUX4WmeEXQmC-rEfJvNPyt4zMmHrZpqY1uD-EQ8TVgyhj-QUDukltj6JjmJeobS9dWFzWuKGgyBmMgO4N5VpUz0gjJrRY9rZmCg8y_38AwGOQofG-NxAY-WN1iKddVFViaFOhkrr8yPbDvrPrskhl8mlmy67hP2SEIWenqR--JQRUqfUuoU3JQ",
    alt: "Restaurant lounge",
  },
  {
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDY0DUrgg9IK10cExISwp4ES9ZMqo_Ub-tyd1LInPFQErPPjDr-ichJWHwKNz-uWLb0xeCl-Lp8IpRCxqEwkN2EmVz2oxwH_81i-5eHjsyvmIr1Jw1xjCw96J6D-2Mdb1epNu3ffaXo9_Rk8wD6S2fF1Zd53J_E0NrcKMbgmKxbBwfcbxfjc6AtCEXPRUmFkHi5pdHJ0iHlywOruUDnt_mtcOCBYkvE91gzBWGoHPGt1wt5m3hTDELqSQ",
    alt: "Architectural feature",
  },
];

const amenities: { label: string; icon: IconComponent }[] = [
  { label: "Free Wi-Fi", icon: WifiIcon },
  { label: "Breakfast", icon: BreakfastIcon },
  { label: "Pool", icon: PoolIcon },
  { label: "Spa", icon: SpaIcon },
  { label: "Gym", icon: GymIcon },
  { label: "Parking", icon: ParkingIcon },
];

export function SearchResultsPage() {
  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <SearchHeader />
      <SearchSummaryBar />
      <main className="mx-auto grid max-w-[1480px] grid-cols-1 gap-8 px-4 py-7 sm:px-6 lg:grid-cols-8 lg:px-10 2xl:grid-cols-12">
        <FiltersSidebar />
        <ResultsColumn />
        <SelectedHotelPanel />
      </main>
    </div>
  );
}

function SearchHeader() {
  const navItems = ["Find Stays", "Deals", "For Business", "Help"];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hk-border)] bg-white">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-5 px-4 py-5 sm:px-6 lg:flex-nowrap lg:px-10">
        <div className="flex min-w-0 items-center gap-5 xl:gap-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 whitespace-nowrap text-[18px] font-bold text-black sm:text-[22px]"
          >
            <KeyIcon className="h-5 w-5 text-[var(--hk-gold)]" />
            Helpkey
          </Link>
          <div className="hidden shrink-0 md:flex">
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
        </div>

        <div className="hidden shrink-0 items-center gap-6 xl:gap-9 lg:flex">
          <nav className="flex items-center gap-6 xl:gap-8">
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
                className="whitespace-nowrap text-[15px] font-medium text-black"
              >
                {item}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3 xl:gap-4">
            <button className="rounded-full p-2 text-black hover:bg-[var(--hk-surface-soft)]">
              <HeartIcon className="h-6 w-6" />
            </button>
            <button className="rounded-full p-2 text-black hover:bg-[var(--hk-surface-soft)]">
              <GlobeIcon className="h-6 w-6" />
            </button>
            <div className="h-6 w-px bg-[var(--hk-border)]" />
            <Link href="/profile" className="whitespace-nowrap text-[15px] font-semibold text-black">Log in</Link>
            <Link href="/profile" className="rounded-full border border-[var(--hk-border-strong)] p-1 text-black">
              <UserCircleIcon className="h-8 w-8" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function SearchSummaryBar() {
  return (
    <section className="border-b border-[rgba(207,212,223,0.7)] bg-white shadow-[0_4px_20px_rgba(11,31,58,0.02)]">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:gap-5 lg:px-10">
        <div className="flex flex-1 flex-col overflow-hidden rounded-[16px] border border-[rgba(188,195,209,0.6)] bg-white md:flex-row">
          <SummaryField icon={PinIcon} value="London" />
          <SummaryField icon={CalendarIcon} value="May 20 - May 22" />
          <SummaryField icon={UserIcon} value="2 Guests" chevron />
        </div>

        <button className="flex h-[62px] min-w-[178px] shrink-0 items-center justify-center gap-3 rounded-[12px] bg-[var(--hk-navy-strong)] px-8 text-[16px] font-semibold whitespace-nowrap text-white">
          <SearchIcon className="h-5 w-5" />
          Search
        </button>
      </div>
    </section>
  );
}

function SummaryField({
  icon: Icon,
  value,
  chevron,
}: {
  icon: IconComponent;
  value: string;
  chevron?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 border-b border-[rgba(207,212,223,0.55)] px-6 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <Icon className="h-6 w-6 text-[var(--hk-muted)]" />
      <span className="whitespace-nowrap text-[16px] text-black">{value}</span>
      {chevron ? <ChevronDownIcon className="ml-auto h-5 w-5 text-[var(--hk-muted)]" /> : null}
    </div>
  );
}

function FiltersSidebar() {
  return (
    <aside className="order-2 col-span-1 lg:order-1 lg:col-span-2 2xl:col-span-3">
      <div className="space-y-8 lg:pr-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-black lg:text-[24px]">Filters</h1>
          <button className="flex items-center gap-2 text-[14px] font-medium text-black">
            <RefreshIcon className="h-4 w-4" />
            Reset
          </button>
        </div>

        <section className="border-t border-[rgba(207,212,223,0.8)] pt-6">
          <h2 className="text-[18px] font-semibold text-black">Price</h2>
          <p className="mt-4 text-[16px] text-[var(--hk-muted)]">₹100 - ₹1,000+</p>
          <div className="relative mt-6 h-8">
            <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-[rgba(207,212,223,0.9)]" />
            <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-[var(--hk-navy-strong)]" />
            <input
              aria-label="Minimum price"
              type="range"
              min="100"
              max="1000"
              defaultValue="100"
              className="hk-range absolute inset-0 w-full"
            />
            <input
              aria-label="Maximum price"
              type="range"
              min="100"
              max="1000"
              defaultValue="1000"
              className="hk-range absolute inset-0 w-full"
            />
          </div>
        </section>

        <section className="border-t border-[rgba(207,212,223,0.8)] pt-6">
          <h2 className="mb-6 text-[18px] font-semibold text-black">Rating</h2>
          <div className="space-y-4">
            <FilterCheckRow checked label="4.5 & up" stars={4.5} />
            <FilterCheckRow label="4.0 & up" stars={4} />
          </div>
        </section>

        <section className="border-t border-[rgba(207,212,223,0.8)] pt-6">
          <h2 className="mb-6 text-[18px] font-semibold text-black">Amenities</h2>
          <div className="space-y-4">
            <CheckboxLabel checked label="Free cancellation" />
            <CheckboxLabel label="Breakfast included" />
            <CheckboxLabel label="Pool" />
            <CheckboxLabel checked label="Free Wi-Fi" />
          </div>
          <button className="mt-6 flex items-center gap-3 rounded-[12px] border border-[var(--hk-border-strong)] bg-white px-5 py-3 text-[15px] font-medium text-black">
            Show more
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </section>
      </div>
    </aside>
  );
}

function ResultsColumn() {
  return (
    <section className="order-1 col-span-1 lg:order-2 lg:col-span-6 2xl:col-span-5">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[32px] font-semibold tracking-[-0.05em] text-black lg:text-[28px]">
          Recommended
        </h2>
        <button className="flex items-center gap-2 text-[16px] text-black">
          Sort by: Recommended
          <ChevronDownIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-8">
        {results.map((hotel) => (
          <Link
            key={hotel.name}
            href="/hotels/the-balmoral-hotel"
            className={`relative flex flex-col overflow-hidden rounded-[18px] border bg-white shadow-[0_4px_20px_rgba(11,31,58,0.04)] sm:flex-row ${
              hotel.selected
                ? "border-[rgba(8,20,44,0.18)] ring-1 ring-[rgba(8,20,44,0.1)] shadow-[0_12px_32px_rgba(11,31,58,0.08)]"
                : "border-[rgba(188,195,209,0.65)]"
            }`}
          >
            {hotel.selected ? (
              <div className="absolute inset-y-0 left-0 w-1 bg-[var(--hk-navy-strong)]" />
            ) : null}

            <div className="relative h-[255px] sm:h-auto sm:w-[41%]">
              <Image
                src={hotel.image}
                alt={hotel.name}
                fill
                sizes="(max-width: 1024px) 100vw, 30vw"
                className="object-cover"
              />
              <button
                aria-label={`Save ${hotel.name}`}
                className={`absolute right-4 top-4 flex h-13 w-13 items-center justify-center rounded-full backdrop-blur ${
                  hotel.saved
                    ? "bg-white text-[var(--hk-favorite)]"
                    : "bg-white/85 text-black"
                }`}
              >
                <HeartIcon className={`h-7 w-7 ${hotel.saved ? "fill-current" : ""}`} />
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-between p-6">
              <div>
                <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-black lg:text-[21px] 2xl:text-[22px]">
                  {hotel.name}
                </h3>
                <p className="mt-2 flex items-center gap-1 text-[15px] text-black">
                  <PinIcon className="h-4 w-4" />
                  {hotel.city}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex items-center gap-1 text-[var(--hk-gold-strong)]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <StarIcon key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <span className="text-[15px] font-semibold text-black">4.9</span>
                </div>
              </div>

              <div className="mt-8 flex items-end justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[15px] text-[var(--hk-success)]">
                    <VerifiedBadgeIcon className="h-4 w-4" />
                    Verified stay
                  </div>
                  <p className="text-[15px] text-[var(--hk-muted)]">Free cancellation</p>
                </div>
                <div className="text-right">
                  <div className="text-[24px] font-extrabold tracking-[-0.04em] text-[var(--hk-navy-strong)] 2xl:text-[26px]">
                    {hotel.price}
                  </div>
                  <div className="mt-1 text-[14px] text-[var(--hk-muted)]">/ night</div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SelectedHotelPanel() {
  return (
    <aside className="order-3 hidden 2xl:col-span-4 2xl:block">
      <div className="overflow-hidden rounded-[20px] border border-[rgba(188,195,209,0.65)] bg-white shadow-[0_12px_32px_rgba(11,31,58,0.06)] 2xl:sticky 2xl:top-[112px]">
        <div className="relative h-[260px] sm:h-[300px]">
          <Image
            src={gallery[0].image}
            alt={gallery[0].alt}
            fill
            sizes="(max-width: 1280px) 100vw, 32vw"
            className="object-cover"
          />
          <button className="absolute left-5 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-md backdrop-blur">
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button className="absolute right-5 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-md backdrop-blur">
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 p-4">
          {gallery.slice(1).map((item, index) => (
            <div key={item.image} className="relative h-20 overflow-hidden rounded-[12px]">
              <Image
                src={item.image}
                alt={item.alt}
                fill
                sizes="120px"
                className="object-cover"
              />
              {index === 3 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[rgba(8,20,44,0.68)] text-[28px] font-semibold text-white">
                  +24
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="p-6">
          <h3 className="text-[28px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)]">
            The Balmoral Hotel
          </h3>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="flex items-center gap-1 text-[15px] text-black">
              <PinIcon className="h-4 w-4" />
              London
            </p>
            <span className="h-4 w-px bg-[var(--hk-border)]" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-[var(--hk-gold-strong)]">
                {Array.from({ length: 5 }).map((_, index) => (
                  <StarIcon key={index} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <span className="text-[15px] font-semibold text-black">4.9</span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 border-y border-[rgba(207,212,223,0.8)] py-6">
            {amenities.map((amenity) => {
              const Icon = amenity.icon;

              return (
                <div key={amenity.label} className="flex flex-col items-center gap-2 text-center text-[var(--hk-muted)]">
                  <Icon className="h-7 w-7" />
                  <span className="text-[11px]">{amenity.label}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <InfoStat icon={UsersIcon} label="Guests" value="2 Guests" />
            <InfoStat icon={BedIcon} label="Bedrooms" value="1 Bedroom" />
            <InfoStat icon={BathIcon} label="Baths" value="1 Bath" />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 border-b border-[rgba(207,212,223,0.8)] pb-8 text-[15px]">
            <span className="flex items-center gap-1.5 text-[var(--hk-success)]">
              <VerifiedBadgeIcon className="h-4 w-4" />
              Verified stay
            </span>
            <span className="h-4 w-px bg-[var(--hk-border)]" />
            <span className="text-[var(--hk-success)]">Free cancellation</span>
          </div>

          <div className="pt-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[32px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)]">
                    ₹495
                  </span>
                  <span className="text-[16px] text-[var(--hk-muted)]">/ night</span>
                </div>
                <p className="mt-2 text-[14px] leading-6 text-[var(--hk-muted)]">
                  ₹990 for 2 nights
                  <br />
                  Taxes and fees included
                </p>
              </div>
            </div>

            <button className="mt-6 w-full rounded-[16px] bg-[var(--hk-navy-strong)] py-4 text-[20px] font-semibold text-white shadow-[0_4px_12px_rgba(11,31,58,0.2)]">
              Book Now
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function FilterCheckRow({
  checked,
  label,
  stars,
}: {
  checked?: boolean;
  label: string;
  stars: number;
}) {
  return (
    <label className="flex items-center gap-4">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-[6px] border ${
          checked
            ? "border-[var(--hk-navy-strong)] bg-[var(--hk-navy-strong)] text-white"
            : "border-[var(--hk-border-strong)] bg-white text-transparent"
        }`}
      >
        <CheckIcon className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-1 text-[var(--hk-gold-strong)]">
        {Array.from({ length: 5 }).map((_, index) => {
          const filled = index + 1 <= Math.floor(stars);
          const half = !filled && index === Math.floor(stars) && stars % 1 !== 0;

          return (
            <StarIcon
              key={index}
              className={`h-4 w-4 ${
                filled || half ? "fill-current" : "fill-[#d8dee9] text-[#d8dee9]"
              }`}
            />
          );
        })}
      </div>
      <span className="ml-auto text-[16px] text-black">{label}</span>
    </label>
  );
}

function CheckboxLabel({ checked, label }: { checked?: boolean; label: string }) {
  return (
    <label className="flex items-center gap-4">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-[6px] border ${
          checked
            ? "border-[var(--hk-navy-strong)] bg-[var(--hk-navy-strong)] text-white"
            : "border-[var(--hk-border-strong)] bg-white text-transparent"
        }`}
      >
        <CheckIcon className="h-4 w-4" />
      </span>
      <span className="text-[16px] text-black">{label}</span>
    </label>
  );
}

function InfoStat({
  icon: Icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[rgba(188,195,209,0.65)] p-4">
      <div className="flex items-center gap-2 text-[13px] text-[var(--hk-muted)]">
        <Icon className="h-5 w-5" />
        {label}
      </div>
      <div className="mt-2 text-[18px] text-black">{value}</div>
    </div>
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

function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m20 20-4.2-4.2m1.95-5.05a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        stroke="currentColor"
        strokeWidth="2"
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

function RefreshIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M18.75 6.75V3.5m0 3.25H15.5m3.25 0a8 8 0 1 0 1.42 8.23"
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

function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="m10 2.3 2.14 4.34 4.79.7-3.46 3.37.81 4.77L10 13.23 5.72 15.5l.82-4.77L3.07 7.34l4.79-.7L10 2.3Z" />
    </svg>
  );
}

function VerifiedBadgeIcon({ className }: IconProps) {
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

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m14.5 6.5-5 5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m9.5 6.5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
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

function BreakfastIcon({ className }: IconProps) {
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

function PoolIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 15.5c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0 2 .8 3 0 2-.8 3 0M6 12V8.75A2.75 2.75 0 0 1 8.75 6h1.5A2.75 2.75 0 0 1 13 8.75V12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpaIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 20c4.5-1.4 7-4.9 7-9.5-2.84 0-4.75 1.1-6 3.12C11.75 11.6 9.84 10.5 7 10.5c0 4.6 2.5 8.1 5 9.5Zm1-8.75c0-3-1.25-5.1-3.75-6.75-1 2.74-.42 5.23 1.75 7.5"
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

function ParkingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 19V5.5h5.5a4 4 0 1 1 0 8H8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 18v-8.25A1.75 1.75 0 0 1 6.25 8h11.5a1.75 1.75 0 0 1 1.75 1.75V18M4.5 13h15M8 10.5h2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BathIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 12.5h14m-12-4V6.75A1.75 1.75 0 0 1 8.75 5h1A1.75 1.75 0 0 1 11.5 6.75V8.5m-8 4v2.25c0 1.8 1.45 3.25 3.25 3.25h10.5c1.8 0 3.25-1.45 3.25-3.25V12.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
