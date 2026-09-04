"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ClipboardList,
  Clock3,
  CreditCard,
  Crown,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Flag,
  Grid2X2,
  Headphones,
  History,
  Hourglass,
  Image,
  Info,
  KeyRound,
  Mail,
  MapPin,
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
  Reply,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  UserX,
  UsersRound,
  UtensilsCrossed,
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
        ) : activeTab === "Rooms & Rates" ? (
          <PartnerRoomsRatesView propertyName={propertyName} />
        ) : activeTab === "Property Listing" ? (
          <PartnerPropertyListingView propertyName={propertyName} />
        ) : activeTab === "Reviews" ? (
          <PartnerReviewsView propertyName={propertyName} />
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

type RoomInventoryCell = {
  available: number;
  price: number;
  status: "available" | "low" | "sold_out" | "price_changed";
};

type RoomInventoryRow = {
  id: string;
  name: string;
  totalRooms: number;
  image: string;
  rates: Record<string, RoomInventoryCell>;
};

const dateColumns = [
  { key: "may20", day: "Tue 20", dateStr: "May 20, 2025", forecast: "68%" },
  { key: "may21", day: "Wed 21", dateStr: "May 21, 2025", forecast: "72%" },
  { key: "may22", day: "Thu 22", dateStr: "May 22, 2025", forecast: "78%" },
  { key: "may23", day: "Fri 23", dateStr: "May 23, 2025", forecast: "82%" },
  { key: "may24", day: "Sat 24", dateStr: "May 24, 2025", forecast: "86%" },
  { key: "may25", day: "Sun 25", dateStr: "May 25, 2025", forecast: "76%" },
  { key: "may26", day: "Mon 26", dateStr: "May 26, 2025", forecast: "69%" },
  { key: "may27", day: "Tue 27", dateStr: "May 27, 2025", forecast: "63%" },
  { key: "may28", day: "Wed 28", dateStr: "May 28, 2025", forecast: "61%" },
  { key: "may29", day: "Thu 29", dateStr: "May 29, 2025", forecast: "58%" },
];

const roomTypeRows: RoomInventoryRow[] = [
  {
    id: "deluxe-king",
    name: "Deluxe King",
    totalRooms: 32,
    image: "/balmoral_hotel.png",
    rates: {
      may20: { available: 18, price: 465, status: "available" },
      may21: { available: 16, price: 465, status: "available" },
      may22: { available: 14, price: 475, status: "available" },
      may23: { available: 8, price: 485, status: "low" },
      may24: { available: 3, price: 495, status: "low" },
      may25: { available: 2, price: 495, status: "low" },
      may26: { available: 6, price: 485, status: "available" },
      may27: { available: 12, price: 475, status: "available" },
      may28: { available: 15, price: 465, status: "available" },
      may29: { available: 17, price: 465, status: "available" },
    },
  },
  {
    id: "exec-suite",
    name: "Executive Suite",
    totalRooms: 18,
    image: "/balmoral_hotel.png",
    rates: {
      may20: { available: 10, price: 895, status: "available" },
      may21: { available: 9, price: 895, status: "available" },
      may22: { available: 8, price: 915, status: "available" },
      may23: { available: 5, price: 925, status: "available" },
      may24: { available: 2, price: 995, status: "low" },
      may25: { available: 1, price: 995, status: "low" },
      may26: { available: 3, price: 955, status: "low" },
      may27: { available: 6, price: 925, status: "available" },
      may28: { available: 8, price: 905, status: "available" },
      may29: { available: 9, price: 895, status: "available" },
    },
  },
  {
    id: "deluxe-twin",
    name: "Deluxe Twin",
    totalRooms: 28,
    image: "/balmoral_hotel.png",
    rates: {
      may20: { available: 15, price: 365, status: "available" },
      may21: { available: 13, price: 365, status: "available" },
      may22: { available: 10, price: 375, status: "available" },
      may23: { available: 6, price: 375, status: "available" },
      may24: { available: 2, price: 385, status: "low" },
      may25: { available: 0, price: 0, status: "sold_out" },
      may26: { available: 2, price: 385, status: "low" },
      may27: { available: 7, price: 375, status: "available" },
      may28: { available: 11, price: 365, status: "available" },
      may29: { available: 13, price: 365, status: "available" },
    },
  },
  {
    id: "premier-king",
    name: "Premier King",
    totalRooms: 24,
    image: "/balmoral_hotel.png",
    rates: {
      may20: { available: 11, price: 625, status: "available" },
      may21: { available: 10, price: 625, status: "available" },
      may22: { available: 8, price: 645, status: "available" },
      may23: { available: 4, price: 655, status: "low" },
      may24: { available: 1, price: 695, status: "low" },
      may25: { available: 1, price: 695, status: "low" },
      may26: { available: 2, price: 665, status: "low" },
      may27: { available: 5, price: 645, status: "available" },
      may28: { available: 7, price: 625, status: "available" },
      may29: { available: 9, price: 625, status: "available" },
    },
  },
  {
    id: "family-suite",
    name: "Family Suite",
    totalRooms: 12,
    image: "/balmoral_hotel.png",
    rates: {
      may20: { available: 6, price: 725, status: "available" },
      may21: { available: 6, price: 725, status: "available" },
      may22: { available: 5, price: 745, status: "available" },
      may23: { available: 3, price: 755, status: "low" },
      may24: { available: 1, price: 795, status: "low" },
      may25: { available: 1, price: 795, status: "low" },
      may26: { available: 1, price: 775, status: "low" },
      may27: { available: 2, price: 755, status: "low" },
      may28: { available: 4, price: 745, status: "low" },
      may29: { available: 5, price: 725, status: "available" },
    },
  },
];

function PartnerRoomsRatesView({ propertyName }: { propertyName: string }) {
  const [selectedRoomId, setSelectedRoomId] = useState("deluxe-king");
  const [selectedDateKey, setSelectedDateKey] = useState("may24");
  const [selectedTab, setSelectedTab] = useState("Inventory Calendar");

  const selectedRoom = useMemo(
    () => roomTypeRows.find((r) => r.id === selectedRoomId) || roomTypeRows[0],
    [selectedRoomId]
  );

  const selectedDate = useMemo(
    () => dateColumns.find((d) => d.key === selectedDateKey) || dateColumns[4],
    [selectedDateKey]
  );

  const selectedCell = selectedRoom.rates[selectedDateKey] || { available: 3, price: 495, status: "low" };

  const [priceInput, setPriceInput] = useState(selectedCell.price);
  const [availabilityInput, setAvailabilityInput] = useState(selectedCell.available);
  const [minStayInput, setMinStayInput] = useState(1);
  const [ctaInput, setCtaInput] = useState(0);
  const [ctdInput, setCtdInput] = useState(0);
  const [breakfastIncluded, setBreakfastIncluded] = useState(true);
  const [refundable, setRefundable] = useState(true);

  useEffect(() => {
    setPriceInput(selectedCell.price);
    setAvailabilityInput(selectedCell.available);
  }, [selectedRoomId, selectedDateKey, selectedCell]);

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#061224]">
            Rooms &amp; Rates
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Manage inventory, pricing, availability and booking restrictions for {propertyName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Room Type
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            Bulk Update Rates
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Sync Channel Calendar
          </button>
        </div>
      </div>

      {/* 5 Snapshot KPI Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={BedDouble}
          title="Available Rooms"
          value="128 / 156"
          trend="↑ 12 vs last 7 days"
          trendType="up"
        />
        <MetricCard
          icon={Tag}
          title="Average Daily Rate"
          value="$487"
          trend="↑ 6% vs last 7 days"
          trendType="up"
        />
        <MetricCard
          icon={TrendingUp}
          title="Occupancy Forecast"
          value="74%"
          trend="↑ 8% vs last 7 days"
          trendType="up"
        />
        <MetricCard
          icon={ArrowUpRight}
          title="Revenue Opportunity"
          value="$8,430"
          trend="↑ High opportunity"
          trendType="up"
        />
        <MetricCard
          icon={AlertTriangle}
          title="Low Availability Dates"
          value="5 dates"
          trend="Next: May 24, May 25"
          trendType="down"
        />
      </div>

      {/* Filter Bar Card */}
      <DashboardCard className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Room Type</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All Room Types</option>
              <option>Deluxe King</option>
              <option>Executive Suite</option>
              <option>Deluxe Twin</option>
              <option>Premier King</option>
              <option>Family Suite</option>
            </select>
          </div>

          <div className="min-w-[170px] flex-1">
            <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Date Range</label>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224]">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>May 20 – May 29, 2025</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-auto" />
            </div>
          </div>

          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Rate Plan</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>Best Flexible Rate</option>
              <option>Non-Refundable 15% Off</option>
              <option>Early Bird Saver</option>
            </select>
          </div>

          <div className="min-w-[150px] flex-1">
            <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Availability Status</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All Statuses</option>
              <option>Available (5+)</option>
              <option>Low (1-4)</option>
              <option>Sold Out (0)</option>
            </select>
          </div>

          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Restrictions</label>
            <select className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224] outline-none">
              <option>All</option>
              <option>Min Stay Required</option>
              <option>Closed to Arrival</option>
              <option>Closed to Departure</option>
            </select>
          </div>

          <div className="pt-2 sm:pt-0">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#061224] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c] transition-colors"
            >
              <Filter className="h-3.5 w-3.5" />
              Apply Filters
            </button>
          </div>
        </div>
      </DashboardCard>

      {/* Sub-Navigation Pill Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e0d8] pb-3">
        {[
          ["Inventory Calendar", CalendarDays],
          ["Room Types", BedDouble],
          ["Rate Plans", Tag],
          ["Restrictions", ShieldCheck],
          ["Promotions", Sparkles],
        ].map(([tabName, TabIcon]) => {
          const isActive = selectedTab === tabName;
          const IconComp = TabIcon as typeof CalendarDays;
          return (
            <button
              key={tabName as string}
              type="button"
              onClick={() => setSelectedTab(tabName as string)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                isActive
                  ? "bg-[#061224] text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-[#061224] border border-[#e5e0d8]"
              }`}
            >
              <IconComp className="h-4 w-4" />
              {tabName as string}
            </button>
          );
        })}
      </div>

      {/* Main Grid: Left Matrix Table + Right Editor Inspector Panel */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Left Column: Inventory Matrix Table Card */}
        <DashboardCard className="p-5 flex flex-col justify-between overflow-hidden">
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  {/* Occupancy Forecast Row */}
                  <tr className="border-b border-[#eee8de] bg-[#fcfbf9]">
                    <th className="p-3 font-semibold text-slate-500 min-w-[160px]">
                      <div className="flex items-center gap-1.5">
                        <span>Occupancy Forecast</span>
                        <Info className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                    </th>
                    {dateColumns.map((col) => (
                      <th key={col.key} className="p-2 text-center font-bold text-[#061224]">
                        {col.forecast}
                      </th>
                    ))}
                  </tr>

                  {/* Dates Header Row */}
                  <tr className="border-b border-[#eee8de] bg-[#fbfaf7] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-3">May 2025</th>
                    {dateColumns.map((col) => {
                      const isSelected = selectedDateKey === col.key;
                      return (
                        <th
                          key={col.key}
                          className={`p-2 text-center transition-colors ${
                            isSelected ? "bg-[#fbf5e8] text-[#c89b3c] font-bold" : "text-slate-500"
                          }`}
                        >
                          {col.day}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#eee8de]">
                  {roomTypeRows.map((room) => (
                    <tr key={room.id} className="hover:bg-[#fcfbf9]/50 transition-colors">
                      {/* Room Header Cell */}
                      <td className="p-3 font-semibold text-[#061224] min-w-[160px]">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-10 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                            <img
                              src={room.image}
                              alt={room.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div>
                            <p className="font-bold leading-tight text-[#061224]">{room.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{room.totalRooms} Rooms</p>
                          </div>
                        </div>
                      </td>

                      {/* 10 Date Matrix Cells */}
                      {dateColumns.map((col) => {
                        const cell = room.rates[col.key];
                        const isSelected = selectedRoomId === room.id && selectedDateKey === col.key;
                        const isSoldOut = cell.status === "sold_out";

                        return (
                          <td
                            key={col.key}
                            onClick={() => {
                              setSelectedRoomId(room.id);
                              setSelectedDateKey(col.key);
                            }}
                            className={`cursor-pointer p-1.5 text-center transition-all ${
                              isSelected
                                ? "bg-[#fffdf7] ring-1.5 ring-[#c89b3c] rounded-xl shadow-xs"
                                : "hover:bg-[#f9f7f2]"
                            }`}
                          >
                            <div
                              className={`flex flex-col items-center justify-center rounded-lg p-1.5 ${
                                isSoldOut
                                  ? "bg-red-50 text-red-600"
                                  : isSelected
                                  ? "bg-[#fbf5e8]"
                                  : ""
                              }`}
                            >
                              <span
                                className={`text-xs font-bold ${
                                  isSoldOut ? "text-red-600 uppercase text-[10px]" : "text-[#061224]"
                                }`}
                              >
                                {isSoldOut ? "Sold Out" : cell.available}
                              </span>
                              <span
                                className={`text-[11px] font-medium ${
                                  isSoldOut ? "text-red-400" : "text-slate-500"
                                }`}
                              >
                                {isSoldOut ? "-" : `$${cell.price}`}
                              </span>
                              {!isSoldOut && (
                                <span
                                  className={`mt-1 h-1.5 w-1.5 rounded-full ${
                                    cell.status === "available"
                                      ? "bg-emerald-500"
                                      : cell.status === "low"
                                      ? "bg-amber-500"
                                      : "bg-blue-500"
                                  }`}
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Matrix Legend Footer */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 border-t border-[#eee8de] pt-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available (5+)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Low (1-4)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Sold Out (0)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Price Changed
              </span>
            </div>
          </div>

          {/* Action Bar Footer */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e0d8] pt-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Info className="h-4 w-4 text-blue-500 shrink-0" />
              <span>
                Bulk changes require confirmation. Use <strong>Bulk Update Rates</strong> to edit multiple dates or room types.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2 text-xs font-bold text-[#061224] hover:bg-slate-50"
              >
                Bulk Update Rates
              </button>
              <button
                type="button"
                className="rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Reset Changes
              </button>
              <button
                type="button"
                className="rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2 text-xs font-bold text-[#061224] hover:bg-slate-50 inline-flex items-center gap-1"
              >
                Preview Public Rate <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded-xl bg-[#061224] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </DashboardCard>

        {/* Right Column: Rate & Availability Inspector Panel */}
        <div className="space-y-4">
          <DashboardCard className="p-5 space-y-5">
            {/* Top Room Overview Card */}
            <div className="flex items-start gap-3 border-b border-[#e5e0d8] pb-4">
              <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-200">
                <img
                  src={selectedRoom.image}
                  alt={selectedRoom.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-[#061224] truncate">{selectedRoom.name}</h3>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{selectedRoom.totalRooms} Rooms Total</p>

                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
                  <div className="rounded-lg bg-[#fcfbf9] border border-[#e5e0d8] p-1.5">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Base Rate</p>
                    <p className="font-extrabold text-[#061224]">${selectedCell.price}<span className="text-[9px] font-normal text-slate-400">/night</span></p>
                  </div>
                  <div className="rounded-lg bg-[#fcfbf9] border border-[#e5e0d8] p-1.5">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Available</p>
                    <p className="font-extrabold text-[#061224]">{selectedCell.available} Rooms</p>
                  </div>
                  <div className="rounded-lg bg-[#fcfbf9] border border-[#e5e0d8] p-1.5">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Occupancy</p>
                    <p className="font-extrabold text-[#061224]">91%</p>
                  </div>
                  <div className="rounded-lg bg-[#fcfbf9] border border-[#e5e0d8] p-1.5">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Revenue (Wk)</p>
                    <p className="font-extrabold text-[#061224]">$7,425</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Rate Plan & Policy */}
            <div className="grid grid-cols-2 gap-2 text-xs border-b border-[#e5e0d8] pb-4">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Rate Plan</p>
                <p className="font-bold text-[#061224]">Best Flexible Rate</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Cancellation Policy</p>
                <p className="font-medium text-slate-700">Free cancellation until 24 hrs before arrival</p>
              </div>
            </div>

            {/* Form Editor for Selected Cell */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#061224]">
                  Update for {selectedDate.day}, {selectedDate.dateStr}
                </h4>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Price Input */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">Price (USD)</label>
                  <div className="flex h-10 items-center rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-bold text-[#061224]">
                    <span className="text-slate-400 mr-2">$</span>
                    <input
                      type="number"
                      value={priceInput}
                      onChange={(e) => setPriceInput(Number(e.target.value))}
                      className="w-full bg-transparent font-bold outline-none"
                    />
                  </div>
                </div>

                {/* Availability Input */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">Availability</label>
                  <input
                    type="number"
                    value={availabilityInput}
                    onChange={(e) => setAvailabilityInput(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-bold text-[#061224] outline-none"
                  />
                </div>

                {/* Min Stay Input */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">Min Stay</label>
                  <div className="flex h-10 items-center justify-between rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224]">
                    <input
                      type="number"
                      value={minStayInput}
                      onChange={(e) => setMinStayInput(Number(e.target.value))}
                      className="w-12 bg-transparent font-bold outline-none"
                    />
                    <span className="text-slate-400 text-[11px]">nights</span>
                  </div>
                </div>

                {/* Close to Arrival */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">Close to Arrival</label>
                  <div className="flex h-10 items-center justify-between rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224]">
                    <input
                      type="number"
                      value={ctaInput}
                      onChange={(e) => setCtaInput(Number(e.target.value))}
                      className="w-12 bg-transparent font-bold outline-none"
                    />
                    <span className="text-slate-400 text-[11px]">days</span>
                  </div>
                </div>

                {/* Close to Departure */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">Close to Departure</label>
                  <div className="flex h-10 items-center justify-between rounded-xl border border-[#e5e0d8] bg-white px-3 text-xs font-semibold text-[#061224]">
                    <input
                      type="number"
                      value={ctdInput}
                      onChange={(e) => setCtdInput(Number(e.target.value))}
                      className="w-12 bg-transparent font-bold outline-none"
                    />
                    <span className="text-slate-400 text-[11px]">days</span>
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#e5e0d8] pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Breakfast Included</span>
                  <button
                    type="button"
                    onClick={() => setBreakfastIncluded(!breakfastIncluded)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                      breakfastIncluded ? "bg-[#061224]" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        breakfastIncluded ? "translate-x-4" : "translate-x-0.5"
                      } mt-0.5`}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Refundable</span>
                  <button
                    type="button"
                    onClick={() => setRefundable(!refundable)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                      refundable ? "bg-[#061224]" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        refundable ? "translate-x-4" : "translate-x-0.5"
                      } mt-0.5`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* AI Rate Insight Box */}
            <div className="rounded-xl border border-[#c89b3c]/40 bg-[#fbf5e8] p-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#9a6b18] font-bold">
                <Star className="h-4 w-4 fill-current" />
                <span>Rate Insight</span>
              </div>
              <p className="text-[#061224] text-[11px] font-medium leading-relaxed">
                Increase rate by 8% for May 24 due to high demand.
              </p>
              <button
                type="button"
                onClick={() => setPriceInput(Math.round(priceInput * 1.08))}
                className="w-full rounded-lg bg-[#c89b3c] py-1.5 text-xs font-bold text-[#061224] hover:bg-[#b5892c] transition-colors"
              >
                Apply Suggested Rate
              </button>
            </div>

            {/* Upcoming Restrictions */}
            <div className="rounded-xl border border-[#e5e0d8] p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#061224] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" /> Upcoming Restrictions
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">2</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-slate-600 pt-1 border-t border-[#eee8de]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#061224]">May 24 – May 25</span>
                  <span>Min Stay 2 nights</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#061224]">May 31 – Jun 02</span>
                  <span>Close to Arrival 1 day</span>
                </div>
              </div>
            </div>

            {/* Change Preview */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2 text-xs">
              <span className="font-bold text-emerald-900">Change Preview</span>
              <p className="text-[10px] text-emerald-700">If you save these changes:</p>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="rounded-lg bg-white p-2 border border-emerald-200">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Revenue Impact</p>
                  <p className="font-black text-emerald-600">+$210</p>
                  <p className="text-[9px] text-slate-400">(This Date)</p>
                </div>
                <div className="rounded-lg bg-white p-2 border border-emerald-200">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Occupancy Impact</p>
                  <p className="font-black text-emerald-600">+3%</p>
                  <p className="text-[9px] text-slate-400">(This Date)</p>
                </div>
                <div className="rounded-lg bg-white p-2 border border-emerald-200">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">ADR Impact</p>
                  <p className="font-black text-emerald-600">+$40</p>
                  <p className="text-[9px] text-slate-400">(This Date)</p>
                </div>
              </div>
            </div>

            {/* Recent Audit Log */}
            <div className="space-y-2 text-xs border-t border-[#e5e0d8] pt-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#061224]">Recent Audit Log</span>
                <button className="text-[10px] font-bold text-[#061224] hover:underline">View All →</button>
              </div>
              <div className="space-y-1.5 text-[11px] text-slate-600">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 shrink-0">May 20, 10:32 AM</span>
                  <span className="font-semibold text-slate-800 text-right">Robert Smith updated rates for Deluxe King (May 24)</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 shrink-0">May 20, 09:15 AM</span>
                  <span className="font-semibold text-slate-800 text-right">Bulk rate update applied to 3 room types</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 shrink-0">May 19, 04:45 PM</span>
                  <span className="font-semibold text-slate-800 text-right">Restriction added: Min Stay 2 nights (May 24-25)</span>
                </div>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>

      {/* Bottom Card: Room Type Performance (Last 7 Days) */}
      <DashboardCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#061224]">Room Type Performance (Last 7 Days)</h3>
          <button className="text-xs font-bold text-[#061224] hover:underline">View All Performance →</button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              name: "Deluxe King",
              image: "/balmoral_hotel.png",
              adr: "$478",
              adrTrend: "↑ 6%",
              occ: "88%",
              occTrend: "↑ 7%",
              rev: "$13,384",
              revTrend: "↑ 12%",
              rating: "4.7 ★",
            },
            {
              name: "Executive Suite",
              image: "/balmoral_hotel.png",
              adr: "$912",
              adrTrend: "↑ 5%",
              occ: "83%",
              occTrend: "↑ 6%",
              rev: "$13,652",
              revTrend: "↑ 10%",
              rating: "4.8 ★",
            },
            {
              name: "Deluxe Twin",
              image: "/balmoral_hotel.png",
              adr: "$368",
              adrTrend: "↑ 4%",
              occ: "78%",
              occTrend: "↑ 3%",
              rev: "$7,926",
              revTrend: "↑ 6%",
              rating: "4.6 ★",
            },
          ].map((item) => (
            <div key={item.name} className="rounded-2xl border border-[#e5e0d8] bg-[#fcfbf9] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-[#061224] truncate">{item.name}</h4>
                  <span className="text-[10px] font-extrabold text-[#c89b3c]">{item.rating}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-white p-2 border border-[#eee8de]">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">ADR</p>
                  <p className="font-extrabold text-[#061224]">{item.adr}</p>
                  <p className="text-[9px] font-bold text-emerald-600">{item.adrTrend}</p>
                </div>
                <div className="rounded-xl bg-white p-2 border border-[#eee8de]">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Occ</p>
                  <p className="font-extrabold text-[#061224]">{item.occ}</p>
                  <p className="text-[9px] font-bold text-emerald-600">{item.occTrend}</p>
                </div>
                <div className="rounded-xl bg-white p-2 border border-[#eee8de]">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Revenue</p>
                  <p className="font-extrabold text-[#061224]">{item.rev}</p>
                  <p className="text-[9px] font-bold text-emerald-600">{item.revTrend}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
}

function PartnerPropertyListingView({ propertyName }: { propertyName: string }) {
  const [activeCategory, setActiveCategory] = useState("Photos & Gallery");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [adminNote, setAdminNote] = useState("");
  const [captionInput, setCaptionInput] = useState("Deluxe King Room with City View");
  const [tagAreaInput, setTagAreaInput] = useState("Guest Room");
  const [altTextInput, setAltTextInput] = useState(
    "Spacious deluxe king room with large window overlooking the city skyline."
  );
  const [photoVisible, setPhotoVisible] = useState(true);

  // 8 Photo Gallery Dataset
  const galleryPhotos = [
    {
      id: 1,
      title: "Deluxe Suite Cover",
      src: "/balmoral_hotel.png",
      quality: "High Quality",
      qualityTone: "green",
      isCover: true,
      hasAlt: true,
      caption: "Deluxe King Room with City View",
      tag: "Guest Room",
      alt: "Spacious deluxe king room with large window overlooking the city skyline.",
    },
    {
      id: 2,
      title: "Ensuite Bathroom",
      src: "/balmoral_hotel.png",
      quality: "High Quality",
      qualityTone: "green",
      isCover: false,
      hasAlt: true,
      caption: "Marble ensuite bathroom with rain shower",
      tag: "Bathroom",
      alt: "Luxury marble bathroom with glass rain shower and lighted vanity.",
    },
    {
      id: 3,
      title: "City View Balcony",
      src: "/balmoral_hotel.png",
      quality: "High Quality",
      qualityTone: "green",
      isCover: false,
      hasAlt: true,
      caption: "Private balcony overlooking city center",
      tag: "Outdoor / Balcony",
      alt: "Private balcony with lounge seating facing the city panorama.",
    },
    {
      id: 4,
      title: "Hotel Dining Room",
      src: "/balmoral_hotel.png",
      quality: "Medium Quality",
      qualityTone: "amber",
      isCover: false,
      hasAlt: true,
      caption: "Gourmet breakfast restaurant hall",
      tag: "Dining / Restaurant",
      alt: "Spacious restaurant hall with breakfast buffet setup.",
    },
    {
      id: 5,
      title: "Grand Lobby Entrance",
      src: "/balmoral_hotel.png",
      quality: "High Quality",
      qualityTone: "green",
      isCover: false,
      hasAlt: true,
      caption: "Grand lobby entrance and concierge desk",
      tag: "Lobby / Entrance",
      alt: "Elegant hotel lobby with chandelier lighting and marble floor.",
    },
    {
      id: 6,
      title: "Cocktail Lounge",
      src: "/balmoral_hotel.png",
      quality: "High Quality",
      qualityTone: "green",
      isCover: false,
      hasAlt: true,
      caption: "Cozy cocktail lounge bar area",
      tag: "Bar & Lounge",
      alt: "Warmly lit lounge bar with plush armchairs and premium spirits display.",
    },
    {
      id: 7,
      title: "Fitness Center Gym",
      src: "/balmoral_hotel.png",
      quality: "Low Quality",
      qualityTone: "red",
      isCover: false,
      hasAlt: false,
      caption: "24-hour fitness center gym",
      tag: "Wellness / Gym",
      alt: "",
    },
    {
      id: 8,
      title: "Indoor Heated Pool",
      src: "/balmoral_hotel.png",
      quality: "Medium Quality",
      qualityTone: "amber",
      isCover: false,
      hasAlt: true,
      caption: "Indoor heated swimming pool & sauna",
      tag: "Pool & Spa",
      alt: "Indoor illuminated heated swimming pool with sun loungers.",
    },
  ];

  const currentPhoto = galleryPhotos[selectedPhotoIndex] || galleryPhotos[0];

  const categories = [
    { name: "Basic Details", icon: Building2, status: "complete" },
    { name: "Photos & Gallery", icon: Image, status: "active" },
    { name: "Rooms", icon: BedDouble, status: "complete" },
    { name: "Amenities", icon: UtensilsCrossed, status: "complete" },
    { name: "Policies", icon: FileText, status: "warning" },
    { name: "Location", icon: MapPin, status: "complete" },
    { name: "Safety Documents", icon: ShieldCheck, status: "warning" },
    { name: "Guest Experience", icon: UsersRound, status: "complete" },
    { name: "SEO & Visibility", icon: Search, status: "incomplete" },
  ];

  // Update form fields when photo selection changes
  const handleSelectPhoto = (index: number) => {
    setSelectedPhotoIndex(index);
    const photo = galleryPhotos[index];
    if (photo) {
      setCaptionInput(photo.caption);
      setTagAreaInput(photo.tag);
      setAltTextInput(photo.alt);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight text-[#061224]">
              Property Listing Editor
            </h2>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Keep your hotel profile complete, accurate and ready for guests for {propertyName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="hidden xl:flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 mr-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Autosaved 2 mins ago • All changes saved</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            Preview Public Listing <ArrowUpRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            Save Draft
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#c8cdd6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-colors"
          >
            <Eye className="h-4 w-4" />
            Preview Listing
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c] transition-colors"
          >
            Submit for Review <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 5 Snapshot KPI Score Header Row */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {/* Listing Health Score Card */}
        <DashboardCard className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative grid h-14 w-14 place-items-center shrink-0">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-slate-200"
                  strokeWidth="3"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#c89b3c]"
                  strokeDasharray="92, 100"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center leading-none">
                <span className="text-sm font-extrabold text-[#061224]">92</span>
                <span className="block text-[8px] font-semibold text-slate-400">/100</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">LISTING HEALTH</p>
                <Info className="h-3 w-3 text-slate-400" />
              </div>
              <span className="inline-block mt-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 border border-emerald-200">
                ✔ Excellent
              </span>
              <p className="mt-1 text-[10px] text-slate-500 font-medium leading-tight">3 improvements can boost visibility</p>
            </div>
          </div>
        </DashboardCard>

        {/* Completion Progress Card */}
        <DashboardCard className="p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">COMPLETION</span>
              <Info className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-[#061224]">92%</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 border border-slate-200">
                <div className="h-full w-[92%] rounded-full bg-[#c89b3c]" />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 font-medium">Great progress! Almost there.</p>
          </div>
          <button className="text-left text-[11px] font-bold text-[#061224] hover:underline mt-1">
            View checklist →
          </button>
        </DashboardCard>

        {/* Status Card */}
        <DashboardCard className="p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">STATUS</span>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-lg font-bold text-[#061224]">Live</span>
            </div>
          </div>
          <p className="text-[11px] font-medium text-slate-500">Visible to guests</p>
        </DashboardCard>

        {/* Last Updated Card */}
        <DashboardCard className="p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">LAST UPDATED</span>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[#061224]">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>May 12, 2025, 10:24 AM</span>
            </div>
          </div>
          <p className="text-[11px] font-medium text-slate-500">by Alex Morgan</p>
        </DashboardCard>

        {/* Pending Changes Card */}
        <DashboardCard className="p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">PENDING CHANGES</span>
              <Info className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-1 text-2xl font-bold tracking-tight text-[#061224]">12</p>
          </div>
          <p className="text-[11px] font-medium text-slate-500">Sections to review</p>
        </DashboardCard>
      </div>

      {/* Main 3-Column Workspace */}
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        {/* Left Vertical Section Selector Column */}
        <div className="space-y-3">
          <DashboardCard className="p-2 space-y-1">
            {categories.map((cat) => {
              const isActive = cat.name === activeCategory;
              const IconComp = cat.icon;

              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(cat.name)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-[#fbf5e8] text-[#061224] border-l-4 border-[#c89b3c] shadow-2xs font-bold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-[#061224]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <IconComp className={`h-4 w-4 shrink-0 ${isActive ? "text-[#c89b3c]" : "text-slate-400"}`} />
                    <span className="truncate">{cat.name}</span>
                  </div>

                  {cat.status === "complete" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  )}
                  {cat.status === "warning" && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  {cat.status === "active" && (
                    <span className="h-2 w-2 rounded-full bg-[#c89b3c] shrink-0" />
                  )}
                  {cat.status === "incomplete" && (
                    <span className="h-3 w-3 rounded-full border border-slate-300 shrink-0" />
                  )}
                </button>
              );
            })}
          </DashboardCard>

          {/* Bottom Version History Box */}
          <DashboardCard className="p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#061224]">
              <History className="h-4 w-4 text-slate-400 shrink-0" />
              <span>Version History</span>
            </div>
            <button className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#061224] hover:underline">
              View all saved versions <ChevronRight className="h-3 w-3" />
            </button>
          </DashboardCard>
        </div>

        {/* Middle Canvas Column (Active Category: Photos & Gallery) */}
        <div className="space-y-4">
          <DashboardCard className="p-5 space-y-5">
            {/* Header Title & Photo Tips Button */}
            <div className="flex items-start justify-between border-b border-[#e5e0d8] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[#061224]">{activeCategory}</h3>
                  <Info className="h-4 w-4 text-slate-400" />
                </div>
                <p className="mt-1 text-xs text-slate-500 font-medium">
                  High-quality photos help guests trust your listing and book with confidence.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#c8cdd6] bg-white px-3 py-1.5 text-xs font-semibold text-[#061224] hover:bg-slate-50"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#c89b3c]" />
                Photo Tips
              </button>
            </div>

            {/* Cover Photo Hero Section & Drag & Drop Upload Zone */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Cover Photo Hero Preview */}
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cover Photo (Primary Image)</p>
                <div className="relative h-56 w-full overflow-hidden rounded-2xl border border-[#e5e0d8] bg-slate-900 group">
                  <img
                    src={currentPhoto.src}
                    alt={currentPhoto.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Gold Crown Badge Top Left */}
                  <div className="absolute top-3 left-3 grid h-7 w-7 place-items-center rounded-full bg-[#c89b3c] text-[#061224] shadow-md">
                    <Crown className="h-4 w-4 fill-current" />
                  </div>
                  {/* Badges Bottom Bar */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <span className="rounded-lg bg-[#061224]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
                      COVER IMAGE
                    </span>
                    <span className="rounded-lg bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-xs flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> High Quality
                    </span>
                  </div>
                </div>
              </div>

              {/* Drag & Drop Upload Box */}
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Upload New Photos</p>
                <div className="flex h-56 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#d8d3c9] bg-[#fdfcf9] p-4 text-center hover:border-[#c89b3c] transition-colors">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-600 mb-2">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="text-xs font-semibold text-[#061224]">Drag &amp; drop photos here</p>
                  <p className="text-[11px] text-slate-400 my-1">or</p>
                  <button
                    type="button"
                    className="rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0a1f3c]"
                  >
                    Upload Photos
                  </button>
                  <p className="mt-2 text-[10px] text-slate-400 font-medium">
                    JPG, PNG up to 15MB • Min. 1200px on longest side
                  </p>
                </div>
              </div>
            </div>

            {/* Gallery Grid (8 / 24 photos) */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5e0d8] pt-4">
                <div className="flex items-center gap-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#061224]">
                    Gallery (8/24 photos)
                  </h4>
                  <span className="text-[11px] font-medium text-slate-400">⋮⋮ Drag to reorder</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                  <span>Photo {selectedPhotoIndex + 1} of 8</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelectPhoto(Math.max(0, selectedPhotoIndex - 1))}
                      className="rounded-lg border border-[#e5e0d8] p-1 hover:bg-slate-50"
                      disabled={selectedPhotoIndex === 0}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPhoto(Math.min(galleryPhotos.length - 1, selectedPhotoIndex + 1))}
                      className="rounded-lg border border-[#e5e0d8] p-1 hover:bg-slate-50"
                      disabled={selectedPhotoIndex === galleryPhotos.length - 1}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 8 Photo Thumbnails Grid */}
              <div className="grid grid-cols-4 gap-2.5">
                {galleryPhotos.map((photo, index) => {
                  const isSelected = selectedPhotoIndex === index;
                  return (
                    <div
                      key={photo.id}
                      onClick={() => handleSelectPhoto(index)}
                      className={`group relative h-24 overflow-hidden rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "ring-2 ring-[#c89b3c] border-[#c89b3c] shadow-xs"
                          : "border-[#e5e0d8] hover:border-slate-400"
                      }`}
                    >
                      <img
                        src={photo.src}
                        alt={photo.title}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                      />
                      {photo.isCover && (
                        <div className="absolute top-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#c89b3c] text-[#061224]">
                          <Crown className="h-3 w-3 fill-current" />
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 right-1">
                        <span
                          className={`block truncate rounded px-1.5 py-0.5 text-[8px] font-bold text-white text-center backdrop-blur-xs ${
                            photo.qualityTone === "green"
                              ? "bg-emerald-600/90"
                              : photo.qualityTone === "amber"
                              ? "bg-amber-600/90"
                              : "bg-red-600/90"
                          }`}
                        >
                          {photo.quality}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Photo Metadata Form */}
              <div className="mt-4 rounded-xl border border-[#e5e0d8] bg-[#fcfbf9] p-4 space-y-3.5 text-xs">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-500">Caption (shown to guests)</label>
                    <input
                      type="text"
                      value={captionInput}
                      onChange={(e) => setCaptionInput(e.target.value)}
                      className="h-9 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 font-semibold text-[#061224] outline-none"
                    />
                    <p className="mt-1 text-[9px] text-slate-400 text-right">33/100</p>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-500">Tag / Area</label>
                    <select
                      value={tagAreaInput}
                      onChange={(e) => setTagAreaInput(e.target.value)}
                      className="h-9 w-full rounded-xl border border-[#e5e0d8] bg-white px-3 font-semibold text-[#061224] outline-none"
                    >
                      <option value="Guest Room">Guest Room</option>
                      <option value="Bathroom">Bathroom</option>
                      <option value="Outdoor / Balcony">Outdoor / Balcony</option>
                      <option value="Dining / Restaurant">Dining / Restaurant</option>
                      <option value="Lobby / Entrance">Lobby / Entrance</option>
                      <option value="Pool & Spa">Pool &amp; Spa</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">Alt Text (accessibility)</label>
                  <textarea
                    rows={2}
                    value={altTextInput}
                    onChange={(e) => setAltTextInput(e.target.value)}
                    className="w-full rounded-xl border border-[#e5e0d8] bg-white p-2.5 font-medium text-[#061224] outline-none"
                  />
                  <p className="mt-0.5 text-[9px] text-slate-400 text-right">74/150</p>
                </div>

                <div className="flex items-center justify-between border-t border-[#eee8de] pt-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#061224]">Visible to guests</span>
                    <button
                      type="button"
                      onClick={() => setPhotoVisible(!photoVisible)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                        photoVisible ? "bg-[#061224]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          photoVisible ? "translate-x-4" : "translate-x-0.5"
                        } mt-0.5`}
                      />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-1.5 font-bold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove Photo
                  </button>
                </div>
              </div>

              {/* Warning Alert Bar at Bottom */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs flex items-center justify-between text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="font-semibold">1 photo is missing alt text</span>
                </div>
                <button className="font-bold text-[#061224] hover:underline text-xs">
                  Add alt text
                </button>
              </div>
            </div>
          </DashboardCard>
        </div>

        {/* Right Inspector Sidebar Column */}
        <div className="space-y-4">
          {/* Public Listing Preview Card */}
          <DashboardCard className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#061224]">
                Public Listing Preview
              </span>
              <button className="text-slate-400 hover:text-slate-600">
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#e5e0d8] bg-white shadow-xs">
              <div className="relative h-36 w-full">
                <img
                  src="/balmoral_hotel.png"
                  alt={propertyName}
                  className="h-full w-full object-cover"
                />
                <button className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-white/80 text-slate-700 backdrop-blur-xs">
                  ♥
                </button>
              </div>
              <div className="p-3 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-[#061224] truncate">{propertyName}</h4>
                  <span className="text-[10px] text-amber-500">★★★★★</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Luxury • City Center</p>
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">4.7</span>
                  <span className="font-bold text-[#061224] text-[11px]">Excellent</span>
                  <span className="text-[10px] text-slate-400">(1,248 reviews)</span>
                </div>
                <p className="pt-1.5 text-xs font-bold text-[#061224]">
                  From $245 <span className="text-[10px] font-normal text-slate-400">/ night</span>
                </p>
              </div>
            </div>
          </DashboardCard>

          {/* Listing Quality Checklist Card */}
          <DashboardCard className="p-4 space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#061224]">
              Listing Quality Checklist
            </span>
            <div className="space-y-2 text-xs font-semibold text-slate-700">
              <div className="flex items-center justify-between">
                <span>Photos &amp; Gallery</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between">
                <span>Description</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between">
                <span>Amenities</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between">
                <span>Location</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between text-slate-800">
                <span>Policies</span>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex items-center justify-between text-slate-800">
                <span>Safety Documents</span>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <button className="text-left text-xs font-bold text-[#061224] hover:underline pt-1">
              View full checklist →
            </button>
          </DashboardCard>

          {/* Improve Your Listing Growth Tips Card */}
          <DashboardCard className="p-4 space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#061224]">
              Improve Your Listing
            </span>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5 rounded-xl border border-[#e5e0d8] p-2.5 bg-[#fcfbf9]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
                  <Image className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-[#061224]">Add 2 bathroom photos</p>
                  <p className="text-[10px] text-slate-500 leading-tight">Guests look for bathroom images before booking.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#e5e0d8] p-2.5 bg-[#fcfbf9]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-[#061224]">Improve cover image</p>
                  <p className="text-[10px] text-slate-500 leading-tight">Brighter images get up to 20% more views.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#e5e0d8] p-2.5 bg-[#fcfbf9]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-purple-50 text-purple-600">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-[#061224]">Complete cancellation policy</p>
                  <p className="text-[10px] text-slate-500 leading-tight">Clear policies build trust and reduce questions.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#e5e0d8] p-2.5 bg-[#fcfbf9]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Star className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-[#061224]">Add hotel highlights</p>
                  <p className="text-[10px] text-slate-500 leading-tight">List what makes your property unique.</p>
                </div>
              </div>
            </div>
          </DashboardCard>

          {/* Change Summary (12 pending) Accordion Card */}
          <DashboardCard className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#061224]">
                Change Summary <span className="font-normal text-slate-400">(12 pending)</span>
              </span>
              <ChevronUp className="h-4 w-4 text-slate-400" />
            </div>
            <div className="space-y-2 text-xs text-slate-700 font-medium">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Image className="h-3.5 w-3.5 text-slate-400" /> Photos
                </span>
                <span className="font-semibold text-[#061224]">8 photos added, 1 removed</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-400" /> Policies
                </span>
                <span className="font-semibold text-[#061224]">Cancellation policy updated</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <UtensilsCrossed className="h-3.5 w-3.5 text-slate-400" /> Amenities
                </span>
                <span className="font-semibold text-[#061224]">2 amenities added</span>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>

      {/* Bottom Grid Row: Tips, Sensitive Actions, Admin Notes, Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Visibility Tips */}
        <DashboardCard className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#c89b3c]">
              <Star className="h-5 w-5 fill-current" />
              <h3 className="text-base font-bold text-[#061224]">Visibility Tips</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
              Guests trust listings with clear room photos, safety info, and transparent policies.
            </p>
            <div className="mt-3 space-y-2 text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e0d8] p-2.5 hover:bg-slate-50">
                <Image className="h-4 w-4 text-[#c89b3c] shrink-0" />
                <span>Use bright, natural lighting for photos</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e0d8] p-2.5 hover:bg-slate-50">
                <ShieldCheck className="h-4 w-4 text-[#c89b3c] shrink-0" />
                <span>Show safety measures to build guest trust</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e0d8] p-2.5 hover:bg-slate-50">
                <FileText className="h-4 w-4 text-[#c89b3c] shrink-0" />
                <span>Be clear about policies to avoid cancellations</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e0d8] p-2.5 hover:bg-slate-50">
                <MapPin className="h-4 w-4 text-[#c89b3c] shrink-0" />
                <span>Add local highlights to inspire bookings</span>
              </div>
            </div>
          </div>
        </DashboardCard>

        {/* Sensitive Actions (Requires Confirmation) */}
        <DashboardCard className="p-5 flex flex-col justify-between border-red-200">
          <div>
            <div className="flex items-center gap-2 text-red-800 font-bold">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <h3 className="text-base font-bold">Sensitive Actions <span className="text-xs font-normal text-slate-500">(Requires Confirmation)</span></h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              These actions require confirmation and admin review.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <button className="rounded-xl border border-red-300 bg-white p-3 text-center font-bold text-red-600 hover:bg-red-50">
                Unpublish Listing
                <span className="block text-[9px] font-normal text-slate-400 mt-0.5">Temporarily hide from guests</span>
              </button>
              <button className="rounded-xl border border-red-300 bg-white p-3 text-center font-bold text-red-600 hover:bg-red-50">
                Delete Photo from Live Listing
                <span className="block text-[9px] font-normal text-slate-400 mt-0.5">Photo will be removed for all guests</span>
              </button>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-slate-400 italic">These actions require confirmation and admin review.</p>
        </DashboardCard>

        {/* Admin Note (optional) */}
        <DashboardCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-[#061224]">Admin Note <span className="text-xs font-normal text-slate-400">(optional)</span></h3>
            <div className="mt-3">
              <textarea
                rows={4}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value.slice(0, 300))}
                placeholder="Add a note for the review team..."
                className="w-full rounded-xl border border-[#e5e0d8] bg-white p-3 text-xs font-medium text-[#061224] outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-400 text-right">{adminNote.length}/300</p>
            </div>
          </div>
        </DashboardCard>

        {/* Recent Activity */}
        <DashboardCard className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#061224]">Recent Activity</h3>
            </div>
            <div className="mt-3 space-y-2.5 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">May 12, 10:24 AM</span>
                <span className="font-semibold text-[#061224]">Photos updated</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">May 12, 09:10 AM</span>
                <span className="font-semibold text-[#061224]">Amenities added</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">May 11, 04:35 PM</span>
                <span className="font-semibold text-[#061224]">Policies updated</span>
              </div>
            </div>
          </div>
          <button className="mt-4 text-left text-xs font-bold text-[#061224] hover:underline">
            View full activity log →
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
          <p className="text-[11px] font-medium text-slate-500 truncate">{title}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#061224]">{value}</p>
          <p className={`mt-0.5 text-[11px] font-semibold ${trendClass}`}>{trend}</p>
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
/* ============================================================================
 * PARTNER REVIEWS VIEW COMPONENT
 * ============================================================================ */

interface ReviewItem {
  id: string;
  initials: string;
  name: string;
  memberBadge?: string;
  verified: boolean;
  status: "AWAITING REPLY" | "CRITICAL" | "REPLIED";
  filterCategory: "awaiting" | "positive" | "critical" | "flagged";
  rating: number;
  stayDates: string;
  roomType: string;
  snippet: string;
  fullContent: string;
  photos: string[];
  categoryRatings: {
    cleanliness: number;
    service: number;
    location: number;
    value: number;
    sleepQuality: number;
  };
  sentiment: "Positive" | "Neutral" | "Negative";
  sentimentSummary: string;
  topics: string[];
  timeAgo: string;
}

const mockReviewsData: ReviewItem[] = [
  {
    id: "rev-1",
    initials: "SL",
    name: "Sophia Lee",
    memberBadge: "★ Gold Member",
    verified: true,
    status: "AWAITING REPLY",
    filterCategory: "awaiting",
    rating: 4.9,
    stayDates: "May 20 – May 23, 2025",
    roomType: "Deluxe King",
    snippet: "Wonderful stay with exceptional service and...",
    fullContent:
      "Wonderful stay with exceptional service from the moment we arrived. The staff were warm and attentive, and our room was spotless with a beautiful city view. The breakfast had a great variety and everything was delicious. We will definitely be back!",
    photos: [
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80",
    ],
    categoryRatings: {
      cleanliness: 5.0,
      service: 5.0,
      location: 4.5,
      value: 4.5,
      sleepQuality: 5.0,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is positive overall.",
    topics: ["Staff", "Cleanliness", "Breakfast"],
    timeAgo: "2h ago",
  },
  {
    id: "rev-2",
    initials: "MR",
    name: "Michael Roberts",
    memberBadge: "",
    verified: true,
    status: "AWAITING REPLY",
    filterCategory: "awaiting",
    rating: 4.2,
    stayDates: "May 18 – May 21, 2025",
    roomType: "Executive Twin",
    snippet: "Great location and friendly staff. Room was clean...",
    fullContent:
      "Great location and friendly staff. Room was clean and comfortable. Breakfast options were good, though the dining room was a bit crowded around 9 AM. Overall a solid stay.",
    photos: [],
    categoryRatings: {
      cleanliness: 4.5,
      service: 4.5,
      location: 5.0,
      value: 4.0,
      sleepQuality: 4.0,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is mostly positive.",
    topics: ["Location", "Staff", "Breakfast"],
    timeAgo: "5h ago",
  },
  {
    id: "rev-3",
    initials: "ET",
    name: "Emma Thompson",
    memberBadge: "",
    verified: true,
    status: "CRITICAL",
    filterCategory: "critical",
    rating: 2.8,
    stayDates: "May 17 – May 19, 2025",
    roomType: "Deluxe King",
    snippet: "Check-in took too long and the room was noisy...",
    fullContent:
      "Check-in took too long and the room was noisy on Friday night due to street traffic. The room facilities were decent, but service was slow when we asked for extra towels.",
    photos: [],
    categoryRatings: {
      cleanliness: 3.5,
      service: 2.0,
      location: 2.5,
      value: 3.0,
      sleepQuality: 2.5,
    },
    sentiment: "Negative",
    sentimentSummary: "Guest sentiment expresses dissatisfaction with check-in speed & noise.",
    topics: ["Check-in", "Noise", "Service"],
    timeAgo: "1d ago",
  },
  {
    id: "rev-4",
    initials: "DW",
    name: "Daniel Williams",
    memberBadge: "★ Silver Member",
    verified: true,
    status: "REPLIED",
    filterCategory: "positive",
    rating: 5.0,
    stayDates: "May 16 – May 18, 2025",
    roomType: "Superior Queen",
    snippet: "Perfect stay! The breakfast was fantastic and...",
    fullContent:
      "Perfect stay! The breakfast was fantastic and the room view exceeded our expectations. The front desk team was super friendly and helpful throughout.",
    photos: [],
    categoryRatings: {
      cleanliness: 5.0,
      service: 5.0,
      location: 5.0,
      value: 5.0,
      sleepQuality: 5.0,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is extremely positive.",
    topics: ["Breakfast", "View", "Staff"],
    timeAgo: "2d ago",
  },
  {
    id: "rev-5",
    initials: "AS",
    name: "Aisha Singh",
    memberBadge: "",
    verified: true,
    status: "REPLIED",
    filterCategory: "positive",
    rating: 4.5,
    stayDates: "May 15 – May 17, 2025",
    roomType: "Deluxe King",
    snippet: "Very comfortable and well maintained. Will...",
    fullContent:
      "Very comfortable and well maintained room. Quiet atmosphere at night. Will definitely recommend to friends visiting Edinburgh.",
    photos: [],
    categoryRatings: {
      cleanliness: 4.5,
      service: 4.5,
      location: 4.5,
      value: 4.5,
      sleepQuality: 4.5,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is very positive.",
    topics: ["Cleanliness", "Comfort"],
    timeAgo: "3d ago",
  },
];

export function PartnerReviewsView({ propertyName = "The Balmoral Hotel" }: { propertyName?: string }) {
  const [activeFilterTab, setActiveFilterTab] = useState<"all" | "awaiting" | "positive" | "critical" | "flagged">("awaiting");
  const [selectedReviewId, setSelectedReviewId] = useState<string>("rev-1");
  const [selectedTone, setSelectedTone] = useState<"Warm" | "Apologetic" | "Professional" | "Short Reply">("Warm");
  const [replyText, setReplyText] = useState<string>(
    "Dear Sophia,\n\nThank you so much for your kind words! We're delighted to hear that you enjoyed your stay, our team's service and the breakfast selection. It was our pleasure to host you, and we look forward to welcoming you back soon.\n\nWarm regards,\nThe Balmoral Hotel Team"
  );
  const [internalNote, setInternalNote] = useState<string>("");
  const [savedNoteSuccess, setSavedNoteSuccess] = useState<boolean>(false);
  const [submittedReply, setSubmittedReply] = useState<boolean>(false);

  const [actionItems, setActionItems] = useState([
    { id: 1, text: "Improve breakfast queue management", priority: "High", due: "Due Jun 5", done: false },
    { id: 2, text: "Add pillow preference to guest profile", priority: "Medium", due: "Due Jun 12", done: false },
    { id: 3, text: "Review check-in timing on weekends", priority: "Low", due: "Due Jun 20", done: false },
  ]);

  const selectedReview = useMemo(() => {
    return mockReviewsData.find((r) => r.id === selectedReviewId) || mockReviewsData[0];
  }, [selectedReviewId]);

  const filteredReviews = useMemo(() => {
    if (activeFilterTab === "all") return mockReviewsData;
    if (activeFilterTab === "awaiting") return mockReviewsData.filter((r) => r.status === "AWAITING REPLY");
    if (activeFilterTab === "positive") return mockReviewsData.filter((r) => r.rating >= 4.0);
    if (activeFilterTab === "critical") return mockReviewsData.filter((r) => r.rating < 3.5 || r.status === "CRITICAL");
    if (activeFilterTab === "flagged") return mockReviewsData.filter((r) => r.filterCategory === "flagged");
    return mockReviewsData;
  }, [activeFilterTab]);

  // Handle tone changes
  const applyToneTemplate = (tone: "Warm" | "Apologetic" | "Professional" | "Short Reply") => {
    setSelectedTone(tone);
    const guestFirstName = selectedReview.name.split(" ")[0];
    if (tone === "Warm") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you so much for your kind words! We're delighted to hear that you enjoyed your stay, our team's service and the breakfast selection. It was our pleasure to host you, and we look forward to welcoming you back soon.\n\nWarm regards,\n${propertyName} Team`
      );
    } else if (tone === "Apologetic") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you for sharing your detailed feedback with us. We sincerely apologize that your stay did not meet all your expectations. We are taking immediate action with our team to address your concerns and ensure a better experience.\n\nSincerely,\n${propertyName} Management`
      );
    } else if (tone === "Professional") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you for taking the time to review your recent stay at ${propertyName}. We appreciate your feedback regarding our amenities and services. Your comments have been shared with our operational leadership.\n\nBest regards,\n${propertyName} Team`
      );
    } else if (tone === "Short Reply") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you so much for your wonderful review! We look forward to welcoming you back for another great stay.`
      );
    }
  };

  const toggleTask = (id: number) => {
    setActionItems((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  return (
    <div className="space-y-6 text-[#061224] pb-16">
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#061224]">
            Reviews &amp; Guest Feedback
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Reply to guests, track rating trends and turn feedback into improvements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const latest = mockReviewsData.find((r) => r.status === "AWAITING REPLY");
              if (latest) setSelectedReviewId(latest.id);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
          >
            <Reply className="h-4 w-4" />
            Respond to Latest
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Download Report
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <span>View Public Reviews</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 2. Top Snapshot KPI Cards (5 Grid Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Average Rating */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-[#c89b3c]">
            <Star className="h-6 w-6 fill-[#c89b3c]" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Average Rating</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-2xl font-bold tracking-tight text-[#061224]">4.6</span>
              <div className="flex items-center text-amber-400 text-xs">
                {"★".repeat(5)}
              </div>
            </div>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>0.2 vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 2: New Reviews */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">New Reviews</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">48</span>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>12 vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 3: Awaiting Reply */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Hourglass className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Awaiting Reply</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">12</span>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              <span>5 vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 4: Positive Sentiment */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <ThumbsUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Positive Sentiment</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">81%</span>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>6% vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 5: Service Improvement Tasks */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100/60 text-[#c89b3c]">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Service Improvement Tasks</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">8</span>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("action-items-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-[11px] font-semibold text-[#c89b3c] hover:underline mt-1 inline-flex items-center gap-1"
            >
              <span>View action items</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Middle Analytics Dashboard (4 Cards) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Analytics Card 1: Rating Distribution */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Rating Distribution</h3>
          <div className="space-y-2.5">
            {[
              { stars: 5, count: 129, pct: 61 },
              { stars: 4, count: 63, pct: 30 },
              { stars: 3, count: 14, pct: 7 },
              { stars: 2, count: 4, pct: 2 },
              { stars: 1, count: 2, pct: 1 },
            ].map((item) => (
              <div key={item.stars} className="flex items-center gap-2.5 text-xs">
                <span className="w-6 font-semibold text-slate-600 flex items-center gap-0.5">
                  {item.stars} <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                </span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#c89b3c] transition-all duration-500"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
                <span className="w-16 text-right font-medium text-slate-500 text-[11px]">
                  {item.count} ({item.pct}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Analytics Card 2: Sentiment Summary */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Sentiment Summary</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {/* Positive */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center">
              <span className="text-[11px] font-semibold text-emerald-800 block">Positive</span>
              <span className="text-xl font-bold text-emerald-900 mt-1 block">81%</span>
              <span className="text-[10px] font-semibold text-emerald-700 mt-0.5 block">↑ 6%</span>
            </div>
            {/* Neutral */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <span className="text-[11px] font-semibold text-slate-700 block">Neutral</span>
              <span className="text-xl font-bold text-slate-800 mt-1 block">12%</span>
              <span className="text-[10px] font-semibold text-slate-500 mt-0.5 block">↓ 2%</span>
            </div>
            {/* Negative */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-center">
              <span className="text-[11px] font-semibold text-rose-800 block">Negative</span>
              <span className="text-xl font-bold text-rose-900 mt-1 block">7%</span>
              <span className="text-[10px] font-semibold text-rose-700 mt-0.5 block">↓ 4%</span>
            </div>
          </div>
        </div>

        {/* Analytics Card 3: Rating Trend */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Rating Trend</h3>
            <span className="text-[11px] font-semibold text-[#c89b3c] flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#c89b3c]" /> Avg Rating
            </span>
          </div>
          <div className="relative h-28 w-full pt-2">
            {/* Y axis markers */}
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[9px] font-semibold text-slate-400 pointer-events-none">
              <span>5.0</span>
              <span>4.0</span>
              <span>3.0</span>
            </div>
            {/* SVG curve chart */}
            <div className="pl-6 h-full w-full">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                {/* Horizontal Grid lines */}
                <line x1="0" y1="0" x2="300" y2="0" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="0" y1="40" x2="300" y2="40" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="300" y2="80" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                {/* Curve */}
                <path
                  d="M 10 32 Q 50 12, 80 44 T 150 20 T 215 50 T 280 24"
                  fill="none"
                  stroke="#c89b3c"
                  strokeWidth="2.5"
                />
                {/* Points */}
                {[
                  { x: 10, y: 32 },
                  { x: 55, y: 16 },
                  { x: 100, y: 44 },
                  { x: 150, y: 20 },
                  { x: 190, y: 46 },
                  { x: 235, y: 28 },
                  { x: 280, y: 24 },
                ].map((pt, idx) => (
                  <circle key={idx} cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" stroke="#c89b3c" strokeWidth="2" />
                ))}
              </svg>
            </div>
            {/* X axis labels */}
            <div className="pl-6 flex justify-between text-[9px] font-semibold text-slate-400 mt-1">
              <span>May 1</span>
              <span>May 8</span>
              <span>May 15</span>
              <span>May 22</span>
              <span>May 29</span>
            </div>
          </div>
        </div>

        {/* Analytics Card 4: Top Feedback Topics */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Top Feedback Topics</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "Cleanliness", count: 72 },
                { name: "Staff", count: 65 },
                { name: "Breakfast", count: 48 },
                { name: "Location", count: 34 },
                { name: "Noise", count: 18 },
                { name: "Check-in", count: 16 },
              ].map((topic) => (
                <span
                  key={topic.name}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors"
                >
                  {topic.name} <span className="text-[11px] text-slate-400 font-medium">({topic.count})</span>
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-[#c89b3c] hover:underline mt-4 text-left inline-flex items-center gap-1"
          >
            <span>View all topics</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 4. Main 3-Column Studio Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* COLUMN 1: Filter Tabs & Review Cards List (3.5 cols / ~30% width) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 pb-1 overflow-x-auto">
            {[
              { id: "all", label: "All", count: 48 },
              { id: "awaiting", label: "Awaiting Reply", count: 12 },
              { id: "positive", label: "Positive", count: 31 },
              { id: "critical", label: "Critical", count: 6 },
              { id: "flagged", label: "Flagged", count: 2 },
            ].map((tab) => {
              const isActive = activeFilterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilterTab(tab.id as any)}
                  className={`relative px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive ? "text-[#061224] font-bold" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label} <span className="text-[10px] opacity-75">({tab.count})</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c89b3c] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Review Cards Stack */}
          <div className="space-y-3">
            {filteredReviews.map((rev) => {
              const isSelected = rev.id === selectedReview.id;
              return (
                <div
                  key={rev.id}
                  onClick={() => setSelectedReviewId(rev.id)}
                  className={`group relative rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "border-2 border-[#c89b3c] bg-[#fffdf7] shadow-sm"
                      : "border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[#c89b3c] font-bold text-xs">
                      {rev.initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-[#061224] truncate">{rev.name}</h4>
                        {/* Status Badge */}
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            rev.status === "AWAITING REPLY"
                              ? "bg-amber-100 text-amber-800"
                              : rev.status === "CRITICAL"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {rev.status}
                        </span>
                      </div>

                      {/* Rating & Verified */}
                      <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                        <span className="font-bold text-[#061224]">{rev.rating}</span>
                        <div className="flex items-center text-amber-400 text-[10px]">
                          {"★".repeat(Math.round(rev.rating))}
                        </div>
                      </div>

                      {/* Snippet */}
                      <p className="text-xs text-slate-600 line-clamp-2 mt-1.5 leading-relaxed font-normal">
                        {rev.snippet}
                      </p>

                      {/* Meta info */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
                        <span className="truncate">{rev.stayDates.split(",")[0]} • {rev.roomType}</span>
                        <span className="shrink-0">{rev.timeAgo}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* List Footer Pagination */}
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500 font-semibold">
            <span>Showing 1-5 of 12</span>
            <button type="button" className="text-[#c89b3c] hover:underline flex items-center gap-1">
              <span>Load more</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* COLUMN 2: Selected Review Details & Interactive Reply Studio (5 cols / ~45% width) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-5">
            {/* Header: Guest Info */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[#c89b3c] font-bold text-sm">
                  {selectedReview.initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#061224]">{selectedReview.name}</h3>
                    {selectedReview.memberBadge && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-[#c89b3c] border border-amber-200">
                        {selectedReview.memberBadge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    {selectedReview.verified && (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verified Stay
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Rating & Date/Room info */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <span className="text-xl font-bold text-[#061224]">{selectedReview.rating}</span>
                  <div className="flex items-center text-amber-400 text-sm">
                    {"★".repeat(Math.round(selectedReview.rating))}
                  </div>
                </div>
                <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                  {selectedReview.stayDates}
                </p>
                <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 mt-1">
                  {selectedReview.roomType}
                </span>
              </div>
            </div>

            {/* Full Review Content Quote */}
            <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-100">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal italic">
                &ldquo;{selectedReview.fullContent}&rdquo;
              </p>
            </div>

            {/* Guest Uploaded Photos Grid (if any) */}
            {selectedReview.photos.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Guest Photos ({selectedReview.photos.length})
                </h4>
                <div className="grid grid-cols-5 gap-2">
                  {selectedReview.photos.slice(0, 4).map((imgUrl, idx) => (
                    <div key={idx} className="relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={imgUrl} alt={`Guest upload ${idx + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  ))}
                  {selectedReview.photos.length > 4 && (
                    <div className="relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 bg-slate-900/80 flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:bg-slate-900 transition-colors">
                      <img src={selectedReview.photos[4]} alt="More" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                      <span className="relative z-10">+{selectedReview.photos.length - 4}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-cards Row: Rating Breakdown & Sentiment Analysis */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Rating Breakdown */}
              <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Rating Breakdown</h4>
                <div className="space-y-1.5">
                  {[
                    { label: "Cleanliness", val: selectedReview.categoryRatings.cleanliness },
                    { label: "Service", val: selectedReview.categoryRatings.service },
                    { label: "Location", val: selectedReview.categoryRatings.location },
                    { label: "Value", val: selectedReview.categoryRatings.value },
                    { label: "Sleep Quality", val: selectedReview.categoryRatings.sleepQuality },
                  ].map((cat) => (
                    <div key={cat.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium text-[11px]">{cat.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#c89b3c]"
                            style={{ width: `${(cat.val / 5) * 100}%` }}
                          />
                        </div>
                        <span className="w-5 text-right font-bold text-slate-700 text-[11px]">{cat.val.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sentiment & Topics Detected */}
              <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sentiment &amp; Topics</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      selectedReview.sentiment === "Positive"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    ● {selectedReview.sentiment}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-600 leading-snug">
                  {selectedReview.sentimentSummary}
                </p>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block mb-1">Topics detected:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedReview.topics.map((t) => (
                      <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <button type="button" className="text-[11px] font-semibold text-[#c89b3c] hover:underline pt-1 inline-block">
                  View all topics ({selectedReview.topics.length + 1}) →
                </button>
              </div>
            </div>

            {/* Reply to Guest Interactive Studio */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h4 className="text-xs font-bold text-[#061224] uppercase tracking-wider">Reply to Guest</h4>
                
                {/* Tone helper selectors */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <span className="text-[10px] font-semibold text-slate-500 pl-1.5">Tone helper ⓘ:</span>
                  {(["Warm", "Apologetic", "Professional", "Short Reply"] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => applyToneTemplate(tone)}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${
                        selectedTone === tone
                          ? "bg-[#061224] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Response Textarea */}
              <div className="relative">
                <textarea
                  rows={6}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-800 leading-relaxed focus:border-[#c89b3c] focus:ring-1 focus:ring-[#c89b3c] focus:outline-none"
                  placeholder="Replies are reviewed for guest safety and tone before publishing."
                />
              </div>

              {/* Quick Template Suggestions Column */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] font-semibold text-slate-400">Template suggestions:</span>
                <button
                  type="button"
                  onClick={() => applyToneTemplate("Warm")}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Thank positive guest
                </button>
                <button
                  type="button"
                  onClick={() => applyToneTemplate("Apologetic")}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Apologize for issue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!replyText.includes("welcoming you back")) {
                      setReplyText((prev) => prev + " We look forward to welcoming you back for another wonderful stay!");
                    }
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Invite return
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSavedNoteSuccess(true);
                    setTimeout(() => setSavedNoteSuccess(false), 3000);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  {savedNoteSuccess ? "Draft Saved ✔" : "Save Draft"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSubmittedReply(true);
                    setTimeout(() => setSubmittedReply(false), 4000);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
                >
                  <span>{submittedReply ? "Reply Submitted! ✔" : "Submit Reply"}</span>
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3: Insights & Reputation Sidebar (3.5 cols / ~25% width) */}
        <div className="lg:col-span-3 space-y-5">
          {/* Card 1: Guest Experience Insights */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Guest Experience Insights</h3>
            
            {/* Repeated Praise */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" /> Repeated Praise
              </span>
              <ul className="space-y-1 pl-5 text-[11px] font-medium text-slate-600 list-disc">
                <li>Friendly and helpful staff</li>
                <li>Clean and comfortable rooms</li>
                <li>Great breakfast variety</li>
              </ul>
            </div>

            {/* Recurring Issues */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> Recurring Issues
              </span>
              <ul className="space-y-1 pl-5 text-[11px] font-medium text-slate-600 list-disc">
                <li>Breakfast queue during peak hours</li>
                <li>Noise from street on weekends</li>
                <li>Long wait during check-in</li>
              </ul>
            </div>
          </div>

          {/* Card 2: Action Items */}
          <div id="action-items-section" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Action Items</h3>
              <button type="button" className="text-[11px] font-semibold text-[#c89b3c] hover:underline">
                View all tasks →
              </button>
            </div>
            <div className="space-y-2.5">
              {actionItems.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-2 text-xs pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                      className="mt-0.5 rounded border-slate-300 text-[#c89b3c] focus:ring-[#c89b3c]"
                    />
                    <span className={`text-[11px] font-medium ${task.done ? "line-through text-slate-400" : "text-slate-700"}`}>
                      {task.text}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        task.priority === "High"
                          ? "bg-rose-100 text-rose-800"
                          : task.priority === "Medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {task.priority}
                    </span>
                    <span className="block text-[9px] text-slate-400 mt-0.5">{task.due}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Reputation Overview */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Reputation Overview</h3>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Response Rate</span>
                <span className="text-base font-bold text-[#061224] mt-0.5 block">92%</span>
                <span className="text-[9px] font-semibold text-emerald-600">↑ 6%</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Avg. Reply Time</span>
                <span className="text-base font-bold text-[#061224] mt-0.5 block">6.2h</span>
                <span className="text-[9px] font-semibold text-emerald-600">↓ 1.1h</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Public Rating</span>
                <span className="text-base font-bold text-[#061224] mt-0.5 block">4.6 ★</span>
                <span className="text-[9px] font-semibold text-emerald-600">↑ 0.2</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px] font-medium">Moderation Status</span>
              <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Good Standing
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">No policy issues detected.</p>
          </div>

          {/* Card 4: Safe Actions */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Safe Actions</h3>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-500" /> Request Review Recheck
              </span>
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Flag className="h-3.5 w-3.5 text-slate-500" /> Flag for Helpkey Review
              </span>
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-slate-500" /> Message Support
              </span>
            </button>
          </div>

          {/* Card 5: Requires Reason (Red Danger Outline Block) */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
            <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">Requires Reason</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className="rounded-xl border border-rose-300 bg-white py-2 text-center text-[10px] font-bold text-rose-700 hover:bg-rose-100/50 transition-colors"
              >
                Flag Review
              </button>
              <button
                type="button"
                className="rounded-xl border border-rose-300 bg-white py-2 text-center text-[10px] font-bold text-rose-700 hover:bg-rose-100/50 transition-colors"
              >
                Dispute Review
              </button>
              <button
                type="button"
                className="rounded-xl border border-rose-300 bg-white py-2 text-center text-[10px] font-bold text-rose-700 hover:bg-rose-100/50 transition-colors"
              >
                Report Abuse
              </button>
            </div>
          </div>

          {/* Card 6: Internal Note & Audit Log */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Internal Note
              </label>
              <textarea
                rows={2}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Add an internal note (only visible to your team)..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#c89b3c] focus:outline-none"
              />
              <div className="text-right mt-1.5">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Save Note
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <History className="h-3.5 w-3.5 text-slate-400" /> Audit Log (latest)
                </span>
                <button type="button" className="text-[10px] font-semibold text-[#c89b3c] hover:underline">
                  View all →
                </button>
              </div>
              <div className="space-y-1.5 text-[10px] text-slate-500 font-medium">
                <div className="flex items-center justify-between">
                  <span>May 31, 10:24 AM</span>
                  <span className="text-slate-700">Draft saved by James C.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>May 31, 09:12 AM</span>
                  <span className="text-slate-700">Review opened by Sarah M.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
