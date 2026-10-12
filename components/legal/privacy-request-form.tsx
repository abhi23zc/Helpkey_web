"use client";

import { useState, type FormEvent } from "react";

export function PrivacyRequestForm({ kind }: { kind: "account-deletion" | "privacy-question" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const deletion = kind === "account-deletion";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/privacy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: form.get("name"), contact: form.get("contact"), accountIdentifier: form.get("accountIdentifier") || "", message: form.get("message") || "", confirmed: form.get("confirmed") === "on", website: form.get("website") || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to submit your request. Please try again.");
      setReference(result.data.reference);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to submit your request. Please try again.");
    } finally { setBusy(false); }
  }

  if (reference) return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><h3 className="font-semibold">Request received</h3><p className="mt-2">Your reference is <strong className="break-all">{reference}</strong>. Keep this for your records. Helpkey will contact you using the details you provided.{deletion && " Your account has not been deleted yet; we must verify that you own it before processing deletion."}</p></div>;

  const field = "mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base focus:border-[var(--hk-navy-strong)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--hk-navy-strong)]";
  return <form onSubmit={submit} className="space-y-5">
    <label className="block text-sm font-semibold">Your name<input name="name" required maxLength={120} autoComplete="name" className={field} /></label>
    <label className="block text-sm font-semibold">Contact email or phone number<input name="contact" required maxLength={180} autoComplete="email" aria-describedby="contact-help" className={field} /><span id="contact-help" className="mt-1 block font-normal text-[var(--hk-muted)]">Use an email address or phone number where we can reach you.</span></label>
    {deletion && <label className="block text-sm font-semibold">Email or phone number on your Helpkey account<input name="accountIdentifier" required maxLength={180} className={field} /></label>}
    <label className="block text-sm font-semibold">{deletion ? "Additional details (optional)" : "Your privacy question"}<textarea name="message" required={!deletion} maxLength={2000} rows={4} className={field} /><span className="mt-1 block font-normal text-[var(--hk-muted)]">Do not send passwords, OTPs, payment card details, or identity documents.</span></label>
    <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="flex items-start gap-3 text-sm"><input name="confirmed" type="checkbox" required className="mt-1 h-4 w-4 shrink-0" /><span>{deletion ? "I am requesting permanent deletion of my Helpkey account and associated personal data. I understand that Helpkey will verify ownership and explain any records that must be retained." : "I agree that Helpkey may use these details to respond to this privacy request."}</span></label>
    {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    <button disabled={busy} type="submit" className="rounded-lg bg-[var(--hk-navy-strong)] px-6 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60">{busy ? "Submitting…" : deletion ? "Request account deletion" : "Send privacy question"}</button>
    <p className="text-sm text-[var(--hk-muted)]">No sign-in or app installation is required. Submission sends a request to Helpkey; it does not immediately remove any data.</p>
  </form>;
}
