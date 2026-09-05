import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BedDouble,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Filter,
  Headphones,
  IndianRupee,
  Info,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Star,
  UserX,
  UsersRound,
  X
} from "lucide-react";
import { DashboardCard, MetricCard, PayoutLine, StatusChip } from "./shared";
import { formatPaise } from "@/lib/currency";

type ReservationItem = {
  id: string;
  guest: string;
  vip?: boolean;
  room: string;
  dates: string;
  nights: number;
  guests: number;
  payment: string;
  request: string;
  status: string;
  arrivalTime: string;
};

const fullReservationList: ReservationItem[] = [
  {
    id: "BK-789451",
    guest: "Sophia Lee",
    vip: true,
    room: "Deluxe King (1205)",
    dates: "May 20 – May 24",
    nights: 4,
    guests: 2,
    payment: "Paid",
    request: "High floor",
    status: "Arriving Today",
    arrivalTime: "14:30 PM",
  },
  {
    id: "BK-789452",
    guest: "Marcus Vance",
    vip: false,
    room: "Executive Suite (1402)",
    dates: "May 20 – May 25",
    nights: 5,
    guests: 2,
    payment: "Paid",
    request: "Airport transfer",
    status: "Arriving Today",
    arrivalTime: "16:00 PM",
  },
  {
    id: "BK-789453",
    guest: "Elena Rostova",
    vip: true,
    room: "Superior Queen (0810)",
    dates: "May 18 – May 22",
    nights: 4,
    guests: 1,
    payment: "Paid",
    request: "Late check-in",
    status: "In House",
    arrivalTime: "-",
  },
  {
    id: "BK-789454",
    guest: "David Chen",
    vip: false,
    room: "Deluxe Twin (0915)",
    dates: "May 20 – May 23",
    nights: 3,
    guests: 2,
    payment: "Pending",
    request: "-",
    status: "No-show Risk",
    arrivalTime: "19:00 PM",
  },
  {
    id: "BK-789455",
    guest: "Amara Johnson",
    vip: false,
    room: "Executive Suite (1501)",
    dates: "May 21 – May 26",
    nights: 5,
    guests: 3,
    payment: "Paid",
    request: "Extra pillows",
    status: "Upcoming",
    arrivalTime: "-",
  },
  {
    id: "BK-789456",
    guest: "Oliver Smith",
    vip: false,
    room: "Deluxe King (1102)",
    dates: "May 22 – May 24",
    nights: 2,
    guests: 2,
    payment: "Paid",
    request: "-",
    status: "Upcoming",
    arrivalTime: "-",
  },
  {
    id: "BK-789457",
    guest: "Claire Dupont",
    vip: true,
    room: "Deluxe King (1208)",
    dates: "May 20 – May 22",
    nights: 2,
    guests: 1,
    payment: "Paid",
    request: "Quiet room",
    status: "Arriving Today",
    arrivalTime: "15:15 PM",
  },
];

