"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Headphones,
  ImageIcon,
  MapPin,
  ShieldCheck,
  UsersRound,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PropertySetup } from "@/components/partner/property-setup";
import { SiteHeader } from "@/components/shared/site-header";

type Property = {
  id: string;
  name: string;
  status: string;
  approvalStatus: string;
  address?: { city?: string; state?: string };
  updatedAt?: string | null;
  onboarding?: { currentStep: number; completedSteps?: number[] };
};

const STEP_COUNT = 8;

const setupSteps = [
  "Property Basics",
  "Location",
  "Rooms",
  "Photos",
  "Policies",
  "Verification",
];

const isDraft = (property: Property) =>
  property.status === "draft" && !["approved", "pending"].includes(property.approvalStatus);

function statusDetails(property: Property) {
  if (isDraft(property)) {
    const complete =
      property.onboarding?.completedSteps?.length ??
      Math.max(0, (property.onboarding?.currentStep ?? 1) - 1);
    return {
      label: `Draft · ${complete} of ${STEP_COUNT} complete`,
      action: "Continue",
      href: `/partner/onboarding?propertyId=${property.id}`,
      tone: "bg-amber-50 text-amber-800",
    };
  }
  if (property.approvalStatus === "approved") {
    return {
      label: "Live",
      action: "Manage",
      href: `/partner/listing?propertyId=${property.id}`,
      tone: "bg-emerald-50 text-emerald-800",
    };
  }
  if (property.approvalStatus === "pending") {
    return {
      label: "Under review",
      action: "View status",
      href: `/partner/listing?propertyId=${property.id}`,
      tone: "bg-sky-50 text-sky-800",
    };
  }
  if (property.approvalStatus === "changes_requested") {
    return {
      label: "Action needed",
      action: "Review changes",
      href: `/partner/onboarding?propertyId=${property.id}`,
      tone: "bg-rose-50 text-rose-800",
    };
  }
  if (property.approvalStatus === "rejected") {
    return {
      label: "Not approved",
      action: "View feedback",
      href: `/partner/listing?propertyId=${property.id}`,
      tone: "bg-rose-50 text-rose-800",
    };
  }
  return {
    label: "Listing",
    action: "View",
    href: `/partner/listing?propertyId=${property.id}`,
    tone: "bg-slate-100 text-slate-700",
  };
}

function savedLabel(value?: string | null) {
  if (!value) return "Last edited recently";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Last edited recently";
  const minutes = Math.max(0, Math.round((Date.now() - date.valueOf()) / 60_000));
  if (minutes < 1) return "Last edited just now";
  if (minutes < 60) return `Last edited ${minutes}m ago`;
  if (minutes < 1_440) return `Last edited ${Math.round(minutes / 60)}h ago`;
  return `Last edited ${Math.round(minutes / 1_440)}d ago`;
}

function locationLabel(property?: Property) {
  return [property?.address?.city, property?.address?.state].filter(Boolean).join(", ") || "Your property";
}

