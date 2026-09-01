import Link from "next/link";
import type { AppUser } from "@/types/auth";

type IconProps = {
  className?: string;
};

type SidebarItem = {
  label: string;
  icon: IconComponent;
  active?: boolean;
};

type PaymentMethod = {
  brand: string;
  last4: string;
  label: string;
  default?: boolean;
};

type IconComponent = (props: IconProps) => React.JSX.Element;

const sidebarItems: SidebarItem[] = [
  { label: "Personal Info", icon: PersonIcon, active: true },
  { label: "Preferences", icon: SlidersIcon },
  { label: "Security", icon: ShieldPersonIcon },
  { label: "Payment Methods", icon: CardIcon },
  { label: "Booking History", icon: HistoryIcon },
];

const paymentMethods: PaymentMethod[] = [
  { brand: "AMEX", last4: "8492", label: "Corporate Card", default: true },
  { brand: "VISA", last4: "4242", label: "Personal (Exp 09/26)" },
];

export function ProfilePage({ user }: { user: AppUser }) {
  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <ProfileHeader user={user} />
      <main className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-4 py-12 sm:px-6 md:grid-cols-12 lg:px-10">
        <AccountSidebar />
        <section className="space-y-6 md:col-span-9">
          <ProfileHero user={user} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PersonalDetailsCard user={user} />
            <PreferencesCard />
            <SecurityCard />
            <PaymentMethodsCard />
          </div>
        </section>
      </main>
      <ProfileFooter />
    </div>
  );
}

function ProfileHeader({ user }: { user: AppUser }) {
  const navItems = ["Find Stays", "Deals", "For Business", "Help"];
  const userInitials = getInitials(user.fullName);

  return (
    <header className="border-b border-[var(--hk-border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-3 text-[18px] font-bold text-[var(--hk-navy-strong)] sm:text-[22px]"
          >
            <StarBadgeIcon className="h-5 w-5 text-[var(--hk-gold-strong)]" />
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
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-4 border-r border-[var(--hk-border)] pr-4 md:flex">
            <button className="text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]">
              <GlobeIcon className="h-6 w-6" />
            </button>
            <span className="text-[14px] font-medium text-[var(--hk-ink)]">USD</span>
            <Link
              href="/wishlist"
              className="text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
            >
              <HeartIcon className="h-6 w-6" />
            </Link>
          </div>

          <button className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-[var(--hk-surface-soft)]">
              <Avatar user={user} size={40} fallback={userInitials} />
            </div>
            <div className="hidden text-left md:block">
              <div className="text-[15px] font-bold text-[var(--hk-navy-strong)]">
                {user.fullName}
              </div>
              <div className="text-[12px] text-[var(--hk-muted)]">Helpkey customer</div>
            </div>
            <ChevronDownIcon className="h-4 w-4 text-[var(--hk-muted)]" />
          </button>
        </div>
      </div>
    </header>
  );
}

