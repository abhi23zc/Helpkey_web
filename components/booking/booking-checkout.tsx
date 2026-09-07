"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BedDouble, BriefcaseBusiness, CheckCircle2, Heart, IndianRupee, MapPin, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/home/home-page";
import { LoginModal } from "@/components/auth/login-modal";
import { useAuth } from "@/components/auth/auth-provider";

type Quote = {
  propertyName: string;
  propertyCity: string | null;
  propertyState: string | null;
  propertyRatingAverage: number;
  propertyCoverImageUrl: string | null;
  checkInTime: string;
  checkOutTime: string;
  currency: string;
  roomType: { name: string };
  ratePlan: { name: string; paymentMode: "full" | "deposit" | "pay_at_property" };
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
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
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const displayTime = (value: string, prefix: string) => `${prefix} ${value}`;

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
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
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
        specialRequest: [companyName.trim() ? `Company: ${companyName.trim()}` : "", taxId.trim() ? `Tax ID: ${taxId.trim()}` : "", request.trim()].filter(Boolean).join("\n"),
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

  if (error && !quote) {
    return <main className="min-h-screen bg-[#f8f7f3]"><SiteHeader onLoginClick={() => setLogin(true)} /><div className="mx-auto max-w-xl px-5 py-20"><Link href="/search" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#44474d]"><ArrowLeft className="h-4 w-4" />Back to results</Link><h1 className="text-3xl font-bold text-[#000615]">This stay is no longer available</h1><p className="mt-3 text-[#44474d]">{error}</p><Link href="/search" className="mt-6 inline-block rounded-lg bg-[#000615] px-5 py-3 font-bold text-white">Browse stays</Link></div><LoginModal isOpen={login} onClose={() => setLogin(false)} /></main>;
  }

  return <main className="min-h-screen bg-[#f8f7f3] text-[#141b2b]"><SiteHeader onLoginClick={() => setLogin(true)} /><div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-10 lg:py-16"><div className="mb-10"><Link href={input ? `/hotels/${input.propertySlug}` : "/search"} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#44474d] transition hover:text-[#000615]"><ArrowLeft className="h-4 w-4" />Back to stay</Link><h1 className="text-4xl font-black tracking-tight text-[#000615] sm:text-5xl">Review your booking</h1><p className="mt-3 text-lg text-[#44474d]">Almost there. Review your details before confirmation.</p></div><div className="grid grid-cols-1 gap-7 lg:grid-cols-12"><section className="space-y-7 lg:col-span-8"><div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-6 shadow-[0_4px_20px_rgba(11,31,58,0.04)]"><div className="mb-6 flex items-center gap-3 border-b border-[#c4c6ce]/30 pb-4"><BriefcaseBusiness className="h-6 w-6 text-[#000615]" /><h2 className="text-2xl font-bold text-[#000615]">Guest and travel details</h2></div>{!loading && !appUser && <div className="mb-5 rounded-lg bg-[#f1f3ff] p-4 text-sm text-[#44474d]"><button onClick={() => setLogin(true)} className="font-bold text-[#000615] underline">Sign in</button> to complete your booking faster.</div>}{confirmed && <p className="mb-5 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"><CheckCircle2 className="h-4 w-4" />Booking confirmed: {confirmed}</p>}<div className="grid gap-5 md:grid-cols-2">{names.map((name, index) => <label key={index} className="text-sm font-semibold text-[#44474d]">Adult guest {index + 1}<input value={name} onChange={event => setNames(current => current.map((item, position) => position === index ? event.target.value : item))} placeholder={index === 0 ? "Primary guest name" : "Guest name"} className="mt-2 w-full rounded-lg border border-[#c4c6ce] bg-transparent px-4 py-3 text-base text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-1 focus:ring-[#000615]" /></label>)}<label className="text-sm font-semibold text-[#44474d]">Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-lg border border-[#c4c6ce] bg-transparent px-4 py-3 text-base text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-1 focus:ring-[#000615]" /></label><label className="text-sm font-semibold text-[#44474d]">Phone number<input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+91" className="mt-2 w-full rounded-lg border border-[#c4c6ce] bg-transparent px-4 py-3 text-base text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-1 focus:ring-[#000615]" /></label><label className="text-sm font-semibold text-[#44474d]">Company name<input value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Acme Corp" className="mt-2 w-full rounded-lg border border-[#c4c6ce] bg-transparent px-4 py-3 text-base text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-1 focus:ring-[#000615]" /></label><label className="text-sm font-semibold text-[#44474d]">GST / Tax ID <span className="font-normal">(optional)</span><input value={taxId} onChange={event => setTaxId(event.target.value)} placeholder="GSTIN or billing reference" className="mt-2 w-full rounded-lg border border-[#c4c6ce] bg-transparent px-4 py-3 text-base text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-1 focus:ring-[#000615]" /></label></div><label className="mt-5 block text-sm font-semibold text-[#44474d]">Special requests<textarea value={request} onChange={event => setRequest(event.target.value)} rows={4} placeholder="Late check-in, quiet room, high floor" className="mt-2 w-full resize-none rounded-lg border border-[#c4c6ce] bg-transparent px-4 py-3 text-base text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-1 focus:ring-[#000615]" /></label><p className="mt-2 text-xs font-medium text-[#75777e]">Requests are subject to availability and cannot be guaranteed.</p>{(error || formError) && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error || formError}</p>}</div><div className="grid gap-4 md:grid-cols-2"><TrustBadge icon={<ShieldCheck className="h-7 w-7 text-[#2f7d5c]" />} title="Secure booking" text="Your information is protected by secure payment and private account checks." /><TrustBadge icon={<IndianRupee className="h-7 w-7 text-[#000615]" />} title="No hidden fees" text="The price breakdown shows room charges, taxes, and guest fees before you confirm." /></div></section><BookingSummary quote={quote} busy={busy} appUserReady={Boolean(appUser)} formError={formError} onSubmit={() => void submit()} /></div></div><LoginModal isOpen={login} onClose={() => setLogin(false)} /></main>;
}

function TrustBadge({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex items-center gap-4 rounded-lg bg-[#f1f3ff] p-4"><span className="shrink-0">{icon}</span><span><span className="block text-sm font-bold text-[#000615]">{title}</span><span className="mt-1 block text-xs leading-5 text-[#44474d]">{text}</span></span></div>;
}

function BookingSummary({ quote, busy, appUserReady, formError, onSubmit }: { quote: Quote | null; busy: boolean; appUserReady: boolean; formError: string; onSubmit: () => void }) {
  const location = [quote?.propertyCity, quote?.propertyState].filter(Boolean).join(", ");
  const taxesAndFees = (quote?.taxPaise ?? 0) + (quote?.customerFeePaise ?? 0);
  const cta = !appUserReady ? "Sign in to continue" : quote?.ratePlan.paymentMode === "pay_at_property" ? "Confirm booking" : `Continue to ${quote?.ratePlan.paymentMode === "deposit" ? "deposit" : "payment"}`;

  return <aside className="lg:col-span-4"><div className="sticky top-24 overflow-hidden rounded-2xl border border-[#c4c6ce]/40 bg-white shadow-[0_12px_32px_rgba(11,31,58,0.08)]"><div className="relative h-52 bg-[#e1e8fd]">{quote?.propertyCoverImageUrl ? <img src={quote.propertyCoverImageUrl} alt={quote.propertyName} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><BedDouble className="h-12 w-12 text-[#7587a7]" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-[#000615]/60 to-transparent" /><button type="button" aria-label="Save stay" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#000615] shadow-sm"><Heart className="h-5 w-5" /></button></div><div className="border-b border-[#c4c6ce]/30 p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-[#000615]">{quote?.propertyName ?? "Checking availability..."}</h2>{location && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[#44474d]"><MapPin className="h-4 w-4" />{location}</p>}</div>{quote && quote.propertyRatingAverage > 0 && <span className="rounded-md bg-[#f3f4f6] px-2 py-1 text-sm font-bold text-[#000615]">★ {quote.propertyRatingAverage.toFixed(1)}</span>}</div><p className="mt-5 flex items-center gap-2 text-sm font-medium text-[#2f7d5c]"><CheckCircle2 className="h-4 w-4" />Free cancellation details shown by selected rate</p></div><div className="border-b border-[#c4c6ce]/30 bg-[#f1f3ff]/60 p-6"><div className="grid grid-cols-2 gap-4"><SummaryDate label="Check-in" value={quote ? shortDate(quote.checkIn) : "-"} helper={quote ? displayTime(quote.checkInTime, "From") : ""} /><SummaryDate label="Check-out" value={quote ? shortDate(quote.checkOut) : "-"} helper={quote ? displayTime(quote.checkOutTime, "Until") : ""} /></div><div className="mt-5 flex gap-3 border-t border-[#c4c6ce]/30 pt-4"><BedDouble className="mt-0.5 h-5 w-5 shrink-0 text-[#75777e]" /><div><p className="text-sm font-bold text-[#000615]">{quote?.roomType.name ?? "Room"}</p><p className="mt-1 text-xs text-[#44474d]">{quote ? `${quote.adults + quote.children} guest${quote.adults + quote.children === 1 ? "" : "s"} - ${quote.nights} night${quote.nights === 1 ? "" : "s"} - ${quote.ratePlan.name}` : "Loading room details"}</p></div></div></div><div className="p-6"><h3 className="text-base font-bold text-[#000615]">Price breakdown</h3>{quote ? <div className="mt-5 space-y-3 text-sm text-[#44474d]"><p className="flex justify-between"><span>{money(quote.subtotalPaise / Math.max(quote.nights, 1), quote.currency)} x {quote.nights} night{quote.nights === 1 ? "" : "s"}</span><span>{money(quote.subtotalPaise, quote.currency)}</span></p><p className="flex justify-between"><span>Taxes and fees</span><span>{money(taxesAndFees, quote.currency)}</span></p><div className="border-t border-[#c4c6ce]/40 pt-5"><p className="flex items-end justify-between text-[#000615]"><span><span className="block text-2xl font-bold">Total</span><span className="mt-1 block text-xs font-medium text-[#44474d]">Includes all taxes and fees</span></span><span className="text-3xl font-black">{money(quote.totalPaise, quote.currency)}</span></p>{quote.payableNowPaise !== quote.totalPaise && <p className="mt-3 flex justify-between rounded-lg bg-[#fff8e8] px-3 py-2 text-sm font-bold text-[#5b4302]"><span>Due now</span><span>{money(quote.payableNowPaise, quote.currency)}</span></p>}</div></div> : <p className="mt-5 text-sm text-[#44474d]">Checking availability...</p>}<button type="button" disabled={busy || !quote || Boolean(formError && appUserReady)} onClick={onSubmit} className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-[#000615] px-5 py-4 text-base font-bold text-white transition hover:bg-[#0b1f3a] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Confirming..." : cta}<ArrowRight className="h-5 w-5" /></button><p className="mt-3 text-center text-xs font-medium text-[#75777e]">{quote?.ratePlan.paymentMode === "pay_at_property" ? "You will pay directly at the property." : "You will review payment securely before charge."}</p></div></div></aside>;
}

function SummaryDate({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div><span className="block text-xs font-medium text-[#44474d]">{label}</span><span className="mt-2 block text-sm font-bold text-[#000615]">{value}</span><span className="mt-1 block text-xs text-[#75777e]">{helper}</span></div>;
}
