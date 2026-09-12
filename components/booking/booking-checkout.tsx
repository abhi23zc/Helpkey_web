"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Heart,
  IndianRupee,
  Lock,
  Mail,
  MapPin,
  Moon,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/shared/site-header";
import { LoginModal } from "@/components/auth/login-modal";
import { useAuth } from "@/components/auth/auth-provider";
import { BookingConfirmationCard } from "@/components/booking/booking-confirmation-card";
import { PublicMediaImage } from "@/components/shared/public-media-image";

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
    Razorpay?: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      order_id: string;
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => void;
      modal?: { ondismiss: () => void };
    }) => { open: () => void };
  }
}

const money = (value: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);

const shortDate = (value: string) => {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const displayTime = (value: string, prefix: string) => `${prefix} ${value}`;

async function loadRazorpay() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Secure payment could not load. Please try again."));
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
  if (
    !input.propertySlug ||
    !input.roomTypeId ||
    !input.ratePlanId ||
    !input.checkIn ||
    !input.checkOut ||
    !Number.isInteger(input.adults) ||
    input.adults < 1
  )
    return null;
  return input;
}

export function BookingCheckout() {
  const { appUser, loading } = useAuth();
  const router = useRouter();
  const [input, setInput] = useState<CheckoutParams | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
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
        setError(
          "Choose a room and valid check-in and check-out dates before continuing."
        );
        setQuoteLoading(false);
        return;
      }
      setInput(next);
    });
  }, []);

  useEffect(() => {
    if (!input) return;
    void Promise.resolve()
      .then(() => {
        setError("");
        setQuoteLoading(true);
        setQuote(null);
        return fetch("/api/bookings/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }).then(async (response) => {
          const body = (await response.json()) as {
            quote?: Quote;
            error?: string;
          };
          if (!response.ok || !body.quote)
            throw new Error(body.error ?? "Unable to quote this stay.");
          setNames((current) =>
            current.length
              ? current
              : Array.from({ length: input.adults }, (_, index) =>
                  index === 0 ? appUser?.fullName ?? "" : ""
                )
          );
          setEmail((current) => current || appUser?.email || "");
          setPhone((current) => current || appUser?.phoneNumber || "");
          setQuote(body.quote);
        });
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Unable to quote this stay."
        )
      )
      .finally(() => setQuoteLoading(false));
  }, [input, appUser?.email, appUser?.fullName, appUser?.phoneNumber]);

  const formError = useMemo(() => {
    if (!appUser) return "";
    if (
      names.length !== input?.adults ||
      names.some((name) => name.trim().length < 2)
    )
      return "Please enter full names for all adult guests.";
    if (!/^\S+@\S+\.\S+$/.test(email))
      return "Please enter a valid email address.";
    if (phone.trim().length < 7) return "Please enter a valid phone number.";
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
        paymentMethod:
          quote.ratePlan.paymentMode === "pay_at_property"
            ? "pay_at_property"
            : "online",
        leadEmail: email,
        leadPhone: phone,
        adultGuestNames: names.map((name) => name.trim()),
        specialRequest: [
          companyName.trim() ? `Company: ${companyName.trim()}` : "",
          taxId.trim() ? `Tax ID: ${taxId.trim()}` : "",
          request.trim(),
        ]
          .filter(Boolean)
          .join("\n"),
      };
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        error?: string;
        bookingId?: string;
        confirmationCode?: string;
        requiresPayment?: boolean;
        razorpay?: {
          keyId: string;
          amount: number;
          currency: string;
          name: string;
          orderId: string;
        };
      };
      if (!response.ok || !result.bookingId || !result.confirmationCode)
        throw new Error(result.error ?? "Unable to create booking.");
      if (result.requiresPayment) {
        await loadRazorpay();
        if (!window.Razorpay || !result.razorpay)
          throw new Error("Secure payment is unavailable.");
        new window.Razorpay({
          key: result.razorpay.keyId,
          amount: result.razorpay.amount,
          currency: result.razorpay.currency,
          name: result.razorpay.name,
          order_id: result.razorpay.orderId,
          handler: async (payment) => {
            const verified = await fetch(
              `/api/bookings/${result.bookingId}/verify-payment`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payment),
              }
            );
            if (!verified.ok) {
              setError(
                "Payment was received but could not be verified. Please contact support."
              );
              setBusy(false);
              return;
            }
            setConfirmed(result.confirmationCode ?? "");
            setBusy(false);
          },
          modal: { ondismiss: () => setBusy(false) },
        }).open();
        return;
      }
      setConfirmed(result.confirmationCode);
      setBusy(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create booking."
      );
      setBusy(false);
    }
  };

  if (error && !quote && !quoteLoading) {
    return (
      <main className="min-h-screen bg-[#f8f7f3] text-[#141b2b]">
        <SiteHeader onLoginClick={() => setLogin(true)} />
        <div className="mx-auto max-w-xl px-5 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <BedDouble className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold text-[#000615]">
            This stay is no longer available
          </h1>
          <p className="mt-3 text-sm text-[#44474d]">{error}</p>
          <Link
            href="/search"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#000615] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0b1f3a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Browse Stays
          </Link>
        </div>
        <LoginModal isOpen={login} onClose={() => setLogin(false)} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f7f3] text-[#141b2b]">
      <SiteHeader onLoginClick={() => setLogin(true)} />

      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        {/* Header & Stepper */}
        <div className="mb-8 border-b border-[#c4c6ce]/30 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href={
                  input ? `/hotels/${input.propertySlug}` : "/search"
                }
                className="group mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[#44474d] transition hover:text-[#000615]"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                Back to property listing
              </Link>
              <h1 className="text-3xl font-black tracking-tight text-[#000615] sm:text-4xl">
                Review &amp; Confirm Booking
              </h1>
              <p className="mt-1.5 text-sm text-[#44474d]">
                Review your guest details and stay summary before confirming.
              </p>
            </div>

            {/* Step Progress Pills */}
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-[#000615]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#000615]" />
                1. Select Room
              </div>
              <span className="text-slate-300">→</span>
              <div
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  confirmed
                    ? "border-slate-200 bg-slate-100 text-[#000615]"
                    : "border-[#000615] bg-[#000615] text-white shadow-xs"
                }`}
              >
                {confirmed && <CheckCircle2 className="h-3.5 w-3.5 text-[#000615]" />}
                <span>2. Guest Details</span>
              </div>
              <span className="text-slate-300">→</span>
              <div
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  confirmed
                    ? "border-[#000615] bg-[#000615] text-white shadow-xs"
                    : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                <span>3. Confirmation</span>
              </div>
            </div>
          </div>
        </div>

        {confirmed ? (
          <div className="py-6">
            <BookingConfirmationCard
              confirmationCode={confirmed}
              propertyName={quote?.propertyName ?? "The Balmoral Hotel"}
              propertyAddress={
                [quote?.propertyCity, quote?.propertyState].filter(Boolean).join(", ") ||
                "1 Princes St, Edinburgh EH2 2EQ, UK"
              }
              guestEmail={email || appUser?.email || "alex@acme.corp"}
              checkInDate={quote?.checkIn ?? "2025-05-20"}
              checkInTime={quote?.checkInTime ? `From ${quote.checkInTime}` : "3:00 PM"}
              checkOutDate={quote?.checkOut ?? "2025-05-22"}
              checkOutTime={quote?.checkOutTime ? `Until ${quote.checkOutTime}` : "11:00 AM"}
              propertySlug={input?.propertySlug}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left Column: Form Details & Trust Badges */}
            <section className="space-y-6 lg:col-span-8">
              {/* Sign-In Banner */}
              {!loading && !appUser && (
                <div className="flex flex-col gap-4 rounded-2xl border border-[#c4c6ce]/40 bg-gradient-to-r from-[#f1f3ff] to-[#eef2ff] p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#000615] text-white shadow-xs">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#000615]">
                        Speed up your booking
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-[#44474d]">
                        Sign in to auto-fill saved guest information, earn loyalty credits, and view instant confirmation.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogin(true)}
                    className="shrink-0 rounded-xl bg-[#000615] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#0b1f3a] active:scale-[0.98]"
                  >
                    Sign in now
                  </button>
                </div>
              )}

              {/* Guest & Contact Details Form */}
              <div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-6 shadow-[0_4px_20px_rgba(11,31,58,0.04)] sm:p-7">
                {/* Primary Guests Section */}
                <div className="mb-6 flex items-center justify-between border-b border-[#c4c6ce]/30 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f3ff] text-[#000615]">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#000615]">
                        Primary Guest Details
                      </h2>
                      <p className="text-xs text-[#75777e]">
                        Names must match official ID presented at check-in.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* Guest Names Fields */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {names.map((name, index) => (
                      <div key={index} className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d]">
                          Adult guest {index + 1}{" "}
                          {index === 0 && <span className="text-rose-500">*</span>}
                        </label>
                        <div className="relative flex items-center">
                          <User className="absolute left-3.5 h-4 w-4 text-slate-400" />
                          <input
                            value={name}
                            onChange={(event) =>
                              setNames((current) =>
                                current.map((item, position) =>
                                  position === index ? event.target.value : item
                                )
                              )
                            }
                            placeholder={
                              index === 0 ? "Full Name (Primary)" : "Full Name"
                            }
                            className="w-full rounded-xl border border-[#c4c6ce] bg-white pl-10 pr-4 py-3 text-sm text-[#141b2b] outline-none transition placeholder:text-slate-400 focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Email & Phone Fields */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d]">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="absolute left-3.5 h-4 w-4 text-slate-400" />
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@example.com"
                          className="w-full rounded-xl border border-[#c4c6ce] bg-white pl-10 pr-4 py-3 text-sm text-[#141b2b] outline-none transition placeholder:text-slate-400 focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10"
                        />
                      </div>
                      <p className="text-[11px] text-[#75777e]">
                        Booking voucher &amp; receipt will be sent here.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d]">
                        Phone Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <Phone className="absolute left-3.5 h-4 w-4 text-slate-400" />
                        <span className="absolute left-9 text-xs font-semibold text-slate-500">
                          +91
                        </span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="9876543210"
                          className="w-full rounded-xl border border-[#c4c6ce] bg-white pl-16 pr-4 py-3 text-sm text-[#141b2b] outline-none transition placeholder:text-slate-400 focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10"
                        />
                      </div>
                      <p className="text-[11px] text-[#75777e]">
                        For check-in updates and property notifications.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Business & Corporate Billing Section */}
                <div className="my-7 border-t border-[#c4c6ce]/30 pt-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f1f3ff] text-[#000615]">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#000615]">
                        Corporate &amp; GST Billing Details{" "}
                        <span className="font-normal text-slate-400">(Optional)</span>
                      </h3>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d]">
                        Company Name
                      </label>
                      <div className="relative flex items-center">
                        <Building2 className="absolute left-3.5 h-4 w-4 text-slate-400" />
                        <input
                          value={companyName}
                          onChange={(event) => setCompanyName(event.target.value)}
                          placeholder="Acme Technologies Pvt Ltd"
                          className="w-full rounded-xl border border-[#c4c6ce] bg-white pl-10 pr-4 py-3 text-sm text-[#141b2b] outline-none transition placeholder:text-slate-400 focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d]">
                        GST / Tax ID Number
                      </label>
                      <div className="relative flex items-center">
                        <FileText className="absolute left-3.5 h-4 w-4 text-slate-400" />
                        <input
                          value={taxId}
                          onChange={(event) => setTaxId(event.target.value)}
                          placeholder="22AAAAA0000A1Z5"
                          className="w-full rounded-xl border border-[#c4c6ce] bg-white pl-10 pr-4 py-3 text-sm text-[#141b2b] outline-none transition placeholder:text-slate-400 focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Special Requests */}
                <div className="border-t border-[#c4c6ce]/30 pt-6">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d]">
                    Special Requests &amp; Stay Preferences{" "}
                    <span className="font-normal text-slate-400">(Optional)</span>
                  </label>
                  <textarea
                    value={request}
                    onChange={(event) => setRequest(event.target.value)}
                    rows={3}
                    placeholder="Quiet room, high floor, late check-in requirement, early breakfast request..."
                    className="mt-2 w-full resize-none rounded-xl border border-[#c4c6ce] bg-white p-3.5 text-sm text-[#141b2b] outline-none transition placeholder:text-slate-400 focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10"
                  />
                  <p className="mt-1.5 text-[11px] text-[#75777e]">
                    Requests are forwarded directly to the property upon confirmation.
                  </p>
                </div>

                {/* Validation / Error Message */}
                {(error || formError) && (
                  <div
                    role="alert"
                    className="mt-6 flex items-center gap-2 rounded-xl bg-rose-50 p-4 text-xs font-bold text-rose-700"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" />
                    {error || formError}
                  </div>
                )}
              </div>

              {/* Trust & Guarantee Badges */}
              <div className="grid gap-4 sm:grid-cols-2">
                <TrustBadge
                  icon={<ShieldCheck className="h-6 w-6 text-[#000615]" />}
                  title="100% Verified & Secure"
                  text="Your details are processed with 256-bit encryption and protected by Helpkey security standards."
                />
                <TrustBadge
                  icon={<IndianRupee className="h-6 w-6 text-[#000615]" />}
                  title="Transparent Pricing"
                  text="Zero hidden surcharges. All applicable taxes, room tariffs, and service fees are included."
                />
              </div>
            </section>

            {/* Right Column: Booking Summary Card */}
            <BookingSummary
              quote={quote}
              busy={busy}
              appUserReady={Boolean(appUser)}
              formError={formError}
              onSubmit={() => void submit()}
            />
          </div>
        )}
      </div>

      <LoginModal isOpen={login} onClose={() => setLogin(false)} />
    </main>
  );
}

function TrustBadge({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-[#c4c6ce]/30 bg-white p-4.5 shadow-xs transition hover:border-[#c4c6ce]/60">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f3ff]">
        {icon}
      </div>
      <div>
        <h4 className="text-xs font-bold text-[#000615]">{title}</h4>
        <p className="mt-1 text-[11px] leading-relaxed text-[#44474d]">{text}</p>
      </div>
    </div>
  );
}

function BookingSummary({
  quote,
  busy,
  appUserReady,
  formError,
  onSubmit,
}: {
  quote: Quote | null;
  busy: boolean;
  appUserReady: boolean;
  formError: string;
  onSubmit: () => void;
}) {
  const location = [quote?.propertyCity, quote?.propertyState]
    .filter(Boolean)
    .join(", ");
  const taxesAndFees = (quote?.taxPaise ?? 0) + (quote?.customerFeePaise ?? 0);
  const cta = !appUserReady
    ? "Sign in to complete booking"
    : quote?.ratePlan.paymentMode === "pay_at_property"
    ? "Confirm & Pay at Property"
    : `Pay ${money(
        quote?.payableNowPaise ?? quote?.totalPaise ?? 0,
        quote?.currency
      )} & Confirm`;

  return (
    <aside className="lg:col-span-4">
      <div className="sticky top-24 overflow-hidden rounded-2xl border border-[#c4c6ce]/40 bg-white shadow-[0_12px_32px_rgba(11,31,58,0.08)]">
        {/* Cover Image Header */}
        <div className="relative h-48 bg-slate-900">
          {quote?.propertyCoverImageUrl ? (
            <PublicMediaImage
              src={quote.propertyCoverImageUrl}
              alt={quote.propertyName}
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-[#0b1f3a] to-[#000615] text-slate-300">
              <BedDouble className="h-10 w-10 opacity-70" />
              <span className="mt-2 text-xs font-medium text-slate-400">
                Helpkey Verified Stay
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#000615]/80 via-[#000615]/20 to-transparent" />
          <button
            type="button"
            aria-label="Save stay"
            className="absolute right-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#000615] shadow-xs backdrop-blur-xs transition hover:scale-105 hover:bg-white"
          >
            <Heart className="h-4.5 w-4.5" />
          </button>
          {quote && (
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
              <span className="rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold backdrop-blur-md">
                Verified Listing
              </span>
              {quote.propertyRatingAverage > 0 && (
                <span className="flex items-center gap-1 rounded-lg bg-amber-400/90 px-2 py-0.5 text-xs font-extrabold text-slate-900 backdrop-blur-md">
                  ★ {quote.propertyRatingAverage.toFixed(1)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Hotel Title & Location */}
        <div className="border-b border-[#c4c6ce]/30 p-5">
          <h2 className="text-xl font-extrabold text-[#000615]">
            {quote?.propertyName ?? "Loading stay details..."}
          </h2>
          {location && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[#44474d]">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {location}
            </p>
          )}
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-[#000615]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#000615]" />
            Free cancellation included
          </p>
        </div>

        {/* Stay Dates & Duration Grid */}
        <div className="border-b border-[#c4c6ce]/30 bg-[#f1f3ff]/50 p-5">
          <div className="relative grid grid-cols-2 gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
            <SummaryDateBlock
              label="Check-in"
              value={quote ? shortDate(quote.checkIn) : "-"}
              time={quote ? displayTime(quote.checkInTime, "From") : ""}
            />
            <SummaryDateBlock
              label="Check-out"
              value={quote ? shortDate(quote.checkOut) : "-"}
              time={quote ? displayTime(quote.checkOutTime, "Until") : ""}
            />
            {quote && quote.nights > 0 && (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#000615] shadow-xs">
                {quote.nights} {quote.nights === 1 ? "Night" : "Nights"}
              </span>
            )}
          </div>

          {/* Room & Occupancy Info */}
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-white p-3.5 border border-slate-200/60">
            <BedDouble className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#000615]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#000615]">
                {quote?.roomType.name ?? "Room selection"}
              </p>
              <p className="mt-0.5 text-[11px] text-[#44474d]">
                {quote
                  ? `${quote.adults + quote.children} guest${
                      quote.adults + quote.children === 1 ? "" : "s"
                    } · ${quote.ratePlan.name}`
                  : "Standard rate plan"}
              </p>
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#44474d]">
            Price Summary
          </h3>
          {quote ? (
            <div className="mt-3 space-y-2.5 text-xs text-[#44474d]">
              <div className="flex justify-between">
                <span>
                  {money(
                    quote.subtotalPaise / Math.max(quote.nights, 1),
                    quote.currency
                  )}{" "}
                  × {quote.nights} {quote.nights === 1 ? "night" : "nights"}
                </span>
                <span className="font-semibold text-[#000615]">
                  {money(quote.subtotalPaise, quote.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Taxes &amp; Guest Fees</span>
                <span className="font-semibold text-[#000615]">
                  {money(taxesAndFees, quote.currency)}
                </span>
              </div>

              <div className="border-t border-[#c4c6ce]/40 pt-3">
                <div className="flex items-end justify-between text-[#000615]">
                  <div>
                    <span className="block text-sm font-extrabold">
                      Total Payable
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Includes all applicable taxes
                    </span>
                  </div>
                  <span className="text-2xl font-black">
                    {money(quote.totalPaise, quote.currency)}
                  </span>
                </div>

                {quote.payableNowPaise !== quote.totalPaise && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 border border-amber-200/60">
                    <span>Due Now</span>
                    <span>
                      {money(quote.payableNowPaise, quote.currency)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 h-20 animate-pulse rounded-xl bg-slate-100" />
          )}

          {/* Action CTA */}
          <button
            type="button"
            disabled={busy || !quote || Boolean(formError && appUserReady)}
            onClick={onSubmit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#000615] px-5 py-4 text-sm font-bold text-white shadow-md transition duration-150 hover:bg-[#0b1f3a] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Processing booking...
              </span>
            ) : (
              <>
                <span>{cta}</span>
                <ArrowRight className="h-4.5 w-4.5" />
              </>
            )}
          </button>

          <p className="mt-3 text-center text-[11px] font-medium text-[#75777e]">
            {quote?.ratePlan.paymentMode === "pay_at_property"
              ? "💳 Pay directly at property during check-in."
              : "🔒 256-Bit SSL Encrypted & Protected Checkout"}
          </p>
        </div>
      </div>
    </aside>
  );
}

function SummaryDateBlock({
  label,
  value,
  time,
}: {
  label: string;
  value: string;
  time: string;
}) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="mt-1 block text-xs font-extrabold text-[#000615]">
        {value}
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-slate-500">
        <Clock className="h-3 w-3" />
        {time}
      </span>
    </div>
  );
}