export function PartnerReservationsView({ propertyName }: { propertyName: string }) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState("All (126)");
  const [assignedRoom, setAssignedRoom] = useState("1205");

  const isInspectorOpen = Boolean(selectedBookingId);
  const selectedBooking = useMemo(
    () => fullReservationList.find((b) => b.id === selectedBookingId) || fullReservationList[0],
    [selectedBookingId]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedBookingId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="space-y-4">
      {/* Page Title & Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-[#061224]">
            Reservations
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Manage arrivals, guest requests, payments and booking changes for {propertyName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Manual Booking
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Sync Calendar
          </button>
        </div>
      </div>

      {/* 5 Snapshot KPI Header Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={UsersRound}
          title="Arrivals Today"
          value="18"
          trend="↑ 12% vs yesterday"
          trendType="up"
        />
        <MetricCard
          icon={Send}
          title="Departures Today"
          value="14"
          trend="↓ 7% vs yesterday"
          trendType="down"
        />
        <MetricCard
          icon={BedDouble}
          title="Staying Tonight"
          value="82"
          trend="72% Occupancy"
          trendType="neutral"
        />
        <MetricCard
          icon={Bell}
          title="Pending Requests"
          value="9"
          trend="3 urgent"
          trendType="attention"
        />
        <MetricCard
          icon={CircleAlert}
          title="No-show Risk"
          value="5"
          trend="High attention"
          trendType="down"
        />
      </div>

      {/* Filter Bar Card */}
      <DashboardCard className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[170px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date Range</label>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224]">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>May 20 – May 27, 2025</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-auto" />
            </div>
          </div>

          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Reservation Status</label>
            <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All Statuses</option>
              <option>Arriving Today</option>
              <option>In House</option>
              <option>Upcoming</option>
              <option>Cancelled</option>
            </select>
          </div>

          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Room Type</label>
            <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All Room Types</option>
              <option>Deluxe King</option>
              <option>Executive Suite</option>
              <option>Deluxe Twin</option>
              <option>Superior Queen</option>
            </select>
          </div>

          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Status</label>
            <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Refunded</option>
            </select>
          </div>

          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Request Type</label>
            <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All</option>
              <option>Late check-in</option>
              <option>Airport transfer</option>
              <option>High floor</option>
            </select>
          </div>

          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Source Channel</label>
            <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All Channels</option>
              <option>Direct (Helpkey)</option>
              <option>Partner API</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#061224] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c] transition-colors"
            >
              <Filter className="h-3.5 w-3.5" />
              Apply Filters
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:text-[#061224]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </DashboardCard>

      {/* Status Pill Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            "All (126)",
            "Arriving Today (18)",
            "In House (32)",
            "Upcoming (41)",
            "Pending Requests (9)",
            "Cancelled (14)",
            "No-show Risk (5)",
          ].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSelectedTab(tab)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                selectedTab === tab
                  ? "bg-[#061224] text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-[#061224] border border-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-slate-500 hidden md:block">
          💡 Click any row to inspect guest details &amp; manage booking
        </p>
      </div>

      {/* 100% Full-Width Interactive Reservations Table */}
      <DashboardCard className="overflow-hidden flex flex-col justify-between w-full">
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/60 bg-[#fbfaf7] text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Booking ID</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Room Type</th>
                  <th className="px-4 py-3">Stay Dates</th>
                  <th className="px-3 py-3 text-center">Guests</th>
                  <th className="px-3 py-3">Payment</th>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-3 py-3">Arrival Time</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {fullReservationList.map((row) => {
                  const isSelected = selectedBookingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedBookingId(row.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#fbf5e8] border-l-4 border-[#c89b3c]"
                          : "hover:bg-[#fcfbf9]"
                      }`}
                    >
                      <td className="px-4 py-3.5 font-bold text-[#061224]">{row.id}</td>
                      <td className="px-4 py-3.5 font-bold text-[#061224]">
                        <div className="flex items-center gap-1.5">
                          <span>{row.guest}</span>
                          {row.vip && (
                            <span className="rounded bg-[#c89b3c]/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#9a6b18]">
                              VIP
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">{row.room}</td>
                      <td className="px-4 py-3.5 text-slate-600 font-medium">
                        <div>{row.dates}</div>
                        <div className="text-[10px] text-slate-400">{row.nights} nights</div>
                      </td>
                      <td className="px-3 py-3.5 text-center font-semibold text-slate-700">{row.guests}</td>
                      <td className="px-3 py-3.5">
                        <StatusChip label={row.payment} tone={row.payment === "Paid" ? "green" : "amber"} />
                      </td>
                      <td className="px-4 py-3.5">
                        {row.request !== "-" ? (
                          <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
                            {row.request}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusChip
                          label={row.status}
                          tone={
                            row.status === "Arriving Today"
                              ? "blue"
                              : row.status === "No-show Risk"
                              ? "amber"
                              : "neutral"
                          }
                        />
                      </td>
                      <td className="px-3 py-3.5 text-slate-600 font-medium">
                        {row.arrivalTime !== "-" ? row.arrivalTime : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBookingId(row.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-[#061224] hover:bg-[#061224] hover:text-white transition-colors"
                        >
                          Inspect <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table Footer Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 p-4 text-xs font-semibold text-slate-600">
          <span>Showing 1 to 7 of 126 reservations</span>
          <div className="flex items-center gap-1.5">
            <button className="rounded-lg border border-slate-200 p-1 text-slate-400 hover:bg-slate-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="rounded-lg bg-[#061224] px-2.5 py-1 text-white font-bold">1</button>
            <button className="rounded-lg border border-slate-200 px-2.5 py-1 hover:bg-slate-50">2</button>
            <button className="rounded-lg border border-slate-200 px-2.5 py-1 hover:bg-slate-50">3</button>
            <span className="px-1 text-slate-400">...</span>
            <button className="rounded-lg border border-slate-200 px-2.5 py-1 hover:bg-slate-50">18</button>
            <button className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 outline-none">
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
          </div>
        </div>
      </DashboardCard>

      {/* Floating Backdrop Overlay for Slide-Over Drawer */}
      {isInspectorOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={() => setSelectedBookingId(null)}
        />
      )}

      {/* Floating Slide-Over Drawer (Booking Inspector Sheet) */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[540px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          isInspectorOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Sticky Header with Close Button */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/60 bg-[#fbfaf7] px-6">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-extrabold text-[#061224]">{selectedBooking?.id ?? "BK-789451"}</h3>
            {selectedBooking && (
              <StatusChip
                label={selectedBooking.status}
                tone={
                  selectedBooking.status === "Arriving Today"
                    ? "blue"
                    : selectedBooking.status === "No-show Risk"
                    ? "amber"
                    : "neutral"
                }
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedBookingId(null)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-[#061224] transition-colors"
            aria-label="Close inspector panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Drawer Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Guest Header & readiness gauge */}
          <div className="flex items-start justify-between border-b border-slate-200/60 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[#fbf5e8] text-base font-bold text-[#c89b3c] border border-[#c89b3c]/30">
                  {selectedBooking?.guest ? selectedBooking.guest.split(" ").map(n => n[0]).join("") : "SL"}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-lg font-bold text-[#061224]">{selectedBooking?.guest ?? "Sophia Lee"}</p>
                    {selectedBooking?.vip && (
                      <span className="rounded bg-[#c89b3c]/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-[#9a6b18]">
                        VIP
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[#c89b3c]">★ Gold Member</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-600 font-medium">
                <p className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  +1 (555) 987-6543
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  sophia.lee@email.com
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                </p>
              </div>
            </div>

            {/* Readiness Dial Gauge */}
            <div className="flex flex-col items-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-emerald-500"
                    strokeDasharray="92, 100"
                    strokeWidth="3"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-sm font-extrabold text-[#061224]">92%</span>
              </div>
              <span className="mt-1 text-[11px] font-bold text-emerald-600">Excellent</span>
            </div>
          </div>

          {/* Stay Timeline */}
          <div className="rounded-xl border border-slate-200 bg-[#fcfbf9] p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Stay Timeline</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Check-in</p>
                <p className="font-bold text-[#061224]">Tue, May 20, 2025</p>
                <p className="text-slate-500">15:00</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Check-out</p>
                <p className="font-bold text-[#061224]">Fri, May 23, 2025</p>
                <p className="text-slate-500">11:00</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] font-bold text-[#061224]">
              <span>{selectedBooking?.nights ?? 3} nights</span>
              <span>{selectedBooking?.guests ?? 2} Guests</span>
            </div>
          </div>

          {/* Room Details & Room Assignment */}
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Room Details</p>
              <p className="mt-1 font-bold text-[#061224]">{selectedBooking?.room ?? "Deluxe King (1205)"}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">1 King Bed • City View • 28 m²</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Room Assignment</p>
              <div className="mt-1.5 flex items-center justify-between">
                <select
                  value={assignedRoom}
                  onChange={(e) => setAssignedRoom(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-[#061224] outline-none"
                >
                  <option value="1205">1205</option>
                  <option value="1206">1206</option>
                  <option value="1207">1207</option>
                </select>
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                  <Check className="h-3.5 w-3.5" /> Assigned
                </span>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#061224]">Payment Summary</span>
            </div>
            <div className="space-y-1.5 pt-1 border-t border-slate-200/60">
              <PayoutLine label="Total Amount" value={formatPaise(712_50, { withFractions: true })} />
              <PayoutLine label="Paid" value={formatPaise(712_50, { withFractions: true })} positive />
              <PayoutLine label="Balance" value={formatPaise(0, { withFractions: true })} />
              <PayoutLine label="Payment Method" value="Visa •••• 4242" />
            </div>
          </div>

          {/* Guest Requests & Pre-arrival Checklist */}
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <p className="font-bold text-[#061224]">Guest Requests (3)</p>
              <ul className="space-y-1 text-[11px] text-slate-600">
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Late check-in (After 3 PM)
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Extra pillows
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Anniversary celebration
                </li>
              </ul>
              <p className="text-[10px] italic text-slate-500 pt-1">Notes: Celebrating 5th anniversary.</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <p className="font-bold text-[#061224]">Pre-arrival Checklist</p>
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-700">
                  <span>ID Verification</span>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Payment Confirmed</span>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Room Assigned</span>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Welcome Note</span>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button className="col-span-2 rounded-xl bg-[#061224] py-2.5 font-bold text-white shadow-xs hover:bg-[#0a1f3c] transition-colors">
              Mark Checked In
            </button>
            <button className="rounded-xl border border-slate-200 bg-white py-2 font-bold text-[#061224] hover:bg-slate-50">
              Update Room
            </button>
            <button className="rounded-xl border border-slate-200 bg-white py-2 font-bold text-[#061224] hover:bg-slate-50">
              Send Message
            </button>
            <button className="col-span-2 rounded-xl border border-slate-200 bg-white py-2 font-bold text-[#061224] hover:bg-slate-50">
              Print Confirmation
            </button>
          </div>

          {/* Internal Note */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
            <p className="font-bold text-[#061224]">Internal Note</p>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Guest celebrating anniversary. Prepare welcome amenities and upgrade requested.
            </p>
            <p className="text-[10px] text-slate-400">Saved 10:20 AM by Daniel Carter</p>
          </div>

          {/* Audit Activity Log */}
          <div className="space-y-2 text-xs border-t border-slate-200/60 pt-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#061224]">Activity Log</span>
              <button className="text-[10px] font-bold text-[#061224] hover:underline">View all</button>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <div className="flex items-center justify-between">
                <span>May 20, 10:15 AM</span>
                <span className="font-semibold text-slate-800">Payment confirmed</span>
                <span className="text-slate-400">Daniel Carter</span>
              </div>
              <div className="flex items-center justify-between">
                <span>May 19, 01:42 PM</span>
                <span className="font-semibold text-slate-800">Room 1205 assigned</span>
                <span className="text-slate-400">Daniel Carter</span>
              </div>
              <div className="flex items-center justify-between">
                <span>May 19, 04:30 PM</span>
                <span className="font-semibold text-slate-800">Reservation created</span>
                <span className="text-slate-400">Helpkey System</span>
              </div>
            </div>
          </div>

          {/* Quick Communication Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs">
            <p className="font-bold text-[#061224]">Quick Communication</p>
            <div className="space-y-1.5">
              <button className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-[#061224] hover:bg-slate-50">
                <MessageSquare className="h-3.5 w-3.5 text-slate-500" /> Message Guest
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-[#061224] hover:bg-slate-50">
                <Phone className="h-3.5 w-3.5 text-slate-500" /> Call Guest
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-[#061224] hover:bg-slate-50">
                <Headphones className="h-3.5 w-3.5 text-slate-500" /> Contact Helpkey Support
              </button>
            </div>
          </div>

          {/* Requires Confirmation (Sensitive Actions) Block */}
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3.5 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-red-800">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>Safe Actions &amp; Confirmation</span>
            </div>
            <p className="text-[10px] text-red-700 leading-tight">
              These actions affect guest booking, payments, or availability and are logged in audit log.
            </p>
            <div className="space-y-1.5 pt-1">
              <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white py-1.5 font-bold text-red-600 hover:bg-red-50">
                <UserX className="h-3.5 w-3.5" /> Cancel Reservation
              </button>
              <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white py-1.5 font-bold text-red-600 hover:bg-red-50">
                <UserX className="h-3.5 w-3.5" /> Mark No-show
              </button>
              <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white py-1.5 font-bold text-red-600 hover:bg-red-50">
                <Calendar className="h-3.5 w-3.5" /> Modify Dates
              </button>
              <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white py-1.5 font-bold text-red-600 hover:bg-red-50">
                <IndianRupee className="h-3.5 w-3.5" /> Request Refund Review
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Bottom Grid: 7-Day Arrival & Capacity Overview + Today's Priority */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 7-Day Arrival & Capacity Overview */}
        <DashboardCard className="p-5 flex flex-col justify-between lg:col-span-2">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#061224]">7-Day Arrival &amp; Capacity Overview</h3>
                <Info className="h-4 w-4 text-slate-400" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-xl border border-slate-200/60 text-center text-xs">
              {[
                { day: "Tue, May 20", arr: "18 Arrivals", pct: "72%", color: "bg-emerald-500" },
                { day: "Wed, May 21", arr: "21 Arrivals", pct: "78%", color: "bg-emerald-500" },
                { day: "Thu, May 22", arr: "16 Arrivals", pct: "68%", color: "bg-amber-500" },
                { day: "Fri, May 23", arr: "20 Arrivals", pct: "80%", color: "bg-amber-500" },
                { day: "Sat, May 24", arr: "24 Arrivals", pct: "92%", color: "bg-red-500" },
                { day: "Sun, May 25", arr: "15 Arrivals", pct: "60%", color: "bg-slate-400" },
                { day: "Mon, May 26", arr: "12 Arrivals", pct: "55%", color: "bg-slate-400" },
              ].map((item) => (
                <div key={item.day} className="border-r border-slate-200/60 p-3 last:border-r-0">
                  <p className="font-bold text-slate-700 text-[11px]">{item.day}</p>
                  <p className="mt-1 font-extrabold text-[#061224]">{item.arr}</p>
                  <div className="mt-3 flex items-center justify-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    <span className="font-extrabold text-[#061224]">{item.pct}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400" /> 0-60%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> 61-80%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> 81-100%
            </span>
          </div>
        </DashboardCard>

        {/* Today's Priority Card */}
        <DashboardCard className="p-5 flex flex-col justify-between lg:col-span-1">
          <div>
            <div className="flex items-center gap-2 text-[#c89b3c]">
              <Star className="h-5 w-5 fill-current" />
              <h3 className="text-base font-bold text-[#061224]">Today&apos;s priority</h3>
            </div>
            <div className="mt-4 space-y-3 text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <ChevronRight className="h-4 w-4 text-[#c89b3c]" />
                <span>18 Arrivals today – Ensure smooth check-ins</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <ChevronRight className="h-4 w-4 text-[#c89b3c]" />
                <span>5 No-show risk bookings – Review and follow up</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <ChevronRight className="h-4 w-4 text-[#c89b3c]" />
                <span>3 Pending requests – Respond to guest requests</span>
              </div>
            </div>
          </div>
          <button className="mt-4 w-full rounded-xl border border-[#c89b3c] py-2.5 text-xs font-bold text-[#9a6b18] hover:bg-[#fbf5e8]">
            View Priority List
          </button>
        </DashboardCard>
      </div>
    </div>
  );
}
