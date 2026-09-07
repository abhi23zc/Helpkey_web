"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BedDouble,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Headphones,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { PartnerShell } from "./partner-shell";
import { Drawer } from "./drawer";

type Booking = {
  id: string;
  confirmationCode: string;
  propertyName: string;
  roomName: string;
  ratePlanName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  totalPaise: number;
  payableNowPaise: number;
  paidPaise: number;
  currency: string;
  bookingStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  leadGuest: { name?: string; email?: string; phone?: string; adultGuestNames?: string[] } | null;
  specialRequest: string | null;
  createdAt: string | null;
};

type StatusId = "all" | "arrivals" | "in_house" | "upcoming" | "pending_payment" | "cancelled" | "no_show";
type ActionStatus = "checked_in" | "completed" | "no_show" | "cancelled";

const statusTabs: Array<{ id: StatusId; label: string }> = [
  { id: "all", label: "All" },
  { id: "arrivals", label: "Arriving Today" },
  { id: "in_house", label: "In House" },
  { id: "upcoming", label: "Upcoming" },
  { id: "pending_payment", label: "Pending Payment" },
  { id: "cancelled", label: "Cancelled" },
  { id: "no_show", label: "No-show Risk" },
];

const closedStatuses = new Set(["cancelled", "expired", "payment_failed"]);
const activeStatuses = new Set(["pending_payment", "confirmed", "checked_in"]);

const money = (value: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);

const sentenceLabel = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getTodayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const formatShortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });

const formatFullDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

function isArrivalToday(booking: Booking, today: string) {
  return booking.checkIn === today && ["confirmed", "checked_in"].includes(booking.bookingStatus);
}

function isStayingTonight(booking: Booking, today: string) {
  return booking.checkIn <= today && booking.checkOut > today && ["confirmed", "checked_in"].includes(booking.bookingStatus);
}

function isNoShowRisk(booking: Booking, today: string) {
  return booking.checkIn < today && booking.bookingStatus === "confirmed";
}

export function PartnerReservationsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) => (
        <PartnerReservations
          propertyId={selectedProperty?.id}
          propertyName={selectedProperty?.name ?? "Selected property"}
        />
      )}
    </PartnerShell>
  );
}

