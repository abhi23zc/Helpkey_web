"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  DollarSign,
  Grid2X2,
  Headphones,
  KeyRound,
  Mail,
  Menu,
  MessageCircle,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
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

export function PartnerDashboard() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const draftCount = properties.filter(
    (property) =>
      property.status === "draft" && property.approvalStatus === "not_submitted"
  ).length;
  const pendingCount = properties.filter(
    (property) => property.approvalStatus === "pending"
  ).length;
  const activeCount = properties.filter(
    (property) => property.status === "active"
  ).length;
  const changesCount = properties.filter((property) =>
    ["changes_requested", "rejected"].includes(property.approvalStatus)
  ).length;

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
              May 18 – May 24, 2025
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
            </button>
          </div>

          {/* Global Search Bar */}
          <div className="hidden h-12 items-center rounded-2xl border border-[#e5e0d8] bg-white px-4 shadow-xs md:flex xl:min-w-0">
            <Search className="h-4 w-4 text-slate-400 shrink-0 mr-2.5" />
            <span className="text-sm font-medium text-slate-400 truncate">
              Search reservations, guests, rooms...
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
                6
              </span>
            </button>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-[#061224] text-xs font-bold text-white ring-2 ring-[#c89b3c]/30 shadow-xs">
              AH
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold leading-tight text-[#061224]">Aurum Hospitality</p>
              <p className="text-[11px] font-semibold text-slate-500">Partner</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

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

        {/* Bottom Grid Layout (Reservations Table + Availability + Reviews & Payouts) */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          {/* Upcoming Reservations Table */}
          <DashboardCard className="overflow-hidden flex flex-col justify-between">
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

          {/* Right Column Stack */}
          <div className="space-y-4">
            {/* Room Availability Card */}
            <DashboardCard className="p-5">
              <h3 className="text-base font-bold text-[#061224]">Room Availability <span className="text-xs font-normal text-slate-500">(Next 7 Days)</span></h3>
              <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-xl border border-[#e5e0d8] text-center text-xs">
                {availabilityDays.map((day) => (
                  <div key={day.day} className="border-r border-[#e5e0d8] p-2.5 last:border-r-0">
                    <p className="font-bold text-slate-700">{day.day}</p>
                    <p className="text-[11px] text-slate-500">{day.date}</p>
                    <p className={`mt-2 text-base font-bold ${day.color}`}>
                      {day.value}
                    </p>
                    <p className={`text-[10px] font-semibold ${day.color}`}>{day.label}</p>
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
                    <span className="text-[10px] font-semibold text-slate-400">Latest Review</span>
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
        </div>
      </section>
    </main>
  );
}

function PartnerSidebar({
  open,
  collapsed,
  onClose,
  onToggleCollapse,
}: {
  open: boolean;
  collapsed: boolean;
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
          {navItems.map(([item, Icon], index) => (
            <button
              key={item}
              type="button"
              className={`group relative flex w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-all duration-200 ${
                index === 0
                  ? "border-l-4 border-[#c89b3c] bg-[#112440] text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              } ${!isExpanded ? "justify-center px-0" : "gap-3.5 px-4"}`}
              title={!isExpanded ? item : undefined}
            >
              <Icon className={`h-5 w-5 shrink-0 ${index === 0 ? "text-[#c89b3c]" : ""}`} />
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
          ))}
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

