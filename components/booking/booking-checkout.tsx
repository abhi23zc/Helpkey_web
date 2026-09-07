"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/home/home-page";
import { LoginModal } from "@/components/auth/login-modal";
import { useAuth } from "@/components/auth/auth-provider";

type Quote = {
  propertyName: string;
  currency: string;
  roomType: { name: string };
  ratePlan: { name: string; paymentMode: "full" | "deposit" | "pay_at_property" };
  checkIn: string;
  checkOut: string;
  nights: number;
  subtotalPaise: number;
  taxPaise: number;
  customerFeePaise: number;
  totalPaise: number;
  payableNowPaise: number;
};

type CheckoutParams = {
  propertySlug: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
};

declare global {
  interface Window {
    Razorpay?: new (options: { key: string; amount: number; currency: string; name: string; order_id: string; handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void; modal?: { ondismiss: () => void } }) => { open: () => void };
  }
}

const money = (value: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);

async function loadRazorpay() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Secure payment could not load. Please try again."));
    document.head.appendChild(script);
  });
}

function parseParams(params: URLSearchParams): CheckoutParams | null {
  const input = {
    propertySlug: params.get("property") ?? "",
    roomTypeId: params.get("room") ?? "",
    ratePlanId: params.get("rate") ?? "",
    checkIn: params.get("checkIn") ?? "",
    checkOut: params.get("checkOut") ?? "",
    adults: Number(params.get("adults") ?? 2),
    children: Number(params.get("children") ?? 0),
    infants: Number(params.get("infants") ?? 0),
  };
  if (!input.propertySlug || !input.roomTypeId || !input.ratePlanId || !input.checkIn || !input.checkOut || !Number.isInteger(input.adults) || input.adults < 1) return null;
  return input;
}

