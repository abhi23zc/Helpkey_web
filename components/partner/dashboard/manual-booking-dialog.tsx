"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BedDouble,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Info,
  Moon,
  RefreshCw,
  User,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { localParts } from "@/lib/booking/domain";
import {
  eligiblePricing,
  type DurationPrice,
} from "@/lib/booking/duration-pricing";
import { parseCollectionPaise } from "@/lib/partner/reservations/collection-amount";
import type { CreationRoom } from "@/lib/partner/reservations/creation-rooms";
import { useHotelCapabilities } from "./hotel-capabilities";
import { PartnerDatePicker } from "./partner-date-picker";

type Props = {
  open: boolean;
  propertyId?: string;
  propertyName: string;
  onClose: () => void;
  onCreated: (id?: string) => void;
  initialRoomTypeId?: string;
  initialUnitId?: string;
  initialPurpose?: "reservation" | "walk_in";
  initialDate?: string;
};
type Rate = {
  id: string;
  roomTypeId: string;
  name: string;
  status: string;
  bookingMode?: string;
  pricingModel?: string;
  durationPrices?: DurationPrice[];
  basePricePaise?: number;
  taxBasisPoints?: number;
  customerFeePaise?: number;
};
type Choices = {
  property?: {
    timezone?: string;
    checkInTime?: string;
    bookingModes?: string[];
  };
  roomTypes: { id: string; name: string; status?: string }[];
  ratePlans: Rate[];
};
type Quote = {
  subtotalPaise: number;
  totalPaise: number;
  taxBasisPoints: number;
  customerFeePaise: number;
  startAt: string;
  endAt: string;
  timezone: string;
  requestedDurationPriced: boolean;
  durationPrices: DurationPrice[];
  roomOptions?: { rooms: CreationRoom[]; nextCursor: string | null };
  creationFeatures?: { assignment: boolean; collection: boolean };
};
type Saved = {
  bookingId: string;
  confirmationCode: string;
  totalPaise?: number;
  collectedPaise?: number;
  balanceDuePaise?: number;
  physicalUnitLabel?: string | null;
};

const field =
  "w-full rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#061224] shadow-xs placeholder-[#8b96aa] focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c] disabled:bg-[#f8f6f0] disabled:text-[#8b96aa] transition-colors";
const selectField =
  "w-full appearance-none rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2.5 pr-8 text-xs font-semibold text-[#061224] shadow-xs focus:border-[#c89b3c] focus:outline-none focus:ring-1 focus:ring-[#c89b3c] disabled:bg-[#f8f6f0] disabled:text-[#8b96aa] transition-colors";
