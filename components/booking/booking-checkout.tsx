"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GuestRules } from "@/components/hotel/guest-rules";
import { formatMoney } from "@/lib/customer/offer";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { CheckoutDisplay, CheckoutInput } from "@/lib/booking/checkout";
import { normalizeAadhaar } from "@/lib/aadhaar";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  IndianRupee,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/shared/site-header";
import { LoginModal } from "@/components/auth/login-modal";
import { useAuth } from "@/components/auth/auth-provider";
import { PublicMediaImage } from "@/components/shared/public-media-image";

type Quote = {
  bookingMode: "overnight" | "hourly";
  pricingModel: "nightly" | "duration" | "package" | "per_hour";
  durationMinutes: number;
  billedHours: number;
  startAt: string;
  arrivalTime: string;
  departureTime: string;
  balanceDuePaise: number;
  timezone: string;
  currency: string;
  roomType: { name: string };
  ratePlan: { name: string; paymentMode: "full" | "deposit" | "pay_at_property" };
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  subtotalPaise: number;
  taxPaise: number;
  customerFeePaise: number;
  totalPaise: number;
  payableNowPaise: number;
  cancellationPolicy: {
    name: string;
    description: string;
    refundableUntilHours: number;
    cancellationFeePercent: number;
  } | null;
  quotedAt: string;
  expiresAt: string;
  fingerprint: string;
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

const money = formatMoney;

const shortDate = (value: string) => {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const displayTime = (value: string, prefix: string) => `${prefix} ${value}`;

const formatAadhaar = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 12)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

/** Checkout requires only a 12-digit numeric ID; it does not validate Aadhaar checksums. */
const checkAadhaarValidity = (val: string) => {
  const digits = normalizeAadhaar(val);
  return /^\d{12}$/.test(digits);
};

const cancellationDeadline = (quote: Quote) => {
  if (!quote.cancellationPolicy || quote.cancellationPolicy.refundableUntilHours <= 0)
    return null;
  const deadline = new Date(
    Date.parse(quote.startAt) -
      quote.cancellationPolicy.refundableUntilHours * 60 * 60 * 1000,
  );
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: quote.timezone,
  }).format(deadline);
};

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

const PRESET_REQUESTS = [
  "Quiet room away from elevator",
  "High floor with city view",
  "Early check-in request",
  "Large double / king bed",
  "Extra towels & pillows",
];

