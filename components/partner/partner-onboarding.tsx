"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Property = { id: string; name: string; status: string; approvalStatus: string; onboarding?: { currentStep: number } };

export function PartnerOnboarding() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/partner/dashboard", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { properties?: Property[] };
      setProperties(result.properties ?? []);
    });
  }, []);

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

  return <main className="min-h-screen bg-slate-50 px-4 py-10">
    <div className="mx-auto max-w-2xl space-y-5">
      {properties.length > 0 && <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-600">Your listings</p><h1 className="mt-1 text-2xl font-bold">Continue where you left off</h1></div><Link href="/partner/dashboard" className="text-sm font-semibold text-slate-700">View all</Link></div>
        <div className="mt-5 space-y-3">{properties.map((property) => <article key={property.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"><div><h2 className="font-semibold">{property.name}</h2><p className="mt-1 text-sm text-slate-600">{property.status === "draft" ? `Draft · step ${property.onboarding?.currentStep ?? 1} of 8` : property.approvalStatus.replaceAll("_", " ")}</p></div><Link href={`/partner/properties/${property.id}`} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Continue</Link></article>)}</div>
      </section>}
      <form action={submit} className="rounded-2xl bg-white p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Helpkey partners</p>
        <h1 className="mt-2 text-3xl font-bold">{properties.length ? "Add another property" : "List your property"}</h1>
        <p className="mt-3 leading-6 text-slate-600">Start with a name. We’ll guide you through one short step at a time and save your progress automatically.</p>
        <label className="mt-7 block text-sm font-semibold">Property name<input required minLength={2} name="name" placeholder="e.g. Sunrise Grand Hotel" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" autoFocus={properties.length === 0}/></label>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="mt-6 w-full rounded-xl bg-slate-900 p-3 font-semibold text-white">{saving ? "Starting…" : "Start new listing"}</button>
      </form>
    </div>
  </main>;
}
