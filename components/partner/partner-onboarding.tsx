"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, CircleHelp, Clock3, FileCheck2, ImageIcon, MapPin, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Property = {
  id: string; name: string; status: string; approvalStatus: string;
  address?: { city?: string; state?: string }; updatedAt?: string | null;
  onboarding?: { currentStep: number; completedSteps?: number[] };
};
const STEP_COUNT = 8;
const isDraft = (property: Property) => property.status === "draft" && !["approved", "pending"].includes(property.approvalStatus);

function statusDetails(property: Property) {
  if (isDraft(property)) {
    const complete = property.onboarding?.completedSteps?.length ?? Math.max(0, (property.onboarding?.currentStep ?? 1) - 1);
    return { label: `Draft · ${complete} of ${STEP_COUNT} complete`, action: "Resume setup", href: `/partner/properties/${property.id}`, tone: "bg-amber-50 text-amber-800" };
  }
  if (property.approvalStatus === "approved") return { label: "Live", action: "Manage property", href: `/partner/listing?propertyId=${property.id}`, tone: "bg-emerald-50 text-emerald-800" };
  if (property.approvalStatus === "pending") return { label: "Under review", action: "View status", href: `/partner/listing?propertyId=${property.id}`, tone: "bg-sky-50 text-sky-800" };
  if (property.approvalStatus === "changes_requested") return { label: "Action needed", action: "Review changes", href: `/partner/properties/${property.id}`, tone: "bg-rose-50 text-rose-800" };
  if (property.approvalStatus === "rejected") return { label: "Not approved", action: "View feedback", href: `/partner/listing?propertyId=${property.id}`, tone: "bg-rose-50 text-rose-800" };
  return { label: "Listing", action: "View property", href: `/partner/listing?propertyId=${property.id}`, tone: "bg-slate-100 text-slate-700" };
}

function savedLabel(value?: string | null) {
  if (!value) return "Saved recently";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Saved recently";
  const minutes = Math.max(0, Math.round((Date.now() - date.valueOf()) / 60_000));
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes}m ago`;
  if (minutes < 1_440) return `Saved ${Math.round(minutes / 60)}h ago`;
  return `Saved ${Math.round(minutes / 1_440)}d ago`;
}

export function PartnerOnboarding() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/partner/dashboard", { cache: "no-store" }).then(async (response) => {
      if (!response.ok || cancelled) return;
      const result = await response.json() as { properties?: Property[] };
      setProperties(result.properties ?? []);
    }).catch(() => { if (!cancelled) setError("We could not load your listings. You can still start a new one."); });
    return () => { cancelled = true; };
  }, []);

  const { drafts, managed } = useMemo(() => {
    const newest = [...properties].sort((a, b) => Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? ""));
    return { drafts: newest.filter(isDraft), managed: newest.filter((property) => !isDraft(property)) };
  }, [properties]);

  async function submit(form: FormData) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/partner/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startDraft: true, name: form.get("name") }) });
      const result = await response.json() as { propertyId?: string; error?: string };
      if (!response.ok || !result.propertyId) throw new Error(result.error ?? "Could not start your listing.");
      router.push(`/partner/properties/${result.propertyId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start your listing."); }
    finally { setSaving(false); }
  }

  const featuredDraft = drafts[0];
  return <main className="min-h-screen bg-[#f7f8fa] px-4 py-6 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-[#0b1f3a]">HELPKEY <span className="font-medium text-[#9a6b18]">PARTNERS</span></Link>
        <Link href="/help" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#0b1f3a]"><CircleHelp className="h-4 w-4" /> Help</Link>
      </header>
      {!properties.length ? <section className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><StartCard saving={saving} error={error} onSubmit={submit} firstProperty /><FirstListingSupport /></section> : <div className="space-y-8">
        <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#9a6b18]">Helpkey Partners</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0b1f3a] sm:text-4xl">Your properties</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Pick up a draft, review a listing status, or add another property when you are ready.</p></div>
        {featuredDraft && <article className="overflow-hidden rounded-3xl border border-[#e5e1d8] bg-white shadow-[0_12px_32px_rgba(11,31,58,0.07)]"><div className="grid gap-5 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#9a6b18]">Continue setup</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0b1f3a]">{featuredDraft.name}</h2><p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600"><span>{statusDetails(featuredDraft).label}</span><span className="hidden text-slate-300 sm:inline">•</span><span>{savedLabel(featuredDraft.updatedAt)}</span></p><div className="mt-5 h-2 max-w-md overflow-hidden rounded-full bg-slate-100" aria-label={statusDetails(featuredDraft).label}><div className="h-full rounded-full bg-[#0b1f3a]" style={{ width: `${Math.max(8, ((featuredDraft.onboarding?.completedSteps?.length ?? 0) / STEP_COUNT) * 100)}%` }} /></div></div><Link href={statusDetails(featuredDraft).href} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-5 py-3 text-sm font-bold text-white hover:bg-[#000615]">Resume setup <ArrowRight className="h-4 w-4" /></Link></div></article>}
        {drafts.length > 1 && <PropertyGroup title="More drafts" properties={drafts.slice(1)} />}
        {managed.length > 0 && <PropertyGroup title="Live & under review" properties={managed} />}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><StartCard saving={saving} error={error} onSubmit={submit} /><FirstListingSupport compact /></section>
      </div>}
      <section className="mt-8 grid gap-4 sm:grid-cols-3"><Benefit icon={<Building2 className="h-5 w-5" />} title="Reach ready-to-book guests" text="Present a complete, trustworthy listing." /><Benefit icon={<BadgeCheck className="h-5 w-5" />} title="Manage bookings easily" text="Keep property details and inventory in one place." /><Benefit icon={<ShieldCheck className="h-5 w-5" />} title="Secure review process" text="We check listings before they go live." /></section>
    </div>
  </main>;
}

