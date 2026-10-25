"use client";

import {
  CheckoutProgress,
  CheckoutReview,
  checkoutStepLabels,
  type CheckoutStep,
} from "./checkout-journey";
import { eligibleOffering } from "@/lib/stay/domain";
import { CheckoutPersonalization } from "@/components/stay/checkout-personalization";
import type {
  Selection,
  TravelerCategory,
  Offering,
  StayRequest,
} from "@/lib/stay/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GuestRules } from "@/components/hotel/guest-rules";
import { formatMoney } from "@/lib/customer/offer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { CheckoutDisplay, CheckoutInput } from "@/lib/booking/checkout";
import { normalizeAadhaar } from "@/lib/aadhaar";
import { GuestCounterRow } from "@/components/booking/guest-counter-row";
import {
  clampGuests,
  guestLimits,
  guestSummary,
  quoteTermsKey,
  sameGuests,
  searchWithGuests,
  type GuestCounts,
} from "@/lib/booking/checkout-state";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  ChevronDown,
  Clock,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/shared/site-header";
import { LoginModal } from "@/components/auth/login-modal";
import { useAuth } from "@/components/auth/auth-provider";
import { PublicMediaImage } from "@/components/shared/public-media-image";

type Quote = {
  availableCustomizations: Offering[];
  customizations: StayRequest[];
  extrasTotalPaise: number;
  includedAmenities: {
    roomAmenities: { code: string; label: string }[];
    propertyAmenities: { code: string; label: string }[];
    rateInclusions: { code: string; label: string }[];
  };
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
  ratePlan: {
    name: string;
    paymentMode: "full" | "deposit" | "pay_at_property";
  };
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
  if (
    !quote.cancellationPolicy ||
    quote.cancellationPolicy.refundableUntilHours <= 0
  )
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

export function BookingCheckout({
  initialInput,
  initialDisplay,
}: {
  initialInput: CheckoutInput | null;
  initialDisplay: CheckoutDisplay | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<CheckoutStep>("details");
  const [furthestStep, setFurthestStep] = useState(0);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const { appUser, loading, refreshUser } = useAuth();
  // Guest counts are editable here. `guests` updates instantly for the UI;
  // `committedGuests` follows after a short pause and is what the quote, the
  // booking request and the page address use, so rapid +/- clicks cost one update.
  const [guests, setGuests] = useState<GuestCounts>(() => ({
    adults: initialInput?.adults ?? 2,
    children: initialInput?.children ?? 0,
    infants: initialInput?.infants ?? 0,
  }));
  const [selections, setSelections] = useState<Selection[]>([]);
  const [committedSelections, setCommittedSelections] = useState<Selection[]>(
    [],
  );
  const [preferences, setPreferences] = useState<TravelerCategory[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setCommittedSelections(selections), 300);
    return () => clearTimeout(timer);
  }, [selections]);
  const [committedGuests, setCommittedGuests] = useState<GuestCounts>(guests);
  const input = useMemo(
    () =>
      initialInput
        ? {
            ...initialInput,
            ...committedGuests,
            customizationSelections: committedSelections,
          }
        : null,
    [initialInput, committedGuests, committedSelections],
  );
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

  // Details are kept for every guest slot ever shown in this visit, so adding a
  // removed guest back restores what was typed. Only the first `guests.adults`
  // entries are validated, shown and submitted.
  const [names, setNames] = useState<string[]>(() =>
    Array.from({ length: guests.adults }, (_, index) =>
      index === 0 ? (appUser?.fullName ?? "") : "",
    ),
  );
  const [aadhaarNumbers, setAadhaarNumbers] = useState<string[]>(() =>
    Array.from({ length: guests.adults }, () => ""),
  );
  const [visibleAadhaar, setVisibleAadhaar] = useState<Record<number, boolean>>(
    {},
  );
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
  const lastTermsKey = useRef<string | null>(null);
  const lastQuoteChoices = useRef<string | null>(null);
  const [lastGoodQuote, setLastGoodQuote] = useState<Quote | null>(null);
  const [lastGoodGuests, setLastGoodGuests] = useState<GuestCounts | null>(
    null,
  );
  const guestCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guestPanelOpen, setGuestPanelOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<GuestCounts | null>(
    null,
  );

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
    placeholderData: keepPreviousData,
  });

  const optionsInput = useMemo(
    () => (input ? { ...input, customizationSelections: [] } : null),
    [input],
  );
  const optionsQuery = useQuery({
    queryKey: ["stay-options", optionsInput],
    queryFn: ({ signal }) =>
      apiFetch<{ offerings: Offering[]; startAt: string; timezone: string }>(
        "/api/bookings/personalization",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(optionsInput),
          signal,
        },
      ),
    enabled: Boolean(optionsInput),
    staleTime: 15000,
    retry: false,
  });
  if (quoteQuery.data?.quote && quoteQuery.data.quote !== lastGoodQuote)
    setLastGoodQuote(quoteQuery.data.quote);
  const quote = quoteQuery.data?.quote ?? lastGoodQuote;
  const quoteLoading = quoteQuery.isLoading || quoteQuery.isFetching;
  // True while the visible quote was priced for a different guest count than the
  // one now selected. Booking is blocked until the matching quote arrives.
  const quoteStale = Boolean(
    quote &&
      input &&
      (quote.adults !== input.adults ||
        quote.children !== input.children ||
        quote.infants !== input.infants),
  );
  const guestsPending = !sameGuests(guests, committedGuests) || quoteStale;
  // Remember the last guest count that priced successfully so a failed change
  // can be undone (state adjusted during render, guarded to avoid loops).
  if (quote && !quoteStale) {
    const priced = {
      adults: quote.adults,
      children: quote.children,
      infants: quote.infants,
    };
    if (!lastGoodGuests || !sameGuests(lastGoodGuests, priced))
      setLastGoodGuests(priced);
  }

  useEffect(() => {
    if (!quote) return;
    // The fingerprint also covers guest counts, so any change starts a fresh
    // booking attempt (new idempotency key). Consent is only withdrawn when the
    // price, payment split, timing, room/rate or cancellation rules changed.
    if (
      lastQuoteFingerprint.current &&
      lastQuoteFingerprint.current !== quote.fingerprint
    ) {
      bookingIdempotencyKey.current = "";
    }
    const termsKey = quoteTermsKey(quote);
    const choicesKey = JSON.stringify({
      adults: quote.adults,
      children: quote.children,
      infants: quote.infants,
      extras: quote.customizations.map((r) => [
        r.offeringId,
        r.variantId,
        r.quantity,
      ]),
    });
    if (lastTermsKey.current && lastTermsKey.current !== termsKey) {
      setTermsAccepted(false);
      setRulesAccepted(false);
      // Intentional guest/extra changes update the summary without an alarm.
      // Changed prices or terms for the same choices still require a warning.
      setQuoteChanged(lastQuoteChoices.current === choicesKey);
    }
    lastQuoteChoices.current = choicesKey;
    lastQuoteFingerprint.current = quote.fingerprint;
    lastTermsKey.current = termsKey;
  }, [quote]);

  useEffect(() => {
    // Account hydration can arrive after the form mounts; preserve edits.
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setNames((current) =>
        current[0] || !appUser?.fullName
          ? current
          : [appUser.fullName, ...current.slice(1)],
      );
      setEmail((current) => current || appUser?.email || "");
      setPhone(
        (current) =>
          current || appUser?.phoneNumber?.replace(/^\+91/, "") || "",
      );
      setBookingContactName((current) => current || appUser?.fullName || "");
    });
    return () => {
      active = false;
    };
  }, [appUser?.email, appUser?.fullName, appUser?.phoneNumber]);

  // Validation details
  const activeNames = useMemo(
    () => names.slice(0, guests.adults),
    [names, guests.adults],
  );
  const activeAadhaar = useMemo(
    () => aadhaarNumbers.slice(0, guests.adults),
    [aadhaarNumbers, guests.adults],
  );

  const nameErrors = useMemo(() => {
    return Array.from(
      { length: guests.adults },
      (_, index) => (names[index] ?? "").trim().length < 2,
    );
  }, [names, guests.adults]);

  const aadhaarErrors = useMemo(() => {
    return Array.from(
      { length: guests.adults },
      (_, index) => !checkAadhaarValidity(aadhaarNumbers[index] ?? ""),
    );
  }, [aadhaarNumbers, guests.adults]);

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

  const detailsError = useMemo(() => {
    if (guestsPending)
      return "Your guest changes are still updating. Please wait a moment.";
    if (nameErrors.some(Boolean))
      return "Please enter full legal names for all adult guests.";
    if (aadhaarErrors.some(Boolean))
      return "Enter a valid 12-digit Aadhaar number for every adult guest.";
    if (emailError) return "Please enter a valid email address.";
    if (phoneError)
      return "Please enter a valid 10-digit Indian mobile number.";
    if (bookingContactError)
      return "Enter the primary booking contact’s full name.";
    if (gstError)
      return "Complete a valid GST business name, GSTIN, and billing address.";
    return "";
  }, [
    aadhaarErrors,
    bookingContactError,
    emailError,
    gstError,
    guestsPending,
    nameErrors,
    phoneError,
  ]);
  const formError =
    detailsError ||
    (!termsAccepted || !rulesAccepted
      ? "Accept the booking terms, cancellation policy, and house rules to confirm."
      : "");

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

  // --- Guest selector -------------------------------------------------------
  // Locked from the moment booking starts until a payment hold ends, because the
  // held booking is tied to the exact guests that were submitted.
  const guestsLocked = busy || (holdSeconds !== null && holdSeconds > 0);
  const childrenAllowed =
    initialDisplay?.propertyRules.childrenPolicy?.allowed !== false;
  const capacity = initialDisplay?.capacity ?? null;
  const limits = guestLimits(guests, capacity, childrenAllowed);

  const commitGuests = useCallback((next: GuestCounts) => {
    setCommittedGuests((current) =>
      sameGuests(current, next) ? current : next,
    );
    // Any change to the booking details is a new booking attempt.
    bookingIdempotencyKey.current = "";
    // Keep refresh, sharing, back-links and the browser history consistent.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${searchWithGuests(window.location.search, next)}`,
    );
  }, []);

  useEffect(
    () => () => {
      if (guestCommitTimer.current) clearTimeout(guestCommitTimer.current);
    },
    [],
  );

  const applyGuests = (requested: GuestCounts) => {
    const next = clampGuests(requested, capacity, childrenAllowed);
    setGuests(next);
    setPendingRemoval(null);
    // Grow the detail slots, never shrink them, so removed guests can be restored.
    const grow = (current: string[]) =>
      current.length >= next.adults
        ? current
        : [...current, ...Array<string>(next.adults - current.length).fill("")];
    setNames(grow);
    setAadhaarNumbers(grow);
    if (guestCommitTimer.current) clearTimeout(guestCommitTimer.current);
    guestCommitTimer.current = setTimeout(() => {
      guestCommitTimer.current = null;
      commitGuests(next);
    }, 400);
  };

  const requestGuests = (requested: GuestCounts) => {
    if (guestsLocked) return;
    if (requested.adults < guests.adults) {
      const leaving = guests.adults - 1;
      if (
        (names[leaving] ?? "").trim() ||
        (aadhaarNumbers[leaving] ?? "").trim()
      ) {
        setPendingRemoval(requested);
        return;
      }
    }
    applyGuests(requested);
  };

  const restoreGuests = () => {
    if (!lastGoodGuests || guestsLocked) return;
    if (guestCommitTimer.current) clearTimeout(guestCommitTimer.current);
    guestCommitTimer.current = null;
    setGuests(lastGoodGuests);
    setPendingRemoval(null);
    commitGuests(lastGoodGuests);
  };

  const selectionUpdating =
    JSON.stringify(selections) !== JSON.stringify(committedSelections);
  const extrasUnavailable = selections.some((selection) => {
    const offering = optionsQuery.data?.offerings.find(
      (o) => o.id === selection.offeringId,
    );
    return (
      !offering ||
      !eligibleOffering(
        offering,
        input?.roomTypeId ?? "",
        input?.bookingMode ?? "overnight",
        quote?.startAt ?? "",
      ) ||
      (selection.variantId === null
        ? offering.variants.length > 0
        : !offering.variants.some((v) => v.id === selection.variantId))
    );
  });
  const extrasBlocked =
    selections.length > 0 &&
    (optionsQuery.isError ||
      optionsQuery.isFetching ||
      extrasUnavailable ||
      quoteQuery.isError ||
      selectionUpdating ||
      quoteQuery.isFetching);

  function goToStep(next: CheckoutStep) {
    if (guestsLocked || next === step) return;
    if (next !== "details" && detailsError) {
      setHasAttemptedSubmit(true);
      setError(detailsError);
      setStep("details");
      const url = new URL(window.location.href);
      url.searchParams.set("step", "details");
      window.history.replaceState(null, "", url);
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(".hk-input-error");
        (field ?? stageHeading.current)?.focus();
        field?.scrollIntoView({ block: "center", behavior: "instant" });
      });
      return;
    }
    if (next === "review" && extrasBlocked) {
      setError(
        "Review or remove the selected extras before continuing. A current price is required.",
      );
      return;
    }
    setError("");
    setHasAttemptedSubmit(false);
    setFurthestStep((old) =>
      Math.max(old, next === "review" ? 2 : next === "extras" ? 1 : 0),
    );
    setStep(next);
    const url = new URL(window.location.href);
    url.searchParams.set("step", next);
    window.history.pushState(null, "", url);
    requestAnimationFrame(() => {
      stageHeading.current?.focus({ preventScroll: true });
      stageHeading.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    });
  }

  useEffect(() => {
    // No guest/identity data is persisted. A reload starts with guest details.
    const url = new URL(window.location.href);
    url.searchParams.set("step", "details");
    window.history.replaceState(null, "", url);
  }, []);
  useEffect(() => {
    function pop() {
      const value = new URLSearchParams(window.location.search).get("step");
      const requested: CheckoutStep =
        value === "extras" || value === "review" ? value : "details";
      const next = guestsLocked
        ? step
        : detailsError
          ? "details"
          : requested === "review" && extrasBlocked
            ? "extras"
            : requested;
      setStep(next);
      const url = new URL(window.location.href);
      url.searchParams.set("step", next);
      window.history.replaceState(null, "", url);
      requestAnimationFrame(() => stageHeading.current?.focus());
    }
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [detailsError, extrasBlocked, guestsLocked, step]);

  const submit = async () => {
    if (step !== "review" || quoteQuery.isError) return;
    if (detailsError) {
      goToStep("details");
      return;
    }
    if (extrasBlocked) {
      goToStep("extras");
      return;
    }
    if (selectionUpdating || quoteQuery.isFetching) return;
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
        travelerPreferences: preferences,
        expectedTotalPaise: quote.totalPaise,
        quoteFingerprint: quote.fingerprint,
        paymentMethod:
          quote.ratePlan.paymentMode === "pay_at_property"
            ? "pay_at_property"
            : "online",
        leadEmail: email,
        leadPhone: `+91${cleanPhone}`,
        adultGuestNames: activeNames.map((name) => name.trim()),
        adultAadhaarLastFour: activeAadhaar.map((number) =>
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
            void refreshUser();
            router.replace(`/trips/${encodeURIComponent(bookingId)}`);
          },
          modal: { ondismiss: () => setBusy(false) },
        }).open();
        return;
      }
      setHoldExpiresAt(null);
      setBusy(false);
      void refreshUser();
      router.replace(`/trips/${encodeURIComponent(bookingId)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create booking.",
      );
      setBusy(false);
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
    <main className="hk-checkout min-h-screen bg-[var(--hk-ivory)] pb-32 text-[var(--hk-ink)] lg:pb-12">
      <SiteHeader onLoginClick={() => setLogin(true)} />

      {quoteChanged && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-3">
          <div className="mx-auto max-w-[1280px] flex items-center gap-2 text-xs font-semibold text-amber-900">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              The price or stay rules were updated. Please review the refreshed
              stay details and accept terms before confirming.
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
            <span className="text-[11px] font-medium text-emerald-700">
              Guaranteed availability
            </span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <header className="mb-7">
          <Link
            href={hotelHref}
            className="mb-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--hk-muted)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to hotel
          </Link>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hk-gold)]">
            Your next stay, made simple
          </p>
          <h1
            ref={stageHeading}
            tabIndex={-1}
            className="scroll-mt-28 text-2xl font-extrabold tracking-tight text-[var(--hk-navy)] outline-none sm:text-3xl"
          >
            {checkoutStepLabels[step]}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--hk-muted)]">
            {step === "details"
              ? "A few details, then you’re one step closer to checking in."
              : step === "extras"
                ? "Small touches for a more comfortable stay. Everything here is optional."
                : "Everything in one place. Take a moment to make sure it’s right."}
          </p>
          <div className="mt-4 rounded-xl border border-[var(--hk-border)] bg-white p-3 text-xs lg:hidden">
            <p className="font-bold text-[var(--hk-navy)]">
              {initialDisplay?.propertyName ?? "Your hotel"} ·{" "}
              {initialDisplay?.roomType.name ?? "Your room"}
            </p>
            <p className="mt-1 leading-5 text-[var(--hk-muted)]">
              {initialDisplay
                ? `${shortDate(initialDisplay.checkIn)} · ${initialDisplay.arrivalTime} → ${shortDate(initialDisplay.checkOut)} · ${initialDisplay.departureTime}`
                : ""}{" "}
              · {guests.adults + guests.children + guests.infants} guests
            </p>
          </div>
          <CheckoutProgress
            furthestStep={furthestStep}
            step={step}
            locked={guestsLocked}
            onChange={goToStep}
          />
        </header>
        {quoteQuery.isError && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {quoteQuery.error instanceof Error
              ? quoteQuery.error.message
              : "We couldn’t refresh your price."}
            <button
              type="button"
              onClick={() => void quoteQuery.refetch()}
              className="ml-2 min-h-11 font-semibold underline"
            >
              Refresh stay price
            </button>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Form Details & Trust Badges */}
          <section className="min-w-0 space-y-5 lg:col-span-8">
            {step === "details" && (
              <>
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
                          Sign in to auto-fill saved guest names, earn Helpkey
                          reward points, and manage bookings instantly.
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
                        {bookingForSomeoneElse
                          ? "Staying Guest Details"
                          : "Primary Guest Details"}
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-slate-500">
                        Must match valid government photo ID presented at
                        property check-in.
                      </p>
                    </div>
                  </div>

                  {/* Guest selector */}
                  <div className="rounded-xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      aria-expanded={guestPanelOpen}
                      aria-controls="checkout-guests-panel"
                      onClick={() => setGuestPanelOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left transition hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-3">
                        <Users className="h-4 w-4 shrink-0 text-slate-400" />
                        <span>
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Guests
                          </span>
                          <span className="block text-sm font-semibold text-[#000615]">
                            {guestSummary(guests)}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#000615] underline">
                          {guestPanelOpen ? "Done" : "Change"}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-slate-400 transition-transform ${guestPanelOpen ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>

                    {guestPanelOpen && (
                      <div
                        id="checkout-guests-panel"
                        className="border-t border-slate-100 px-4 pb-4 pt-2"
                      >
                        <GuestCounterRow
                          large
                          label="Adults"
                          note="Age 13+"
                          limitNote="Room limit reached"
                          value={guests.adults}
                          min={limits.adults.min}
                          max={limits.adults.max}
                          disabled={guestsLocked}
                          onChange={(adults) =>
                            requestGuests({ ...guests, adults })
                          }
                        />
                        {childrenAllowed ? (
                          <>
                            <GuestCounterRow
                              large
                              label="Children"
                              note="Ages 2–12"
                              limitNote="Room limit reached"
                              value={guests.children}
                              min={limits.children.min}
                              max={limits.children.max}
                              disabled={guestsLocked}
                              onChange={(children) =>
                                requestGuests({ ...guests, children })
                              }
                            />
                            <GuestCounterRow
                              large
                              label="Infants"
                              note="Under 2"
                              limitNote="Room limit reached"
                              value={guests.infants}
                              min={limits.infants.min}
                              max={limits.infants.max}
                              disabled={guestsLocked}
                              onChange={(infants) =>
                                requestGuests({ ...guests, infants })
                              }
                            />
                          </>
                        ) : (
                          <p className="py-2 text-[11px] text-slate-500">
                            This property does not allow children or infants.
                          </p>
                        )}
                        {capacity && (
                          <p className="pt-2 text-[11px] text-slate-500">
                            This room allows up to {capacity.maxOccupancy}{" "}
                            {capacity.maxOccupancy === 1 ? "guest" : "guests"}
                            {childrenAllowed && capacity.maxInfants > 0
                              ? `, plus up to ${capacity.maxInfants} ${capacity.maxInfants === 1 ? "infant" : "infants"}`
                              : ""}
                            .
                          </p>
                        )}
                        {guestsLocked && (
                          <p className="pt-2 text-[11px] font-semibold text-amber-700">
                            Guests can&apos;t be changed while your room is
                            being held for payment.
                          </p>
                        )}
                      </div>
                    )}

                    <p className="sr-only" aria-live="polite">
                      {guestSummary(guests)}
                    </p>

                    {pendingRemoval && (
                      <div
                        role="alertdialog"
                        aria-label="Confirm removing a guest"
                        className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs"
                      >
                        <p className="font-bold text-amber-900">
                          Remove Guest {guests.adults}
                          {(names[guests.adults - 1] ?? "").trim()
                            ? ` (${(names[guests.adults - 1] ?? "").trim()})`
                            : ""}
                          ?
                        </p>
                        <p className="mt-1 text-amber-800">
                          Their details will be taken off this booking. If you
                          add the guest back during this visit, we&apos;ll
                          restore what you entered.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applyGuests(pendingRemoval)}
                            className="rounded-lg bg-[#000615] px-4 py-2 font-bold text-white"
                          >
                            Remove guest
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingRemoval(null)}
                            className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-bold text-amber-900"
                          >
                            Keep guest
                          </button>
                        </div>
                      </div>
                    )}

                    {guestsPending && !quoteQuery.isError && (
                      <p
                        role="status"
                        className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-[11px] font-semibold text-slate-600"
                      >
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                        Updating your stay…
                      </p>
                    )}

                    {quoteQuery.isError &&
                      sameGuests(guests, committedGuests) && (
                        <div
                          role="alert"
                          className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs"
                        >
                          <p className="font-bold text-rose-900">
                            {quoteQuery.error instanceof Error &&
                            quoteQuery.error.message
                              ? quoteQuery.error.message
                              : "We couldn't confirm this stay for your guests."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {lastGoodGuests &&
                              !sameGuests(lastGoodGuests, committedGuests) && (
                                <button
                                  type="button"
                                  onClick={restoreGuests}
                                  className="rounded-lg bg-[#000615] px-4 py-2 font-bold text-white"
                                >
                                  Go back to {guestSummary(lastGoodGuests)}
                                </button>
                              )}
                            <Link
                              href={hotelHref}
                              className="rounded-lg border border-rose-300 bg-white px-4 py-2 font-bold text-rose-900"
                            >
                              Choose another room
                            </Link>
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Booking For Someone Else Toggle Row */}
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f8ff] p-4">
                    <input
                      type="checkbox"
                      checked={bookingForSomeoneElse}
                      onChange={(event) =>
                        setBookingForSomeoneElse(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 accent-[#000615]"
                    />
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#000615]">
                          I am booking for someone else
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Booking voucher and receipt will go to you; the
                          staying guest will check in.
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
                          We will send the voucher and payment invoice to this
                          contact.
                        </p>
                      </div>

                      <div className="grid gap-5 sm:grid-cols-3 pt-1">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Your Full Name{" "}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input
                            value={bookingContactName}
                            onChange={(e) =>
                              setBookingContactName(e.target.value)
                            }
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
                            Email Address{" "}
                            <span className="text-rose-500">*</span>
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
                            Mobile Number{" "}
                            <span className="text-rose-500">*</span>
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
                    {activeNames.map((name, index) => {
                      const isNameInvalid =
                        hasAttemptedSubmit && nameErrors[index];
                      const aadhaarValue = aadhaarNumbers[index] ?? "";
                      const isAadhaarInvalid =
                        hasAttemptedSubmit && aadhaarErrors[index];
                      const isAadhaarComplete =
                        normalizeAadhaar(aadhaarValue).length === 12;

                      return (
                        <div key={index} className="space-y-4">
                          <div className="space-y-4">
                            {/* Full Name */}
                            <div>
                              <label className="block text-xs font-bold uppercase tracking-wider text-[#44474d] mb-1.5">
                                Adult guest {index + 1}{" "}
                                <span className="text-rose-500">*</span>
                              </label>
                              <div className="relative flex items-center">
                                <User className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                                <input
                                  aria-label={`Adult guest ${index + 1} full name`}
                                  value={name}
                                  onChange={(event) =>
                                    setNames((curr) =>
                                      curr.map((item, pos) =>
                                        pos === index
                                          ? event.target.value
                                          : item,
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
                                  Aadhaar Number{" "}
                                  <span className="text-rose-500">*</span>
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
                                  type={
                                    visibleAadhaar[index] ? "text" : "password"
                                  }
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
                      Your Aadhaar is processed securely with 256-bit
                      encryption. Only the last 4 digits are retained on the
                      booking voucher for validation at check-in.
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
                        We&apos;ll send your booking confirmation voucher and
                        arrival details here.
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
                          Booking voucher and receipt will be delivered to this
                          address.
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
                              hasAttemptedSubmit && phoneError
                                ? "hk-input-error"
                                : ""
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

                <div>
                  {/* Collapsible Corporate & GST Billing Details */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowGstForm(!showGstForm)}
                      className="flex w-full items-center justify-between rounded-2xl border border-[var(--hk-border)] bg-white p-5 text-left transition hover:bg-slate-100/70"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white border border-slate-200 text-[#000615] shadow-xs">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#000615]">
                            Corporate &amp; GST Billing Details{" "}
                            <span className="font-normal text-slate-400">
                              (Optional)
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Add GSTIN if you need an official business tax
                            invoice for your company.
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
                              onChange={(e) =>
                                setTaxId(e.target.value.toUpperCase())
                              }
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
                                setBillingAddress((c) => ({
                                  ...c,
                                  line1: e.target.value,
                                }))
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
                                  setBillingAddress((c) => ({
                                    ...c,
                                    city: e.target.value,
                                  }))
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
                                  setBillingAddress((c) => ({
                                    ...c,
                                    state: e.target.value,
                                  }))
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
              </>
            )}
            {step === "extras" && (
              <>
                <CheckoutPersonalization
                  roomTypeId={input?.roomTypeId ?? ""}
                  bookingMode={input?.bookingMode ?? "overnight"}
                  quote={quote}
                  offerings={optionsQuery.data?.offerings ?? []}
                  selections={selections}
                  setSelections={setSelections}
                  preferences={preferences}
                  setPreferences={setPreferences}
                  locked={guestsLocked}
                  updating={selectionUpdating || quoteQuery.isFetching}
                  optionsLoading={optionsQuery.isFetching}
                  optionsError={optionsQuery.isError}
                  priceError={quoteQuery.isError}
                  retry={() => void optionsQuery.refetch()}
                />
                {/* Special Requests */}
                <details className="rounded-2xl border border-[var(--hk-border)] bg-white p-5">
                  <summary className="min-h-6 cursor-pointer text-sm font-semibold text-[var(--hk-navy)]">
                    Anything else the hotel should know?{" "}
                    <span className="font-normal text-[var(--hk-muted)]">
                      · Optional
                    </span>
                  </summary>
                  {/* Preset Pills */}
                  <textarea
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    rows={3}
                    placeholder="Any specific room preference or arrival note..."
                    aria-label="Note for the hotel"
                    disabled={guestsLocked}
                    className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-[#141b2b] outline-none transition focus:border-[#000615] focus:ring-2 focus:ring-[#000615]/10 placeholder:text-slate-400 leading-relaxed"
                  />
                  <p className="text-xs text-slate-400">
                    Requests are forwarded to the property after confirmation
                    and are subject to availability.
                  </p>
                </details>
              </>
            )}
            {step === "review" && (
              <>
                <CheckoutReview
                  names={activeNames}
                  email={email}
                  phone={phone}
                  contactName={
                    bookingForSomeoneElse ? bookingContactName : null
                  }
                  requests={quote?.customizations ?? []}
                  currency={quote?.currency ?? "INR"}
                  notes={request}
                  billing={taxId ? `${companyName} · ${taxId}` : null}
                  onEdit={goToStep}
                  locked={guestsLocked}
                  propertyName={initialDisplay?.propertyName ?? "Your hotel"}
                  roomName={initialDisplay?.roomType.name ?? "Your room"}
                  stayLabel={`${initialDisplay ? shortDate(initialDisplay.checkIn) : ""} · ${initialDisplay?.arrivalTime ?? ""} → ${initialDisplay ? shortDate(initialDisplay.checkOut) : ""} · ${initialDisplay?.departureTime ?? ""} · ${guests.adults + guests.children + guests.infants} guests`}
                  amenities={[
                    ...(quote?.includedAmenities.roomAmenities ?? []),
                    ...(quote?.includedAmenities.propertyAmenities ?? []),
                    ...(quote?.includedAmenities.rateInclusions ?? []),
                  ].map((a) => a.label)}
                  cancellation={
                    quote?.cancellationPolicy
                      ? `${quote.cancellationPolicy.name}: ${quote.cancellationPolicy.description}${cancellationDeadline(quote) ? ` Cancellation deadline: ${cancellationDeadline(quote)} (${quote.timezone}).` : ""}`
                      : "This booking and its paid extras are non-refundable on customer cancellation."
                  }
                  rules={
                    initialDisplay?.propertyRules ? (
                      <GuestRules property={initialDisplay.propertyRules} />
                    ) : (
                      <p>Present a valid government ID at check-in.</p>
                    )
                  }
                />
                {quote && (
                  <div className="rounded-2xl border border-[var(--hk-border)] bg-white p-5 lg:hidden">
                    <h2 className="mb-4 font-bold text-[var(--hk-navy)]">
                      Price breakdown
                    </h2>
                    <PriceBreakdown quote={quote} />
                  </div>
                )}
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
                        I confirm that all staying guests meet the
                        property&apos;s check-in age, ID verification, and
                        house-rule requirements.
                      </span>
                    </label>
                  </div>

                  {/* Validation Banner if attempted submit */}
                  {hasAttemptedSubmit && formError && !error && (
                    <div
                      role="alert"
                      className="flex items-center gap-2.5 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs sm:text-sm font-bold text-rose-800"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" />
                      <span>{formError}</span>
                    </div>
                  )}
                </div>

                <p className="flex items-center justify-center gap-2 text-xs text-[var(--hk-muted)]">
                  <Lock className="h-3.5 w-3.5" />
                  Secure payment · Clear prices · Your booking in My Trips
                </p>
              </>
            )}
            {step !== "details" && (
              <button
                type="button"
                disabled={guestsLocked}
                onClick={() =>
                  goToStep(step === "review" ? "extras" : "details")
                }
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--hk-muted)]"
              >
                <ArrowLeft className="h-4 w-4" />
                {step === "review"
                  ? "Back to additions"
                  : "Back to guest details"}
              </button>
            )}
          </section>

          {/* Right Column: Sticky Booking Summary Card */}
          <BookingSummary
            display={initialDisplay}
            quote={quote}
            busy={busy}
            appUserReady={Boolean(appUser)}
            guestCount={guests.adults + guests.children + guests.infants}
            updating={
              guestsPending || selectionUpdating || quoteQuery.isFetching
            }
            actionLabel={
              step === "details"
                ? "Continue to personalize"
                : step === "extras"
                  ? "Continue to review"
                  : undefined
            }
            actionBlocked={
              quoteQuery.isError || (step === "extras" && extrasBlocked)
            }
            selectedCount={selections.reduce(
              (sum, selection) => sum + selection.quantity,
              0,
            )}
            onSubmit={() =>
              step === "details"
                ? goToStep("extras")
                : step === "extras"
                  ? goToStep("review")
                  : void submit()
            }
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

function PriceBreakdown({ quote }: { quote: Quote }) {
  return (
    <div className="space-y-3 text-sm text-[var(--hk-muted)]">
      <div className="flex justify-between gap-3">
        <span>Room charges</span>
        <span className="font-medium text-[var(--hk-navy)]">
          {money(quote.subtotalPaise, quote.currency)}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span>Taxes & fees</span>
        <span>{money(quote.taxPaise, quote.currency)}</span>
      </div>
      {quote.customerFeePaise > 0 && (
        <div className="flex justify-between gap-3">
          <span>Helpkey service fee</span>
          <span>{money(quote.customerFeePaise, quote.currency)}</span>
        </div>
      )}
      <div className="flex justify-between gap-3">
        <span>Stay additions</span>
        <span>
          {quote.extrasTotalPaise
            ? money(quote.extrasTotalPaise, quote.currency)
            : "Free"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--hk-border)] pt-4 font-bold text-[var(--hk-navy)]">
        <span>Booking total</span>
        <span className="text-xl">
          {money(quote.totalPaise, quote.currency)}
        </span>
      </div>
      <p className="text-xs">Includes all applicable taxes and charges.</p>
      <div className="flex justify-between rounded-xl bg-[var(--hk-surface-soft)] px-3 py-3 font-semibold text-[var(--hk-navy)]">
        <span>Pay now</span>
        <span>{money(quote.payableNowPaise, quote.currency)}</span>
      </div>
      {quote.balanceDuePaise > 0 && (
        <div className="flex justify-between gap-3 text-xs">
          <span>Pay at property</span>
          <span className="font-semibold text-[var(--hk-navy)]">
            {money(quote.balanceDuePaise, quote.currency)}
          </span>
        </div>
      )}
    </div>
  );
}

function BookingSummary({
  display,
  quote,
  busy,
  appUserReady,
  guestCount,
  updating,
  onSubmit,
  quoteError,
  onRetry,
  actionLabel,
  actionBlocked,
  selectedCount,
}: {
  display: CheckoutDisplay | null;
  quote: Quote | null;
  busy: boolean;
  appUserReady: boolean;
  guestCount: number;
  updating: boolean;
  onSubmit: () => void;
  quoteError: string;
  onRetry: () => void;
  actionLabel?: string;
  actionBlocked: boolean;
  selectedCount: number;
}) {
  const cta =
    actionLabel ??
    (!appUserReady
      ? "Sign in to confirm"
      : quote?.ratePlan.paymentMode === "pay_at_property"
        ? "Confirm & pay at property"
        : `Pay ${money(quote?.payableNowPaise ?? 0, quote?.currency)} & confirm`);
  const disabled = busy || !quote || updating || actionBlocked;
  const buttonText = busy
    ? "Securing reservation…"
    : updating
      ? "Updating your stay…"
      : quoteError
        ? "Refresh price to continue"
        : cta;
  return (
    <>
      <aside
        aria-label="Booking summary"
        className="hidden self-start lg:sticky lg:top-24 lg:col-span-4 lg:block"
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--hk-border)] bg-white shadow-[var(--hk-shadow-card)]">
          <div className="flex items-center gap-3 border-b border-[var(--hk-border)] p-5">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]">
              {display?.propertyCoverImageUrl ? (
                <PublicMediaImage
                  src={display.propertyCoverImageUrl}
                  alt=""
                  sizes="64px"
                  className="h-full w-full object-cover"
                />
              ) : (
                <BedDouble className="h-7 w-7" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[var(--hk-navy)]">
                {display?.propertyName ?? "Your hotel"}
              </h2>
              <p className="mt-1 text-xs text-[var(--hk-muted)]">
                {[display?.propertyCity, display?.propertyState]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p className="mt-1 text-xs font-medium text-[var(--hk-navy)]">
                {display?.roomType.name ?? "Your room"}
              </p>
            </div>
          </div>
          <div className="space-y-2 border-b border-[var(--hk-border)] bg-[var(--hk-surface-soft)]/40 p-5 text-xs text-[var(--hk-muted)]">
            <div className="flex justify-between gap-3">
              <span>Check-in</span>
              <span className="text-right font-semibold text-[var(--hk-navy)]">
                {display
                  ? `${shortDate(display.checkIn)} · ${displayTime(display.arrivalTime, "")}`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Check-out</span>
              <span className="text-right font-semibold text-[var(--hk-navy)]">
                {display
                  ? `${shortDate(display.checkOut)} · ${displayTime(display.departureTime, "")}`
                  : "—"}
              </span>
            </div>
            <p className="pt-1">
              {guestCount} {guestCount === 1 ? "guest" : "guests"} ·{" "}
              {quote?.bookingMode === "hourly"
                ? `${quote.durationMinutes / 60} hour stay`
                : `${quote?.nights ?? display?.nights ?? 1} night stay`}
            </p>
          </div>
          <div className="p-5">
            <h3 className="mb-4 text-sm font-bold text-[var(--hk-navy)]">
              Your booking summary
            </h3>
            {quote ? (
              <PriceBreakdown quote={quote} />
            ) : (
              <p role="status" className="text-sm text-[var(--hk-muted)]">
                Preparing your price…
              </p>
            )}
            {!!quote?.customizations.length && (
              <details className="mt-3 border-t border-[var(--hk-border)] pt-1 text-xs">
                <summary className="min-h-11 cursor-pointer py-3 font-semibold text-[var(--hk-navy)]">
                  Selected additions ({selectedCount})
                </summary>
                <div className="max-h-44 space-y-3 overflow-y-auto pb-3">
                  {quote.customizations.map((r) => (
                    <div
                      key={r.id}
                      className="flex justify-between gap-3 text-[var(--hk-muted)]"
                    >
                      <span>
                        {r.name}
                        {r.variantName ? ` · ${r.variantName}` : ""} ×{" "}
                        {r.quantity}
                      </span>
                      <span className="shrink-0">
                        {r.totalPaise
                          ? money(r.totalPaise, quote.currency)
                          : "Free"}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {quote?.cancellationPolicy && (
              <details className="mt-3 text-xs text-[var(--hk-muted)]">
                <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--hk-navy)]">
                  {quote.cancellationPolicy.name} cancellation
                </summary>
                <p className="leading-5">
                  {quote.cancellationPolicy.description}
                  {cancellationDeadline(quote)
                    ? ` Deadline: ${cancellationDeadline(quote)} (${quote.timezone}).`
                    : ""}
                </p>
              </details>
            )}
            {quoteError && (
              <div
                role="alert"
                className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"
              >
                {quoteError}
                <button
                  type="button"
                  onClick={onRetry}
                  className="block min-h-11 font-semibold underline"
                >
                  Refresh price
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={onSubmit}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--hk-navy)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--hk-primary)] disabled:opacity-50"
            >
              {buttonText}
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[var(--hk-muted)]">
              <Lock className="h-3 w-3" />
              Secure booking with Helpkey
            </p>
          </div>
        </div>
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hk-border)] bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(11,31,58,0.06)] lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-[var(--hk-muted)]">
              Pay now
              {selectedCount
                ? ` · ${selectedCount} ${selectedCount === 1 ? "addition" : "additions"}`
                : ""}
            </p>
            <p className="text-lg font-extrabold text-[var(--hk-navy)]">
              {money(quote?.payableNowPaise ?? 0, quote?.currency)}
            </p>
            {quote && quote.balanceDuePaise > 0 && (
              <p className="text-[10px] text-[var(--hk-muted)]">
                {money(quote.balanceDuePaise, quote.currency)} at property
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={onSubmit}
            className="min-h-12 max-w-[65%] rounded-xl bg-[var(--hk-navy)] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </>
  );
}