export function BookingCheckout() {
  const { appUser, loading } = useAuth();
  const router = useRouter();
  const [input, setInput] = useState<CheckoutParams | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [request, setRequest] = useState("");
  const [confirmed, setConfirmed] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      const next = parseParams(new URLSearchParams(window.location.search));
      if (!next) {
        setError("Choose a room and valid check-in and check-out dates before continuing.");
        return;
      }
      setInput(next);
    });
  }, []);

  useEffect(() => {
    if (!input) return;
    void Promise.resolve().then(() => {
      setError("");
      setQuote(null);
      return fetch("/api/bookings/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
        .then(async (response) => {
          const body = await response.json() as { quote?: Quote; error?: string };
          if (!response.ok || !body.quote) throw new Error(body.error ?? "Unable to quote this stay.");
          setNames((current) => current.length ? current : Array.from({ length: input.adults }, (_, index) => index === 0 ? appUser?.fullName ?? "" : ""));
          setEmail((current) => current || appUser?.email || "");
          setPhone((current) => current || appUser?.phoneNumber || "");
          setQuote(body.quote);
        });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to quote this stay."));
  }, [input, appUser?.email, appUser?.fullName, appUser?.phoneNumber]);

  const formError = useMemo(() => {
    if (!appUser) return "";
    if (names.length !== input?.adults || names.some((name) => name.trim().length < 2)) return "Add the name of every adult guest.";
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email address.";
    if (phone.trim().length < 7) return "Enter a valid phone number.";
    return "";
  }, [appUser, email, input?.adults, names, phone]);

  const submit = async () => {
    if (!appUser) {
      setLogin(true);
      return;
    }
    if (!input || !quote || formError) {
      setError(formError || "This stay is not ready to book.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        ...input,
        paymentMethod: quote.ratePlan.paymentMode === "pay_at_property" ? "pay_at_property" : "online",
        leadEmail: email,
        leadPhone: phone,
        adultGuestNames: names.map((name) => name.trim()),
        specialRequest: request,
      };
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; bookingId?: string; confirmationCode?: string; requiresPayment?: boolean; razorpay?: { keyId: string; amount: number; currency: string; name: string; orderId: string } };
      if (!response.ok || !result.bookingId || !result.confirmationCode) throw new Error(result.error ?? "Unable to create booking.");
      if (result.requiresPayment) {
        await loadRazorpay();
        if (!window.Razorpay || !result.razorpay) throw new Error("Secure payment is unavailable.");
        new window.Razorpay({
          key: result.razorpay.keyId,
          amount: result.razorpay.amount,
          currency: result.razorpay.currency,
          name: result.razorpay.name,
          order_id: result.razorpay.orderId,
          handler: async (payment) => {
            const verified = await fetch(`/api/bookings/${result.bookingId}/verify-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payment) });
            if (!verified.ok) {
              setError("Payment was received but could not be verified. Please contact support.");
              setBusy(false);
              return;
            }
            setConfirmed(result.confirmationCode ?? "");
            router.push(`/trips?confirmed=${encodeURIComponent(result.confirmationCode ?? "")}`);
          },
          modal: { ondismiss: () => setBusy(false) },
        }).open();
        return;
      }
      setConfirmed(result.confirmationCode);
      router.push(`/trips?confirmed=${encodeURIComponent(result.confirmationCode)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create booking.");
      setBusy(false);
    }
  };

  if (error && !quote) return <main className="min-h-screen bg-[var(--hk-ivory)]"><SiteHeader onLoginClick={() => setLogin(true)} /><div className="mx-auto max-w-xl px-5 py-20"><h1 className="text-2xl font-bold text-[var(--hk-navy)]">This stay is no longer available</h1><p className="mt-3 text-[var(--hk-muted)]">{error}</p><Link href="/search" className="mt-6 inline-block rounded-xl bg-[var(--hk-navy)] px-5 py-3 font-bold text-white">Browse stays</Link></div><LoginModal isOpen={login} onClose={() => setLogin(false)} /></main>;

  return <main className="min-h-screen bg-[var(--hk-ivory)]"><SiteHeader onLoginClick={() => setLogin(true)} /><div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1fr_360px]"><section className="rounded-xl border border-[var(--hk-border)] bg-white p-6"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[var(--hk-gold-strong)]"><ShieldCheck className="h-4 w-4" />Secure reservation</p><h1 className="mt-2 text-3xl font-bold text-[var(--hk-navy)]">Confirm your stay</h1>{confirmed && <p className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"><CheckCircle2 className="h-4 w-4" />Booking confirmed: {confirmed}</p>}{!loading && !appUser && <button onClick={() => setLogin(true)} className="mt-5 rounded-lg bg-[var(--hk-navy)] px-4 py-2 font-bold text-white">Sign in to book</button>}<div className="mt-7 space-y-4">{names.map((name, index) => <label key={index} className="block text-sm font-semibold">Adult guest {index + 1}<input value={name} onChange={event => setNames(current => current.map((item, position) => position === index ? event.target.value : item))} className="mt-1 w-full rounded-lg border border-[var(--hk-border-strong)] p-3" required /></label>)}<label className="block text-sm font-semibold">Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-lg border border-[var(--hk-border-strong)] p-3" required /></label><label className="block text-sm font-semibold">Phone number<input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+91" className="mt-1 w-full rounded-lg border border-[var(--hk-border-strong)] p-3" required /></label><label className="block text-sm font-semibold">Special request <span className="font-normal text-[var(--hk-muted)]">(optional)</span><textarea value={request} onChange={event => setRequest(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-[var(--hk-border-strong)] p-3" /></label></div>{(error || formError) && <p role="alert" className="mt-4 text-sm text-red-700">{error || formError}</p>}<button disabled={busy || !quote || Boolean(formError && appUser)} onClick={() => void submit()} className="mt-7 w-full rounded-xl bg-[var(--hk-navy)] py-4 font-bold text-white disabled:opacity-50">{busy ? "Confirming..." : quote?.ratePlan.paymentMode === "pay_at_property" ? "Confirm pay at property booking" : `Pay ${quote ? money(quote.payableNowPaise, quote.currency) : ""}`}</button></section><aside className="h-fit rounded-xl border border-[var(--hk-border)] bg-white p-6 shadow-[var(--hk-shadow-card)]">{quote ? <><h2 className="text-lg font-bold text-[var(--hk-navy)]">{quote.propertyName}</h2><p className="mt-1 text-sm text-[var(--hk-muted)]">{quote.roomType.name} · {quote.ratePlan.name}</p><p className="mt-4 text-sm">{quote.checkIn} to {quote.checkOut} · {quote.nights} night{quote.nights === 1 ? "" : "s"}</p><div className="mt-5 space-y-3 border-t pt-4 text-sm text-[var(--hk-muted)]"><p className="flex justify-between"><span>Room charges</span><span>{money(quote.subtotalPaise, quote.currency)}</span></p><p className="flex justify-between"><span>Taxes</span><span>{money(quote.taxPaise, quote.currency)}</span></p><p className="flex justify-between"><span>Fees</span><span>{money(quote.customerFeePaise, quote.currency)}</span></p><p className="flex justify-between border-t pt-3 text-lg font-bold text-[var(--hk-navy)]"><span>Total</span><span>{money(quote.totalPaise, quote.currency)}</span></p>{quote.payableNowPaise !== quote.totalPaise && <p className="flex justify-between font-semibold text-[var(--hk-navy)]"><span>Due now</span><span>{money(quote.payableNowPaise, quote.currency)}</span></p>}</div></> : <p className="text-[var(--hk-muted)]">Checking availability...</p>}</aside></div><LoginModal isOpen={login} onClose={() => setLogin(false)} /></main>;
}