function PartnerReservations({ propertyId, propertyName }: { propertyId?: string; propertyName: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusId>("all");
  const [roomFilter, setRoomFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignedRooms, setAssignedRooms] = useState<Record<string, string>>({});

  const today = useMemo(() => getTodayKey(), []);

  const load = useCallback(async () => {
    if (!propertyId) {
      setBookings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ propertyId, status: "all", q: query });
      const response = await fetch(`/api/partner/bookings?${params}`, { cache: "no-store" });
      const body = (await response.json()) as { bookings?: Booking[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load reservations.");
      setBookings(body.bookings ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load reservations.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, query]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    if (!inspectorOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspectorOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [inspectorOpen]);

  const rooms = useMemo(() => {
    return Array.from(new Set(bookings.map((booking) => booking.roomName).filter(Boolean))).sort();
  }, [bookings]);

  const metrics = useMemo(() => {
    const arrivals = bookings.filter((booking) => isArrivalToday(booking, today)).length;
    const departures = bookings.filter(
      (booking) => booking.checkOut === today && ["checked_in", "completed"].includes(booking.bookingStatus)
    ).length;
    const staying = bookings.filter((booking) => isStayingTonight(booking, today)).length;
    const pendingRequests = bookings.filter((booking) => Boolean(booking.specialRequest)).length;
    const noShowRisk = bookings.filter((booking) => isNoShowRisk(booking, today)).length;

    return { arrivals, departures, staying, pendingRequests, noShowRisk };
  }, [bookings, today]);

  const tabCounts = useMemo<Record<StatusId, number>>(
    () => ({
      all: bookings.length,
      arrivals: bookings.filter((booking) => isArrivalToday(booking, today)).length,
      in_house: bookings.filter((booking) => booking.bookingStatus === "checked_in").length,
      upcoming: bookings.filter((booking) => booking.checkIn > today && activeStatuses.has(booking.bookingStatus)).length,
      pending_payment: bookings.filter((booking) => booking.bookingStatus === "pending_payment").length,
      cancelled: bookings.filter((booking) => closedStatuses.has(booking.bookingStatus)).length,
      no_show: bookings.filter((booking) => booking.bookingStatus === "no_show" || isNoShowRisk(booking, today)).length,
    }),
    [bookings, today]
  );

  const filtered = useMemo(() => {
    return bookings.filter((booking) => {
      const matchesStatus =
        status === "all" ||
        (status === "arrivals" && isArrivalToday(booking, today)) ||
        (status === "in_house" && booking.bookingStatus === "checked_in") ||
        (status === "upcoming" && booking.checkIn > today && activeStatuses.has(booking.bookingStatus)) ||
        (status === "pending_payment" && booking.bookingStatus === "pending_payment") ||
        (status === "cancelled" && closedStatuses.has(booking.bookingStatus)) ||
        (status === "no_show" && (booking.bookingStatus === "no_show" || isNoShowRisk(booking, today)));

      const matchesRoom = roomFilter === "all" || booking.roomName === roomFilter;
      const matchesPayment = paymentFilter === "all" || booking.paymentStatus === paymentFilter;
      return matchesStatus && matchesRoom && matchesPayment;
    });
  }, [bookings, paymentFilter, roomFilter, status, today]);

  const selectedBooking = useMemo(() => {
    return filtered.find((booking) => booking.id === selectedId) ?? filtered[0] ?? null;
  }, [filtered, selectedId]);

  const dateRangeLabel = useMemo(() => {
    if (!filtered.length) return "No stays in view";
    const sorted = [...filtered].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return `${formatShortDate(sorted[0].checkIn)} – ${formatShortDate(sorted[sorted.length - 1].checkOut)}`;
  }, [filtered]);

  const updateStatus = async (bookingId: string, nextStatus: ActionStatus) => {
    setBusy(bookingId);
    setError("");
    try {
      const response = await fetch(`/api/partner/bookings/${bookingId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to update reservation.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update reservation.");
    } finally {
      setBusy(null);
    }
  };

  const selectReservation = (bookingId: string) => {
    setSelectedId(bookingId);
    setInspectorOpen(true);
  };

  const exportCsv = () => {
    const header = ["Booking ID", "Guest", "Room Type", "Stay Dates", "Guests", "Payment", "Status", "Total"];
    const rows = filtered.map((booking) => [
      booking.confirmationCode,
      booking.leadGuest?.name ?? "Guest",
      booking.roomName,
      `${booking.checkIn} to ${booking.checkOut}`,
      String(booking.adults + booking.children),
      sentenceLabel(booking.paymentStatus),
      sentenceLabel(booking.bookingStatus),
      money(booking.totalPaise, booking.currency),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `helpkey-reservations-${today}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-5 pt-1">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#e4ded2] bg-white px-5 py-4 shadow-[0_8px_28px_rgba(6,18,36,0.04)] xl:flex-row xl:items-center">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.035em] text-[#061224]">Reservations</h1>
          <p className="mt-1 text-sm font-medium text-[#5f6b82]">
            {propertyName} · Manage arrivals, guest requests, payments and booking changes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#061224] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#0b1f3a]"
          >
            <Plus className="h-4 w-4" />
            Add Manual Booking
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4ded2] bg-white px-4 text-xs font-semibold text-[#061224] hover:border-[#c89b3c] hover:bg-[#fbf5e8]"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4ded2] bg-white px-4 text-xs font-semibold text-[#061224] hover:border-[#c89b3c] hover:bg-[#fbf5e8] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Sync Calendar
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={CalendarCheck2} label="Arrivals Today" value={metrics.arrivals} note="Ready for check-in" tone="gold" />
        <KpiCard icon={CalendarDays} label="Departures Today" value={metrics.departures} note="Expected check-outs" tone="red" />
        <KpiCard icon={BedDouble} label="Staying Tonight" value={metrics.staying} note="Live occupied stays" tone="blue" />
        <KpiCard icon={ShieldCheck} label="Pending Requests" value={metrics.pendingRequests} note="Guest notes to review" tone="amber" />
        <KpiCard icon={AlertTriangle} label="No-show Risk" value={metrics.noShowRisk} note={metrics.noShowRisk ? "High attention" : "No risk flagged"} tone="warning" />
      </div>

      <div className="rounded-2xl border border-[#e4ded2] bg-white p-3 shadow-[0_8px_28px_rgba(6,18,36,0.05)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_88px]">
          <FilterBox label="Date Range" value={dateRangeLabel} icon={CalendarDays} />
          <SelectBox label="Reservation Status" value={status} onChange={(value) => setStatus(value as StatusId)}>
            {statusTabs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </SelectBox>
          <SelectBox label="Room Type" value={roomFilter} onChange={setRoomFilter}>
            <option value="all">All Room Types</option>
            {rooms.map((room) => (
              <option key={room} value={room}>
                {room}
              </option>
            ))}
          </SelectBox>
          <SelectBox label="Payment Status" value={paymentFilter} onChange={setPaymentFilter}>
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="pay_at_property">Pay at Property</option>
            <option value="failed">Failed</option>
          </SelectBox>
          <button
            type="button"
            onClick={() => {
              setStatus("all");
              setRoomFilter("all");
              setPaymentFilter("all");
              setQuery("");
            }}
            className="inline-flex h-[54px] items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-4 text-xs font-semibold text-blue-700 hover:bg-blue-100 lg:self-end"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e4ded2] bg-white shadow-[0_8px_28px_rgba(6,18,36,0.05)]">
        <div className="border-b border-[#ede7dc] p-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reservations, guests, booking ID..."
              className="h-12 w-full rounded-xl border border-[#e4ded2] bg-[#fbfbff] pl-11 pr-16 text-sm font-medium text-[#061224] outline-none focus:border-[#061224] focus:ring-2 focus:ring-[#061224]/10"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-[#e4ded2] bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                ⌘K
              </span>
            )}
          </label>
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatus(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  status === tab.id
                    ? "border-[#061224] bg-[#061224] text-white"
                    : "border-[#e4ded2] bg-white text-[#4d5870] hover:border-[#c89b3c] hover:bg-[#fbf5e8] hover:text-[#061224]"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${status === tab.id ? "bg-[#f4d58b] text-[#061224]" : "bg-[#eef2ff] text-[#061224]"}`}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="min-w-0">
            {loading ? (
              <ReservationSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <ReservationTable
                bookings={filtered}
                selectedId={selectedBooking?.id ?? null}
                busy={busy}
                onSelect={selectReservation}
                onUpdate={updateStatus}
              />
            )}
        </div>
      </div>

      <BookingInspector
        open={inspectorOpen}
        booking={selectedBooking}
        today={today}
        assignedRoom={selectedBooking ? assignedRooms[selectedBooking.id] ?? "1205" : "1205"}
        onAssignRoom={(room) => {
          if (!selectedBooking) return;
          setAssignedRooms((prev) => ({ ...prev, [selectedBooking.id]: room }));
        }}
        busy={selectedBooking ? busy === selectedBooking.id : false}
        onUpdate={updateStatus}
        onClose={() => setInspectorOpen(false)}
      />
    </section>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof CalendarCheck2;
  label: string;
  value: number;
  note: string;
  tone: "gold" | "red" | "blue" | "amber" | "warning";
}) {
  const tones = {
    gold: "bg-[#fbf0d8] text-[#b8821f] ring-[#f0cf88]",
    red: "bg-red-50 text-red-600 ring-red-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    warning: "bg-[#fff4d8] text-[#d08a00] ring-[#f0cf88]",
  };

  return (
    <article className="min-h-[124px] rounded-2xl border border-[#e4ded2] bg-white p-4 shadow-[0_8px_28px_rgba(6,18,36,0.04)]">
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="max-w-[130px] text-[12px] font-semibold uppercase leading-tight tracking-[0.04em] text-[#34415a]">{label}</p>
          <p className="mt-1 text-3xl font-bold leading-none tracking-[-0.04em] text-[#061224]">{value}</p>
        </div>
        </div>
        <p className={`text-xs font-medium ${tone === "warning" && value ? "text-red-600" : "text-[#66738b]"}`}>
          {note}
        </p>
      </div>
    </article>
  );
}

function FilterBox({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CalendarDays }) {
  return (
    <div className="rounded-xl border border-[#e4ded2] bg-white px-3 py-2">
      <p className="text-[11px] font-medium text-[#4d5870]">{label}</p>
      <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#061224]">
        <Icon className="h-4 w-4 text-[#8b96aa]" />
        <span className="truncate">{value}</span>
        <ChevronDown className="ml-auto h-4 w-4 text-[#8b96aa]" />
      </div>
    </div>
  );
}

function SelectBox({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="rounded-xl border border-[#e4ded2] bg-white px-3 py-2">
      <span className="block text-[11px] font-medium text-[#4d5870]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm font-semibold text-[#061224] outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function ReservationTable({
  bookings,
  selectedId,
  busy,
  onSelect,
  onUpdate,
}: {
  bookings: Booking[];
  selectedId: string | null;
  busy: string | null;
  onSelect: (id: string) => void;
  onUpdate: (bookingId: string, status: ActionStatus) => void;
}) {
  return (
    <div>
      <div className="hidden grid-cols-[1.08fr_1.15fr_1fr_0.78fr_0.82fr_0.58fr] border-b border-[#ede7dc] bg-[#fbfbff] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#4d5870] lg:grid">
        <span>Booking</span>
        <span>Guest</span>
        <span>Stay</span>
        <span>Payment</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-[#ede7dc] lg:block">
        {bookings.map((booking) => (
          <ReservationRow
            key={booking.id}
            booking={booking}
            selected={booking.id === selectedId}
            busy={busy === booking.id}
            onSelect={() => onSelect(booking.id)}
            onUpdate={onUpdate}
          />
        ))}
      </div>
      <div className="flex flex-col gap-3 border-t border-[#ede7dc] px-4 py-4 text-xs font-semibold text-[#4d5870] sm:flex-row sm:items-center sm:justify-between">
        <span>Showing 1 to {bookings.length} of {bookings.length} reservations</span>
        <div className="flex items-center gap-2">
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#e4ded2] bg-white text-[#8b96aa]" type="button">‹</button>
          <button className="grid h-8 w-8 place-items-center rounded-lg bg-[#061224] text-white" type="button">1</button>
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#e4ded2] bg-white text-[#061224]" type="button">2</button>
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#e4ded2] bg-white text-[#8b96aa]" type="button">›</button>
        </div>
      </div>
    </div>
  );
}

function ReservationRow({
  booking,
  selected,
  busy,
  onSelect,
  onUpdate,
}: {
  booking: Booking;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onUpdate: (bookingId: string, status: ActionStatus) => void;
}) {
  const guestName = booking.leadGuest?.name ?? "Guest";
  const guests = booking.adults + booking.children;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
      className={`mx-3 my-3 grid cursor-pointer gap-3 rounded-xl border border-[#e4ded2] px-4 py-4 text-sm shadow-sm outline-none transition hover:bg-[#fbf5e8]/45 lg:m-0 lg:grid-cols-[1.08fr_1.15fr_1fr_0.78fr_0.82fr_0.58fr] lg:items-center lg:rounded-none lg:border-0 lg:shadow-none ${
        selected ? "bg-[#fffaf0] ring-1 ring-inset ring-[#c89b3c]" : "bg-white"
      }`}
    >
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b96aa] lg:hidden">Booking</p>
        <p className="break-words font-semibold leading-tight text-[#061224]">{booking.confirmationCode}</p>
        <p className="mt-1 text-xs font-normal text-[#68758c]">{booking.roomName}</p>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b96aa] lg:hidden">Guest</p>
        <p className="font-semibold text-[#061224]">{guestName}</p>
        <p className="mt-1 break-words text-xs font-normal text-[#68758c]">
          {guests} guest{guests === 1 ? "" : "s"}
          {booking.leadGuest?.phone ? ` · ${booking.leadGuest.phone}` : ""}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b96aa] lg:hidden">Stay</p>
        <p className="font-semibold text-[#061224]">{formatShortDate(booking.checkIn)} – {formatShortDate(booking.checkOut)}</p>
        <p className="text-xs font-normal text-[#68758c]">
          {booking.nights} night{booking.nights === 1 ? "" : "s"} · {booking.ratePlanName}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b96aa] lg:hidden">Payment</p>
        <PaymentBadge value={booking.paymentStatus} />
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b96aa] lg:hidden">Status</p>
        <StatusBadge value={booking.bookingStatus} />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[#ede7dc] pt-3 lg:border-t-0 lg:pt-0">
        <InlineActions booking={booking} busy={busy} onUpdate={onUpdate} />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[#e4ded2] bg-white text-[#061224] hover:border-[#c89b3c]"
          aria-label="Open reservation details"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InlineActions({
  booking,
  busy,
  onUpdate,
}: {
  booking: Booking;
  busy: boolean;
  onUpdate: (bookingId: string, status: ActionStatus) => void;
}) {
  if (booking.bookingStatus === "confirmed") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          void onUpdate(booking.id, "checked_in");
        }}
        className="rounded-lg bg-[#061224] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "..." : "Check in"}
      </button>
    );
  }

  if (booking.bookingStatus === "checked_in") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          void onUpdate(booking.id, "completed");
        }}
        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "..." : "Complete"}
      </button>
    );
  }

  return null;
}

type ReservationTab = "details" | "guest" | "stay" | "payment" | "audit";

function BookingInspector({
  open,
  booking,
  today,
  assignedRoom,
  onAssignRoom,
  busy,
  onUpdate,
  onClose,
}: {
  open: boolean;
  booking: Booking | null;
  today: string;
  assignedRoom: string;
  onAssignRoom: (room: string) => void;
  busy: boolean;
  onUpdate: (bookingId: string, status: ActionStatus) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ReservationTab>("details");
  const [noteText, setNoteText] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [checklist, setChecklist] = useState({
    idVerified: true,
    paymentConfirmed: true,
    roomCleaned: true,
    keyIssued: false,
  });

  useEffect(() => {
    setTab("details");
    setNoteSaved(false);
  }, [booking?.id]);

  if (!booking) return null;

  const guestName = booking.leadGuest?.name ?? "Guest";
  const guests = booking.adults + booking.children;
  const due = Math.max(0, booking.payableNowPaise - booking.paidPaise);
  const readiness =
    booking.bookingStatus === "checked_in"
      ? 100
      : booking.bookingStatus === "confirmed" && booking.paymentStatus === "paid"
      ? 92
      : 65;

  const toggleChecklist = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const footerAction = (
    <div className="flex items-center gap-2">
      {booking.bookingStatus === "confirmed" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onUpdate(booking.id, "checked_in")}
          className="flex-1 rounded-xl bg-[#061224] py-3 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-colors disabled:opacity-50"
        >
          {busy ? "Updating..." : "Mark Checked In"}
        </button>
      )}
      {booking.bookingStatus === "checked_in" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onUpdate(booking.id, "completed")}
          className="flex-1 rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition-colors disabled:opacity-50"
        >
          {busy ? "Updating..." : "Complete Stay"}
        </button>
      )}
      {["completed", "cancelled", "no_show"].includes(booking.bookingStatus) && (
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl bg-[#061224] py-3 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-colors"
        >
          Close Details
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        Dismiss
      </button>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={booking.confirmationCode}
      description={`${guestName} · ${guests} guest${guests === 1 ? "" : "s"} · ${booking.roomName}`}
      badge={<StatusBadge value={booking.bookingStatus} />}
      headerExtra={<PaymentBadge value={booking.paymentStatus} />}
      footer={footerAction}
    >
      {/* Top Tab Bar (Matching Image 2 Room Editor tabs) */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100 pb-2 mb-4">
        {[
          { id: "details", label: "Details" },
          { id: "guest", label: "Guest Info" },
          { id: "stay", label: "Stay & Room" },
          { id: "payment", label: "Payment" },
          { id: "audit", label: "Actions & Audit" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as ReservationTab)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
              tab === item.id ? "bg-[#061224] text-white shadow-xs" : "text-slate-500 hover:bg-slate-100 hover:text-[#061224]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="space-y-4 text-xs">
        {/* TAB 1: OVERVIEW DETAILS */}
        {tab === "details" && (
          <div className="space-y-4">
            {/* Guest Summary Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="grid h-13 w-13 shrink-0 place-items-center rounded-full bg-[#f6e8c8] text-lg font-bold text-[#b8821f] border border-[#f0cf88]">
                  {initials(guestName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-bold text-[#061224]">{guestName}</p>
                    {readiness >= 90 && (
                      <span className="rounded bg-[#c89b3c]/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-[#9a6b18]">
                        VIP
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 font-medium">
                    {guests} guest{guests === 1 ? "" : "s"} · {booking.leadGuest?.phone ?? "No phone"}
                  </p>
                  <p className="truncate text-xs text-slate-400 font-normal">{booking.leadGuest?.email ?? "No email"}</p>
                </div>
              </div>
            </div>

            {/* Readiness Score Dial Gauge */}
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-[#fbfbff] to-[#f4f7fc] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#061224]">Check-in Readiness</span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> {readiness >= 90 ? "Guest Ready" : "Requires Review"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-3xl font-extrabold tracking-tight text-emerald-600">{readiness}%</p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                    {readiness >= 90 ? "All pre-arrival requirements completed" : "Pending checklist verification"}
                  </p>
                </div>
                <div className="relative grid h-16 w-16 place-items-center">
                  <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                    <path
                      className="text-slate-200"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-500 transition-all duration-500"
                      strokeDasharray={`${readiness}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute text-xs font-extrabold text-[#061224]">{readiness}%</span>
                </div>
              </div>
            </div>

            {/* Quick Stay Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-200 p-3 bg-white">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stay Duration</span>
                <p className="mt-1 font-bold text-[#061224]">{booking.nights} night{booking.nights === 1 ? "" : "s"}</p>
                <p className="text-[11px] text-slate-500">{formatShortDate(booking.checkIn)} – {formatShortDate(booking.checkOut)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 bg-white">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Room</span>
                <p className="mt-1 font-bold text-[#061224]">Room {assignedRoom}</p>
                <p className="text-[11px] text-emerald-600 font-semibold">{booking.roomName}</p>
              </div>
            </div>

            {/* Staff Internal Notes Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#061224]">Internal Staff Note</span>
                {noteSaved && <span className="text-[10px] font-bold text-emerald-600">Saved</span>}
              </div>
              <textarea
                value={noteText}
                onChange={(e) => {
                  setNoteText(e.target.value);
                  setNoteSaved(false);
                }}
                placeholder="Add private note for reception staff (e.g. VIP guest, late arrival expected)..."
                rows={2}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-[#c89b3c]"
              />
              <button
                type="button"
                onClick={() => setNoteSaved(true)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800"
              >
                Save Internal Note
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: GUEST INFO */}
        {tab === "guest" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <h3 className="font-bold text-sm text-[#061224]">Lead Guest Profile</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400">Full Name</label>
                  <input
                    readOnly
                    value={guestName}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-[#061224]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400">Total Occupants</label>
                  <input
                    readOnly
                    value={`${booking.adults} Adults, ${booking.children} Children`}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-[#061224]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400">Phone Number</label>
                  <input
                    readOnly
                    value={booking.leadGuest?.phone ?? "Not provided"}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-[#061224]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400">Email Address</label>
                  <input
                    readOnly
                    value={booking.leadGuest?.email ?? "Not provided"}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-[#061224]"
                  />
                </div>
              </div>
            </div>

            {/* Special Request Box */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-1">
              <span className="font-bold text-blue-900 text-xs">Guest Special Request</span>
              <p className="text-xs text-blue-800 leading-relaxed font-medium">
                {booking.specialRequest ?? "No special request recorded for this reservation."}
              </p>
            </div>

            {/* Communication Shortcuts */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
              <span className="font-bold text-[#061224]">Direct Communication</span>
              <div className="space-y-2 pt-1">
                <ActionLink icon={Mail} label="Send Email to Guest" href={booking.leadGuest?.email ? `mailto:${booking.leadGuest.email}` : undefined} />
                <ActionLink icon={Phone} label="Call Guest Phone" href={booking.leadGuest?.phone ? `tel:${booking.leadGuest.phone}` : undefined} />
                <ActionLink icon={Headphones} label="Contact Helpkey Partner Desk" href="mailto:support@helpkey.in" />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STAY & ROOM */}
        {tab === "stay" && (
          <div className="space-y-4">
            {/* Timeline */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <span className="font-bold text-sm text-[#061224]">Stay Timeline & Schedule</span>
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Check-In Date</p>
                  <p className="font-bold text-[#061224] text-sm mt-0.5">{formatFullDate(booking.checkIn)}</p>
                  <p className="text-slate-500 text-[11px]">From 15:00 PM</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50 text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Check-Out Date</p>
                  <p className="font-bold text-[#061224] text-sm mt-0.5">{formatFullDate(booking.checkOut)}</p>
                  <p className="text-slate-500 text-[11px]">Until 11:00 AM</p>
                </div>
              </div>
            </div>

            {/* Room Assignment */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <span className="font-bold text-sm text-[#061224]">Room Category & Physical Assignment</span>
              <div className="space-y-2 text-xs">
                <DetailRow label="Booked Room Category" value={booking.roomName} strong />
                <DetailRow label="Rate Plan" value={booking.ratePlanName} />
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-2">
                  <span className="font-bold text-[#061224]">Assign Room Number</span>
                  <select
                    value={assignedRoom}
                    onChange={(e) => onAssignRoom(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-bold text-[#061224] outline-none focus:border-[#c89b3c]"
                  >
                    <option value="1205">Room 1205</option>
                    <option value="1206">Room 1206</option>
                    <option value="1301">Room 1301</option>
                    <option value="1402">Room 1402</option>
                    <option value="1501">Room 1501</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Pre-arrival Checklist */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
              <span className="font-bold text-sm text-[#061224]">Pre-arrival Checklist</span>
              <div className="space-y-2 pt-1">
                {[
                  { key: "idVerified", label: "Government ID / Passport Verified" },
                  { key: "paymentConfirmed", label: "Full Payment Clear / Pre-authorized" },
                  { key: "roomCleaned", label: "Housekeeping Inspection Passed" },
                  { key: "keyIssued", label: "Key Card Prepared / Handed Over" },
                ].map((item) => {
                  const checked = checklist[item.key as keyof typeof checklist];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleChecklist(item.key as keyof typeof checklist)}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 font-semibold transition-colors ${
                        checked
                          ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-xs">{item.label}</span>
                      {checked ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <div className="h-4 w-4 rounded border border-slate-300 bg-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PAYMENT */}
        {tab === "payment" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#061224]">Financial Breakdown</span>
                <PaymentBadge value={booking.paymentStatus} />
              </div>
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <DetailRow label="Total Stay Tariff" value={money(booking.totalPaise, booking.currency)} strong />
                <DetailRow label="Payable at Property / Now" value={money(booking.payableNowPaise, booking.currency)} />
                <DetailRow label="Amount Paid" value={money(booking.paidPaise, booking.currency)} success />
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-bold text-sm">
                  <span className="text-[#061224]">Outstanding Balance</span>
                  <span className={due > 0 ? "text-amber-700" : "text-emerald-700"}>
                    {money(due, booking.currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <span className="font-bold text-xs text-[#061224]">Payment Channel & Method</span>
              <DetailRow label="Payment Method" value={booking.paymentMethod ? sentenceLabel(booking.paymentMethod) : "Helpkey Online Pay"} />
              <DetailRow label="Booking Date" value={booking.createdAt ? formatFullDate(booking.createdAt.slice(0, 10)) : "Direct Booking"} />
            </div>

            {due > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-bold text-amber-900 text-xs">Collect Balance at Front Desk</p>
                <p className="text-xs text-amber-800 mt-0.5 font-medium">
                  Guest has a remaining balance of {money(due, booking.currency)} to settle upon check-in.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ACTIONS & AUDIT */}
        {tab === "audit" && (
          <div className="space-y-4">
            {/* Quick Status Control */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <span className="font-bold text-sm text-[#061224]">Reservation Status Actions</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || booking.bookingStatus !== "confirmed"}
                  onClick={() => void onUpdate(booking.id, "checked_in")}
                  className="rounded-xl bg-[#061224] py-2.5 font-bold text-white shadow-xs hover:bg-[#0c1f3b] disabled:opacity-40 transition-colors"
                >
                  Mark Checked In
                </button>
                <button
                  type="button"
                  disabled={busy || booking.bookingStatus !== "checked_in"}
                  onClick={() => void onUpdate(booking.id, "completed")}
                  className="rounded-xl bg-emerald-700 py-2.5 font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-40 transition-colors"
                >
                  Complete Stay
                </button>
              </div>
            </div>

            {/* Safe / Danger Zone */}
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 space-y-3">
              <div className="flex items-center gap-1.5 font-bold text-red-900 text-xs">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span>Sensitive Administrative Actions</span>
              </div>
              <p className="text-[11px] text-red-700 leading-relaxed font-medium">
                Modifying these states affects inventory and guest notifications.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || !["pending_payment", "confirmed"].includes(booking.bookingStatus)}
                  onClick={() => void onUpdate(booking.id, "cancelled")}
                  className="rounded-xl border border-red-300 bg-white py-2 font-bold text-red-700 hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  Cancel Reservation
                </button>
                <button
                  type="button"
                  disabled={busy || booking.bookingStatus !== "confirmed"}
                  onClick={() => void onUpdate(booking.id, "no_show")}
                  className="rounded-xl border border-red-300 bg-white py-2 font-bold text-red-700 hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  Mark No-show
                </button>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <span className="font-bold text-sm text-[#061224]">Activity Log</span>
              <div className="space-y-2.5 pt-1 border-t border-slate-100 text-[11px]">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-semibold text-[#061224]">Status: {sentenceLabel(booking.bookingStatus)}</span>
                  <span className="text-slate-400">System Log</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-semibold text-[#061224]">Room {assignedRoom} assigned</span>
                  <span className="text-slate-400">Desk Staff</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-semibold text-[#061224]">Payment status: {sentenceLabel(booking.paymentStatus)}</span>
                  <span className="text-slate-400">Gateway</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function ActionLink({ icon: Icon, label, href }: { icon: typeof Mail; label: string; href?: string }) {
  const className = "flex w-full items-center gap-3 rounded-lg border border-[#e4ded2] bg-white px-3 py-2.5 text-xs font-semibold text-[#061224] hover:border-[#c89b3c] hover:bg-[#fbf5e8]";

  if (!href) {
    return (
      <button type="button" disabled className={`${className} cursor-not-allowed opacity-45`}>
        <Icon className="h-4 w-4" />
        {label}
      </button>
    );
  }

  return (
    <a href={href} className={className}>
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#e4ded2] bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold text-[#061224]">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, strong = false, success = false }: { label: string; value: string; strong?: boolean; success?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-semibold text-[#68758c]">{label}</span>
      <span className={`text-right font-semibold ${strong ? "text-[#061224]" : success ? "text-emerald-700" : "text-[#263247]"}`}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    arriving_today: "border-blue-100 bg-blue-50 text-blue-700",
    confirmed: "border-blue-100 bg-blue-50 text-blue-700",
    checked_in: "border-emerald-100 bg-emerald-50 text-emerald-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending_payment: "border-amber-100 bg-amber-50 text-amber-700",
    cancelled: "border-red-100 bg-red-50 text-red-700",
    no_show: "border-red-100 bg-red-50 text-red-700",
    expired: "border-slate-200 bg-slate-100 text-slate-700",
    payment_failed: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <span className={`inline-flex w-fit items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${styles[value] ?? "border-slate-200 bg-slate-100 text-slate-700"}`}>
      {value === "arriving_today" ? "Arriving Today" : sentenceLabel(value)}
    </span>
  );
}

function PaymentBadge({ value }: { value: string }) {
  const paid = value === "paid" || value === "pay_at_property";
  return (
    <span className={`inline-flex w-fit items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${paid ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
      {sentenceLabel(value)}
    </span>
  );
}

function ReservationSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="grid gap-3 border-b border-[#ede7dc] px-4 py-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-5 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-10 text-center">
      <CalendarDays className="mx-auto h-9 w-9 text-[#c89b3c]" />
      <h2 className="mt-3 text-lg font-semibold text-[#061224]">No reservations found</h2>
      <p className="mt-1 text-sm font-semibold text-[#68758c]">
        Try another status, room type, payment filter, or search term.
      </p>
    </div>
  );
}