export function PartnerOnboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [properties, setProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/partner/dashboard", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const result = (await response.json()) as { properties?: Property[] };
        setProperties(result.properties ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("We could not load your listings. You can still start a new one.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { drafts, managed } = useMemo(() => {
    const newest = [...properties].sort(
      (a, b) => Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? ""),
    );
    return {
      drafts: newest.filter(isDraft),
      managed: newest.filter((property) => !isDraft(property)),
    };
  }, [properties]);

  async function submit(form: FormData) {
    const name = String(form.get("name") ?? "").trim();
    const propertyType = String(form.get("propertyType") ?? "hotel");
    const city = String(form.get("city") ?? "").trim();
    const countryCode = String(form.get("countryCode") ?? "IN");
    if (!name) {
      setError("Enter your property name to start the listing.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/partner/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDraft: true, name, propertyType, city, countryCode }),
      });
      const result = (await response.json()) as { propertyId?: string; error?: string };
      if (!response.ok || !result.propertyId) {
        throw new Error(result.error ?? "Could not start your listing.");
      }
      router.push(`/partner/onboarding?propertyId=${result.propertyId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start your listing.");
    } finally {
      setSaving(false);
    }
  }

  const featuredDraft = drafts[0];
  const activePropertyId = searchParams.get("propertyId");

  if (activePropertyId) return <PropertySetup propertyId={activePropertyId} />;

  return (
    <main className="min-h-screen bg-[#f6f3ed] text-[#071633]">
      <SiteHeader variant="partner" />

      <div className="mx-auto grid max-w-[1200px] gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-5 xl:px-0">
        <div className="space-y-4">
          {featuredDraft && <ResumeStrip property={featuredDraft} />}
          <SetupCard error={error} onSubmit={submit} saving={saving} hasDraft={Boolean(featuredDraft)} />
        </div>

        <PartnerGuidance />

        <section className="lg:col-span-2">
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-base font-bold text-slate-900">Why partner with Helpkey</h2>
            <p className="hidden text-xs font-medium text-slate-500 sm:block">
              More than hotels, we grow together.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Benefit
              icon={<UsersRound className="h-6 w-6" />}
              title="Reach ready-to-book guests"
              text="Get your property in front of travelers looking for stays, every day."
            />
            <Benefit
              icon={<BarChart3 className="h-6 w-6" />}
              title="Manage bookings easily"
              text="Update availability, rates and more from a simple dashboard."
            />
            <Benefit
              icon={<CreditCard className="h-6 w-6" />}
              title="Secure payouts"
              text="Get paid on time with a transparent and reliable system."
            />
          </div>
        </section>

        {(drafts.length > 1 || managed.length > 0) && (
          <section className="rounded-xl border border-[#ded8cf] bg-white p-4 shadow-[0_4px_16px_rgba(7,22,51,0.04)] lg:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#bb8525]">
                  Your listings
                </p>
                <h2 className="mt-0.5 text-base font-bold text-slate-900">Other properties</h2>
              </div>
              <Link
                href="/partner/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#071633] hover:text-[#bb8525]"
              >
                View dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-3.5 grid gap-3 md:grid-cols-2">
              {drafts.slice(1).map((property) => (
                <ListingRow key={property.id} property={property} />
              ))}
              {managed.map((property) => (
                <ListingRow key={property.id} property={property} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ResumeStrip({ property }: { property: Property }) {
  const status = statusDetails(property);

  return (
    <article className="grid gap-3 rounded-xl border border-[#ded8cf] bg-white p-4 shadow-[0_4px_16px_rgba(7,22,51,0.04)] md:grid-cols-[200px_80px_minmax(0,1fr)_130px_100px] md:items-center">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Continue where you left off</h2>
        <p className="mt-0.5 text-xs text-slate-500">You have a draft listing</p>
      </div>
      <div className="h-12 overflow-hidden rounded-md bg-[#0b2c4f]">
        <div className="h-full w-full bg-[linear-gradient(140deg,#0c2c4b_0%,#0c2c4b_38%,#e0a63b_39%,#e0a63b_44%,#193b61_45%,#193b61_100%)] opacity-95" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold text-slate-900">{property.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{locationLabel(property)}</p>
      </div>
      <p className="text-xs font-medium text-slate-500">{savedLabel(property.updatedAt)}</p>
      <Link
        href={status.href}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-[#092442] px-3.5 text-xs font-bold text-white transition hover:bg-[#061633]"
      >
        {status.action}
      </Link>
    </article>
  );
}

function SetupCard({
  error,
  onSubmit,
  saving,
  hasDraft,
}: {
  error: string;
  onSubmit: (form: FormData) => Promise<void>;
  saving: boolean;
  hasDraft: boolean;
}) {
  return (
    <form
      action={onSubmit}
      className="rounded-xl border border-[#ded8cf] bg-white p-5 shadow-[0_8px_24px_rgba(7,22,51,0.06)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#bb8525]">
            Helpkey Partners
          </p>
          <h1 className="mt-1.5 text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
            List your property on Helpkey
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Create your listing step by step. Save progress anytime and publish after review.
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 sm:block">Step 1 of 6</span>
      </div>

      <Stepper />

      <div className="mt-6 border-t border-slate-200/80 pt-5">
        <h2 className="text-base font-bold text-slate-900">Start with your property basics</h2>
        <p className="mt-1 text-xs sm:text-sm text-slate-500">Tell us about your property. You can edit this later.</p>

        <div className="mt-5 grid gap-x-5 gap-y-4 md:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-700 sm:text-sm">
            Property name <span className="text-rose-600">*</span>
            <input
              required
              minLength={2}
              name="name"
              placeholder="e.g. The Sunrise Hotel"
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#092442] focus:ring-2 focus:ring-[#092442]/15"
              autoFocus={!hasDraft}
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Use the name guests already know.
            </span>
          </label>

          <SelectField
            label="Property type"
            name="propertyType"
            options={[
              ["hotel", "Hotel"],
              ["apartment", "Apartment"],
              ["villa", "Villa"],
              ["resort", "Resort"],
              ["hostel", "Hostel"],
              ["guest_house", "Guest House"],
              ["homestay", "Homestay"],
              ["other", "Other"],
            ]}
          />
          <label className="block text-xs font-semibold text-slate-700 sm:text-sm">
            City <span className="text-rose-600">*</span>
            <input
              required
              name="city"
              placeholder="e.g. Goa"
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#092442] focus:ring-2 focus:ring-[#092442]/15"
            />
          </label>
          <SelectField label="Country / Region" name="countryCode" options={[["IN", "India"]]} />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              disabled={saving}
              className="inline-flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-lg bg-[#092442] px-5 text-xs font-bold text-white transition hover:bg-[#061633] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Starting..." : "Continue"} <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="h-10 rounded-lg border border-slate-300 px-5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Save as draft
            </button>
          </div>
          <p className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="grid h-4.5 w-4.5 place-items-center rounded-full bg-emerald-600 text-white">
              <Check className="h-3 w-3" />
            </span>
            Your progress saves automatically.
          </p>
        </div>
      </div>
    </form>
  );
}

function Stepper() {
  return (
    <div className="mt-5 grid grid-cols-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
      {setupSteps.map((step, index) => {
        const active = index === 0;
        return (
          <div key={step} className="relative flex flex-col items-center gap-1.5 text-center">
            {index < setupSteps.length - 1 && (
              <span className="absolute left-1/2 top-3.5 hidden h-px w-full bg-slate-200 lg:block" />
            )}
            <span
              className={`relative z-10 grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition-colors ${
                active ? "bg-[#092442] text-white shadow-sm" : "bg-slate-100 text-slate-500"
              }`}
            >
              {index + 1}
            </span>
            <span className={`text-xs ${active ? "font-semibold text-[#092442]" : "font-medium text-slate-500"}`}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SelectField({ label, name, options }: { label: string; name: string; options: Array<[string, string]> }) {
  return (
    <label className="block text-xs font-semibold text-slate-700 sm:text-sm">
      {label} <span className="text-rose-600">*</span>
      <span className="relative mt-1.5 block">
        <select
          name={name}
          required
          className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3.5 pr-9 text-sm font-normal text-slate-900 outline-none transition focus:border-[#092442] focus:ring-2 focus:ring-[#092442]/15"
        >
          {options.map(([value, optionLabel]) => (
            <option key={value} value={value}>{optionLabel}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </span>
    </label>
  );
}

function PartnerGuidance() {
  return (
    <aside className="space-y-3.5">
      <InfoPanel>
        <div className="flex gap-3.5">
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[#c8912c]" />
          <div>
            <h2 className="text-base font-bold text-slate-900">What you will need</h2>
            <ul className="mt-3 space-y-2.5 text-xs font-medium text-slate-700">
              <GuideItem icon={<MapPin className="h-4 w-4 text-slate-400" />} text="Property address" />
              <GuideItem icon={<BedDouble className="h-4 w-4 text-slate-400" />} text="Room types and prices" />
              <GuideItem icon={<ImageIcon className="h-4 w-4 text-slate-400" />} text="6+ property photos" />
              <GuideItem icon={<Wifi className="h-4 w-4 text-slate-400" />} text="Amenities" />
              <GuideItem icon={<FileText className="h-4 w-4 text-slate-400" />} text="Cancellation policy" />
              <GuideItem icon={<ShieldCheck className="h-4 w-4 text-slate-400" />} text="Business verification documents" />
            </ul>
          </div>
        </div>
      </InfoPanel>

      <InfoPanel className="py-3.5">
        <div className="flex items-center gap-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#c4a04f]/60 text-[#c4a04f] bg-[#fdfaf3]">
            <Clock3 className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Usually takes 10–15 minutes</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              You can save your progress and continue later.
            </p>
          </div>
        </div>
      </InfoPanel>

      <InfoPanel className="py-3.5">
        <div className="flex items-center gap-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#092442] text-white">
            <Check className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Reviewed before going live</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Helpkey checks listings for accuracy and guest trust.
            </p>
          </div>
        </div>
      </InfoPanel>

      <InfoPanel className="py-3.5">
        <div className="flex items-center gap-3.5">
          <Headphones className="h-8 w-8 shrink-0 text-[#c8912c]" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">Need help?</h3>
            <p className="mt-0.5 text-xs text-slate-500">Partner support is available.</p>
            <Link href="/help" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8b6418] hover:underline">
              Contact partner support <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </div>
      </InfoPanel>
    </aside>
  );
}

function InfoPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[#ded8cf] bg-white p-4 shadow-[0_4px_16px_rgba(7,22,51,0.04)] ${className}`}>
      {children}
    </section>
  );
}

function GuideItem({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span>{icon}</span>
      <span>{text}</span>
    </li>
  );
}

function Benefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="flex min-h-[88px] gap-3.5 rounded-xl border border-[#ded8cf] bg-white p-4 shadow-[0_4px_16px_rgba(7,22,51,0.04)]">
      <span className="mt-0.5 shrink-0 text-[#c8912c] [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p>
      </div>
    </article>
  );
}

function ListingRow({ property }: { property: Property }) {
  const status = statusDetails(property);

  return (
    <article className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3.5">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold text-slate-900">{property.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{locationLabel(property)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
        <Link href={status.href} className="inline-flex items-center gap-1 text-xs font-semibold text-[#071633] hover:text-[#bb8525]">
          {status.action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