function StartCard({ saving, error, onSubmit, firstProperty = false }: { saving: boolean; error: string; onSubmit: (form: FormData) => Promise<void>; firstProperty?: boolean }) {
  return <form action={onSubmit} className="rounded-3xl border border-[#e5e1d8] bg-white p-6 shadow-[0_12px_32px_rgba(11,31,58,0.06)] sm:p-8"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#9a6b18]">Helpkey Partners</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0b1f3a]">{firstProperty ? "List your property on Helpkey" : "Add another property"}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Start with the name guests know. You will complete one clear step at a time, and your work saves when you continue.</p><label className="mt-7 block text-sm font-bold text-[#0b1f3a]">Property name<input required minLength={2} name="name" placeholder="e.g. Sunrise Grand Hotel" className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition focus:border-[#0b1f3a] focus:ring-4 focus:ring-[#0b1f3a]/10" autoFocus={firstProperty} /></label>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{error}</p>}<button disabled={saving} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-5 py-3 text-sm font-bold text-white hover:bg-[#000615] disabled:cursor-not-allowed disabled:opacity-60"><Plus className="h-4 w-4" /> {saving ? "Starting listing…" : "Start listing"}</button></form>;
}
function FirstListingSupport({ compact = false }: { compact?: boolean }) {
  return <aside className="space-y-4 rounded-3xl border border-[#e5e1d8] bg-[#0b1f3a] p-6 text-white sm:p-7"><div><Clock3 className="h-5 w-5 text-[#fed88b]" /><h2 className="mt-3 text-lg font-extrabold">{compact ? "A simple setup process" : "Usually takes 10–15 minutes"}</h2><p className="mt-2 text-sm leading-6 text-slate-300">Save your draft at any stage and return whenever it suits you.</p></div>{!compact && <div className="border-t border-white/15 pt-5"><p className="text-sm font-bold">What you will need</p><ul className="mt-3 space-y-2 text-sm text-slate-300"><li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#fed88b]" /> Property address</li><li className="flex gap-2"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#fed88b]" /> Six or more property photos</li><li className="flex gap-2"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#fed88b]" /> Ownership documents</li></ul></div>}<div className="border-t border-white/15 pt-5"><p className="text-sm font-bold">Reviewed before going live</p><p className="mt-2 text-sm leading-6 text-slate-300">Helpkey reviews listings for accuracy and guest trust.</p></div></aside>;
}
function PropertyGroup({ title, properties }: { title: string; properties: Property[] }) {
  return <section><h2 className="text-lg font-extrabold text-[#0b1f3a]">{title}</h2><div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-[#e5e1d8] bg-white">{properties.map((property) => { const status = statusDetails(property); const location = [property.address?.city, property.address?.state].filter(Boolean).join(", "); return <article key={property.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><h3 className="truncate font-bold text-[#0b1f3a]">{property.name}</h3><p className="mt-1 text-sm text-slate-600">{location || status.label}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span><Link href={status.href} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[#0b1f3a] hover:text-[#9a6b18]">{status.action}<ArrowRight className="h-4 w-4" /></Link></div></article>; })}</div></section>;
}
function Benefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <article className="rounded-2xl border border-[#e5e1d8] bg-white p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fbf3df] text-[#9a6b18]">{icon}</span><h2 className="mt-4 text-sm font-extrabold text-[#0b1f3a]">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></article>; }