function AccountSidebar() {
  return (
    <aside className="md:col-span-3">
      <div className="md:sticky md:top-6">
        <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
          Account Settings
        </h1>
        <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={
                  item.label === "Personal Info"
                    ? "/profile"
                    : item.label === "Booking History"
                      ? "/trips"
                      : "/profile"
                }
                className={`flex items-center gap-3 rounded-[12px] px-4 py-3 text-[15px] ${
                  item.active
                    ? "bg-[var(--hk-surface-muted)] font-bold text-[var(--hk-navy-strong)]"
                    : "font-medium text-[var(--hk-ink)] hover:bg-white"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function ProfileHero({ user }: { user: AppUser }) {
  const userInitials = getInitials(user.fullName);

  return (
    <section className="rounded-[20px] bg-white p-8 shadow-[var(--hk-shadow-soft)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white shadow-sm">
              <Avatar user={user} size={96} fallback={userInitials} />
            </div>
            <button className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hk-navy-strong)] text-white shadow-md">
              <EditIcon className="h-4 w-4" />
            </button>
          </div>

          <div>
            <h2 className="text-[32px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)] sm:text-[48px]">
              {user.fullName}
            </h2>
            <p className="mt-2 flex items-center gap-2 text-[16px] text-[var(--hk-muted)]">
              <BriefcaseIcon className="h-5 w-5" />
              Business traveler
            </p>
          </div>
        </div>

        <div className="border-t border-[var(--hk-border)] pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(213,171,84,0.25)] bg-[rgba(213,171,84,0.08)] px-4 py-2 text-[14px] font-semibold text-[#785d1c]">
            <PremiumIcon className="h-4 w-4" />
            Helpkey Platinum
          </span>
          <p className="mt-3 text-right text-[13px] text-[var(--hk-muted)]">
            14 nights until next tier
          </p>
        </div>
      </div>
    </section>
  );
}

function PersonalDetailsCard({ user }: { user: AppUser }) {
  return (
    <section className="rounded-[20px] bg-white p-6 shadow-[var(--hk-shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hk-shadow-card)]">
      <CardHeader title="Personal Details" icon={BadgeIcon} action="Edit" />
      <div className="space-y-4">
        <DetailRow label="Legal Name" value={user.fullName} />
        <DetailRow label="Email Address" value={user.email || "Not added"} />
        <DetailRow label="Phone Number" value={user.phoneNumber || "Not added"} />
        <div className="pt-2">
          <div className="flex items-start gap-3 rounded-[12px] border border-[var(--hk-border)] bg-[#eef2ff] p-3">
            <BusinessIcon className="mt-0.5 h-5 w-5 text-[var(--hk-navy-strong)]" />
            <div>
              <div className="text-[14px] font-semibold text-[var(--hk-navy-strong)]">
                Corporate Booking Enabled
              </div>
              <div className="text-[12px] text-[var(--hk-muted)]">
                Invoices route to Global Corp AP.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Avatar({ user, size, fallback }: { user: AppUser; size: number; fallback: string }) {
  if (user.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.photoURL}
        alt={user.fullName}
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--hk-navy-strong)] text-[18px] font-bold text-white">
      {fallback}
    </div>
  );
}

function getInitials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PreferencesCard() {
  return (
    <section className="rounded-[20px] bg-white p-6 shadow-[var(--hk-shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hk-shadow-card)]">
      <CardHeader title="Stay Preferences" icon={RoomPreferencesIcon} action="Edit" />
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PreferenceTile
            icon={BedIcon}
            title="King Bed"
            subtitle="Preferred"
          />
          <PreferenceTile
            icon={NoSmokingIcon}
            title="Non-Smoking"
            subtitle="Required"
          />
        </div>
        <div>
          <label className="mb-2 block text-[12px] text-[var(--hk-muted)]">
            Accessibility Needs
          </label>
          <span className="inline-flex rounded-full border border-[var(--hk-border)] bg-[var(--hk-surface-muted)] px-4 py-2 text-[14px] text-[var(--hk-navy-strong)]">
            Ground floor requested
          </span>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-[var(--hk-muted)]">
            Special Instructions
          </label>
          <p className="text-[16px] italic text-[var(--hk-muted)]">
            &quot;Quiet room away from elevators if possible.&quot;
          </p>
        </div>
      </div>
    </section>
  );
}

function SecurityCard() {
  return (
    <section className="rounded-[20px] bg-white p-6 shadow-[var(--hk-shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hk-shadow-card)]">
      <div className="mb-6 flex items-center gap-3 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
        <LockIcon className="h-7 w-7" />
        Security
      </div>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--hk-border)] pb-5">
          <div>
            <div className="mb-1 text-[15px] font-semibold text-[var(--hk-ink)]">Password</div>
            <div className="text-[13px] text-[var(--hk-muted)]">
              Last changed 3 months ago
            </div>
          </div>
          <button className="rounded-[12px] border border-[var(--hk-navy-strong)] px-5 py-2.5 text-[14px] font-semibold text-[var(--hk-navy-strong)]">
            Update
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-[var(--hk-ink)]">
              Two-Factor Auth
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--hk-success)]" />
            </div>
            <div className="text-[13px] text-[var(--hk-muted)]">
              Authenticator App active
            </div>
          </div>
          <button className="text-[15px] font-medium text-[#755a1a] hover:underline">
            Manage
          </button>
        </div>
      </div>
    </section>
  );
}

function PaymentMethodsCard() {
  return (
    <section className="rounded-[20px] bg-white p-6 shadow-[var(--hk-shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hk-shadow-card)]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
          <WalletIcon className="h-7 w-7" />
          Payment Methods
        </div>
        <button className="flex items-center gap-1 text-[15px] font-medium text-[#755a1a] hover:underline">
          <AddIcon className="h-4 w-4" />
          Add
        </button>
      </div>

      <div className="space-y-3">
        {paymentMethods.map((method) => (
          <div
            key={method.last4}
            className={`relative flex items-center justify-between gap-4 rounded-[12px] border p-4 ${
              method.default
                ? "border-[var(--hk-navy-strong)] bg-white"
                : "border-[var(--hk-border)] bg-[#fbfcff]"
            }`}
          >
            {method.default ? (
              <div className="absolute inset-y-0 left-0 w-1 rounded-l-[12px] bg-[var(--hk-navy-strong)]" />
            ) : null}
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-14 items-center justify-center rounded border border-[var(--hk-border)] bg-[var(--hk-surface-soft)] text-[12px] font-bold text-[var(--hk-navy-strong)]">
                {method.brand}
              </div>
              <div>
                <div className="text-[15px] font-semibold text-[var(--hk-ink)]">
                  •••• {method.last4}
                </div>
                <div className="text-[13px] text-[var(--hk-muted)]">{method.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {method.default ? (
                <span className="rounded-md bg-[var(--hk-surface-muted)] px-3 py-1 text-[12px] font-medium text-[var(--hk-navy-strong)]">
                  Default
                </span>
              ) : null}
              <button className="text-[var(--hk-muted)] hover:text-[#ba1a1a]">
                <DeleteIcon className="h-6 w-6" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CardHeader({
  title,
  icon: Icon,
  action,
}: {
  title: string;
  icon: IconComponent;
  action: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
        <Icon className="h-7 w-7" />
        {title}
      </div>
      <button className="text-[15px] font-medium text-[#755a1a] hover:underline">
        {action}
      </button>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] text-[var(--hk-muted)]">{label}</label>
      <div className="text-[16px] text-[var(--hk-ink)]">{value}</div>
    </div>
  );
}

function PreferenceTile({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: IconComponent;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--hk-border)] bg-white p-4">
      <Icon className="mb-3 h-7 w-7 text-[var(--hk-muted)]" />
      <div className="text-[15px] font-semibold text-[var(--hk-ink)]">{title}</div>
      <div className="text-[13px] text-[var(--hk-muted)]">{subtitle}</div>
    </div>
  );
}

function ProfileFooter() {
  const columns = [
    ["Privacy Policy", "Terms of Service"],
    ["Cookie Policy", "Sustainability"],
    ["Careers", "Press"],
  ];

  return (
    <footer className="mt-12 border-t border-[var(--hk-border)] bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-10">
        <div>
          <Link
            href="/"
            className="mb-4 flex items-center gap-3 text-[18px] font-bold text-[var(--hk-navy-strong)] sm:text-[22px]"
          >
            <StarBadgeIcon className="h-5 w-5 text-[var(--hk-gold-strong)]" />
            Helpkey
          </Link>
          <p className="text-[13px] text-[var(--hk-muted)]">
            Premium stays for the modern professional.
          </p>
        </div>

        <div className="md:col-span-2 grid grid-cols-2 gap-8 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column[0]} className="flex flex-col gap-3">
              {column.map((item) => (
                <Link
                  key={item}
                  href="/help"
                  className="text-[15px] text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
                >
                  {item}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-end md:justify-end">
          <p className="text-[12px] text-[var(--hk-muted)]">
            © 2024 Helpkey International. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
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

function PersonIcon({ className }: IconProps) {
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

function SlidersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 6.5h8m3 0h4m-9 0a2 2 0 1 0-4 0m4 11h9m-14 0h2m3 0a2 2 0 1 0-4 0m11-5.5h4m-14 0h8m0 0a2 2 0 1 0-4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldPersonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 20.5c4.5-2.05 6.5-5.15 6.5-9.63V6.5L12 3.75 5.5 6.5v4.37c0 4.48 2 7.58 6.5 9.63Zm0-8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-3.25 4c.65-1.4 1.88-2.25 3.25-2.25s2.6.85 3.25 2.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 8.25h14.5M6.25 5.5h11.5A1.75 1.75 0 0 1 19.5 7.25v9.5a1.75 1.75 0 0 1-1.75 1.75H6.25A1.75 1.75 0 0 1 4.5 16.75v-9.5A1.75 1.75 0 0 1 6.25 5.5Zm1 8.75h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HistoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 12a7.25 7.25 0 1 0 2.13-5.12M4.75 4.75v4.5h4.5M12 8.5V12l2.75 1.75"
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

function PremiumIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 4.5 14 8l3.75.55-2.71 2.64.64 3.76L12 13.15l-3.68 1.8.64-3.76L6.25 8.55 10 8l2-3.5Zm0 12.25v2.75M7.75 18.5h8.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BadgeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 4.75h8A2.25 2.25 0 0 1 18.25 7v10A2.25 2.25 0 0 1 16 19.25H8A2.25 2.25 0 0 1 5.75 17V7A2.25 2.25 0 0 1 8 4.75Zm1 4h6m-6 3.5h6m-6 3.5h3M10 3.5h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BusinessIcon({ className }: IconProps) {
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

function RoomPreferencesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 18v-8.25A1.75 1.75 0 0 1 6.5 8h7m-8.75 10h14.5M7 13h10.5m-8-2.5h3.5m6.75-2.75h.01m-1.5-1.5.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
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

function NoSmokingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 14h11.5m2.5 0h.5A1.25 1.25 0 0 0 21 12.75v-1.5A1.25 1.25 0 0 0 19.75 10h-.5M6.5 8.5c0-1.66 1.34-3 3-3 1 0 1.5.5 2.5.5 1.66 0 3 1.34 3 3v1M5 5l14 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8.25 10V7.75a3.75 3.75 0 1 1 7.5 0V10m-8 9.25h8.5A1.75 1.75 0 0 0 18 17.5v-5A1.75 1.75 0 0 0 16.25 10.75h-8.5A1.75 1.75 0 0 0 6 12.5v5a1.75 1.75 0 0 0 1.75 1.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WalletIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 7.25A1.75 1.75 0 0 1 6.5 5.5h11A1.75 1.75 0 0 1 19.25 7v10A1.75 1.75 0 0 1 17.5 18.75h-11A1.75 1.75 0 0 1 4.75 17V7.25Zm0 2h14.5m-4.5 4h4.5v2.5h-4.5a1.25 1.25 0 0 1 0-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AddIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8.5 8.5v8m7-8v8M5.75 6.5h12.5m-10 0 .7-1.4A1.75 1.75 0 0 1 10.5 4h3a1.75 1.75 0 0 1 1.57 1.1l.68 1.4m-9 0V18A1.75 1.75 0 0 0 8.5 19.75h7A1.75 1.75 0 0 0 17.25 18V6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
