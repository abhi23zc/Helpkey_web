"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Grid2X2,
  Headphones,
  Info,
  KeyRound,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  UserX,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

type Property = {
  id: string;
  name: string;
  propertyType: string;
  status: string;
  approvalStatus: string;
  rejectionReason: string | null;
  address?: { city?: string; state?: string };
  onboarding?: { currentStep: number; completedSteps?: number[] };
  totalPhysicalRooms?: number;
  updatedAt?: string | null;
};

const setupTasks = [
  "Choose property type",
  "Confirm location",
  "Add basic details",
  "Add rooms and rates",
  "Set facilities",
  "Upload photos",
  "Upload ID documents",
  "Review and submit",
];

const navItems = [
  ["Overview", Grid2X2],
  ["Reservations", CalendarDays],
  ["Calendar", CalendarDays],
  ["Rooms & Rates", BedDouble],
  ["Property Listing", Building2],
  ["Reviews", Star],
  ["Payouts", WalletCards],
  ["Promotions", Tag],
  ["Messages", Mail],
  ["Settings", Settings],
] as const;

async function loadPartnerDashboard() {
  const response = await fetch("/api/partner/dashboard", { cache: "no-store" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Unable to load dashboard.");
  return json.properties as Property[];
}

export function PartnerDashboard({ initialTab = "Overview" }: { initialTab?: string }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    loadPartnerDashboard()
      .then((items) => {
        setProperties(items);
        setSelectedId((current) => current || items[0]?.id || "");
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Unable to load dashboard."
        )
      );
  }, []);

  useEffect(() => {
    const syncSidebar = () => setSidebarCollapsed(window.innerWidth < 1440);
    syncSidebar();
    window.addEventListener("resize", syncSidebar);
    return () => window.removeEventListener("resize", syncSidebar);
  }, []);

  const selectedProperty = useMemo(
    () =>
      properties.find((property) => property.id === selectedId) ??
      properties[0],
    [properties, selectedId]
  );

  const currentStep = selectedProperty?.onboarding?.currentStep ?? 1;
  const completedSteps = selectedProperty?.onboarding?.completedSteps?.length ?? 0;
  const health =
    selectedProperty?.status === "active"
      ? 92
      : Math.max(12, Math.round((completedSteps / setupTasks.length) * 100));

  const isLive = selectedProperty?.status === "active";
  const propertyName = selectedProperty?.name ?? "The Balmoral Hotel";

  return (
    <main
      className={`min-h-screen bg-[#f7f5f0] text-[#061224] font-sans transition-[padding] duration-300 ${
        sidebarCollapsed ? "lg:pl-20" : "lg:pl-[248px]"
      }`}
    >
      <PartnerSidebar
        open={menuOpen}
        collapsed={sidebarCollapsed}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onClose={() => setMenuOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
      />

      <section className="mx-auto max-w-[1680px] px-3 py-4 sm:px-5 lg:px-6 2xl:px-8 space-y-4">
        {/* Top Control Header Bar */}
        <header className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(220px,260px)_minmax(260px,1fr)_auto] xl:items-center">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-xl border border-[#e5e0d8] bg-white p-2 text-[#061224]"
              aria-label="Open partner menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-[#061224]">Helpkey Partner</h1>
          </div>

          {/* Property Dropdown Selector */}
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-[#e5e0d8] bg-white px-3 shadow-xs">
            <div className="relative h-8 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/balmoral_hotel.png"
                alt="Hotel facade"
                className="h-full w-full object-cover"
              />
            </div>
            <select
              value={selectedProperty?.id ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
              className="w-full cursor-pointer bg-transparent text-sm font-bold text-[#061224] outline-none"
            >
              {properties.length ? (
                properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))
              ) : (
                <option value="">The Balmoral Hotel</option>
              )}
            </select>
          </div>

          {/* Date Range Picker Selector */}
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-[#e5e0d8] bg-white px-4 shadow-xs">
            <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#061224]"
            >
              May 20, 2025
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
            </button>
          </div>

          {/* Global Search Bar */}
          <div className="hidden h-12 items-center rounded-2xl border border-[#e5e0d8] bg-white px-4 shadow-xs md:flex xl:min-w-0">
            <Search className="h-4 w-4 text-slate-400 shrink-0 mr-2.5" />
            <span className="text-sm font-medium text-slate-400 truncate">
              Search reservations, guests, booking ID...
            </span>
            <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">
              ⌘K
            </span>
          </div>

          {/* Right Notification & Profile Controls */}
          <div className="flex items-center justify-end gap-3 md:justify-self-end">
            <button
              type="button"
              className="relative grid h-12 w-12 place-items-center rounded-2xl border border-[#e5e0d8] bg-white shadow-xs transition-colors hover:bg-slate-50"
              title="Notifications"
            >
              <Bell className="h-5 w-5 text-[#061224]" />
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#c89b3c] text-[10px] font-bold text-white shadow-xs">
                5
              </span>
            </button>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-[#061224] text-xs font-bold text-white ring-2 ring-[#c89b3c]/30 shadow-xs">
              DC
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold leading-tight text-[#061224]">Daniel Carter</p>
              <p className="text-[11px] font-semibold text-slate-500">Partner Admin</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Tab Conditional View Rendering */}
        {activeTab === "Reservations" ? (
          <PartnerReservationsView propertyName={propertyName} />
        ) : (
          <PartnerOverviewView
            selectedProperty={selectedProperty}
            propertyName={propertyName}
            health={health}
            isLive={isLive}
          />
        )}
      </section>
    </main>
  );
}

function PartnerOverviewView({
  selectedProperty,
  propertyName,
  health,
  isLive,
}: {
  selectedProperty?: Property;
  propertyName: string;
  health: number;
  isLive: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Hero Section Banner */}
      <section className="overflow-hidden rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          {/* Real Hotel Thumbnail Image */}
          <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 shadow-xs lg:h-28 lg:w-44">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/balmoral_hotel.png"
              alt={propertyName}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-[#061224] sm:text-3xl">
              Welcome back, Aurum Hospitality <span className="inline-block">👋</span>
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Here&apos;s what&apos;s happening at{" "}
              <span className="font-semibold text-[#061224]">{propertyName}</span> today.
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-3.5 py-1 text-xs font-bold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live on Helpkey
              </span>
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
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-4 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
            >
              <BedDouble className="h-4 w-4" />
              Add Room
            </Link>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-4 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
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
          icon={DollarSign}
          title="Revenue This Week"
          value="$48,250"
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
                  Revenue (USD)
                </span>
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-3.5 rounded-sm bg-[#c89b3c]" />
                  Occupancy (%)
                </span>
              </div>
            </div>

            {/* Timeframe Switcher */}
            <div className="flex rounded-xl border border-[#e5e0d8] bg-[#f7f5f0] p-1">
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
          <div className="mt-4 grid gap-4 border-t border-[#e5e0d8] pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">Total Revenue</p>
              <p className="mt-1 text-xl font-bold text-[#061224]">$48,250</p>
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
          <div className="flex items-center justify-between border-b border-[#e5e0d8] p-5">
            <h3 className="text-base font-bold text-[#061224]">Upcoming Reservations</h3>
            <button type="button" className="text-xs font-bold text-[#061224] hover:underline">
              View all
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#eee8de] bg-[#fbfaf7] text-slate-500 font-bold uppercase tracking-wider">
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
              <tbody className="divide-y divide-[#eee8de]">
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
                        <button className="rounded-lg border border-[#e5e0d8] px-3 py-1.5 font-bold text-xs hover:bg-slate-50 transition-colors">
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
        <div className="border-t border-[#e5e0d8] p-4 text-center">
          <button type="button" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#061224] hover:underline">
            View all reservations <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </DashboardCard>

      {/* Room Availability Card (Full Width Below Reservations) */}
      <DashboardCard className="p-5 w-full">
        <h3 className="text-base font-bold text-[#061224]">Room Availability <span className="text-xs font-normal text-slate-500">(Next 7 Days)</span></h3>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 overflow-hidden rounded-xl border border-[#e5e0d8] text-center text-xs">
          {availabilityDays.map((day) => (
            <div key={day.day} className="border-r border-[#e5e0d8] p-3.5 last:border-r-0 border-b lg:border-b-0">
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
              <PayoutLine label="Payout Amount" value="$12,450.00" positive />
              <PayoutLine label="Commission" value="12%" />
              <PayoutLine label="Bank Status" value="Verified" positive icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600 inline ml-1" />} />
            </div>
          </div>
          <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 border-t border-[#e5e0d8] pt-3 text-xs font-bold text-[#061224] hover:underline">
            View Payouts <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </DashboardCard>
      </div>
    </div>
  );
}

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

function PartnerReservationsView({ propertyName }: { propertyName: string }) {
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
            className="inline-flex items-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2.5 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2.5 text-xs font-bold text-[#061224] hover:bg-slate-50 transition-colors"
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
            <div className="flex h-10 items-center gap-2 rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224]">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>May 20 – May 27, 2025</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-auto" />
            </div>
          </div>

          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Reservation Status</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All Statuses</option>
              <option>Arriving Today</option>
              <option>In House</option>
              <option>Upcoming</option>
              <option>Cancelled</option>
            </select>
          </div>

          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Room Type</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All Room Types</option>
              <option>Deluxe King</option>
              <option>Executive Suite</option>
              <option>Deluxe Twin</option>
              <option>Superior Queen</option>
            </select>
          </div>

          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Status</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Refunded</option>
            </select>
          </div>

          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Request Type</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All</option>
              <option>Late check-in</option>
              <option>Airport transfer</option>
              <option>High floor</option>
            </select>
          </div>

          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Source Channel</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e0d8] pb-3">
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
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-[#061224] border border-[#e5e0d8]"
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
              <thead className="border-b border-[#eee8de] bg-[#fbfaf7] text-slate-500 font-bold uppercase tracking-wider">
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
              <tbody className="divide-y divide-[#eee8de]">
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
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e5e0d8] bg-white px-2.5 py-1 text-[11px] font-bold text-[#061224] hover:bg-[#061224] hover:text-white transition-colors"
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e0d8] p-4 text-xs font-semibold text-slate-600">
          <span>Showing 1 to 7 of 126 reservations</span>
          <div className="flex items-center gap-1.5">
            <button className="rounded-lg border border-[#e5e0d8] p-1 text-slate-400 hover:bg-slate-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="rounded-lg bg-[#061224] px-2.5 py-1 text-white font-bold">1</button>
            <button className="rounded-lg border border-[#e5e0d8] px-2.5 py-1 hover:bg-slate-50">2</button>
            <button className="rounded-lg border border-[#e5e0d8] px-2.5 py-1 hover:bg-slate-50">3</button>
            <span className="px-1 text-slate-400">...</span>
            <button className="rounded-lg border border-[#e5e0d8] px-2.5 py-1 hover:bg-slate-50">18</button>
            <button className="rounded-lg border border-[#e5e0d8] p-1 text-slate-600 hover:bg-slate-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select className="rounded-lg border border-[#e5e0d8] bg-white px-2 py-1 outline-none">
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
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#e5e0d8] bg-[#fbfaf7] px-6">
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
          <div className="flex items-start justify-between border-b border-[#e5e0d8] pb-4">
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
          <div className="rounded-xl border border-[#e5e0d8] bg-[#fcfbf9] p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Stay Timeline</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#eee8de]">
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
            <div className="flex items-center justify-between border-t border-[#eee8de] pt-2 text-[11px] font-bold text-[#061224]">
              <span>{selectedBooking?.nights ?? 3} nights</span>
              <span>{selectedBooking?.guests ?? 2} Guests</span>
            </div>
          </div>

          {/* Room Details & Room Assignment */}
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-[#e5e0d8] p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Room Details</p>
              <p className="mt-1 font-bold text-[#061224]">{selectedBooking?.room ?? "Deluxe King (1205)"}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">1 King Bed • City View • 28 m²</p>
            </div>
            <div className="rounded-xl border border-[#e5e0d8] p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Room Assignment</p>
              <div className="mt-1.5 flex items-center justify-between">
                <select
                  value={assignedRoom}
                  onChange={(e) => setAssignedRoom(e.target.value)}
                  className="rounded-lg border border-[#e5e0d8] bg-white px-2 py-1 font-bold text-[#061224] outline-none"
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
          <div className="rounded-xl border border-[#e5e0d8] p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#061224]">Payment Summary</span>
            </div>
            <div className="space-y-1.5 pt-1 border-t border-[#eee8de]">
              <PayoutLine label="Total Amount" value="$712.50" />
              <PayoutLine label="Paid" value="$712.50" positive />
              <PayoutLine label="Balance" value="$0.00" />
              <PayoutLine label="Payment Method" value="Visa •••• 4242" />
            </div>
          </div>

          {/* Guest Requests & Pre-arrival Checklist */}
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-[#e5e0d8] p-3 space-y-1.5">
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

            <div className="rounded-xl border border-[#e5e0d8] p-3 space-y-1.5">
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
            <button className="rounded-xl border border-[#c8cdd6] bg-white py-2 font-bold text-[#061224] hover:bg-slate-50">
              Update Room
            </button>
            <button className="rounded-xl border border-[#c8cdd6] bg-white py-2 font-bold text-[#061224] hover:bg-slate-50">
              Send Message
            </button>
            <button className="col-span-2 rounded-xl border border-[#c8cdd6] bg-white py-2 font-bold text-[#061224] hover:bg-slate-50">
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
          <div className="space-y-2 text-xs border-t border-[#e5e0d8] pt-4">
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
          <div className="rounded-xl border border-[#e5e0d8] bg-white p-3 space-y-2 text-xs">
            <p className="font-bold text-[#061224]">Quick Communication</p>
            <div className="space-y-1.5">
              <button className="flex w-full items-center gap-2 rounded-lg border border-[#e5e0d8] px-3 py-1.5 font-semibold text-[#061224] hover:bg-slate-50">
                <MessageSquare className="h-3.5 w-3.5 text-slate-500" /> Message Guest
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg border border-[#e5e0d8] px-3 py-1.5 font-semibold text-[#061224] hover:bg-slate-50">
                <Phone className="h-3.5 w-3.5 text-slate-500" /> Call Guest
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg border border-[#e5e0d8] px-3 py-1.5 font-semibold text-[#061224] hover:bg-slate-50">
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
                <DollarSign className="h-3.5 w-3.5" /> Request Refund Review
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
            <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-xl border border-[#e5e0d8] text-center text-xs">
              {[
                { day: "Tue, May 20", arr: "18 Arrivals", pct: "72%", color: "bg-emerald-500" },
                { day: "Wed, May 21", arr: "21 Arrivals", pct: "78%", color: "bg-emerald-500" },
                { day: "Thu, May 22", arr: "16 Arrivals", pct: "68%", color: "bg-amber-500" },
                { day: "Fri, May 23", arr: "20 Arrivals", pct: "80%", color: "bg-amber-500" },
                { day: "Sat, May 24", arr: "24 Arrivals", pct: "92%", color: "bg-red-500" },
                { day: "Sun, May 25", arr: "15 Arrivals", pct: "60%", color: "bg-slate-400" },
                { day: "Mon, May 26", arr: "12 Arrivals", pct: "55%", color: "bg-slate-400" },
              ].map((item) => (
                <div key={item.day} className="border-r border-[#e5e0d8] p-3 last:border-r-0">
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
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e0d8] p-3 hover:bg-slate-50">
                <ChevronRight className="h-4 w-4 text-[#c89b3c]" />
                <span>18 Arrivals today – Ensure smooth check-ins</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e0d8] p-3 hover:bg-slate-50">
                <ChevronRight className="h-4 w-4 text-[#c89b3c]" />
                <span>5 No-show risk bookings – Review and follow up</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e0d8] p-3 hover:bg-slate-50">
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

function PartnerSidebar({
  open,
  collapsed,
  activeTab = "Overview",
  onSelectTab,
  onClose,
  onToggleCollapse,
}: {
  open: boolean;
  collapsed: boolean;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  onClose: () => void;
  onToggleCollapse: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = !collapsed || isHovered;

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={onClose}
          aria-label="Close partner menu overlay"
        />
      )}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#061224] text-white shadow-2xl transition-[transform,width] duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${isExpanded ? "w-[248px]" : "w-[248px] lg:w-20"}`}
      >
        <div
          className={`flex h-20 items-center border-b border-white/10 px-4 transition-all duration-300 ${
            !isExpanded ? "justify-between" : "justify-between px-5"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <KeyRound className="h-8 w-8 shrink-0 text-[#c89b3c]" />
            <div className={`transition-opacity duration-300 ${!isExpanded ? "hidden" : "block"}`}>
              <p className="text-xl font-bold uppercase tracking-wide leading-none text-white">Helpkey</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c89b3c] mt-0.5">
                Partner
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10 lg:block shrink-0 transition-colors"
            aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
            title={collapsed ? (isHovered ? "Pin expanded sidebar" : "Expand sidebar") : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <button type="button" onClick={onClose} className="ml-auto lg:hidden text-white/80">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          {navItems.map(([item, Icon]) => {
            const isActive = activeTab === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  if (onSelectTab) onSelectTab(item);
                  onClose();
                }}
                className={`group relative flex w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? "border-l-4 border-[#c89b3c] bg-[#112440] text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                } ${!isExpanded ? "justify-center px-0" : "gap-3.5 px-4"}`}
                title={!isExpanded ? item : undefined}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-[#c89b3c]" : ""}`} />
                <span className={`truncate transition-opacity duration-200 ${!isExpanded ? "hidden" : "block"}`}>
                  {item}
                </span>
                {item === "Messages" && isExpanded && (
                  <span className="ml-auto grid h-5 w-5 place-items-center rounded-full bg-[#c89b3c] text-[10px] font-bold text-[#061224]">
                    3
                  </span>
                )}
                {item === "Messages" && !isExpanded && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#c89b3c]" />
                )}
              </button>
            );
          })}
        </nav>

        <div className={`space-y-3 p-3 transition-opacity duration-300 ${!isExpanded ? "hidden" : "block"}`}>
          <div className="rounded-2xl border border-[#c89b3c]/30 bg-[#0d1e38] p-3.5">
            <p className="text-xs font-bold text-[#c89b3c]">Need help?</p>
            <p className="mt-1 text-[11px] leading-4 text-white/75">
              Our Partner Support team is here for you.
            </p>
            <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#c89b3c] px-3 py-1.5 text-xs font-bold text-[#c89b3c] hover:bg-[#c89b3c]/10 transition-colors">
              <Headphones className="h-3.5 w-3.5" />
              Contact Support
            </button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <p className="text-[11px] font-bold">Last synced</p>
                <p className="text-[10px] text-white/65">2 mins ago</p>
              </div>
              <ShieldCheck className="ml-auto h-4 w-4 text-white/75 shrink-0" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function DashboardCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-[#e5e0d8] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.03)] ${className}`}
    >
      {children}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  trend,
  trendType,
}: {
  icon: typeof UsersRound;
  title: string;
  value: string;
  trend: string;
  trendType: "up" | "down" | "attention" | "neutral";
}) {
  const trendClass =
    trendType === "up"
      ? "text-emerald-600"
      : trendType === "down"
        ? "text-red-500"
        : trendType === "attention"
          ? "text-[#c89b3c]"
          : "text-slate-500";

  return (
    <DashboardCard className="p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fbf5e8] text-[#c89b3c]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-600 truncate">{title}</p>
          <p className="mt-0.5 text-2xl font-extrabold leading-tight text-[#061224]">{value}</p>
          <p className={`mt-0.5 text-[11px] font-bold ${trendClass}`}>{trend}</p>
        </div>
      </div>
    </DashboardCard>
  );
}

function RevenueOccupancyDualChart() {
  const dates = ["May 18", "May 19", "May 20", "May 21", "May 22", "May 23", "May 24"];
  const revenueHeights = [115, 142, 112, 120, 110, 105, 138]; // in SVG pixels
  const linePoints = [
    { x: 50, y: 70 },   // 64%
    { x: 110, y: 55 },  // 75%
    { x: 170, y: 68 },  // 68%
    { x: 230, y: 62 },  // 70%
    { x: 290, y: 80 },  // 55%
    { x: 350, y: 75 },  // 60%
    { x: 410, y: 48 },  // 82%
  ];

  const pathD = `M ${linePoints.map((p) => `${p.x} ${p.y}`).join(" L ")}`;

  return (
    <div className="h-64 w-full rounded-xl border border-[#eee8de] bg-gradient-to-b from-white to-[#fcfbf9] p-4 relative">
      <svg viewBox="0 0 460 210" className="h-full w-full" preserveAspectRatio="none">
        {/* Horizontal grid lines & Y-axis labels */}
        {[30, 70, 110, 150, 190].map((y, index) => {
          const revLabels = ["$50K", "$40K", "$30K", "$20K", "$10K"];
          const occLabels = ["100%", "75%", "50%", "25%", "0%"];
          return (
            <g key={y}>
              <text x="5" y={y + 4} className="text-[9px] fill-slate-400 font-medium">
                {revLabels[index]}
              </text>
              <line x1="38" y1={y} x2="422" y2={y} stroke="#e5e0d8" strokeDasharray="3 3" strokeWidth="0.8" />
              <text x="428" y={y + 4} className="text-[9px] fill-slate-400 font-medium">
                {occLabels[index]}
              </text>
            </g>
          );
        })}

        {/* Revenue Bars */}
        {revenueHeights.map((h, index) => {
          const x = 38 + index * 60;
          return (
            <rect
              key={index}
              x={x}
              y={190 - h}
              width="24"
              height={h}
              rx="3"
              fill="#061224"
            />
          );
        })}

        {/* Occupancy Line & Nodes */}
        <path d={pathD} fill="none" stroke="#c89b3c" strokeWidth="2.5" />
        {linePoints.map((pt, index) => (
          <circle
            key={index}
            cx={pt.x}
            cy={pt.y}
            r="4.5"
            fill="#c89b3c"
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}

        {/* X Axis Date Labels */}
        {dates.map((date, index) => (
          <text
            key={date}
            x={50 + index * 60}
            y="206"
            textAnchor="middle"
            className="text-[9px] fill-slate-500 font-bold"
          >
            {date}
          </text>
        ))}
      </svg>
    </div>
  );
}

function OperationItem({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof UsersRound;
  title: string;
  detail: string;
  tone: "blue" | "gold" | "green" | "red";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    gold: "bg-[#fbf5e8] text-[#c89b3c] border-[#f5ebda]",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    red: "bg-red-50 text-red-500 border-red-100",
  };

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl border border-[#e5e0d8] p-2.5 text-left hover:bg-[#fcfbf9] transition-colors"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${colors[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-xs font-bold text-[#061224]">{title}</b>
        <small className="text-[11px] font-semibold text-slate-500">{detail}</small>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
    </button>
  );
}

function ActionRow({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof CircleAlert;
  title: string;
  detail: string;
  tone: "warning" | "info" | "gold" | "purple";
}) {
  const colors = {
    warning: "bg-amber-50 text-amber-600 border-amber-100",
    info: "bg-blue-50 text-blue-600 border-blue-100",
    gold: "bg-[#fbf5e8] text-[#c89b3c] border-[#f5ebda]",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
  };

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl border border-[#e5e0d8] p-2.5 text-left hover:bg-[#fcfbf9] transition-colors"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${colors[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-xs font-bold text-[#061224]">{title}</b>
        <small className="text-[11px] font-medium text-slate-500 truncate block">{detail}</small>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
    </button>
  );
}

function StatusChip({
  label: itemLabel,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "blue" | "neutral";
}) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${colors[tone]}`}>
      {itemLabel}
    </span>
  );
}

function PayoutLine({
  label: itemLabel,
  value,
  positive,
  icon,
}: {
  label: string;
  value: string;
  positive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-600 font-medium">{itemLabel}</span>
      <b className={positive ? "text-emerald-600 font-bold" : "text-[#061224] font-bold"}>
        {value}
        {icon}
      </b>
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

