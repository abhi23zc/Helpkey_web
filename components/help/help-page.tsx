import Link from "next/link";

type IconProps = {
  className?: string;
};

type IconComponent = (props: IconProps) => React.JSX.Element;

type Topic = {
  title: string;
  description: string;
  icon: IconComponent;
};

type Faq = {
  question: string;
  answer: string;
  open?: boolean;
};

const topics: Topic[] = [
  {
    title: "Manage Bookings",
    description: "Changes, cancellations, and itinerary details.",
    icon: CalendarEditIcon,
  },
  {
    title: "Payments & Refunds",
    description: "Invoices, receipts, and refund statuses.",
    icon: PaymentsIcon,
  },
  {
    title: "Business Travel Program",
    description: "Corporate rates, expense tracking, and admin tools.",
    icon: BriefcaseIcon,
  },
  {
    title: "Safety & Security",
    description: "Travel advisories, property standards, and emergency info.",
    icon: ShieldIcon,
  },
];

const faqs: Faq[] = [
  {
    question: "How do I cancel my business reservation?",
    answer:
      'You can cancel your reservation by navigating to "Manage Bookings" in your account dashboard. For corporate accounts, cancellation policies may vary based on your company\'s agreement.',
    open: true,
  },
  {
    question: "When will I receive my refund?",
    answer:
      'Refunds typically process within 5-7 business days depending on your banking institution. You can track the status in the "Payments & Refunds" section.',
  },
  {
    question: "How can I get an invoice for my stay?",
    answer:
      "Invoices are automatically emailed to the address on file within 24 hours of checkout. You can also download them directly from your past trips.",
  },
];

export function HelpPage() {
  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <HelpHeader />
      <main className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-10">
        <HeroSection />
        <TopicsSection />
        <FaqSection />
        <SupportSection />
      </main>
      <HelpFooter />
    </div>
  );
}

function HelpHeader() {
  const navItems = ["Find Stays", "Deals", "For Business", "Help"];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hk-border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-10">
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
                    : "#"
              }
              className={`text-[15px] font-medium ${
                item === "Help"
                  ? "border-b-2 border-[var(--hk-navy-strong)] pb-1 text-[var(--hk-navy-strong)]"
                  : "text-[var(--hk-ink)] hover:text-[var(--hk-navy-strong)]"
              }`}
            >
              {item}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <button className="hidden items-center gap-1 text-[14px] text-[var(--hk-muted)] md:flex">
            <GlobeIcon className="h-5 w-5" />
            USD
          </button>
          <Link
            href="/wishlist"
            className="text-[var(--hk-muted)] hover:text-[var(--hk-navy-strong)]"
          >
            <HeartIcon className="h-6 w-6" />
          </Link>
          <button className="flex items-center gap-2 rounded-[10px] bg-[var(--hk-navy-strong)] px-4 py-2.5 text-[14px] font-semibold text-white">
            <UserCircleIcon className="h-5 w-5" />
            <span>Log in</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="mx-auto mb-14 max-w-[780px] text-center">
      <h1 className="mb-6 text-[40px] font-extrabold tracking-[-0.05em] text-[var(--hk-navy-strong)] sm:text-[56px]">
        How can we help?
      </h1>
      <div className="flex items-center gap-3 rounded-[16px] border border-[rgba(196,198,206,0.35)] bg-white p-2 shadow-[0_12px_32px_rgba(11,31,58,0.08)]">
        <SearchIcon className="ml-4 h-6 w-6 shrink-0 text-[var(--hk-navy-strong)]/70" />
        <input
          type="text"
          placeholder="Search for answers..."
          className="w-full border-none bg-transparent px-1 py-3 text-[16px] text-[var(--hk-ink)] outline-none placeholder:text-[rgba(68,71,77,0.7)]"
        />
        <button className="shrink-0 rounded-[12px] bg-[var(--hk-navy-strong)] px-6 py-3 text-[14px] font-semibold text-white">
          Search
        </button>
      </div>
    </section>
  );
}

