import Link from "next/link";
import {
  ArrowUpRight,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  IndianRupee,
  MessageCircle,
  MoreVertical,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  UsersRound
} from "lucide-react";
import type { Property } from "./types";
import { formatPaise } from "@/lib/currency";
import { ActionRow, DashboardCard, MetricCard, OperationItem, PayoutLine, RevenueOccupancyDualChart, StatusChip } from "./shared";

export function PartnerOverviewView({
  selectedProperty,
  propertyName,
  businessName,
  isLive,
  health,
}: {
  selectedProperty?: Property;
  propertyName: string;
  businessName: string;
  isLive: boolean;
  health: number;
}) {
  const coverImage = selectedProperty?.coverImageUrl || "/balmoral_hotel.png";
  return (
    <div className="space-y-4">
      {/* Hero Section Banner */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          {/* Real Hotel Thumbnail Image */}
          <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 shadow-xs lg:h-28 lg:w-44">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImage}
              alt={propertyName}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-[#061224] sm:text-3xl">
              Welcome back, {businessName}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Here&apos;s what&apos;s happening at{" "}
              <span className="font-semibold text-[#061224]">{propertyName}</span> today.
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              {isLive ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-3.5 py-1 text-xs font-bold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Live on Helpkey
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/70 px-3.5 py-1 text-xs font-bold text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Not live yet
                </span>
              )}
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                Listing Health
                <b className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#c89b3c] text-xs text-[#061224]">
                  {health}
                </b>
                <span className="font-bold text-[#061224]">Excellent</span>
                <span className="text-slate-500">Keep it up!</span>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-row lg:items-center">
            <Link
              href={selectedProperty ? `/partner/properties/${selectedProperty.id}` : "#"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c] transition-colors"
            >
              <CalendarDays className="h-4 w-4" />
              Update Availability
            </Link>
            <Link
              href="/partner/onboarding?new=1"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
            >
              <BedDouble className="h-4 w-4" />
              Add Room
            </Link>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
            >
              <ArrowUpRight className="h-4 w-4" />
              View Public Listing
            </button>
          </div>
        </div>
      </section>

      {/* 5 Metric Header Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={UsersRound}
          title="Arrivals Today"
          value="14"
          trend="↑ 27% vs yesterday"
          trendType="up"
        />
        <MetricCard
          icon={Send}
          title="Departures Today"
          value="8"
          trend="↓ 11% vs yesterday"
          trendType="down"
        />
        <MetricCard
          icon={Clock3}
          title="Occupancy"
          value="78%"
          trend="↑ 6 pts vs last week"
          trendType="up"
        />
        <MetricCard
          icon={IndianRupee}
          title="Revenue This Week"
          value={formatPaise(482_500_00)}
          trend="↑ 18% vs last week"
          trendType="up"
        />
        <MetricCard
          icon={Bell}
          title="Pending Requests"
          value="5"
          trend="Requires attention"
          trendType="attention"
        />
      </div>

      {/* Middle Row Layout (Revenue & Occupancy Chart + Operations + Action Center) */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_340px_360px]">
        {/* Card 1: Dual Axis Chart */}
        <DashboardCard className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#061224]">Revenue & Occupancy</h3>
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-3.5 rounded-sm bg-[#061224]" />
                  Revenue (INR)
                </span>
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-3.5 rounded-sm bg-[#c89b3c]" />
                  Occupancy (%)
                </span>
              </div>
            </div>

            {/* Timeframe Switcher */}
            <div className="flex rounded-xl border border-slate-200/80 bg-[#f7f5f0] p-1">
              {["Daily", "Weekly", "Monthly"].map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    index === 0
                      ? "bg-[#061224] text-white shadow-xs"
                      : "text-slate-600 hover:text-[#061224]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Dual-Axis Chart */}
          <RevenueOccupancyDualChart />

          {/* Mini Summary Stats */}
          <div className="mt-4 grid gap-4 border-t border-slate-200/80 pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">Total Revenue</p>
              <p className="mt-1 text-xl font-bold text-[#061224]">{formatPaise(482_500_00)}</p>
              <p className="text-xs font-bold text-emerald-600">↑ 18%</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Average Occupancy</p>
              <p className="mt-1 text-xl font-bold text-[#061224]">78%</p>
              <p className="text-xs font-bold text-emerald-600">↑ 6 pts</p>
            </div>
            <div className="flex items-end justify-end">
              <Link
                href={selectedProperty ? `/partner/properties/${selectedProperty.id}` : "#"}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#061224] hover:underline"
              >
                View full report <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </DashboardCard>

        {/* Card 2: Today's Operations */}
        <DashboardCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-[#061224]">Today&apos;s Operations</h3>
            <div className="mt-4 space-y-2.5">
              <OperationItem
                icon={UsersRound}
                title="Check-ins"
                detail="14 expected"
                tone="blue"
              />
              <OperationItem
                icon={Bell}
                title="Special Requests"
                detail="3 new requests"
                tone="gold"
              />
              <OperationItem
                icon={Sparkles}
                title="Housekeeping Notes"
                detail="8 rooms pending"
                tone="green"
              />
              <OperationItem
                icon={CreditCard}
                title="Payment Issues"
                detail="1 requires attention"
                tone="red"
              />
            </div>
          </div>
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-end gap-1.5 text-xs font-bold text-[#061224] hover:underline"
          >
            View all operations <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </DashboardCard>

        {/* Card 3: Action Center */}
        <DashboardCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-[#061224]">Action Center</h3>
            <div className="mt-4 space-y-2.5">
              <ActionRow
                icon={CircleAlert}
                title="Low Availability Alert"
                detail="Only 2 Deluxe Rooms left for May 24"
                tone="warning"
              />
              <ActionRow
                icon={MessageCircle}
                title="Reply to Reviews"
                detail="2 new reviews need your response"
                tone="info"
              />
              <ActionRow
                icon={Building2}
                title="Payout Pending"
                detail="Your next payout is due soon"
                tone="gold"
              />
              <ActionRow
                icon={TrendingUp}
                title="Update Seasonal Pricing"
                detail="High demand dates coming up"
                tone="purple"
              />
            </div>
          </div>
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-end gap-1.5 text-xs font-bold text-[#061224] hover:underline"
          >
            View all actions <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </DashboardCard>
      </div>

      {/* Upcoming Reservations Table (Full Width) */}
      <DashboardCard className="overflow-hidden flex flex-col justify-between w-full">
        <div>
          <div className="flex items-center justify-between border-b border-slate-200/60 p-5">
            <h3 className="text-base font-bold text-[#061224]">Upcoming Reservations</h3>
            <button type="button" className="text-xs font-bold text-[#061224] hover:underline">
              View all
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/60 bg-[#fbfaf7] text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Guest</th>
                  <th className="px-4 py-3">Room Type</th>
                  <th className="px-4 py-3">Stay Dates</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {reservationRows.map((row) => (
                  <tr key={row.guest} className="hover:bg-[#fcfbf9] transition-colors">
                    <td className="px-5 py-3.5 font-bold text-[#061224]">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#061224] text-[11px] font-bold text-white shadow-xs">
                          {row.initials}
                        </div>
                        <span>{row.guest}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-700">{row.room}</td>
                    <td className="px-4 py-3.5 text-slate-600 font-medium">{row.dates}</td>
                    <td className="px-4 py-3.5">
                      <StatusChip label={row.payment} tone={row.payment === "Paid" ? "green" : "amber"} />
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 font-medium">{row.request}</td>
                    <td className="px-4 py-3.5">
                      <StatusChip label={row.status} tone={row.status === "Arriving Today" ? "blue" : "neutral"} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="rounded-lg border border-slate-200/80 px-3 py-1.5 font-bold text-xs hover:bg-slate-50 transition-colors">
                          View
                        </button>
                        <button className="p-1 text-slate-400 hover:text-slate-600">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="border-t border-slate-200/60 p-4 text-center">
          <button type="button" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#061224] hover:underline">
            View all reservations <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </DashboardCard>

      {/* Room Availability Card (Full Width Below Reservations) */}
      <DashboardCard className="p-5 w-full">
        <h3 className="text-base font-bold text-[#061224]">Room Availability <span className="text-xs font-normal text-slate-500">(Next 7 Days)</span></h3>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 overflow-hidden rounded-xl border border-slate-200/60 text-center text-xs">
          {availabilityDays.map((day) => (
            <div key={day.day} className="border-r border-slate-200/60 p-3.5 last:border-r-0 border-b lg:border-b-0">
              <p className="font-bold text-slate-700 text-sm">{day.day}</p>
              <p className="text-xs text-slate-500">{day.date}</p>
              <p className={`mt-2 text-lg font-extrabold ${day.color}`}>
                {day.value}
              </p>
              <p className={`text-xs font-bold ${day.color}`}>{day.label}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-xs font-bold text-[#061224] hover:underline"
        >
          Manage Availability Calendar <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </DashboardCard>

      {/* Reviews Summary & Payout Summary 2-Column Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Reviews Summary Card */}
        <DashboardCard className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#061224]">Reviews Summary</h3>
              <span className="text-xs font-semibold text-slate-400">Latest Review</span>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <p className="text-4xl font-extrabold text-[#061224]">4.6</p>
              <span className="text-xs text-slate-500 font-semibold">/ 5</span>
            </div>
            <div className="mt-1 flex text-[#c89b3c]">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-4 w-4 fill-current" />
              ))}
            </div>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              Based on 126 reviews
            </p>

            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 italic text-slate-600 text-xs leading-relaxed">
              &quot;Wonderful stay! The staff were incredibly welcoming and the room was spotless. We&apos;ll be back for sure!&quot;
              <span className="mt-1 block not-italic text-[10px] font-bold text-slate-500">— James T., May 17, 2025</span>
            </div>
          </div>
          <button className="mt-4 rounded-xl bg-[#061224] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#0a1f3c] transition-colors">
            Respond to Reviews
          </button>
        </DashboardCard>

        {/* Payout Summary Card */}
        <DashboardCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-[#061224]">Payout Summary</h3>
            <div className="mt-4 space-y-2.5 text-xs">
              <PayoutLine label="Next Payout Date" value="May 26, 2025" />
              <PayoutLine label="Payout Amount" value={formatPaise(124_500_00, { withFractions: true })} positive />
              <PayoutLine label="Commission" value="12%" />
              <PayoutLine label="Bank Status" value="Verified" positive icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600 inline ml-1" />} />
            </div>
          </div>
          <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 border-t border-slate-200/60 pt-3 text-xs font-bold text-[#061224] hover:underline">
            View Payouts <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </DashboardCard>
      </div>
    </div>
  );
}

const reservationRows = [
  {
    initials: "EJ",
    guest: "Emma Johnson",
    room: "Deluxe King",
    dates: "May 18 – May 21",
    payment: "Paid",
    request: "Late check-in",
    status: "Arriving Today",
  },
  {
    initials: "MB",
    guest: "Michael Brown",
    room: "Executive Suite",
    dates: "May 18 – May 20",
    payment: "Paid",
    request: "Extra pillows",
    status: "Arriving Today",
  },
  {
    initials: "SW",
    guest: "Sarah Wilson",
    room: "Deluxe Twin",
    dates: "May 19 – May 22",
    payment: "Pending",
    request: "High floor",
    status: "Upcoming",
  },
  {
    initials: "DL",
    guest: "David Lee",
    room: "Premier King",
    dates: "May 19 – May 23",
    payment: "Paid",
    request: "Airport transfer",
    status: "Upcoming",
  },
];

const availabilityDays = [
  { day: "Sun", date: "18", value: "72%", label: "Available", color: "text-emerald-600" },
  { day: "Mon", date: "19", value: "68%", label: "Available", color: "text-emerald-600" },
  { day: "Tue", date: "20", value: "64%", label: "Available", color: "text-emerald-600" },
  { day: "Wed", date: "21", value: "58%", label: "Available", color: "text-emerald-600" },
  { day: "Thu", date: "22", value: "41%", label: "Low", color: "text-amber-600" },
  { day: "Fri", date: "23", value: "36%", label: "Low", color: "text-amber-600" },
  { day: "Sat", date: "24", value: "18%", label: "Very Low", color: "text-red-500" },
];