const button =
  "min-h-10 rounded-xl border border-[#ede7dc] bg-white px-3.5 py-2 text-xs font-bold text-[#061224] shadow-xs hover:bg-[#fbfaf8] hover:border-[#c89b3c] transition-colors disabled:opacity-50";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00Z`) + 86400000).toISOString().slice(0, 10);

const initial = {
  reservationPurpose: "reservation" as "reservation" | "walk_in",
  bookingMode: "overnight" as "overnight" | "hourly",
  checkIn: "",
  checkOut: "",
  arrivalTime: "10:00",
  recordedArrivalTime: "",
  durationMinutes: 0,
  roomTypeId: "",
  ratePlanId: "",
  physicalUnitId: "",
  guestName: "",
  guestPhone: "",
  guestEmail: "",
  adultNames: "",
  childNames: "",
  infantNames: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  adults: 1,
  children: 0,
  infants: 0,
  priceOverride: "",
  negotiatedPriceReason: "",
  payment: "pay_at_property",
  amount: "",
  collectionMethod: "cash",
  collectionReference: "",
  specialRequest: "",
};

function Section({
  number,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  number: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3.5 rounded-2xl border border-[#ede7dc] bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex items-center gap-2.5 border-b border-[#f3efe8] pb-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fbf5e8] text-[#c89b3c] shrink-0">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#061224]">
            {number}. {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-[#8b96aa]">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-[#68758c] space-y-1.5">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {required && (
          <span className="text-[10px] font-bold text-amber-700 lowercase">
            Required
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

export function ManualBookingDialog(props: Props) {
  return props.open ? (
    <CreationDialog
      key={`${props.propertyId}:${props.initialUnitId || "none"}`}
      {...props}
    />
  ) : null;
}

function CreationDialog({
  propertyId,
  propertyName,
  onClose,
  onCreated,
  initialRoomTypeId,
  initialUnitId,
  initialPurpose,
  initialDate,
}: Props) {
  const permits = useHotelCapabilities(),
    client = useQueryClient();
  const [form, setForm] = useState(initial),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [saved, setSaved] = useState<Saved>();
  const [clock, setClock] = useState(() => Date.now()),
    [more, setMore] = useState<{
      scope: string;
      rooms: CreationRoom[];
      next: string | null;
    }>(),
    [loadingMore, setLoadingMore] = useState(false);
  const pending = useRef<{
      body: string;
      key: string;
      uncertain?: boolean;
    } | null>(null),
    inFlight = useRef(false),
    initialized = useRef(false),
    panel = useRef<HTMLDivElement>(null);

  const controls = useRef({
    dirty,
    submitting,
    uncertain,
    saved: !!saved,
    onClose,
  });
  useEffect(() => {
    controls.current = {
      dirty,
      submitting,
      uncertain,
      saved: !!saved,
      onClose,
    };
  }, [dirty, submitting, uncertain, saved, onClose]);

  const close = () => {
    const c = controls.current;
    if (c.submitting) return;
    if (
      !c.saved &&
      (c.dirty || c.uncertain) &&
      !confirm(
        c.uncertain
          ? "This reservation may already be saved. Retry the same request or check reservations before creating another. Close anyway?"
          : "Discard the unfinished reservation?",
      )
    )
      return;
    c.onClose();
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setInterval(() => setClock(Date.now()), 30000);
    const frame = requestAnimationFrame(() =>
      panel.current
        ?.querySelector<HTMLElement>("select, input, button")
        ?.focus(),
    );
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const items = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ) || [],
        ).filter((n) => n.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (
        !controls.current.saved &&
        (controls.current.dirty ||
          controls.current.submitting ||
          controls.current.uncertain)
      )
        e.preventDefault();
    };
    let url = location.href;
    const pop = () => {
      const c = controls.current;
      if (
        !c.saved &&
        (c.dirty || c.submitting || c.uncertain) &&
        !confirm(
          "Leave this unfinished reservation? If submission was interrupted, check reservations before starting again.",
        )
      )
        history.pushState(null, "", url);
      else {
        url = location.href;
        c.onClose();
      }
    };
    document.addEventListener("keydown", key);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", pop);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", pop);
      previous?.focus();
    };
  }, []);

  const choices = useQuery({
    queryKey: ["partner", propertyId, "creation-choices"],
    enabled: !!propertyId,
    queryFn: ({ signal }) =>
      apiFetch<Choices>(`/api/partner/properties/${propertyId}?view=rooms`, {
        signal,
      }),
    refetchOnWindowFocus: false,
  });
  const timezone = choices.data?.property?.timezone || "Asia/Kolkata",
    today = localParts(clock, timezone).date;
  const modes = choices.data?.property?.bookingModes || ["overnight", "hourly"];
  const rooms =
    choices.data?.roomTypes.filter(
      (r) => r.status === undefined || r.status === "active",
    ) || [];
  const rates = (roomId: string, mode: string) =>
    choices.data?.ratePlans.filter(
      (r) =>
        r.roomTypeId === roomId &&
        (r.bookingMode || "overnight") === mode &&
        r.status === "active" &&
        eligiblePricing(r),
    ) || [];

  useEffect(() => {
    if (!choices.data || initialized.current) return;
    const handle = setTimeout(() => {
      if (initialized.current) return;
      initialized.current = true;
      const hotel = choices.data!.property,
        zone = hotel?.timezone || "Asia/Kolkata",
        local = localParts(Date.now(), zone),
        date =
          initialDate ||
          (local.time >= (hotel?.checkInTime || "14:00")
            ? nextDay(local.date)
            : local.date);
      const mode =
        hotel?.bookingModes?.length === 1
          ? (hotel.bookingModes[0] as "overnight" | "hourly")
          : "overnight";
      const availableRooms = choices.data!.roomTypes.filter(
          (r) => r.status === undefined || r.status === "active",
        ),
        roomId =
          initialRoomTypeId ||
          (availableRooms.length === 1 ? availableRooms[0].id : "");
      const eligible = choices.data!.ratePlans.filter(
        (r) =>
          r.roomTypeId === roomId &&
          (r.bookingMode || "overnight") === mode &&
          r.status === "active" &&
          eligiblePricing(r),
      );
      const slot = localParts(
        Math.ceil((Date.now() + 30 * 60000) / 900000) * 900000,
        zone,
      );
      setForm((f) =>
        f.checkIn || f.guestName
          ? f
          : {
              ...f,
              reservationPurpose: initialPurpose || f.reservationPurpose,
              bookingMode: mode,
              checkIn: mode === "hourly" ? slot.date : date,
              checkOut: nextDay(mode === "hourly" ? slot.date : date),
              arrivalTime: mode === "hourly" ? slot.time : f.arrivalTime,
              roomTypeId: roomId,
              physicalUnitId: initialUnitId || "",
              ratePlanId: eligible.length === 1 ? eligible[0].id : "",
              durationMinutes:
                eligible.length === 1 && mode === "hourly"
                  ? (eligible[0].durationPrices?.[0]?.hours || 1) * 60
                  : 60,
            },
      );
    }, 0);
    return () => clearTimeout(handle);
  }, [choices.data]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  }

  function chooseRoom(id: string) {
    const offered = rates(id, form.bookingMode);
    setDirty(true);
    setForm((f) => ({
      ...f,
      roomTypeId: id,
      ratePlanId: offered.length === 1 ? offered[0].id : "",
      durationMinutes:
        offered.length === 1 && f.bookingMode === "hourly"
          ? (offered[0].durationPrices?.[0]?.hours || 1) * 60
          : f.durationMinutes,
      priceOverride: "",
      negotiatedPriceReason: "",
    }));
  }

  const priceRequest = {
    propertyId,
    guestName: "Preview guest",
    reservationPurpose: form.reservationPurpose,
    recordedArrivalTime:
      form.reservationPurpose === "walk_in"
        ? form.recordedArrivalTime
        : undefined,
    bookingMode: form.bookingMode,
    roomTypeId: form.roomTypeId,
    ratePlanId: form.ratePlanId,
    checkIn: form.checkIn,
    checkOut: form.bookingMode === "overnight" ? form.checkOut : undefined,
    arrivalTime: form.arrivalTime,
    durationMinutes: form.durationMinutes || undefined,
    adults: form.adults,
    children: form.children,
    infants: form.infants,
  };
  const scope = JSON.stringify(priceRequest);

  const quote = useQuery({
    queryKey: ["partner", propertyId, "manual-date-price", priceRequest],
    enabled:
      !!propertyId &&
      !!form.ratePlanId &&
      !!form.checkIn &&
      (form.bookingMode === "hourly"
        ? !!form.durationMinutes
        : !!form.checkOut) &&
      !saved &&
      !uncertain,
    queryFn: ({ signal }) =>
      apiFetch<Quote>("/api/partner/bookings/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(priceRequest),
        signal,
      }),
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const rate = choices.data?.ratePlans.find((r) => r.id === form.ratePlanId);
  const subtotal = form.priceOverride
    ? parseCollectionPaise(form.priceOverride)
    : quote.data?.subtotalPaise;
  const tax = Number.isSafeInteger(subtotal)
    ? Number(
        (BigInt(subtotal!) *
          BigInt(quote.data?.taxBasisPoints ?? rate?.taxBasisPoints ?? 0) +
          BigInt(5000)) /
          BigInt(10000),
      )
    : 0;
  const total =
    subtotal == null
      ? 0
      : subtotal +
        tax +
        (quote.data?.customerFeePaise ?? rate?.customerFeePaise ?? 0);
  const collected =
    form.payment === "paid"
      ? total
      : form.payment === "partial"
        ? parseCollectionPaise(form.amount)
        : 0;
  const canCollect =
    permits("payment.collect") &&
    quote.data?.creationFeatures?.collection !== false;
  const canAssign =
    permits("reservation.assign") &&
    quote.data?.creationFeatures?.assignment !== false;

  const loaded = [
    ...(quote.data?.roomOptions?.rooms || []),
    ...(more?.scope === scope ? more.rooms : []),
  ];
  const options = [...new Map(loaded.map((r) => [r.id, r])).values()].sort(
    (a, b) =>
      Number(b.readyNow) - Number(a.readyNow) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  const selected = options.find((r) => r.id === form.physicalUnitId),
    cursor =
      more?.scope === scope ? more.next : quote.data?.roomOptions?.nextCursor;

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const q = await apiFetch<Quote>("/api/partner/bookings/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...priceRequest, roomCursor: cursor }),
      });
      setMore((previous) => ({
        scope,
        rooms: [
          ...(previous?.scope === scope ? previous.rooms : []),
          ...(q.roomOptions?.rooms || []),
        ],
        next: q.roomOptions?.nextCursor || null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load rooms.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const recovering = pending.current?.uncertain === true;
    setError("");
    if (!recovering && !e.currentTarget.reportValidity()) return;
    if (
      !recovering &&
      (form.contactName || form.contactEmail || form.contactPhone) &&
      form.contactName.trim().length < 2
    ) {
      setError(
        "Enter the separate booking contact's name, or clear their contact details.",
      );
      return;
    }
    if (!recovering) {
      if (
        !quote.data ||
        quote.isError ||
        quote.isFetching ||
        quote.data.requestedDurationPriced === false
      ) {
        setError(
          "Wait for an available price and correct any stay errors before saving.",
        );
        return;
      }
      if (!form.guestName.trim() || form.guestName.trim().length < 2) {
        setError("Enter the actual lead staying guest's name.");
        return;
      }
      if (subtotal === null || subtotal === undefined) {
        setError("Enter a valid price with at most two decimal places.");
        return;
      }
      if (
        form.priceOverride &&
        (!permits("rates.manage") ||
          form.negotiatedPriceReason.trim().length < 3)
      ) {
        setError("An agreed price requires pricing permission and a reason.");
        return;
      }
      if (
        collected === null ||
        collected < 0 ||
        collected > total ||
        (form.payment === "partial" && (collected <= 0 || collected >= total))
      ) {
        setError(
          "Enter a partial advance greater than zero and below the total, or choose no/full collection.",
        );
        return;
      }
      if (collected > 0 && !canCollect) {
        setError(
          "Your role or the hotel's payment settings do not permit collecting money. Choose no payment collected.",
        );
        return;
      }
      if (
        collected > 0 &&
        form.collectionMethod !== "cash" &&
        !form.collectionReference.trim()
      ) {
        setError("Enter the UPI or card-terminal reference.");
        return;
      }
      if (form.physicalUnitId && (!canAssign || !selected?.available)) {
        setError(
          "The selected room is no longer available for this stay. Choose another room or explicitly leave it unassigned.",
        );
        return;
      }
      const accompanyingGuests = (
        [
          [form.adultNames, "adult"],
          [form.childNames, "child"],
          [form.infantNames, "infant"],
        ] as const
      ).flatMap(([names, ageGroup]) =>
        names
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name) => ({ name, ageGroup })),
      );
      const body = JSON.stringify({
        ...priceRequest,
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        guestPhone: form.guestPhone,
        accompanyingGuests,
        bookingContact: form.contactName.trim()
          ? {
              name: form.contactName,
              email: form.contactEmail,
              phone: form.contactPhone,
            }
          : undefined,
        initialCollectionPaise: collected,
        paymentMethod: form.payment === "paid" ? "paid" : "pay_at_property",
        collectionMethod: form.collectionMethod,
        collectionReference: form.collectionReference,
        physicalUnitId: form.physicalUnitId || null,
        negotiatedSubtotalPaise: form.priceOverride ? subtotal : undefined,
        negotiatedPriceReason: form.priceOverride
          ? form.negotiatedPriceReason
          : undefined,
        expectedTotalPaise: total,
        expectedStartAt: quote.data.startAt,
        expectedEndAt: quote.data.endAt,
        expectedTimezone: quote.data.timezone,
        specialRequest: form.specialRequest,
      });
      if (pending.current?.body !== body)
        pending.current = { body, key: crypto.randomUUID() };
    }
    if (!pending.current) return;
    inFlight.current = true;
    setSubmitting(true);
    let definitive = false;
    try {
      const response = await fetch("/api/partner/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.current.key,
        },
        body: pending.current.body,
      });
      const b = await response.json();
      if (!response.ok) {
        definitive =
          !recovering && response.status < 500 && response.status !== 408;
        if (!definitive) setUncertain(true);
        else {
          setUncertain(false);
          setMore(undefined);
          void quote.refetch();
        }
        throw new Error(
          typeof b.error === "string"
            ? b.error
            : b.error?.message || "Unable to save reservation.",
        );
      }
      if (
        typeof b.bookingId !== "string" ||
        typeof b.confirmationCode !== "string"
      )
        throw new Error(
          "Submission response was incomplete. Retry the same reservation.",
        );
      definitive = true;
      setSaved(b);
      setDirty(false);
      setUncertain(false);
      await client.invalidateQueries({ queryKey: ["partner", propertyId] });
    } catch (e) {
      if (!definitive) {
        pending.current.uncertain = true;
        setUncertain(true);
        void client.invalidateQueries({ queryKey: ["partner", propertyId] });
      }
      setError(
        e instanceof Error
          ? e.message
          : "Unable to confirm submission. Retry the same request.",
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const locked = submitting || uncertain;
  const moment = (value?: string) =>
    value
      ? new Date(value).toLocaleString("en-IN", {
          timeZone: timezone,
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Choose a valid stay";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Manual Booking"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#061224]/60 backdrop-blur-xs"
        onClick={close}
      />
      <div
        ref={panel}
        className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#ede7dc] bg-[#fbfaf8] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[#ede7dc] bg-white p-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fbf5e8] text-[#c89b3c]">
              <CalendarPlus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#061224]">
                Add Manual Booking
              </h2>
              <p className="text-xs text-[#8b96aa]">
                {propertyName} · {timezone}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={submitting}
            onClick={close}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#ede7dc] bg-white text-[#68758c] hover:bg-[#fbf5e8] hover:text-[#061224] hover:border-[#c89b3c] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Scrollable Form Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {saved ? (
            <div className="space-y-5 py-8 text-center max-w-md mx-auto">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-xl font-bold text-[#061224]">
                  Booking Confirmed!
                </h3>
                <p className="text-xs text-[#68758c] mt-1">
                  The reservation is confirmed, but the guest is not checked in.
                </p>
              </div>
              <div className="rounded-xl border border-[#ede7dc] bg-white p-4 shadow-xs">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b96aa]">
                  Confirmation Code
                </span>
                <p className="font-mono text-2xl font-bold text-[#061224] tracking-wider mt-1">
                  {saved.confirmationCode}
                </p>
              </div>
              <div className="rounded-xl border border-[#f0ece4] bg-[#fdfdfc] p-3.5 text-xs space-y-1.5">
                <p className="font-semibold text-[#061224]">
                  Collected at hotel:{" "}
                  {money(saved.collectedPaise ?? collected ?? 0)} · Remaining:{" "}
                  {money(saved.balanceDuePaise ?? total - (collected || 0))}
                </p>
                <p className="text-[#68758c]">
                  {saved.physicalUnitLabel
                    ? `Assigned room: ${saved.physicalUnitLabel}. Check readiness before explicit check-in.`
                    : "Room unassigned."}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0b1f3a] px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#132c50] transition-colors"
                onClick={() => onCreated(saved.bookingId)}
              >
                View Reservation in Dashboard
              </button>
            </div>
          ) : (
            <form id="mbf" onSubmit={submit} className="space-y-4" noValidate>
              <fieldset
                disabled={locked}
                className="space-y-4 disabled:opacity-80"
              >
                {/* 1. Stay and arrival */}
                <Section
                  number="1"
                  icon={Calendar}
                  title="Stay and arrival"
                  subtitle="Reservation purpose, stay mode, and arrival dates"
                >
                  <Field label="Reservation purpose">
                    <div className="relative">
                      <select
                        aria-label="Reservation purpose"
                        disabled={choices.isPending}
                        className={selectField}
                        value={form.reservationPurpose}
                        onChange={(e) => {
                          const purpose = e.target
                              .value as typeof form.reservationPurpose,
                            now = localParts(Date.now(), timezone);
                          setDirty(true);
                          setForm((f) => ({
                            ...f,
                            reservationPurpose: purpose,
                            ...(purpose === "walk_in"
                              ? {
                                  checkIn: now.date,
                                  checkOut: nextDay(now.date),
                                  recordedArrivalTime: now.time,
                                  arrivalTime: now.time,
                                }
                              : {}),
                          }));
                        }}
                      >
                        <option value="reservation">
                          Future reservation / telephone
                        </option>
                        <option value="walk_in">
                          Guest arriving now — walk-in
                        </option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                    </div>
                  </Field>

                  <div className="flex items-start gap-2 rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-2.5 text-xs text-[#68758c]">
                    <Info className="h-4 w-4 text-[#c89b3c] shrink-0 mt-0.5" />
                    <p>
                      Saving confirms the reservation. Check-in is a separate
                      action. Walk-ins record today's hotel date directly.
                    </p>
                  </div>

                  {/* Stay Mode Segmented Control */}
                  <div className="inline-flex p-1 rounded-xl bg-[#f8f6f0] border border-[#ede7dc]">
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                        form.bookingMode === "overnight"
                          ? "bg-[#0b1f3a] text-white shadow-xs"
                          : "text-[#68758c] hover:text-[#061224] hover:bg-white/80"
                      } disabled:opacity-50`}
                      aria-pressed={form.bookingMode === "overnight"}
                      disabled={!modes.includes("overnight")}
                      onClick={() => {
                        setDirty(true);
                        setForm((f) => ({
                          ...f,
                          bookingMode: "overnight",
                          ratePlanId: "",
                          priceOverride: "",
                        }));
                      }}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      <span>Overnight Stay</span>
                    </button>
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                        form.bookingMode === "hourly"
                          ? "bg-[#0b1f3a] text-white shadow-xs"
                          : "text-[#68758c] hover:text-[#061224] hover:bg-white/80"
                      } disabled:opacity-50`}
                      aria-pressed={form.bookingMode === "hourly"}
                      disabled={!modes.includes("hourly")}
                      onClick={() => {
                        const now = new Date(Date.now() + 30 * 60000),
                          local = localParts(now.getTime(), timezone);
                        const minutes =
                          Math.ceil(Number(local.time.slice(3)) / 15) * 15;
                        const next = localParts(
                          now.getTime() +
                            (minutes - Number(local.time.slice(3))) * 60000,
                          timezone,
                        );
                        setDirty(true);
                        setForm((f) => ({
                          ...f,
                          bookingMode: "hourly",
                          ratePlanId: "",
                          durationMinutes: 60,
                          arrivalTime:
                            f.reservationPurpose === "walk_in"
                              ? f.recordedArrivalTime
                              : next.time,
                          checkIn:
                            f.reservationPurpose === "walk_in"
                              ? f.checkIn
                              : next.date,
                          priceOverride: "",
                        }));
                      }}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>Hourly / Day Use</span>
                    </button>
                  </div>

                  {!modes.includes("hourly") && (
                    <p className="text-xs text-[#8b96aa]">
                      Hourly stays are not offered by this hotel.
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Check-in Date">
                      <PartnerDatePicker
                        aria-label="Check-in date"
                        value={form.checkIn}
                        min={today}
                        timezone={timezone}
                        onChange={(e) => {
                          const newCheckIn = e.target.value;
                          setDirty(true);
                          setForm((f) => {
                            const shouldAdvanceCheckOut =
                              f.bookingMode === "overnight" &&
                              f.checkOut &&
                              f.checkOut <= newCheckIn;
                            return {
                              ...f,
                              checkIn: newCheckIn,
                              ...(shouldAdvanceCheckOut
                                ? { checkOut: nextDay(newCheckIn) }
                                : {}),
                            };
                          });
                        }}
                      />
                    </Field>
                    {form.bookingMode === "overnight" ? (
                      <Field label="Check-out Date">
                        <PartnerDatePicker
                          aria-label="Check-out date"
                          value={form.checkOut}
                          min={form.checkIn || today}
                          timezone={timezone}
                          onChange={(e) => set("checkOut", e.target.value)}
                        />
                      </Field>
                    ) : (
                      <Field label="Arrival time">
                        <input
                          type="time"
                          className={field}
                          step={900}
                          value={form.arrivalTime}
                          disabled={form.reservationPurpose === "walk_in"}
                          onChange={(e) => set("arrivalTime", e.target.value)}
                        />
                      </Field>
                    )}
                  </div>

                  {form.reservationPurpose === "walk_in" && (
                    <Field label={`Recorded arrival time (${today})`}>
                      <input
                        type="time"
                        className={field}
                        value={form.recordedArrivalTime}
                        onChange={(e) => {
                          setDirty(true);
                          setForm((f) => ({
                            ...f,
                            recordedArrivalTime: e.target.value,
                            arrivalTime: e.target.value,
                          }));
                        }}
                      />
                    </Field>
                  )}
                </Section>

                {/* 2. Room, rate and optional room number */}
                <Section
                  number="2"
                  icon={BedDouble}
                  title="Room, rate and optional room number"
                  subtitle="Category selection, pricing, and live room allocation"
                >
                  {choices.isPending && (
                    <p role="status" className="text-xs text-[#8b96aa]">
                      Loading hotel rooms and rates…
                    </p>
                  )}
                  {choices.isError && (
                    <div
                      role="alert"
                      className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                    >
                      <span>Unable to load hotel choices.</span>
                      <button
                        type="button"
                        className="font-bold underline"
                        onClick={() => void choices.refetch()}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Room category">
                      <div className="relative">
                        <select
                          aria-label="Room category"
                          className={selectField}
                          value={form.roomTypeId}
                          onChange={(e) => chooseRoom(e.target.value)}
                        >
                          <option value="">Choose room type</option>
                          {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                      </div>
                    </Field>
                    <Field label="Published rate">
                      <div className="relative">
                        <select
                          aria-label="Published rate"
                          className={selectField}
                          value={form.ratePlanId}
                          onChange={(e) => {
                            const r = choices.data?.ratePlans.find(
                              (r) => r.id === e.target.value,
                            );
                            setDirty(true);
                            setForm((f) => ({
                              ...f,
                              ratePlanId: e.target.value,
                              durationMinutes:
                                f.bookingMode === "hourly"
                                  ? (r?.durationPrices?.[0]?.hours || 1) * 60
                                  : f.durationMinutes,
                              priceOverride: "",
                              negotiatedPriceReason: "",
                            }));
                          }}
                        >
                          <option value="">Choose rate</option>
                          {rates(form.roomTypeId, form.bookingMode).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                      </div>
                    </Field>
                  </div>

                  {form.roomTypeId &&
                    !rates(form.roomTypeId, form.bookingMode).length && (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                        No eligible published rate for this room type and stay
                        mode.
                      </p>
                    )}

                  {form.bookingMode === "hourly" && (
                    <Field label="Duration">
                      <div className="relative">
                        <select
                          className={selectField}
                          value={form.durationMinutes}
                          onChange={(e) =>
                            set("durationMinutes", Number(e.target.value))
                          }
                        >
                          <option value={0}>Choose duration</option>
                          {(
                            quote.data?.durationPrices ||
                            rate?.durationPrices ||
                            []
                          ).map((r) => (
                            <option key={r.hours} value={r.hours * 60}>
                              {r.hours} hours · {money(r.pricePaise)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                      </div>
                    </Field>
                  )}

                  {quote.isFetching && (
                    <div
                      role="status"
                      className="flex items-center gap-2 text-xs font-semibold text-[#8b96aa]"
                    >
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#c89b3c]" />
                      <span>Checking hotel availability and price…</span>
                    </div>
                  )}

                  {quote.isError && !uncertain && (
                    <div
                      role="alert"
                      className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                    >
                      <span>{quote.error.message}</span>
                      <button
                        type="button"
                        className="font-bold underline"
                        onClick={() => void quote.refetch()}
                      >
                        Retry availability
                      </button>
                    </div>
                  )}

                  {/* Physical room with compact inline refresh */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#68758c]">
                        Physical room
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-[#ede7dc] bg-[#fbfaf8] px-2.5 py-1 text-[11px] font-semibold text-[#68758c] hover:bg-[#fbf5e8] hover:text-[#061224] hover:border-[#c89b3c] transition-colors disabled:opacity-50"
                        disabled={quote.isFetching}
                        onClick={() => {
                          setMore(undefined);
                          void quote.refetch();
                        }}
                      >
                        <RefreshCw
                          className={`h-3 w-3 text-[#c89b3c] ${
                            quote.isFetching ? "animate-spin" : ""
                          }`}
                        />
                        <span>Refresh room availability</span>
                      </button>
                    </div>

                    <div className="relative">
                      <select
                        aria-label="Physical room"
                        className={selectField}
                        value={form.physicalUnitId}
                        disabled={!canAssign || !quote.data || quote.isError}
                        onChange={(e) => set("physicalUnitId", e.target.value)}
                      >
                        <option value="">Leave unassigned</option>
                        {form.physicalUnitId && !selected && (
                          <option value={form.physicalUnitId}>
                            Previous selection — recheck or leave unassigned
                          </option>
                        )}
                        {options.map((r) => (
                          <option
                            key={r.id}
                            value={r.id}
                            disabled={!r.available}
                          >
                            {r.label} · {r.housekeeping} ·{" "}
                            {r.readyNow
                              ? "Ready now"
                              : r.occupiedNow
                                ? "Occupied now"
                                : "Vacant now"}
                            {!r.available ? " · Unavailable for stay" : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                    </div>

                    {!canAssign && (
                      <p className="text-xs text-[#8b96aa]">
                        Room assignment requires permission and the hotel’s
                        allocation feature. You can leave the reservation
                        unassigned.
                      </p>
                    )}
                    {form.reservationPurpose === "reservation" && (
                      <p className="text-xs text-[#8b96aa]">
                        Availability covers the complete requested stay and
                        turnover. Current cleanliness or occupancy does not
                        guarantee readiness on the arrival date.
                      </p>
                    )}
                  </div>

                  {selected?.reason && (
                    <p
                      role="status"
                      className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                    >
                      Room {selected.label}: {selected.reason}
                    </p>
                  )}

                  {options.some((r) => !r.available) && (
                    <details className="group rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs transition-colors">
                      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#061224]">
                        <span>Why some rooms are unavailable</span>
                        <ChevronDown
                          size={14}
                          className="text-[#8b96aa] transition-transform duration-200 group-open:rotate-180"
                        />
                      </summary>
                      <div className="pt-2.5 space-y-1 text-[#68758c]">
                        {options
                          .filter((r) => !r.available)
                          .map((r) => (
                            <p key={r.id}>
                              <strong className="text-[#061224]">{r.label}</strong>: {r.reason}
                            </p>
                          ))}
                      </div>
                    </details>
                  )}

                  {cursor && (
                    <button
                      type="button"
                      className={button}
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                    >
                      Load more room numbers
                    </button>
                  )}
                </Section>

                {/* 3. Staying guests and booking contact */}
                <Section
                  number="3"
                  icon={Users}
                  title="Staying guests and booking contact"
                  subtitle="Guest headcount, lead guest, and optional booking contact"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["adults", "Adults", 1, 12],
                        ["children", "Children", 0, 10],
                        ["infants", "Infants", 0, 10],
                      ] as const
                    ).map(([key, label, min, max]) => (
                      <Field key={key} label={label}>
                        <input
                          className={field}
                          aria-label={label}
                          type="number"
                          min={min}
                          max={max}
                          value={form[key]}
                          onChange={(e) => set(key, Number(e.target.value))}
                        />
                      </Field>
                    ))}
                  </div>

                  <Field label="Lead staying guest" required>
                    <input
                      aria-label="Guest name"
                      className={field}
                      value={form.guestName}
                      maxLength={120}
                      required
                      placeholder="Full legal name of lead staying guest"
                      onChange={(e) => set("guestName", e.target.value)}
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Guest phone">
                      <input
                        className={field}
                        value={form.guestPhone}
                        maxLength={25}
                        placeholder="+91..."
                        onChange={(e) => set("guestPhone", e.target.value)}
                      />
                    </Field>
                    <Field label="Guest email">
                      <input
                        type="email"
                        className={field}
                        value={form.guestEmail}
                        placeholder="guest@example.com"
                        onChange={(e) => set("guestEmail", e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label="Accompanying adult names — one per line">
                    <textarea
                      aria-label="Accompanying adult names — one per line"
                      className={`${field} min-h-[64px]`}
                      value={form.adultNames}
                      placeholder="One name per line (optional for single occupants)"
                      onChange={(e) => set("adultNames", e.target.value)}
                    />
                  </Field>

                  {(form.children > 0 ||
                    form.infants > 0 ||
                    !!form.childNames ||
                    !!form.infantNames) && (
                    <details className="group rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs transition-colors">
                      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#061224]">
                        <span>Child and infant names (optional now)</span>
                        <ChevronDown
                          size={14}
                          className="text-[#8b96aa] transition-transform duration-200 group-open:rotate-180"
                        />
                      </summary>
                      <div className="pt-3 space-y-3">
                        <Field label="Child names — one per line">
                          <textarea
                            className={`${field} min-h-[56px]`}
                            value={form.childNames}
                            placeholder="One child name per line"
                            onChange={(e) => set("childNames", e.target.value)}
                          />
                        </Field>
                        <Field label="Infant names — one per line">
                          <textarea
                            className={`${field} min-h-[56px]`}
                            value={form.infantNames}
                            placeholder="One infant name per line"
                            onChange={(e) => set("infantNames", e.target.value)}
                          />
                        </Field>
                      </div>
                    </details>
                  )}

                  <details className="group rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs transition-colors">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#061224]">
                      <span>Someone else made this booking</span>
                      <ChevronDown
                        size={14}
                        className="text-[#8b96aa] transition-transform duration-200 group-open:rotate-180"
                      />
                    </summary>
                    <div className="pt-3 space-y-3">
                      <Field label="Booking contact name">
                        <input
                          className={field}
                          value={form.contactName}
                          placeholder="Name of booker or company"
                          onChange={(e) => set("contactName", e.target.value)}
                        />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Booking contact email">
                          <input
                            type="email"
                            className={field}
                            value={form.contactEmail}
                            placeholder="booker@company.com"
                            onChange={(e) =>
                              set("contactEmail", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Booking contact phone">
                          <input
                            className={field}
                            value={form.contactPhone}
                            placeholder="+91..."
                            onChange={(e) =>
                              set("contactPhone", e.target.value)
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </details>
                </Section>

                {/* 4. Hotel collection and review */}
                <Section
                  number="4"
                  icon={CreditCard}
                  title="Hotel collection and review"
                  subtitle="Advance collection, negotiated pricing, and estimated total"
                >
                  <Field label="Payment status">
                    <div className="relative">
                      <select
                        aria-label="Payment status"
                        className={selectField}
                        value={form.payment}
                        onChange={(e) => set("payment", e.target.value)}
                      >
                        <option value="pay_at_property">
                          No payment collected
                        </option>
                        <option value="partial" disabled={!canCollect}>
                          Partial advance collected at hotel
                        </option>
                        <option value="paid" disabled={!canCollect}>
                          Full amount collected at hotel
                        </option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                    </div>
                  </Field>

                  {!canCollect && (
                    <p className="text-xs text-[#8b96aa]">
                      Your role or the hotel’s settings do not permit
                      collections. Save unpaid; an authorized manager or cashier
                      can record collection.
                    </p>
                  )}

                  {form.payment === "partial" && (
                    <Field label="Advance amount (₹)">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8b96aa]">
                          ₹
                        </span>
                        <input
                          className={`${field} pl-8`}
                          inputMode="decimal"
                          value={form.amount}
                          onChange={(e) => set("amount", e.target.value)}
                          placeholder="e.g. 500.00"
                        />
                      </div>
                    </Field>
                  )}

                  {form.payment !== "pay_at_property" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Payment method">
                        <div className="relative">
                          <select
                            aria-label="Payment method"
                            className={selectField}
                            value={form.collectionMethod}
                            onChange={(e) =>
                              set("collectionMethod", e.target.value)
                            }
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI collected at hotel</option>
                            <option value="card_terminal">
                              Hotel card terminal
                            </option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b96aa]" />
                        </div>
                      </Field>
                      <Field label="Collection reference">
                        <input
                          className={field}
                          maxLength={180}
                          value={form.collectionReference}
                          onChange={(e) =>
                            set("collectionReference", e.target.value)
                          }
                          placeholder={
                            form.collectionMethod === "cash"
                              ? "Optional receipt note"
                              : "Required UPI / terminal reference"
                          }
                        />
                      </Field>
                    </div>
                  )}

                  {permits("rates.manage") && (
                    <details className="group rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs transition-colors">
                      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#061224]">
                        <span>Agree a different room price</span>
                        <ChevronDown
                          size={14}
                          className="text-[#8b96aa] transition-transform duration-200 group-open:rotate-180"
                        />
                      </summary>
                      <div className="pt-3 space-y-3">
                        <Field label="Agreed room subtotal (₹)">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8b96aa]">
                              ₹
                            </span>
                            <input
                              className={`${field} pl-8`}
                              inputMode="decimal"
                              value={form.priceOverride}
                              onChange={(e) =>
                                set("priceOverride", e.target.value)
                              }
                              placeholder="Leave blank for published price"
                            />
                          </div>
                        </Field>
                        <Field label="Price adjustment reason">
                          <input
                            className={field}
                            value={form.negotiatedPriceReason}
                            placeholder="Reason for agreed price"
                            onChange={(e) =>
                              set("negotiatedPriceReason", e.target.value)
                            }
                          />
                        </Field>
                      </div>
                    </details>
                  )}

                  <details className="group rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3 text-xs transition-colors">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#061224]">
                      <span>Special requests and notes</span>
                      <ChevronDown
                        size={14}
                        className="text-[#8b96aa] transition-transform duration-200 group-open:rotate-180"
                      />
                    </summary>
                    <div className="pt-3">
                      <textarea
                        aria-label="Special requests"
                        className={`${field} min-h-[64px]`}
                        maxLength={1000}
                        value={form.specialRequest}
                        placeholder="Internal staff note or guest special request"
                        onChange={(e) => set("specialRequest", e.target.value)}
                      />
                    </div>
                  </details>

                  {/* Clean Live Price Breakdown Card */}
                  <div className="rounded-xl border border-[#ede7dc] bg-[#fbfaf8] p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[#68758c]">
                      <span>Room Subtotal</span>
                      <span className="font-semibold text-[#061224]">
                        {money(subtotal ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#68758c]">
                      <span>Taxes</span>
                      <span className="font-semibold text-[#061224]">
                        {money(tax)}
                      </span>
                    </div>
                    {(quote.data?.customerFeePaise ??
                      rate?.customerFeePaise ??
                      0) > 0 && (
                      <div className="flex items-center justify-between text-[#68758c]">
                        <span>Fees</span>
                        <span className="font-semibold text-[#061224]">
                          {money(
                            quote.data?.customerFeePaise ??
                              rate?.customerFeePaise ??
                              0,
                          )}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-[#ede7dc] pt-2 flex items-center justify-between font-bold text-[#061224]">
                      <span>Total Estimated Stay</span>
                      <span className="text-sm">{money(total)}</span>
                    </div>
                    <p className="text-[10px] text-[#8b96aa] pt-0.5">
                      Tax {money(tax)} · Fees{" "}
                      {money(
                        quote.data?.customerFeePaise ??
                          rate?.customerFeePaise ??
                          0,
                      )}
                    </p>
                  </div>
                </Section>
              </fieldset>
            </form>
          )}
        </div>

        {/* Pinned Error / Status Alerts */}
        {error && (
          <div
            role="alert"
            className="mx-4 sm:mx-6 mb-2 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 shrink-0"
          >
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">Please check your inputs</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {uncertain && (
          <div
            role="status"
            className="mx-4 sm:mx-6 mb-2 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shrink-0"
          >
            <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Submission Pending Confirmation</p>
              <p>
                Submission was not confirmed and may already be saved. Your
                exact request is locked for a safe retry; do not start another
                booking for this guest.
              </p>
            </div>
          </div>
        )}

        {/* Pinned Bottom Sticky Footer */}
        {!saved && (
          <footer className="shrink-0 space-y-2.5 border-t border-[#ede7dc] bg-white p-4 sm:px-6">
            <div
              className="flex items-center gap-2 text-xs text-[#68758c]"
              aria-live="polite"
            >
              <Info className="h-3.5 w-3.5 text-[#c89b3c] shrink-0" />
              <span className="truncate">
                Review occupancy:{" "}
                {quote.data?.startAt && quote.data?.endAt ? (
                  <>
                    <strong className="text-[#061224]">
                      {moment(quote.data.startAt)}
                    </strong>{" "}
                    →{" "}
                    <strong className="text-[#061224]">
                      {moment(quote.data.endAt)}
                    </strong>{" "}
                    ({timezone}).{" "}
                  </>
                ) : (
                  <>
                    Select dates and room to review stay interval ({timezone}).{" "}
                  </>
                )}
                {form.bookingMode === "overnight"
                  ? "Full calendar-night pricing applies."
                  : "Hourly duration pricing applies."}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs">
                <div className="text-sm font-bold text-[#061224]">
                  Total: {money(total)}
                </div>
                <div className="text-[#68758c] mt-0.5">
                  Collected at hotel:{" "}
                  <strong className="text-[#061224]">
                    {money(collected ?? 0)}
                  </strong>{" "}
                  · Remaining:{" "}
                  <strong
                    className={
                      total - (collected || 0) > 0
                        ? "text-amber-800"
                        : "text-emerald-700"
                    }
                  >
                    {money(Math.max(0, total - (collected || 0)))}
                  </strong>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#ede7dc] bg-white px-4 py-2 text-xs font-semibold text-[#061224] shadow-xs hover:bg-[#fbfaf8] transition-colors"
                  disabled={submitting}
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  aria-label="Create Booking"
                  form="mbf"
                  type="submit"
                  disabled={submitting || !propertyId}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0b1f3a] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#132c50] transition-colors disabled:opacity-50"
                >
                  <CalendarPlus className="h-4 w-4 text-[#c89b3c]" />
                  <span>
                    {submitting
                      ? "Saving…"
                      : uncertain
                        ? "Retry same reservation"
                        : "Create Booking"}
                  </span>
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