function TopicsSection() {
  return (
    <section className="mb-16">
      <h2 className="mb-8 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
        Browse Topics
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {topics.map((topic) => {
          const Icon = topic.icon;
          return (
            <Link
              key={topic.title}
              href={topic.title === "Manage Bookings" ? "/trips" : topic.title === "Payments & Refunds" ? "/trips" : topic.title === "Business Travel Program" ? "/profile" : "/help"}
              className="rounded-[16px] border border-white/50 bg-white/70 p-6 shadow-[var(--hk-shadow-soft)] backdrop-blur-[12px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--hk-shadow-card)]"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--hk-surface-soft)] text-[var(--hk-navy-strong)]">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-[18px] font-semibold text-[var(--hk-navy-strong)]">
                {topic.title}
              </h3>
              <p className="text-[15px] leading-7 text-[var(--hk-muted)]">
                {topic.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-12">
      <div className="md:col-span-4">
        <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
          Frequently Asked Questions
        </h2>
        <p className="text-[16px] text-[var(--hk-muted)]">
          Quick answers to our most common inquiries.
        </p>
      </div>

      <div className="space-y-4 md:col-span-8">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            open={faq.open}
            className="group rounded-[16px] border border-white/50 bg-white/70 shadow-[var(--hk-shadow-soft)] backdrop-blur-[12px]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between p-6 text-[17px] font-semibold text-[var(--hk-navy-strong)]">
              {faq.question}
              <ChevronDownIcon className="h-5 w-5 text-[var(--hk-muted)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-[rgba(196,198,206,0.35)] px-6 pb-6 pt-4 text-[15px] leading-7 text-[var(--hk-muted)]">
              {faq.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function SupportSection() {
  return (
    <section className="relative overflow-hidden rounded-[16px] border border-[rgba(196,198,206,0.35)] bg-white p-8 shadow-[var(--hk-shadow-soft)] md:p-12">
      <div className="pointer-events-none absolute inset-0 opacity-5 [background-image:radial-gradient(circle_at_100%_100%,#000615_0%,transparent_50%)]" />
      <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
        <div className="text-center md:text-left">
          <h2 className="mb-2 text-[24px] font-semibold tracking-[-0.03em] text-[var(--hk-navy-strong)]">
            Still need help?
          </h2>
          <p className="text-[16px] text-[var(--hk-muted)]">
            Our premium support team is available 24/7 to assist you.
          </p>
        </div>

        <div className="flex w-full flex-col gap-4 sm:flex-row md:w-auto">
          <button className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-[var(--hk-navy-strong)] px-6 py-3 text-[14px] font-semibold text-[var(--hk-navy-strong)] hover:bg-[var(--hk-surface-soft)] md:flex-none">
            <CallIcon className="h-5 w-5" />
            Call Us
          </button>
          <button className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[var(--hk-navy-strong)] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_12px_32px_rgba(11,31,58,0.08)] md:flex-none">
            <ChatIcon className="h-5 w-5" />
            Chat with Support
          </button>
        </div>
      </div>
    </section>
  );
}

function HelpFooter() {
  const columns = [
    ["Privacy Policy", "Terms of Service"],
    ["Cookie Policy", "Sustainability"],
    ["Careers", "Press"],
  ];

  return (
    <footer className="mt-16 border-t border-[var(--hk-border)] bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-10">
        <div>
          <div className="mb-4 flex items-center gap-3 text-[18px] font-bold text-[var(--hk-navy-strong)] sm:text-[22px]">
            <StarBadgeIcon className="h-5 w-5 text-[var(--hk-gold-strong)]" />
            Helpkey
          </div>
          <p className="text-[12px] text-[var(--hk-muted)]">
            © 2024 Helpkey International. All rights reserved.
          </p>
        </div>

        <div className="md:col-span-3 grid grid-cols-2 gap-8 sm:grid-cols-3">
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

function CalendarEditIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 3.75v3m9-3v3M4.5 9.25h9m-7.25 10h11.5A1.75 1.75 0 0 0 19.5 17.5V7.25A1.75 1.75 0 0 0 17.75 5.5H6.25A1.75 1.75 0 0 0 4.5 7.25V17.5c0 .97.78 1.75 1.75 1.75Zm8.25-5.75 4.25-4.25a1.24 1.24 0 1 0-1.75-1.75l-4.25 4.25L12 15.5l2.5-.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaymentsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 8.25h14.5M6.25 5.5h11.5A1.75 1.75 0 0 1 19.5 7.25v9.5a1.75 1.75 0 0 1-1.75 1.75H6.25A1.75 1.75 0 0 1 4.5 16.75v-9.5A1.75 1.75 0 0 1 6.25 5.5Zm8.5 8h2.5m-8.5 0h3"
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

function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 20.5c4.5-2.05 6.5-5.15 6.5-9.63V6.5L12 3.75 5.5 6.5v4.37c0 4.48 2 7.58 6.5 9.63Zm0-8.38V8.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="15.5" r="0.9" fill="currentColor" />
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

function CallIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.75 4.75h2.5l1.25 4-1.75 1.75a15.34 15.34 0 0 0 4.75 4.75l1.75-1.75 4 1.25v2.5A1.75 1.75 0 0 1 17.5 19a12.75 12.75 0 0 1-12.5-12.5 1.75 1.75 0 0 1 1.75-1.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5.75 6.5h12.5A1.75 1.75 0 0 1 20 8.25v7.5a1.75 1.75 0 0 1-1.75 1.75H9l-4.25 2V8.25A1.75 1.75 0 0 1 5.75 6.5Zm3 4h6.5m-6.5 3h4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