export function BookingCheckout({
  initialInput,
  initialDisplay,
}: {
  initialInput: CheckoutInput | null;
  initialDisplay: CheckoutDisplay | null;
}) {
  const router = useRouter();
  const { appUser, loading } = useAuth();
  const input = initialInput;
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [holdSeconds, setHoldSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!holdExpiresAt) return;
    const update = () =>
      setHoldSeconds(
        Math.max(0, Math.ceil((Date.parse(holdExpiresAt) - Date.now()) / 1000)),
      );
    queueMicrotask(update);
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [holdExpiresAt]);

  const [quoteChanged, setQuoteChanged] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const defaultAdults = Math.max(1, initialInput?.adults ?? (typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("adults") || 2) : 2));
  const [names, setNames] = useState<string[]>(() =>
    Array.from({ length: defaultAdults }, (_, index) =>
      index === 0 ? appUser?.fullName ?? "" : "",
    ),
  );
  const [aadhaarNumbers, setAadhaarNumbers] = useState<string[]>(() =>
    Array.from({ length: defaultAdults }, () => ""),
  );
  const [visibleAadhaar, setVisibleAadhaar] = useState<Record<number, boolean>>({});
  const [bookingForSomeoneElse, setBookingForSomeoneElse] = useState(false);
  const [bookingContactName, setBookingContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showGstForm, setShowGstForm] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [billingAddress, setBillingAddress] = useState({
    line1: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [request, setRequest] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const bookingIdempotencyKey = useRef("");
  const lastQuoteFingerprint = useRef<string | null>(null);

  const quoteQuery = useQuery({
    queryKey: queryKeys.checkoutQuote(input ?? {}),
    queryFn: ({ signal }) =>
      apiFetch<{ quote: Quote }>("/api/bookings/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal,
      }),
    enabled: Boolean(input),
    staleTime: (query) =>
      Math.max(
        0,
        Date.parse(query.state.data?.quote.expiresAt ?? "") -
          query.state.dataUpdatedAt,
      ),
    refetchInterval: (query) =>
      Math.max(
        1_000,
        Date.parse(query.state.data?.quote.expiresAt ?? "") - Date.now(),
      ),
    retry: false,
  });

  const quote = quoteQuery.data?.quote ?? null;
  const quoteLoading = quoteQuery.isLoading || quoteQuery.isFetching;

  useEffect(() => {
    if (!quote) return;
    if (
      lastQuoteFingerprint.current &&
      lastQuoteFingerprint.current !== quote.fingerprint
    ) {
      setTermsAccepted(false);
      setRulesAccepted(false);
      setQuoteChanged(true);
      bookingIdempotencyKey.current = "";
    }
    lastQuoteFingerprint.current = quote.fingerprint;
  }, [quote]);

  useEffect(() => {
    const count = Math.max(1, input?.adults ?? (typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("adults") || 2) : 2));
    setNames((current) =>
      current.length === count
        ? current
        : Array.from({ length: count }, (_, index) => current[index] ?? (index === 0 ? appUser?.fullName ?? "" : "")),
    );
    setAadhaarNumbers((current) =>
      current.length === count
        ? current
        : Array.from({ length: count }, (_, index) => current[index] ?? ""),
    );
    setEmail((current) => current || appUser?.email || "");
    setPhone((current) => current || appUser?.phoneNumber?.replace(/^\+91/, "") || "");
    setBookingContactName((current) => current || appUser?.fullName || "");
  }, [input?.adults, appUser?.email, appUser?.fullName, appUser?.phoneNumber]);

  // Validation details
  const nameErrors = useMemo(() => {
    return names.map((name) => name.trim().length < 2);
  }, [names]);

  const aadhaarErrors = useMemo(() => {
    return aadhaarNumbers.map((num) => !checkAadhaarValidity(num));
  }, [aadhaarNumbers]);

  const emailError = useMemo(() => {
    return !/^\S+@\S+\.\S+$/.test(email);
  }, [email]);

  const phoneError = useMemo(() => {
    return !/^(?:\+91)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ""));
  }, [phone]);

  const bookingContactError = useMemo(() => {
    return bookingForSomeoneElse && bookingContactName.trim().length < 2;
  }, [bookingForSomeoneElse, bookingContactName]);

  const gstError = useMemo(() => {
    if (!showGstForm && !taxId) return false;
    return Boolean(
      taxId &&
        (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
          taxId.toUpperCase(),
        ) ||
          !companyName.trim() ||
          !Object.values(billingAddress).every(Boolean)),
    );
  }, [billingAddress, companyName, showGstForm, taxId]);

  const formError = useMemo(() => {
    if (!appUser) return "";
    if (names.length !== input?.adults || nameErrors.some(Boolean)) {
      return "Please enter full legal names for all adult guests.";
    }
    if (aadhaarNumbers.length !== input?.adults || aadhaarErrors.some(Boolean)) {
      return "Enter a valid 12-digit Aadhaar number for every adult guest.";
    }
    if (emailError) return "Please enter a valid email address.";
    if (phoneError) return "Please enter a valid 10-digit Indian mobile number.";
    if (bookingContactError) return "Enter the primary booking contact's full name.";
    if (gstError) return "Complete a valid GST business name, GSTIN, and billing address.";
    if (!termsAccepted || !rulesAccepted) {
      return "Accept the booking terms, cancellation policy, and house rules to confirm.";
    }
    return "";
  }, [
    aadhaarErrors,
    aadhaarNumbers.length,
    appUser,
    bookingContactError,
    emailError,
    gstError,
    input?.adults,
    nameErrors,
    names.length,
    phoneError,
    rulesAccepted,
    termsAccepted,
  ]);

  const hotelHref = input
    ? `/hotels/${input.propertySlug}?${new URLSearchParams({
        property: input.propertySlug,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId,
        ...(quote ? { searchTotalPaise: String(quote.totalPaise) } : {}),
        bookingMode: input.bookingMode,
        ...(input.bookingMode === "hourly"
          ? {
              arrivalTime: input.arrivalTime ?? "",
              durationMinutes: String(input.durationMinutes ?? ""),
            }
          : { checkOut: input.checkOut ?? "" }),
        checkIn: input.checkIn,
        adults: String(input.adults),
        children: String(input.children),
        infants: String(input.infants),
      })}`
    : "/search";

  const submit = async () => {
    if (!appUser) {
      setLogin(true);
      return;
    }
    setHasAttemptedSubmit(true);

    if (!input || !quote || formError) {
      setError(formError || "This stay is not ready to book.");
      // Scroll smoothly to first invalid field
      const firstInvalid = document.querySelector(".hk-input-error");
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setBusy(true);
    setError("");
    setQuoteChanged(false);

    try {
      if (!bookingIdempotencyKey.current) {
        bookingIdempotencyKey.current = crypto.randomUUID();
      }
      const cleanPhone = phone.replace(/\D/g, "").replace(/^91/, "");
      const body = {
        ...input,
        expectedTotalPaise: quote.totalPaise,
        quoteFingerprint: quote.fingerprint,
        paymentMethod:
          quote.ratePlan.paymentMode === "pay_at_property"
            ? "pay_at_property"
            : "online",
        leadEmail: email,
        leadPhone: `+91${cleanPhone}`,
        adultGuestNames: names.map((name) => name.trim()),
        adultAadhaarLastFour: aadhaarNumbers.map((number) =>
          normalizeAadhaar(number).slice(-4),
        ),
        bookingContact: bookingForSomeoneElse
          ? {
              name: bookingContactName.trim(),
              email,
              phone: `+91${cleanPhone}`,
            }
          : undefined,
        specialRequest: [request.trim()].filter(Boolean).join("\n"),
        billing:
          showGstForm && taxId
            ? {
                legalName: companyName.trim(),
                gstin: taxId.trim().toUpperCase(),
                address: billingAddress,
              }
            : null,
        termsAccepted,
      };

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": bookingIdempotencyKey.current,
        },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as {
        error?: string;
        code?: string;
        bookingId?: string;
        confirmationCode?: string;
        expiresAt?: string;
        requiresPayment?: boolean;
        razorpay?: {
          keyId: string;
          amount: number;
          currency: string;
          name: string;
          orderId: string;
        };
      };

      if (result.code === "QUOTE_CHANGED") {
        bookingIdempotencyKey.current = "";
        setTermsAccepted(false);
        setRulesAccepted(false);
        setQuoteChanged(true);
        void quoteQuery.refetch();
        setBusy(false);
        return;
      }
      if (!response.ok || !result.bookingId || !result.confirmationCode) {
        throw new Error(result.error ?? "Unable to create booking.");
      }
      const bookingId = result.bookingId;
      if (result.requiresPayment) {
        setHoldExpiresAt(result.expiresAt ?? null);
        await loadRazorpay();
        if (!window.Razorpay || !result.razorpay) {
          throw new Error("Secure payment is unavailable.");
        }
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
              },
            );
            if (!verified.ok) {
              setError(
                "Payment was received but could not be verified. Please contact Helpkey support.",
              );
              setBusy(false);
              return;
            }
            setHoldExpiresAt(null);
            setBusy(false);
            router.replace(`/trips/${encodeURIComponent(bookingId)}`);
          },
          modal: { ondismiss: () => setBusy(false) },
        }).open();
        return;
      }
      setHoldExpiresAt(null);
      setBusy(false);
      router.replace(`/trips/${encodeURIComponent(bookingId)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create booking.",
      );
      setBusy(false);
    }
  };

  const togglePresetRequest = (item: string) => {
    if (request.includes(item)) {
      setRequest((curr) =>
        curr
          .replace(item, "")
          .replace(/,\s*,/g, ",")
          .replace(/^,\s*|\s*,\s*$/g, "")
          .trim(),
      );
    } else {
      setRequest((curr) => (curr ? `${curr}, ${item}` : item));
    }
  };

  if (error && !quote && !quoteLoading) {
    return (
      <main className="min-h-screen bg-[#f8f7f3] text-[#141b2b]">
        <SiteHeader onLoginClick={() => setLogin(true)} />
        <div className="mx-auto max-w-xl px-5 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-[#000615] shadow-xs">
            <BedDouble className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#000615]">
            This stay is no longer available
          </h1>
          <p className="mt-3 text-sm text-[#44474d]">{error}</p>
          <Link
            href="/search"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#000615] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#0b1f3a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Browse Other Stays
          </Link>
        </div>
        <LoginModal isOpen={login} onClose={() => setLogin(false)} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f7f3] pb-24 text-[#141b2b] lg:pb-12">
      <SiteHeader onLoginClick={() => setLogin(true)} />

      {quoteChanged && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-3">
          <div className="mx-auto max-w-[1280px] flex items-center gap-2 text-xs font-semibold text-amber-900">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              The price or stay rules were updated. Please review the refreshed stay details and accept terms before confirming.
            </span>
          </div>
        </div>
      )}

      {holdSeconds !== null && (
        <div className="bg-emerald-50 border-b border-emerald-200/80 px-4 py-2.5">
          <div className="mx-auto max-w-[1280px] flex items-center justify-between text-xs font-bold text-emerald-900">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-emerald-600" />
              {holdSeconds > 0
                ? `Room reserved temporarily for ${Math.floor(holdSeconds / 60)}:${String(holdSeconds % 60).padStart(2, "0")}`
                : "Your payment hold has expired. Check Trips for status."}
            </span>
            <span className="text-[11px] font-medium text-emerald-700">Guaranteed availability</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        {/* Header & Stepper */}
        <div className="mb-8 border-b border-[#c4c6ce]/30 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href={
                  hotelHref
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
                  "border-[#000615] bg-[#000615] text-white shadow-xs"
                }`}
              >
                <span>2. Guest Details</span>
              </div>
              <span className="text-slate-300">→</span>
              <div
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  "border-slate-200 bg-white text-slate-400"
                }`}
              >
                <span>3. Confirmation</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
            {/* Left Column: Form Details & Trust Badges */}
            <section className="space-y-6 lg:col-span-8">
              {/* Sign-In Prompt Banner */}
              {!loading && !appUser && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 rounded-2xl border border-amber-200/50 bg-gradient-to-r from-amber-50/40 via-white to-blue-50/30 p-6 sm:p-7 shadow-xs">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#000615] text-white shadow-xs">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#000615]">
                        Fast-track your booking
                      </h3>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-md">
                        Sign in to auto-fill saved guest names, earn Helpkey reward points, and manage bookings instantly.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogin(true)}
                    className="shrink-0 rounded-xl bg-[#000615] px-6 py-3 text-xs font-bold text-white transition hover:bg-[#0b1f3a] active:scale-[0.98] shadow-sm"
                  >
                    Sign In
                  </button>
                </div>
              )}

              {/* CARD 1: Guest Information */}
              <div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-6 sm:p-7 shadow-[0_4px_20px_rgba(11,31,58,0.04)] space-y-8">
                {/* Section Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#c4c6ce]/30 pb-6">
                  <div>
                    <h2 className="text-lg font-bold text-[#000615]">
                      {bookingForSomeoneElse ? "Staying Guest Details" : "Primary Guest Details"}
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">
                      Must match valid government photo ID presented at property check-in.
                    </p>
                  </div>
                </div>

                {/* Booking For Someone Else Toggle Row */}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f8ff] p-4">
                  <input
                    type="checkbox"
                    checked={bookingForSomeoneElse}
                    onChange={(event) => setBookingForSomeoneElse(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#000615]"
                  />
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#000615]">
                        I am booking for someone else
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Booking voucher and receipt will go to you; the staying guest will check in.
                      </p>
                    </div>
                  </div>
                </label>

                {/* Booking Contact Details (if booking for someone else) */}
                {bookingForSomeoneElse && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-6 space-y-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#000615] flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-600" />
                        Booking Contact Details (You)
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        We will send the voucher and payment invoice to this contact.
                      </p>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-3 pt-1">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Your Full Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          value={bookingContactName}
                          onChange={(e) => setBookingContactName(e.target.value)}
                          placeholder="Your Name"
                          className={`w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/5 ${
                            hasAttemptedSubmit && bookingContactError
                              ? "border-rose-400 bg-rose-50/20 hk-input-error"
                              : "border-slate-200"
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Email Address <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/5"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Mobile Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="9876543210"
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/5"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Individual Guests */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {names.map((name, index) => {
                    const isNameInvalid = hasAttemptedSubmit && nameErrors[index];
                    const aadhaarValue = aadhaarNumbers[index] ?? "";
                    const isAadhaarInvalid =
                      hasAttemptedSubmit && aadhaarErrors[index];
                    const isAadhaarComplete = normalizeAadhaar(aadhaarValue).length === 12;

                    return (
                      <div
                        key={index}
                        className="space-y-4"
                      >
                        <div className="space-y-4">
                          {/* Full Name */}
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d] mb-1.5">
                              Adult guest {index + 1} <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative flex items-center">
                              <User className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                              <input
                                value={name}
                                onChange={(event) =>
                                  setNames((curr) =>
                                    curr.map((item, pos) =>
                                      pos === index ? event.target.value : item,
                                    ),
                                  )
                                }
                                placeholder={
                                  index === 0
                                    ? "Full name as on ID"
                                    : `Guest ${index + 1} full name`
                                }
                                className={`w-full rounded-xl border bg-white pl-11 pr-4 py-3 text-sm text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10 placeholder:text-slate-400 ${
                                  isNameInvalid
                                    ? "border-rose-400 bg-rose-50/20 hk-input-error"
                                    : "border-[#c4c6ce]/40 hover:border-slate-300"
                                }`}
                              />
                            </div>
                            {isNameInvalid && (
                              <p className="mt-1.5 text-xs font-medium text-rose-600">
                                Please enter full name (at least 2 letters)
                              </p>
                            )}
                          </div>

                          {/* Aadhaar / Government ID */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label
                                htmlFor={`aadhaar-${index}`}
                                className="block text-xs font-bold text-slate-700"
                              >
                                Aadhaar Number <span className="text-rose-500">*</span>
                              </label>
                              {isAadhaarComplete && (
                                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                                  <Check className="h-3.5 w-3.5" /> 12 digits
                                </span>
                              )}
                            </div>
                            <div className="relative flex items-center">
                              <ShieldCheck className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                              <input
                                id={`aadhaar-${index}`}
                                type={visibleAadhaar[index] ? "text" : "password"}
                                inputMode="numeric"
                                autoComplete="off"
                                value={aadhaarValue}
                                onChange={(event) =>
                                  setAadhaarNumbers((curr) =>
                                    curr.map((item, pos) =>
                                      pos === index
                                        ? formatAadhaar(event.target.value)
                                        : item,
                                    ),
                                  )
                                }
                                placeholder="XXXX XXXX XXXX"
                                className={`w-full rounded-xl border bg-white pl-11 pr-16 py-3 text-sm tracking-wider font-mono text-[#141b2b] outline-none transition placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10 ${
                                  isAadhaarInvalid
                                    ? "border-rose-400 bg-rose-50/20 hk-input-error"
                                    : "border-[#c4c6ce]/40 hover:border-slate-300"
                                }`}
                              />
                              <button
                                type="button"
                                aria-label={`${visibleAadhaar[index] ? "Hide" : "Show"} Aadhaar`}
                                onClick={() =>
                                  setVisibleAadhaar((curr) => ({
                                    ...curr,
                                    [index]: !curr[index],
                                  }))
                                }
                                className="absolute right-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#000615] hover:bg-slate-100 transition"
                              >
                                {visibleAadhaar[index] ? "Hide" : "Show"}
                              </button>
                            </div>
                            {isAadhaarInvalid && (
                              <p className="mt-1.5 text-xs font-medium text-rose-600">
                                Enter a valid 12-digit Aadhaar number
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2.5 text-xs text-slate-400 pt-3 border-t border-[#c4c6ce]/30">
                  <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>
                    Your Aadhaar is processed securely with 256-bit encryption. Only the last 4 digits are retained on the booking voucher for validation at check-in.
                  </span>
                </div>
              </div>

              {/* CARD 2: Contact Information (when not booking for someone else) */}
              {!bookingForSomeoneElse && (
                <div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-6 sm:p-7 shadow-[0_4px_20px_rgba(11,31,58,0.04)] space-y-7">
                  <div className="border-b border-[#c4c6ce]/30 pb-5">
                    <h2 className="text-lg font-bold text-[#000615] flex items-center gap-2.5">
                      <Mail className="h-5 w-5 text-[#000615]" />
                      Contact Information
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">
                      We&apos;ll send your booking confirmation voucher and arrival details here.
                    </p>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className={`w-full rounded-xl border bg-white pl-11 pr-4 py-3 text-sm text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10 placeholder:text-slate-400 ${
                            hasAttemptedSubmit && emailError
                              ? "border-rose-400 bg-rose-50/20 hk-input-error"
                              : "border-[#c4c6ce]/40 hover:border-slate-300"
                          }`}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        Booking voucher and receipt will be delivered to this address.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">
                        Mobile Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center rounded-xl border border-[#c4c6ce]/40 bg-white overflow-hidden transition hover:border-slate-300 focus-within:border-[#000615] focus-within:ring-4 focus-within:ring-blue-500/10">
                        <span className="flex items-center gap-1.5 bg-slate-50 border-r border-slate-200 px-3.5 py-3.5 text-xs font-bold text-slate-600 select-none">
                          <span>🇮🇳</span> +91
                        </span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="9876543210"
                          className={`w-full bg-white px-4 py-3 text-sm text-[#141b2b] outline-none placeholder:text-slate-400 ${
                            hasAttemptedSubmit && phoneError ? "hk-input-error" : ""
                          }`}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        For check-in alerts and hotel property directions.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 3: Preferences & Business Billing */}
              <div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-6 sm:p-7 shadow-[0_4px_20px_rgba(11,31,58,0.04)] space-y-7">
                {/* Special Requests */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#000615]">
                      Special Requests &amp; Stay Preferences{" "}
                      <span className="text-xs font-normal text-slate-400">(Optional)</span>
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">
                      Select quick requests or write specific notes for the hotel reception.
                    </p>
                  </div>

                  {/* Preset Pills */}
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {PRESET_REQUESTS.map((item) => {
                      const isAdded = request.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => togglePresetRequest(item)}
                          className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                            isAdded
                              ? "bg-[#000615] text-white shadow-xs"
                              : "bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 border border-slate-200/70"
                          }`}
                        >
                          {isAdded ? "✓ " : "+ "}
                          {item}
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    rows={3}
                    placeholder="Any specific room preference or arrival note..."
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10 placeholder:text-slate-400 leading-relaxed"
                  />
                  <p className="text-xs text-slate-400">
                    Requests are forwarded to the property after confirmation and are subject to availability.
                  </p>
                </div>

                {/* Collapsible Corporate & GST Billing Details */}
                <div className="pt-6 border-t border-[#c4c6ce]/30">
                  <button
                    type="button"
                    onClick={() => setShowGstForm(!showGstForm)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#c4c6ce]/40 bg-slate-50/50 p-5 text-left transition hover:bg-slate-100/70"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white border border-slate-200 text-[#000615] shadow-xs">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#000615]">
                          Corporate &amp; GST Billing Details{" "}
                          <span className="font-normal text-slate-400">(Optional)</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Add GSTIN if you need an official business tax invoice for your company.
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${
                        showGstForm ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {showGstForm && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 space-y-5 animate-in fade-in duration-150">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Registered Company Name
                          </label>
                          <input
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="e.g. Acme Technologies Pvt Ltd"
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#000615]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            GST / Tax ID Number
                          </label>
                          <input
                            value={taxId}
                            onChange={(e) => setTaxId(e.target.value.toUpperCase())}
                            placeholder="22AAAAA0000A1Z5"
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none uppercase font-mono focus:border-[#000615]"
                          />
                        </div>
                      </div>

                      <div className="grid gap-5 sm:grid-cols-2 pt-3 border-t border-[#c4c6ce]/30">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Billing Address Line
                          </label>
                          <input
                            value={billingAddress.line1}
                            onChange={(e) =>
                              setBillingAddress((c) => ({ ...c, line1: e.target.value }))
                            }
                            placeholder="Street / Office Address"
                            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#000615]"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">
                              City
                            </label>
                            <input
                              value={billingAddress.city}
                              onChange={(e) =>
                                setBillingAddress((c) => ({ ...c, city: e.target.value }))
                              }
                              placeholder="City"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000615]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">
                              State
                            </label>
                            <input
                              value={billingAddress.state}
                              onChange={(e) =>
                                setBillingAddress((c) => ({ ...c, state: e.target.value }))
                              }
                              placeholder="State"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000615]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">
                              PIN
                            </label>
                            <input
                              value={billingAddress.postalCode}
                              onChange={(e) =>
                                setBillingAddress((c) => ({
                                  ...c,
                                  postalCode: e.target.value,
                                }))
                              }
                              placeholder="PIN"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000615]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 4: Policies & Confirmation Agreement */}
              <div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-6 sm:p-7 shadow-[0_4px_20px_rgba(11,31,58,0.04)] space-y-6">
                <h2 className="text-lg font-bold text-[#000615]">
                  Booking Terms &amp; Policies
                </h2>

                <div className="space-y-4 pt-1">
                  <label
                    className={`flex items-start gap-4 rounded-2xl p-4 cursor-pointer transition-all duration-200 ${
                      hasAttemptedSubmit && !termsAccepted
                        ? "border border-rose-300 bg-rose-50/20"
                        : "hover:bg-slate-50/80"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 h-5 w-5 accent-[#000615] rounded border-slate-300 cursor-pointer"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      I agree to the Helpkey{" "}
                      <Link
                        href="/help"
                        target="_blank"
                        className="font-bold text-[#000615] underline hover:text-slate-900"
                      >
                        Terms of Service and Privacy Policy
                      </Link>{" "}
                      and acknowledge the property cancellation policy.
                    </span>
                  </label>

                  <label
                    className={`flex items-start gap-4 rounded-2xl p-4 cursor-pointer transition-all duration-200 ${
                      hasAttemptedSubmit && !rulesAccepted
                        ? "border border-rose-300 bg-rose-50/20"
                        : "hover:bg-slate-50/80"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={rulesAccepted}
                      onChange={(e) => setRulesAccepted(e.target.checked)}
                      className="mt-0.5 h-5 w-5 accent-[#000615] rounded border-slate-300 cursor-pointer"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      I confirm that all staying guests meet the property&apos;s check-in age, ID verification, and house-rule requirements.
                    </span>
                  </label>
                </div>

                {/* Validation Banner if attempted submit */}
                {hasAttemptedSubmit && formError && (
                  <div
                    role="alert"
                    className="flex items-center gap-2.5 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs sm:text-sm font-bold text-rose-800"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" />
                    <span>{formError}</span>
                  </div>
                )}
              </div>

              {/* Trust Badges */}
              <div className="grid gap-4 sm:grid-cols-2">
                <TrustBadge
                  icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
                  title="100% Verified &amp; Encrypted"
                  text="Your reservation and guest data are transmitted with 256-bit bank-grade SSL encryption."
                />
                <TrustBadge
                  icon={<IndianRupee className="h-5 w-5 text-[#000615]" />}
                  title="Transparent Pricing"
                  text="Zero hidden surcharges. All applicable goods and services taxes (GST) and room charges are clear."
                />
              </div>

              {/* What Happens Next Card */}
              <div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-5 sm:p-6 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#000615] flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-4.5 w-4.5 text-[#000615]" />
                  What happens after booking?
                </h3>
                <div className="grid gap-5 text-xs text-slate-600 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50/80 p-4 border border-[#c4c6ce]/30">
                    <strong className="block text-sm font-bold text-[#000615] mb-1">
                      1. Instant Confirmation
                    </strong>
                    <span className="leading-relaxed">Payment is processed and your reservation is secured with the hotel.</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 p-4 border border-[#c4c6ce]/30">
                    <strong className="block text-sm font-bold text-[#000615] mb-1">
                      2. Booking saved
                    </strong>
                    <span className="leading-relaxed">Your booking details and receipt are always available in My Trips.</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 p-4 border border-[#c4c6ce]/30">
                    <strong className="block text-sm font-bold text-[#000615] mb-1">
                      3. Smooth Check-in
                    </strong>
                    <span className="leading-relaxed">Show confirmation code and valid government ID at the reception.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Right Column: Sticky Booking Summary Card */}
            <BookingSummary
              display={initialDisplay}
              quote={quote}
              busy={busy}
              appUserReady={Boolean(appUser)}
              formError={formError}
              onSubmit={() => void submit()}
              quoteError={
                quoteQuery.error instanceof Error ? quoteQuery.error.message : ""
              }
              onRetry={() => void quoteQuery.refetch()}
            />
        </div>
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
    <div className="flex items-start gap-3.5 rounded-2xl border border-[#c4c6ce]/40 bg-white p-4.5 shadow-xs transition hover:border-slate-300">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-200">
        {icon}
      </div>
      <div>
        <h4 className="text-xs font-bold text-[#000615]">{title}</h4>
        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function BookingSummary({
  display,
  quote,
  busy,
  appUserReady,
  onSubmit,
  quoteError,
  onRetry,
}: {
  display: CheckoutDisplay | null;
  quote: Quote | null;
  busy: boolean;
  appUserReady: boolean;
  formError: string;
  onSubmit: () => void;
  quoteError: string;
  onRetry: () => void;
}) {
  const location = [display?.propertyCity, display?.propertyState]
    .filter(Boolean)
    .join(", ");

  const cta = !appUserReady
    ? "Sign In to Confirm Booking"
    : quote?.ratePlan.paymentMode === "pay_at_property"
      ? "Confirm & Pay at Property"
      : `Pay ${money(
          quote?.payableNowPaise ?? quote?.totalPaise ?? 0,
          quote?.currency,
        )} & Confirm`;

  const totalGuests = display
    ? display.adults + display.children + display.infants
    : 1;

  const nightsCount = quote?.nights ?? display?.nights ?? 1;

  return (
    <>
      <aside className="lg:col-span-4 lg:sticky lg:top-24 self-start transition-all">
        <div className="overflow-hidden rounded-2xl border border-[#c4c6ce]/40 bg-white shadow-[0_12px_32px_rgba(11,31,58,0.08)]">
          {/* Hotel Cover Image */}
          <div className="relative h-48 bg-slate-900 overflow-hidden">
            {display?.propertyCoverImageUrl ? (
              <PublicMediaImage
                src={display.propertyCoverImageUrl}
                alt={display.propertyName}
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            {display && (
              <div className="absolute bottom-3.5 left-4 right-4 flex items-center justify-between text-white">
                <span className="rounded-lg bg-white/20 backdrop-blur-md px-3 py-1 text-[11px] font-bold border border-white/20">
                  Verified Listing
                </span>
                {display.propertyRatingAverage > 0 && (
                  <span className="flex items-center gap-1 rounded-lg bg-amber-400/90 px-2.5 py-1 text-xs font-extrabold text-slate-900 backdrop-blur-md">
                    ★ {display.propertyRatingAverage.toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Hotel Title & Location */}
          <div className="border-b border-[#c4c6ce]/30 p-5 space-y-2.5">
            {display ? (
              <h2 className="text-xl font-black tracking-tight text-[#000615]">
                {display.propertyName}
              </h2>
            ) : (
              <div className="space-y-2">
                <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            )}
            {location && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#000615]" />
                <span>{location}</span>
              </p>
            )}
            {display?.propertyAddress && (
              <p className="text-[11px] text-slate-400 leading-relaxed truncate">
                {display.propertyAddress}
              </p>
            )}

            {/* Cancellation Policy Chip */}
            {display?.propertyRules && (
              <div className="mt-4 rounded-xl border border-[#c4c6ce]/40 bg-[#f8f7f3] p-4">
                <h3 className="mb-2 text-sm font-bold text-[#000615]">Property rules</h3>
                <GuestRules property={display.propertyRules} />
              </div>
            )}
            {quote?.cancellationPolicy && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 mt-2">
                <p className="inline-flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  {quote.cancellationPolicy.cancellationFeePercent === 0
                    ? "Free cancellation"
                    : quote.cancellationPolicy.name}
                </p>
                <p className="mt-0.5 text-[11px] text-[#44474d] leading-relaxed">
                  {cancellationDeadline(quote)
                    ? `Cancel by ${cancellationDeadline(quote)} (${quote.timezone}) for full refund.`
                    : quote.cancellationPolicy.description}
                </p>
              </div>
            )}
          </div>

          {/* Check-In / Check-Out Grid */}
          <div className="border-b border-[#c4c6ce]/30 bg-[#f1f3ff]/50 p-5 space-y-3.5">
            <div className="rounded-2xl border border-[#c4c6ce]/40 bg-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <SummaryDateBlock
                  label="Check-in"
                  value={display ? shortDate(display.checkIn) : "-"}
                  time={display ? displayTime(display.arrivalTime, "From") : ""}
                />

                {display && (
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#000615] shadow-xs">
                      {quote?.bookingMode === "hourly"
                        ? `${quote.durationMinutes / 60}h Stay`
                        : `${nightsCount} ${nightsCount === 1 ? "Night" : "Nights"}`}
                    </span>
                  </div>
                )}

                <SummaryDateBlock
                  label="Check-out"
                  value={display ? shortDate(display.checkOut) : "-"}
                  time={display ? displayTime(display.departureTime, "Until") : ""}
                  align="right"
                />
              </div>
            </div>

            {/* Room Info */}
            <div className="flex items-start gap-3 rounded-2xl bg-white p-3.5 border border-[#c4c6ce]/40 shadow-xs">
              <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-[#000615]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#000615]">
                  {display?.roomType.name ?? "Room selection"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {totalGuests} {totalGuests === 1 ? "Guest" : "Guests"} ·{" "}
                  {display?.ratePlan.name ?? "Standard Rate"}
                </p>
              </div>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="p-6 sm:p-7">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#000615]">
              Price Summary
            </h3>

            {quote ? (
              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>
                    {quote.bookingMode === "hourly"
                      ? `${quote.durationMinutes / 60} ${
                          quote.durationMinutes === 60 ? "hour" : "hours"
                        }`
                      : `${quote.nights} ${quote.nights === 1 ? "night" : "nights"}`}
                  </span>
                  <span className="font-bold text-[#000615]">
                    {money(quote.subtotalPaise, quote.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Taxes &amp; Fees</span>
                  <span className="font-bold text-[#000615]">
                    {money(quote.taxPaise, quote.currency)}
                  </span>
                </div>
                {quote.customerFeePaise > 0 && (
                  <div className="flex justify-between">
                    <span>Helpkey service fee</span>
                    <span className="font-bold text-[#000615]">
                      {money(quote.customerFeePaise, quote.currency)}
                    </span>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-end justify-between text-[#000615]">
                    <div>
                      <span className="block text-sm font-black">
                        Total Payable
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Includes all applicable taxes
                      </span>
                    </div>
                    <span className="text-2xl font-black text-[#000615]">
                      {money(quote.totalPaise, quote.currency)}
                    </span>
                  </div>

                  {quote.payableNowPaise !== quote.totalPaise && (
                    <div className="mt-3.5 flex items-center justify-between rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900 border border-amber-200/60">
                      <span>Due Now</span>
                      <span>{money(quote.payableNowPaise, quote.currency)}</span>
                    </div>
                  )}
                  {quote.balanceDuePaise > 0 && (
                    <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 border border-slate-200">
                      <span>Payable at Property</span>
                      <span>{money(quote.balanceDuePaise, quote.currency)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-slate-100 p-4 text-xs text-slate-600">
                <div className="h-8 animate-pulse rounded bg-slate-200" />
                {quoteError && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-2 font-bold text-[#000615] underline"
                  >
                    Could not refresh price. Try again
                  </button>
                )}
              </div>
            )}

            {/* Action CTA Button */}
            <button
              type="button"
              disabled={busy || !quote}
              onClick={onSubmit}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#000615] px-5 py-4 text-sm font-bold text-white shadow-lg shadow-[#000615]/15 transition duration-150 hover:bg-[#0b1f3a] hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Securing reservation...
                </span>
              ) : (
                <>
                  <span>{cta}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="mt-3.5 text-center text-[11px] font-medium text-slate-500 flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3 text-slate-400" />
              <span>256-Bit SSL Encrypted &amp; Protected Checkout</span>
            </p>
            <Link
              href="/help"
              className="mt-2 block text-center text-[11px] font-semibold text-[#000615] hover:underline"
            >
              Need help with this booking?
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile Sticky Bottom Pay Bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-[0_-8px_24px_rgba(11,31,58,0.12)] lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Total Payable
            </p>
            <p className="truncate text-lg font-black text-[#000615]">
              {money(
                quote?.payableNowPaise ?? quote?.totalPaise ?? 0,
                quote?.currency,
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !quote}
            onClick={onSubmit}
            className="rounded-xl bg-[#000615] px-5 py-3 text-xs font-bold text-white shadow-md active:scale-95 disabled:opacity-50"
          >
            {busy ? "Securing..." : appUserReady ? "Confirm Booking" : "Sign In"}
          </button>
        </div>
      </div>
    </>
  );
}

function SummaryDateBlock({
  label,
  value,
  time,
  align = "left",
}: {
  label: string;
  value: string;
  time: string;
  align?: "left" | "right";
}) {
  const isRight = align === "right";
  return (
    <div className={isRight ? "text-right" : "text-left"}>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="mt-0.5 block text-xs font-extrabold text-[#000615]">
        {value}
      </span>
      <span
        className={`mt-0.5 flex items-center gap-1 text-[10px] font-medium text-slate-500 ${
          isRight ? "justify-end" : "justify-start"
        }`}
      >
        <Clock className="h-3 w-3 text-[#000615]" />
        {time}
      </span>
    </div>
  );
}
