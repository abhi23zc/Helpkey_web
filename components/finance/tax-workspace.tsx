"use client";
import { useAuth } from "@/components/auth/auth-provider";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { fieldClass, buttonClass } from "./policy-editor";
/** Draft text is intentionally independent of query refreshes and rejected publications. */
export function TaxWorkspace() {
  const { appUser } = useAuth();
  const query = useQuery({ queryKey: ["private", "tax-configuration"], queryFn: () => apiFetch<{ registry: { revision: number; active: unknown[] }; versions: unknown[] }>("/api/admin/finance/taxes"), retry: false });
  const [draft, setDraft] = useState("");
  const [property, setProperty] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("accommodation");
  const [jurisdiction, setJurisdiction] = useState("");
  const [profileKind, setProfileKind] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [version, setVersion] = useState(1);
  const [treatment, setTreatment] = useState("percentage");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [basisPoints, setBasisPoints] = useState(0);
  const [mode, setMode] = useState("overnight");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  function prepareRule(preview = false) {
    const rule = { id: ruleId, version, category, treatment, reason, components: treatment === "percentage" ? [{ code: "tax", basisPoints }] : [], serviceDateBasis: mode === "overnight" ? "night_date" : mode === "hourly" ? "hourly_start" : "fulfilment_date", scope: { jurisdictions: [jurisdiction], registrations: ["registered"], profileKinds: [profileKind], bookingModes: [mode], minimumTaxablePaise: 0, maximumTaxablePaise: null, effectiveFrom: from, effectiveThrough: through }, legalReference: reference, reviewedBy: appUser?.uid ?? "", reviewedAt: new Date().toISOString(), synthetic: false };
    setProperty(""); setSupplier("");
    setDraft(JSON.stringify(preview ? { action: "preview", rule, profile: { jurisdiction, registration: "registered", profileKind, supplierId: "preview_supplier", invoiceResponsibility: "hotel", reviewedBy: appUser?.uid ?? "", reviewedAt: new Date().toISOString(), profileContentRevision: 1 }, enteredUnitPaise: 200000, quantity: 1, basis: "tax_exclusive", bookingMode: mode, serviceDate: from } : { action: "create_version", rule, reason }, null, 2));
  }
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const result = await apiFetch(`/api/admin/finance/taxes${supplier ? `?supplierId=${encodeURIComponent(supplier)}` : property ? `?propertyId=${encodeURIComponent(property)}` : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(JSON.parse(draft)) });
      setMessage(JSON.stringify(result)); await query.refetch();
    } catch (error) { setMessage(`${error instanceof Error ? error.message : "Save failed"}. Your draft is retained.`); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border p-5"><h2 className="text-lg font-semibold">Service categories and tax rules</h2><p className="text-sm">Create reviewed rule versions, then activate an explicit set with declared category, jurisdiction, registration, profile, mode, date and taxable-range coverage. Activation rejects overlaps and gaps. Production rules need legal references; zero and exempt rules also need a reason.</p><div className="grid gap-3 sm:grid-cols-2">{[["Rule identifier", ruleId, setRuleId], ["Service category", category, setCategory], ["Jurisdiction", jurisdiction, setJurisdiction], ["Property tax profile kind", profileKind, setProfileKind], ["Legal reference", reference, setReference], ["Review reason", reason, setReason], ["Effective from (YYYY-MM-DD)", from, setFrom], ["Effective through (YYYY-MM-DD)", through, setThrough]].map(([label, value, setter]) => <label key={String(label)}>{String(label)}<input className={fieldClass} value={String(value)} onChange={e => (setter as (v: string) => void)(e.target.value)} /></label>)}<label>Immutable version<input type="number" min="1" className={fieldClass} value={version} onChange={e => setVersion(Number(e.target.value))} /></label><label>Total tax basis points<input type="number" min="0" max="10000" className={fieldClass} value={basisPoints} onChange={e => setBasisPoints(Number(e.target.value))} /></label><label>Treatment<select className={fieldClass} value={treatment} onChange={e => setTreatment(e.target.value)}><option value="percentage">Percentage</option><option value="zero_rated">Zero rated</option><option value="exempt">Exempt</option></select></label><label>Service mode<select className={fieldClass} value={mode} onChange={e => setMode(e.target.value)}><option value="overnight">Room night</option><option value="hourly">Hourly accommodation</option><option value="service">Dated service</option></select></label></div><p className="text-xs">Prepare a command, then review all registration states, components, taxable tiers and dates in the draft before saving. Existing drafts change only when you choose a preparation action.</p><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => prepareRule()}>Prepare reviewed version</button><button className={buttonClass} onClick={() => prepareRule(true)}>Prepare example preview</button><button className={buttonClass} onClick={() => { setProperty(""); setSupplier(""); setDraft(JSON.stringify({ action: "activate", expectedRevision: query.data?.registry.revision ?? 0, active: query.data?.registry.active ?? [], coverage: [{ category, jurisdiction, registration: "registered", profileKind, bookingMode: mode, from, through }], reason }, null, 2)); }}>Prepare activation</button></div><p>Active registry revision: {query.data?.registry.revision ?? "unavailable"}</p><details><summary>Versions and active coverage</summary><pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(query.data, null, 2)}</pre></details><label className="block">Property ID for a separately reviewed tax profile (leave blank for rules)<input className={fieldClass} value={property} onChange={e => setProperty(e.target.value)} /></label><label className="block">Supplier ID for a separately reviewed supplier profile<input className={fieldClass} value={supplier} onChange={e => setSupplier(e.target.value)} /></label><label className="block">Reviewed configuration command<textarea className={`${fieldClass} min-h-64 font-mono`} value={draft} onChange={e => setDraft(e.target.value)} placeholder={'{"action":"activate","expectedRevision":0,"active":[],"coverage":[],"reason":"Reviewed publication"}'} /></label><button className={buttonClass} disabled={busy || !draft} onClick={save}>Save reviewed configuration</button><p role="status">{message}</p></section>;
}
