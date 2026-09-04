"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Ban,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  FileCheck,
  FileText,
  Headphones,
  History,
  Image as ImageIcon,
  Landmark,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SortDesc,
  Timer,
  UserCheck,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";

type Property = {
  id: string;
  name: string;
  propertyType: string;
  status: string;
  approvalStatus: string;
  address?: { city?: string; state?: string };
  partnerId?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  rejectionReason?: string | null;
};

type User = {
  uid: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  roles: string[];
  accountStatus: string;
  lastLoginAt: string | null;
  createdAt?: string | null;
};

type AdminAssetRecord = {
  id: string;
  name?: string;
  description?: string;
  publicPhone?: string;
  publicEmail?: string;
  checkInTime?: string;
  checkOutTime?: string;
  floors?: number;
  totalPhysicalRooms?: number;
  totalInventory?: number;
  inventory?: number;
  basePricePaise?: number;
  fileName?: string;
  documentType?: string;
  category?: string;
  mimeType?: string;
  moderationStatus?: string;
  status?: string;
};

type AdminRecord = AdminAssetRecord & Record<string, unknown>;

type Detail = {
  property: AdminRecord;
  partner: AdminRecord | null;
  roomTypes: AdminRecord[];
  ratePlans: AdminRecord[];
  policies: AdminRecord[];
  media: AdminRecord[];
  documents: AdminRecord[];
};

type Overview = {
  metrics: Record<string, number>;
  urgentProperties: Property[];
};

const nav = ["Overview", "Properties", "Partners", "Customers"] as const;

const label = (value: string | null | undefined) =>
  (value ?? "-")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const textValue = (value: unknown) =>
  typeof value === "string" ? value : undefined;

type PartnerListItem = {
  user: User;
  partnerProperties: Property[];
  pendingCount: number;
  changesCount: number;
  activeCount: number;
  primaryProperty: Property | null;
  city: string;
  progress: number;
  state: "pending" | "approved" | "changes_requested" | "suspended" | "all";
  risk: "Low" | "Medium" | "High";
};

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Request failed.");
  return json;
}

export function AdminDashboard() {
  const [section, setSection] = useState<(typeof nav)[number]>("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  const isSidebarExpanded = !sidebarCollapsed || sidebarHovered;

  const loadOverview = () =>
    api("/api/admin/overview")
      .then(setOverview)
      .catch((cause) => setError(cause.message));
  const loadProperties = () =>
    api("/api/admin/properties")
      .then((data) => setProperties(data.properties))
      .catch((cause) => setError(cause.message));
  const loadUsers = () =>
    api("/api/admin/users")
      .then((data) => setUsers(data.users))
      .catch((cause) => setError(cause.message));

  useEffect(() => {
    void Promise.all([loadOverview(), loadProperties(), loadUsers()]);
  }, []);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openProperty = (id: string) => {
    setSelectedId(id);
    setSection("Properties");
  };

  const content =
    section === "Overview" ? (
      <OverviewPanel
        data={overview}
        properties={properties}
        onOpen={openProperty}
        onNavigate={setSection}
        onRefresh={() => void Promise.all([loadOverview(), loadProperties()])}
        searchQuery={globalSearch}
      />
    ) : section === "Properties" ? (
      <PropertiesPanel
        properties={properties}
        reload={loadProperties}
        onOpen={setSelectedId}
        searchQuery={globalSearch}
        setSearchQuery={setGlobalSearch}
      />
    ) : section === "Partners" ? (
      <PartnersPanel
        users={users}
        properties={properties}
        reload={loadUsers}
        onOpenProperty={setSelectedId}
        searchQuery={globalSearch}
        setSearchQuery={setGlobalSearch}
      />
    ) : (
      <UsersPanel
        kind="customer"
        users={users}
        reload={loadUsers}
        searchQuery={globalSearch}
        setSearchQuery={setGlobalSearch}
      />
    );

  return (
    <main
      className={`min-h-screen bg-[#f8f9fc] font-sans text-[#141b2b] transition-[padding] duration-300 ${
        sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"
      }`}
    >
      {/* Desktop Navigation Sidebar */}
      <aside
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#0b1f3a] text-[#d6e3ff] shadow-xl transition-[width] duration-300 lg:flex ${
          isSidebarExpanded ? "w-64" : "w-20"
        }`}
      >
        <div
          className={`flex h-20 items-center gap-3 bg-[#071c36] px-5 ${
            !isSidebarExpanded ? "justify-center px-3" : ""
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffdf9f] text-[#261a00] shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div className={!isSidebarExpanded ? "hidden" : "min-w-0 flex-1"}>
            <div className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-white">
              Helpkey{" "}
              <span className="rounded bg-[#755a1a] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Admin
              </span>
            </div>
            <p className="truncate text-[10px] text-[#7587a7]">
              Hotel admin console
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          className={`mx-3 mt-3 flex h-10 items-center rounded-lg bg-[#071c36]/80 px-3 text-xs font-semibold text-white transition-all hover:bg-[#071c36] active:scale-95 ${
            !isSidebarExpanded ? "justify-center" : "justify-between"
          }`}
          aria-label={sidebarCollapsed ? "Pin sidebar open" : "Collapse sidebar"}
          title={sidebarCollapsed ? (sidebarHovered ? "Pin expanded sidebar (Ctrl+B)" : "Expand sidebar (Ctrl+B)") : "Collapse sidebar (Ctrl+B)"}
        >
          {!isSidebarExpanded ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <span className="flex items-center gap-2">
                <PanelLeftClose className="h-4 w-4 text-[#fed88b]" />
                Collapse
              </span>
              <span className="rounded bg-[#0b1f3a] px-1.5 py-0.5 text-[9px] font-mono text-[#b5c7ea]">
                Ctrl+B
              </span>
            </>
          )}
        </button>

        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          <SidebarItem
            label="Dashboard"
            icon={LayoutDashboard}
            active={section === "Overview"}
            onClick={() => setSection("Overview")}
            collapsed={!isSidebarExpanded}
          />
          <SidebarItem
            label="Partners"
            icon={ShieldCheck}
            active={section === "Partners"}
            onClick={() => setSection("Partners")}
            collapsed={!isSidebarExpanded}
            badge={
              properties.filter((p) => p.approvalStatus === "pending").length ||
              undefined
            }
          />
          <SidebarItem
            label="Properties"
            icon={Building2}
            active={section === "Properties"}
            onClick={() => setSection("Properties")}
            collapsed={!isSidebarExpanded}
          />
          <SidebarItem
            label="Bookings"
            icon={CalendarDays}
            collapsed={!isSidebarExpanded}
          />
          <SidebarItem
            label="Users"
            icon={Users}
            active={section === "Customers"}
            onClick={() => setSection("Customers")}
            collapsed={!isSidebarExpanded}
          />
          <SidebarItem
            label="Reviews"
            icon={MessageSquare}
            collapsed={!isSidebarExpanded}
          />
          <SidebarItem
            label="Payments"
            icon={WalletCards}
            collapsed={!isSidebarExpanded}
          />
          <SidebarItem
            label="Support"
            icon={Headphones}
            collapsed={!isSidebarExpanded}
          />
          <SidebarItem
            label="Settings"
            icon={Settings}
            collapsed={!isSidebarExpanded}
          />
        </nav>

        <div
          className={`m-3 mb-6 flex items-center gap-3 rounded-xl bg-[#071c36] p-3 border border-white/5 ${
            !isSidebarExpanded ? "justify-center" : ""
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffdf9f] text-sm font-bold text-[#261a00] shadow-sm">
            A
          </div>
          <div className={`min-w-0 flex-1 ${!isSidebarExpanded ? "hidden" : ""}`}>
            <p className="truncate text-xs font-semibold text-white">
              Admin User
            </p>
            <p className="truncate text-[10px] text-[#7587a7]">
              Platform Director
            </p>
          </div>
          <MoreHorizontal
            className={`h-4 w-4 text-[#7587a7] ${!isSidebarExpanded ? "hidden" : ""}`}
          />
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[#0b1f3a] p-4 text-[#d6e3ff] shadow-2xl flex flex-col justify-between animate-in slide-in-from-left duration-300">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#071c36]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ffdf9f] text-[#261a00] font-bold">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Helpkey Admin</h3>
                    <p className="text-[10px] text-[#7587a7]">Platform Console</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-2 text-[#7587a7] hover:bg-[#071c36] hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-1">
                {[
                  { name: "Overview", labelName: "Dashboard", icon: LayoutDashboard },
                  { name: "Partners", labelName: "Partners", icon: ShieldCheck },
                  { name: "Properties", labelName: "Properties", icon: Building2 },
                  { name: "Customers", labelName: "Users & Customers", icon: Users },
                ].map((item) => {
                  const IconComponent = item.icon;
                  const isActive = section === item.name;
                  return (
                    <button
                      type="button"
                      key={item.name}
                      onClick={() => {
                        setSection(item.name as (typeof nav)[number]);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                        isActive
                          ? "bg-[#755a1a] text-white shadow-md"
                          : "text-[#b5c7ea] hover:bg-[#071c36] hover:text-white"
                      }`}
                    >
                      <IconComponent className="h-5 w-5" />
                      <span>{item.labelName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[#071c36] pt-4">
              <div className="flex items-center gap-3 rounded-xl bg-[#071c36] p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffdf9f] text-sm font-bold text-[#261a00]">
                  A
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Admin User</p>
                  <p className="text-[10px] text-[#7587a7]">Platform Director</p>
                </div>
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* Fixed Top Header Bar */}
      <header
        className={`sticky top-0 z-30 h-16 border-b border-[#e5e9f5] bg-white/90 backdrop-blur-xl transition-[left] duration-300 lg:fixed lg:right-0 lg:h-20 ${
          sidebarCollapsed ? "lg:left-20" : "lg:left-64"
        }`}
      >
        <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-200 p-2 text-[#44474d] hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileMenuOpen((current) => !current)}
              aria-label="Open mobile menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[#44474d] sm:flex">
              <Building2 className="h-4 w-4 text-[#755a1a]" />
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-[#141b2b]">
                Platform Console
              </span>
              <span className="mx-1 h-3.5 w-px bg-slate-200" />
              <span className="rounded-full bg-[#f1f3ff] px-2.5 py-1 text-[10px] font-semibold text-[#44474d] border border-[#e1e8fd]">
                14:32 UTC
              </span>
            </div>
          </div>

          <div className="relative max-w-md flex-1 px-2 sm:px-4">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search partners, properties, or records..."
              className="h-9 sm:h-10 w-full rounded-xl bg-slate-50 pl-10 pr-8 text-xs outline-none border border-slate-200 transition-colors placeholder:text-slate-400 focus:bg-white focus:border-[#755a1a] focus:ring-2 focus:ring-[#755a1a]/20"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => setGlobalSearch("")}
                className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-2xs sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              </span>
              Live Production
            </span>
            <button
              type="button"
              className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-600 ring-2 ring-white" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b1f3a] text-xs font-bold text-white ring-2 ring-[#ffdf9f] shadow-sm">
              A
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="mx-auto max-w-[1700px] px-4 py-6 lg:pt-24 lg:px-8">
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}
        {content}
      </div>

      {selectedId && (
        <PropertyDrawer
          propertyId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            void Promise.all([loadOverview(), loadProperties()]);
          }}
        />
      )}
    </main>
  );
}

function SidebarItem({
  label: itemLabel,
  icon: Icon,
  active,
  onClick,
  collapsed,
  badge,
}: {
  label: string;
  icon: typeof LayoutDashboard;
  active?: boolean;
  onClick?: () => void;
  collapsed?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      title={collapsed ? itemLabel : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition-all ${
        collapsed ? "justify-center px-2" : ""
      } ${
        active
          ? "bg-[#755a1a] text-white shadow-md"
          : onClick
          ? "text-[#b5c7ea] hover:bg-[#071c36] hover:text-white"
          : "cursor-not-allowed text-[#7587a7] opacity-60"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
      <span className={collapsed ? "sr-only" : "truncate"}>{itemLabel}</span>
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto rounded-full bg-[#fed88b] px-2 py-0.5 text-[10px] font-bold text-[#261a00]">
          {badge}
        </span>
      )}
    </button>
  );
}

function OverviewPanel({
  data,
  properties,
  onOpen,
  onNavigate,
  onRefresh,
  searchQuery,
}: {
  data: Overview | null;
  properties: Property[];
  onOpen: (id: string) => void;
  onNavigate: (section: (typeof nav)[number]) => void;
  onRefresh: () => void;
  searchQuery: string;
}) {
  const [velocityTimeframe, setVelocityTimeframe] = useState<"weekly" | "monthly">("weekly");
  const [busyProperty, setBusyProperty] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const metric = data?.metrics ?? {};
  const pending =
    data?.urgentProperties ??
    properties.filter((item) => item.approvalStatus === "pending");

  const filteredProperties = useMemo(() => {
    if (!searchQuery) return properties;
    return properties.filter((p) =>
      `${p.name} ${p.address?.city ?? ""} ${p.propertyType}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    );
  }, [properties, searchQuery]);

  const approveProperty = async (propertyId: string) => {
    setBusyProperty(propertyId);
    setActionError("");
    try {
      await api(`/api/admin/properties/${propertyId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      });
      onRefresh();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Unable to approve listing."
      );
    } finally {
      setBusyProperty(null);
    }
  };

  const cards = [
    {
      label: "Total Properties",
      value: properties.length,
      detail: `${pending.length} waiting for review`,
      icon: Building2,
      tint: "bg-blue-50 text-[#0b1f3a]",
    },
    {
      label: "Files To Check",
      value: (metric.pendingPhotos ?? 0) + (metric.pendingDocuments ?? 0),
      detail: "Photos and documents",
      icon: FileCheck,
      tint: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Pending Partners",
      value: metric.partners ?? 0,
      detail: `${metric.pendingListings ?? 0} listing submissions`,
      icon: UserCheck,
      tint: "bg-amber-50 text-amber-800",
    },
    {
      label: "Properties Live",
      value: metric.activeListings ?? 0,
      detail: "Visible to customers",
      icon: Activity,
      tint: "bg-indigo-50 text-indigo-700",
    },
  ];

  return (
    <div className="space-y-5 pb-10 animate-in fade-in duration-300">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Helpkey Admin
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review partners, properties, and files from one dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title="History is not enabled yet."
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-400 shadow-2xs opacity-75"
          >
            <History className="h-4 w-4" />
            History
          </button>
          <button
            type="button"
            disabled
            title="Exports are not enabled yet."
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-400 shadow-2xs opacity-75"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => onNavigate("Customers")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#07172b] transition-colors active:scale-95"
          >
            <UserPlus className="h-4 w-4 text-[#fed88b]" />
            Add Admin
          </button>
        </div>
      </header>

      {actionError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <p>{actionError}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Property growth
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  New listings compared with approved live properties.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setVelocityTimeframe("weekly")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    velocityTimeframe === "weekly"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setVelocityTimeframe("monthly")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    velocityTimeframe === "monthly"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div className="mt-5 h-72 w-full overflow-hidden rounded-xl border border-slate-100 bg-white">
              <svg
                viewBox="0 0 760 300"
                className="h-full w-full"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="velocityFill" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#0b1f3a" stopOpacity=".18" />
                    <stop offset="1" stopColor="#0b1f3a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[50, 100, 150, 200, 250].map((line) => (
                  <path
                    key={line}
                    d={`M0 ${line}H700`}
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                  />
                ))}
                {velocityTimeframe === "weekly" ? (
                  <>
                    <path
                      d="M0 230 C70 200 100 95 150 130 S235 160 290 105 S390 145 450 90 S540 125 600 70 S690 125 760 95 L760 300 L0 300 Z"
                      fill="url(#velocityFill)"
                    />
                    <path
                      d="M0 230 C70 200 100 95 150 130 S235 160 290 105 S390 145 450 90 S540 125 600 70 S690 125 760 95"
                      fill="none"
                      stroke="#0b1f3a"
                      strokeWidth="3"
                    />
                    <path
                      d="M0 250 C75 210 125 190 170 170 S260 205 330 165 S410 190 470 150 S550 185 630 135 S700 170 760 150"
                      fill="none"
                      stroke="#c98a21"
                      strokeWidth="2"
                    />
                  </>
                ) : (
                  <>
                    <path
                      d="M0 245 C80 215 140 160 220 170 S340 155 420 110 S560 95 760 60 L760 300 L0 300 Z"
                      fill="url(#velocityFill)"
                    />
                    <path
                      d="M0 245 C80 215 140 160 220 170 S340 155 420 110 S560 95 760 60"
                      fill="none"
                      stroke="#0b1f3a"
                      strokeWidth="3"
                    />
                    <path
                      d="M0 260 C100 225 180 210 270 190 S450 165 760 130"
                      fill="none"
                      stroke="#c98a21"
                      strokeWidth="2"
                    />
                  </>
                )}
              </svg>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#0b1f3a]" />
                  New listings
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-[#c98a21]" />
                  Approved properties
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Updated from live data
              </span>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Recent properties
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("Properties")}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                View all properties
              </button>
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[700px] grid-cols-[.8fr_1.7fr_1fr_1fr_1fr] gap-4 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span>ID</span>
                <span>Property</span>
                <span>Location</span>
                <span>Status</span>
                <span className="text-right">Action</span>
              </div>
              {filteredProperties.slice(0, 5).map((property) => (
                <button
                  type="button"
                  key={property.id}
                  onClick={() => onOpen(property.id)}
                  className="grid w-full min-w-[700px] grid-cols-[.8fr_1.7fr_1fr_1fr_1fr] items-center gap-4 border-t border-slate-100 px-5 py-3 text-left text-xs transition-colors hover:bg-slate-50"
                >
                  <b className="font-mono text-slate-900">
                    #{property.id.slice(-6).toUpperCase()}
                  </b>
                  <span className="min-w-0">
                    <b className="block truncate text-slate-900">{property.name}</b>
                    <small className="text-slate-500">
                      {label(property.propertyType)}
                    </small>
                  </span>
                  <span className="text-slate-600">
                    {property.address?.city ?? "—"}
                  </span>
                  <span className="w-fit rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                    {label(property.approvalStatus)}
                  </span>
                  <span className="justify-self-end font-bold text-[#0b1f3a]">
                    Review
                  </span>
                </button>
              ))}
              {!filteredProperties.length && (
                <p className="py-8 text-center text-sm text-slate-500">
                  No listing activity found.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Approval queue</h3>
              <button
                type="button"
                onClick={() => onNavigate("Properties")}
                className="text-xs font-bold text-[#0b1f3a] hover:text-[#755a1a]"
              >
                View all
              </button>
            </div>
            <div>
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    Partner verification
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                    {pending.length}
                  </span>
                </div>
              </div>
              {pending.slice(0, 4).map((property) => (
                <div
                  key={property.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-800">
                    {property.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {property.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {property.address?.city ?? "Location pending"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busyProperty === property.id}
                      onClick={() => void approveProperty(property.id)}
                      className="rounded-lg bg-[#0b1f3a] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(property.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Review
                    </button>
                  </div>
                </div>
              ))}
              {!pending.length && (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Nothing is waiting for approval.
                </p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Support tickets</h3>
              <button
                type="button"
                disabled
                className="text-xs font-bold text-slate-400"
                title="Support ticket module is not connected yet."
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                {
                  icon: CircleAlert,
                  title: "Payment not received",
                  status: "Open",
                  tone: "bg-red-50 text-red-600 ring-red-100",
                  statusTone: "bg-red-50 text-red-700",
                },
                {
                  icon: Clock3,
                  title: "Property photos not updating",
                  status: "In progress",
                  tone: "bg-amber-50 text-amber-700 ring-amber-100",
                  statusTone: "bg-amber-50 text-amber-800",
                },
                {
                  icon: Users,
                  title: "Partner onboarding issue",
                  status: "Open",
                  tone: "bg-blue-50 text-blue-700 ring-blue-100",
                  statusTone: "bg-blue-50 text-blue-700",
                },
                {
                  icon: CheckCircle,
                  title: "Cancellation policy clarification",
                  status: "Resolved",
                  tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
                  statusTone: "bg-emerald-50 text-emerald-700",
                },
              ].map(({ icon: ItemIcon, title, status, tone, statusTone }) => {
                return (
                  <div
                    key={title}
                    className="flex items-center gap-3 px-5 py-4"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}
                    >
                      <ItemIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {title}
                      </p>
                      <p className="text-xs text-slate-500">Internal support</p>
                    </div>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone}`}
                    >
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Quick actions</h3>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <CommandCard
                icon={UserCheck}
                title="Partners"
                detail="Review partner accounts"
                onClick={() => onNavigate("Partners")}
              />
              <CommandCard
                icon={Building2}
                title="Properties"
                detail="Review submissions"
                onClick={() => onNavigate("Properties")}
              />
              <CommandCard
                icon={CalendarDays}
                title="Bookings"
                detail="Coming soon"
                disabled
              />
              <CommandCard
                icon={Ban}
                title="Block access"
                detail={`${metric.suspendedAccounts ?? 0} blocked`}
                onClick={() => onNavigate("Customers")}
                danger
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({
  label: cardLabel,
  value,
  detail,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Building2;
  tint: string;
}) {
  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {cardLabel}
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold transition-transform group-hover:scale-110 ${tint}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function CommandCard({
  icon: Icon,
  title,
  detail,
  onClick,
  danger,
  disabled,
}: {
  icon: typeof ShieldCheck;
  title: string;
  detail: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl p-3 text-left transition-all ${
        danger
          ? "bg-red-50 text-red-900 border border-red-100 hover:bg-red-100"
          : "bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-50" : "active:scale-95"}`}
    >
      <Icon className="h-4 w-4 text-[#755a1a]" />
      <b className="mt-1.5 block text-xs leading-tight font-bold">{title}</b>
      <span className="mt-0.5 block text-[10px] opacity-75">{detail}</span>
    </button>
  );
}

function PropertiesPanel({
  properties,
  reload,
  onOpen,
  searchQuery,
  setSearchQuery,
}: {
  properties: Property[];
  reload: () => void;
  onOpen: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [filter, setFilter] = useState<
    "pending" | "changes_requested" | "approved" | "rejected" | "all"
  >("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = {
    all: properties.length,
    pending: properties.filter((item) => item.approvalStatus === "pending")
      .length,
    changes_requested: properties.filter(
      (item) => item.approvalStatus === "changes_requested"
    ).length,
    approved: properties.filter((item) => item.approvalStatus === "approved")
      .length,
    rejected: properties.filter((item) => item.approvalStatus === "rejected")
      .length,
  };

  const propertyTypes = Array.from(
    new Set(properties.map((item) => item.propertyType).filter(Boolean))
  );

  const visible = useMemo(
    () =>
      properties.filter(
        (item) =>
          (filter === "all" ||
            item.approvalStatus === filter ||
            (filter === "approved" && item.status === "active")) &&
          (typeFilter === "all" || item.propertyType === typeFilter) &&
          `${item.name} ${item.address?.city ?? ""} ${item.address?.state ?? ""} ${item.propertyType}`
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      ),
    [properties, searchQuery, filter, typeFilter]
  );

  const selected =
    visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  const reviewTabs: Array<{ key: typeof filter; label: string; count: number }> =
    [
      { key: "pending", label: "Pending Review", count: counts.pending },
      {
        key: "changes_requested",
        label: "Changes Needed",
        count: counts.changes_requested,
      },
      { key: "approved", label: "Approved", count: counts.approved },
      { key: "rejected", label: "Rejected", count: counts.rejected },
      { key: "all", label: "All", count: counts.all },
    ];

  return (
    <div className="animate-in space-y-6 pb-10 fade-in duration-300">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
         
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Property Submission Review
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-500">
             
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-[#755a1a]" /> Refresh
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <PropertyReviewStat
            icon={Clock3}
            label="Awaiting approval"
            value={counts.pending}
            detail="Submitted listings"
          />
          <PropertyReviewStat
            icon={CircleAlert}
            label="Changes needed"
            value={counts.changes_requested}
            detail="Returned to partner"
          />
          <PropertyReviewStat
            icon={CheckCircle}
            label="Catalog ready"
            value={counts.approved}
            detail="Approved properties"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
              {reviewTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
                    filter === tab.key
                      ? "bg-[#0b1f3a] text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      filter === tab.key
                        ? "bg-[#fed88b] text-[#261a00]"
                        : "bg-white text-slate-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-80 ">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search property, city, or type..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#755a1a] focus:ring-2 focus:ring-[#755a1a]/15"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-[#755a1a]"
              >
                <option value="all">All property types</option>
                {propertyTypes.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Queue priority order
            </span>
            <span className="text-[11px] font-semibold text-[#755a1a]">
              {visible.length} shown
            </span>
          </div>
          <div className="space-y-3">
            {visible.map((property) => (
              <PropertyQueueCard
                key={property.id}
                property={property}
                active={selected?.id === property.id}
                onSelect={() => setSelectedId(property.id)}
                onOpen={() => onOpen(property.id)}
              />
            ))}
            {!visible.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                <Search className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-3 font-bold text-slate-900">
                  No properties found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Try another status, type, or search term.
                </p>
              </div>
            )}
          </div>
        </section>

        {selected ? (
          <PropertyReviewWorkspace property={selected} onOpen={onOpen} />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 font-bold text-slate-900">
              Select a property to review
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function PropertyReviewStat({
  icon: Icon,
  label: statLabel,
  value,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#755a1a]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {statLabel}
        </p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

function PropertyQueueCard({
  property,
  active,
  onSelect,
  onOpen,
}: {
  property: Property;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const completeness = propertyCompleteness(property);
  return (
    <article
      className={`relative rounded-2xl border bg-white p-4 shadow-2xs transition-all ${
        active
          ? "border-[#e6c277] ring-2 ring-[#ffdf9f]"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      }`}
    >
     
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0b1f3a] text-sm font-bold text-white shadow-xs">
            {property.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#755a1a]">
                  {label(property.propertyType)}
                </p>
                <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">
                  {property.name}
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {property.address?.city ?? "Location pending"}
                </p>
              </div>
              <PropertyStatusBadge property={property} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-700">
                #{property.id.slice(-6).toUpperCase()}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-700">
                {label(property.status)}
              </span>
              {property.submittedAt && (
                <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold">
                  Submitted
                </span>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>Readiness</span>
                <span
                  className={
                    completeness >= 80
                      ? "text-emerald-700"
                      : completeness >= 50
                      ? "text-amber-800"
                      : "text-slate-600"
                  }
                >
                  {completeness}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    completeness >= 80
                      ? "bg-emerald-600"
                      : completeness >= 50
                      ? "bg-[#755a1a]"
                      : "bg-amber-500"
                  }`}
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-200"
      >
        Full review <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

function PropertyReviewWorkspace({
  property,
  onOpen,
}: {
  property: Property;
  onOpen: (id: string) => void;
}) {
  const completeness = propertyCompleteness(property);
  const city = property.address?.city ?? "Location pending";
  const state =
    property.approvalStatus === "approved"
      ? property.status
      : property.approvalStatus;

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#ffdf9f] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#5b4302]">
                Audit ID: HK-{property.id.slice(-5).toUpperCase()}
              </span>
              <PropertyStatusBadge property={property} />
            </div>
            <h3 className="mt-3 text-2xl font-bold text-slate-900">
              {property.name}
            </h3>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <Building2 className="h-4 w-4 text-[#755a1a]" />
              {city}
              {property.address?.state ? `, ${property.address.state}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpen(property.id)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-4 text-sm font-bold text-white transition-colors hover:bg-[#07172b]"
          >
            Open full review <ChevronRight className="h-4 w-4 text-[#fed88b]" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-100 p-4 sm:grid-cols-4">
          <ReviewFact label="Category" value={label(property.propertyType)} />
          <ReviewFact label="Readiness" value={`${completeness}%`} />
          <ReviewFact label="Lifecycle" value={label(property.status)} />
          <ReviewFact label="Review state" value={label(state)} />
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Quality audit checklist
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Use the full review drawer for media, KYC, room, rate, and policy
              decisions.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {completeness}% ready
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ReviewCheck
            label="Core property details"
            complete={property.name !== "Untitled property"}
            detail="Name, type, lifecycle, and owner record"
          />
          <ReviewCheck
            label="Location confirmation"
            complete={Boolean(property.address?.city)}
            detail="Structured address and market city"
          />
          <ReviewCheck
            label="Partner submission"
            complete={Boolean(property.submittedAt)}
            detail="Submitted listing is ready for admin queue"
          />
          <ReviewCheck
            label="Approval decision"
            complete={property.approvalStatus === "approved"}
            detail="Approve, reject, or request changes"
          />
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-900">Review guidance</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <GuidanceTile
            icon={ImageIcon}
            title="Photos"
            detail="Approve images one by one after checking clarity and relevance."
          />
          <GuidanceTile
            icon={FileCheck}
            title="Documents"
            detail="PAN, government ID, and ownership documents remain private."
          />
          <GuidanceTile
            icon={ShieldCheck}
            title="Publish"
            detail="Approval activates only when all required checks pass."
          />
        </div>
      </article>
    </section>
  );
}

function PropertyStatusBadge({ property }: { property: Property }) {
  const value =
    property.approvalStatus === "approved"
      ? property.status
      : property.approvalStatus;
  const classes =
    value === "active" || value === "approved"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : value === "pending"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : value === "changes_requested" || value === "rejected"
      ? "bg-red-50 text-red-800 border-red-200"
      : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${classes}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label(value)}
    </span>
  );
}

function propertyCompleteness(property: Property) {
  let score = 35;
  if (property.name && property.name !== "Untitled property") score += 15;
  if (property.address?.city) score += 15;
  if (property.submittedAt) score += 15;
  if (property.approvalStatus === "pending") score += 10;
  if (property.approvalStatus === "approved") score += 20;
  if (property.approvalStatus === "changes_requested") score -= 5;
  return Math.max(20, Math.min(score, 100));
}

function ReviewFact({
  label: factLabel,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {factLabel}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ReviewCheck({
  label: checkLabel,
  detail,
  complete,
}: {
  label: string;
  detail: string;
  complete: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          complete
            ? "bg-emerald-100 text-emerald-800"
            : "bg-amber-100 text-amber-800"
        }`}
      >
        {complete ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <Clock3 className="h-4 w-4" />
        )}
      </span>
      <div>
        <p className="text-sm font-bold text-slate-900">{checkLabel}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function GuidanceTile({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof ImageIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-[#e9edff] p-4">
      <Icon className="h-5 w-5 text-[#755a1a]" />
      <h4 className="mt-3 text-sm font-bold text-slate-900">{title}</h4>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function PartnersPanel({
  users,
  properties,
  reload,
  onOpenProperty,
  searchQuery,
  setSearchQuery,
}: {
  users: User[];
  properties: Property[];
  reload: () => void;
  onOpenProperty: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [filter, setFilter] = useState<
    "pending" | "approved" | "changes_requested" | "suspended" | "all"
  >("pending");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sortUrgency, setSortUrgency] = useState(false);
  const [dossierDrawerOpen, setDossierDrawerOpen] = useState(false);

  const partners = useMemo(
    () =>
      users
        .filter((item) => item.roles.includes("partner"))
        .map((user): PartnerListItem => {
          const partnerProperties = properties.filter(
            (property) => property.partnerId === user.uid
          );
          const pendingCount = partnerProperties.filter(
            (property) => property.approvalStatus === "pending"
          ).length;
          const changesCount = partnerProperties.filter(
            (property) => property.approvalStatus === "changes_requested"
          ).length;
          const activeCount = partnerProperties.filter(
            (property) => property.status === "active"
          ).length;
          const primaryProperty = partnerProperties[0] ?? null;
          const city = primaryProperty?.address?.city ?? "Location pending";
          const progress =
            user.accountStatus === "suspended"
              ? 2
              : pendingCount > 0
              ? 4
              : activeCount > 0
              ? 5
              : 3;
          const state: PartnerListItem["state"] =
            user.accountStatus === "suspended"
              ? "suspended"
              : changesCount > 0
              ? "changes_requested"
              : pendingCount > 0
              ? "pending"
              : activeCount > 0
              ? "approved"
              : "all";

          const risk: PartnerListItem["risk"] =
            user.accountStatus === "suspended"
              ? "High"
              : changesCount > 0
              ? "Medium"
              : "Low";

          return {
            user,
            partnerProperties,
            pendingCount,
            changesCount,
            activeCount,
            primaryProperty,
            city,
            progress,
            state,
            risk,
          };
        }),
    [properties, users]
  );

  const counts = {
    all: partners.length,
    pending: partners.filter((item) => item.state === "pending").length,
    approved: partners.filter((item) => item.state === "approved").length,
    changes_requested: partners.filter(
      (item) => item.state === "changes_requested"
    ).length,
    suspended: partners.filter((item) => item.state === "suspended").length,
  };

  const visible = useMemo(() => {
    let list = partners.filter((item) => {
      const matchesFilter = filter === "all" || item.state === filter;
      const matchesSearch = [
        item.user.fullName,
        item.user.email,
        item.user.phoneNumber,
        item.user.uid,
        item.primaryProperty?.name,
        item.city,
      ]
        .filter(Boolean)
        .some((val) =>
          String(val).toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesFilter && matchesSearch;
    });

    if (sortUrgency) {
      list = [...list].sort((a, b) => b.pendingCount - a.pendingCount);
    }
    return list;
  }, [partners, filter, searchQuery, sortUrgency]);

  const selected =
    visible.find((item) => item.user.uid === selectedUid) ?? visible[0] ?? null;

  const handleSelectPartner = (uid: string) => {
    setSelectedUid(uid);
    setDossierDrawerOpen(true);
  };

  const mutate = async (user: User, patch: Record<string, unknown>) => {
    setBusy(user.uid);
    setError("");
    try {
      await api(`/api/admin/users/${user.uid}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update partner."
      );
    } finally {
      setBusy(null);
    }
  };

  const tabs: Array<{
    key: typeof filter;
    label: string;
    count: number;
  }> = [
    { key: "pending", label: "Pending Review", count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    {
      key: "changes_requested",
      label: "Changes Requested",
      count: counts.changes_requested,
    },
    { key: "suspended", label: "Suspended", count: counts.suspended },
    { key: "all", label: "All Partners", count: counts.all },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#755a1a]">
              <span>Institutional Compliance</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#755a1a]" />
              <span className="normal-case tracking-normal text-slate-500 font-normal">
                KYC / AML Protocol 3.4
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Partner Verification
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-500">
              Review partner accounts, listing portfolios, and compliance status from one focused queue.
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-[#0b1f3a] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#07172b] transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-[#fed88b]" />
            Refresh
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <PartnerStatCard
            icon={Clock3}
            label="Pending Review"
            value={counts.pending}
            detail="Needs admin action"
          />
          <PartnerStatCard
            icon={BadgeCheck}
            label="Verified"
            value={counts.approved}
            detail="Active partner portfolios"
          />
          <PartnerStatCard
            icon={Ban}
            label="Suspended"
            value={counts.suspended}
            detail="Access restricted"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-2xs border border-slate-200 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                  filter === tab.key
                    ? "bg-[#0b1f3a] text-white shadow-xs"
                    : "text-slate-600 hover:bg-white/70"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    filter === tab.key
                      ? "bg-[#fed88b] text-[#261a00] font-bold"
                      : "bg-white text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search partner, property, city..."
                className="h-9 w-full rounded-xl bg-slate-50 pl-10 pr-4 text-xs outline-none border border-slate-200 focus:border-[#755a1a]"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortUrgency((prev) => !prev)}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold border transition-colors ${
                sortUrgency
                  ? "bg-[#0b1f3a] text-white border-[#0b1f3a]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <SortDesc className="h-4 w-4 text-[#755a1a]" />
              {sortUrgency ? "Sorted by SLA" : "SLA Urgency"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Table + Dossier Container */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/70 px-4 py-3 border-b border-slate-200 text-xs text-slate-600">
            <label className="flex items-center gap-2.5 font-bold uppercase tracking-wider text-[10px]">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-[#0b1f3a]" />
              Batch Selection
            </label>
            <span className="text-slate-500">
              Showing {visible.length ? "1" : "0"}-{visible.length} of{" "}
              {counts[filter]} submissions
            </span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 font-bold">
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">Partner / Entity</th>
                  <th className="px-4 py-3">Verification Docs</th>
                  <th className="px-4 py-3">Portfolio</th>
                  <th className="px-4 py-3">Risk Level</th>
                  <th className="px-4 py-3 text-right">Intake</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((item) => (
                  <PartnerLedgerRow
                    key={item.user.uid}
                    item={item}
                    active={selected?.user.uid === item.user.uid}
                    onSelect={() => handleSelectPartner(item.user.uid)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="divide-y divide-slate-100 lg:hidden">
            {visible.map((item) => (
              <button
                type="button"
                key={item.user.uid}
                onClick={() => handleSelectPartner(item.user.uid)}
                className={`w-full p-4 text-left transition-colors ${
                  selected?.user.uid === item.user.uid ? "bg-slate-100" : "bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <PartnerAvatar name={item.user.fullName} active={selected?.user.uid === item.user.uid} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">
                          {item.user.fullName || "Unnamed partner"}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.primaryProperty?.name ?? "No property linked"}{" "}
                          · {item.city}
                        </p>
                      </div>
                      <PartnerRisk risk={item.risk} />
                    </div>
                    <div className="mt-2">
                      <PartnerProgress progress={item.progress} />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!visible.length && (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="font-bold text-slate-900">
                No partners match this view
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Adjust search query or choose another status tab.
              </p>
            </div>
          )}

          {/* Table Footer Stats Bar */}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#755a1a]" />
                <b>{counts.approved}</b> verified portfolios
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#e6c277]" />
                <b>{counts.pending + counts.changes_requested}</b> pending escalations
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Protocol v3.4 Active
            </span>
          </div>
        </section>

        {/* Desktop Dossier Panel (XL Screens) */}
        <aside className="hidden xl:block space-y-4">
          {selected ? (
            <PartnerDossier
              item={selected}
              busy={busy === selected.user.uid}
              onOpenProperty={onOpenProperty}
              onMutate={mutate}
            />
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xs">
              <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-bold text-slate-900">
                Select a partner to view details
              </p>
            </section>
          )}
        </aside>
      </div>

      {/* Slide-over Drawer Modal for Dossier on Mobile & Tablet (< xl) */}
      {dossierDrawerOpen && selected && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setDossierDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-slate-50 p-4 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-base font-bold text-slate-900">Partner Dossier</h3>
              <button
                type="button"
                onClick={() => setDossierDrawerOpen(false)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PartnerDossier
              item={selected}
              busy={busy === selected.user.uid}
              onOpenProperty={(id) => {
                setDossierDrawerOpen(false);
                onOpenProperty(id);
              }}
              onMutate={mutate}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerStatCard({
  icon: Icon,
  label: statLabel,
  value,
  detail,
}: {
  icon: typeof Timer;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#755a1a]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {statLabel}
        </p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function PartnerLedgerRow({
  item,
  active,
  onSelect,
}: {
  item: PartnerListItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer transition-colors ${
        active ? "bg-blue-50/70" : "hover:bg-slate-50"
      }`}
    >
      <td className="relative px-4 py-3.5 text-center">
        {active && (
          <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#755a1a]" />
        )}
        <input
          type="checkbox"
          checked={active}
          onChange={onSelect}
          className="h-4 w-4 rounded border-slate-300 text-[#0b1f3a]"
        />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <PartnerAvatar name={item.user.fullName} active={active} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-bold text-slate-900">
                {item.user.fullName || "Unnamed partner"}
              </span>
              {item.activeCount > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 border border-amber-200">
                  Live
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {item.primaryProperty?.name ?? "Property onboarding"} · {item.city}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-[#755a1a] truncate">
              {item.user.email ?? item.user.phoneNumber ?? item.user.uid}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <PartnerProgress progress={item.progress} />
      </td>
      <td className="px-4 py-3.5">
        <p className="text-xs font-bold text-slate-900">
          {item.partnerProperties.length} listings
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {item.pendingCount} pending · {item.activeCount} live
        </p>
      </td>
      <td className="px-4 py-3.5">
        <PartnerRisk risk={item.risk} />
      </td>
      <td className="px-4 py-3.5 text-right">
        <button
          type="button"
          className={`ml-auto flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
            active ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function PartnerDossier({
  item,
  busy,
  onOpenProperty,
  onMutate,
}: {
  item: PartnerListItem;
  busy: boolean;
  onOpenProperty: (id: string) => void;
  onMutate: (user: User, patch: Record<string, unknown>) => Promise<void>;
}) {
  const nextProperty =
    item.partnerProperties.find(
      (property) => property.approvalStatus === "pending"
    ) ?? item.primaryProperty;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-1.5 bg-[#0b1f3a]" />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <PartnerAvatar name={item.user.fullName} active size="large" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {item.user.fullName || "Unnamed partner"}
              </h3>
              <PartnerStatus state={item.state} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500 truncate">
              {item.user.email ?? item.user.phoneNumber ?? item.user.uid}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 truncate">
              {item.primaryProperty?.name ?? "No linked property"} · {item.city}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 border border-slate-100">
          <DossierMetric label="Listings" value={item.partnerProperties.length} />
          <DossierMetric label="Pending Review" value={item.pendingCount} />
          <DossierMetric label="Live Portfolio" value={item.activeCount} />
          <DossierMetric label="Risk Level" value={item.risk} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              KYC & Verification Dossier
            </h4>
            <span className="text-xs font-bold text-[#755a1a]">
              {item.progress} / 5 verified
            </span>
          </div>
          <div className="mt-2.5 space-y-2">
            {[
              ["Government ID", item.progress >= 1, FileCheck],
              ["PAN / Tax record", item.progress >= 2, Landmark],
              ["Ownership proof", item.progress >= 3, FileText],
              ["Property photos", item.progress >= 4, ImageIcon],
              ["Final sign-off", item.progress >= 5, CheckCircle],
            ].map(([name, complete, Icon]) => {
              const ItemIcon = Icon as typeof FileCheck;
              return (
                <div
                  key={String(name)}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 border border-slate-100"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#755a1a] shadow-2xs border border-slate-200">
                    <ItemIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {String(name)}
                    </p>
                    <p
                      className={`text-[10px] font-semibold ${
                        complete ? "text-emerald-700" : "text-amber-800"
                      }`}
                    >
                      {complete ? "Verified" : "Action Needed"}
                    </p>
                  </div>
                  {complete ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {nextProperty && (
            <button
              type="button"
              onClick={() => onOpenProperty(nextProperty.id)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#07172b]"
            >
              <Eye className="h-4 w-4 text-[#fed88b]" />
              Review linked property
            </button>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onMutate(item.user, {
                  accountStatus:
                    item.user.accountStatus === "active"
                      ? "suspended"
                      : "active",
                })
              }
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-colors disabled:opacity-50 ${
                item.user.accountStatus === "active"
                  ? "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              {item.user.accountStatus === "active" ? (
                <Ban className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {item.user.accountStatus === "active" ? "Suspend" : "Reactivate"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onMutate(item.user, {
                  roles: item.user.roles.includes("admin")
                    ? item.user.roles.filter((role) => role !== "admin")
                    : [...item.user.roles, "admin"],
                })
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-100 border border-amber-200 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-200 transition-colors disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              {item.user.roles.includes("admin") ? "Remove admin" : "Make admin"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerAvatar({
  name,
  active,
  size = "default",
}: {
  name: string;
  active?: boolean;
  size?: "default" | "large";
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl font-bold border ${
        size === "large" ? "h-11 w-11 text-lg" : "h-9 w-9 text-xs"
      } ${
        active
          ? "bg-[#0b1f3a] text-white border-[#0b1f3a]"
          : "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {(name || "P").charAt(0).toUpperCase()}
    </span>
  );
}

function PartnerProgress({ progress }: { progress: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
        <span>{progress} / 5 Verification</span>
      </div>
      <div className="mt-1 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-slate-100 border border-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            progress < 3
              ? "bg-red-600"
              : progress < 5
              ? "bg-amber-500"
              : "bg-emerald-600"
          }`}
          style={{ width: `${Math.min(progress, 5) * 20}%` }}
        />
      </div>
    </div>
  );
}

function PartnerRisk({ risk }: { risk: "Low" | "Medium" | "High" }) {
  const className =
    risk === "High"
      ? "bg-red-100 text-red-900 border-red-200"
      : risk === "Medium"
      ? "bg-amber-100 text-amber-900 border-amber-200"
      : "bg-emerald-50 text-emerald-800 border-emerald-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {risk} Risk
    </span>
  );
}

function PartnerStatus({ state }: { state: PartnerListItem["state"] }) {
  const text = state === "changes_requested" ? "Changes requested" : label(state);
  return (
    <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
      {text}
    </span>
  );
}

function DossierMetric({
  label: metricLabel,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-slate-500">{metricLabel}</p>
      <p className="mt-0.5 text-xs font-bold text-slate-900">{value}</p>
    </div>
  );
}

function UsersPanel({
  kind,
  users,
  reload,
  searchQuery,
  setSearchQuery,
}: {
  kind: "partner" | "customer";
  users: User[];
  reload: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = users
    .filter((item) =>
      kind === "partner"
        ? item.roles.includes("partner")
        : item.roles.includes("customer") && !item.roles.includes("partner")
    )
    .filter((item) =>
      `${item.fullName} ${item.email ?? ""} ${item.phoneNumber ?? ""}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    );

  const mutate = async (user: User, patch: Record<string, unknown>) => {
    setBusy(user.uid);
    setError("");
    try {
      await api(`/api/admin/users/${user.uid}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update account."
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#755a1a]">
              <span>Account Management</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#755a1a]" />
              <span className="normal-case tracking-normal text-slate-500 font-normal">
                Access Guard
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {kind === "partner" ? "Partners" : "Users & Customers"} ({visible.length})
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-500">
              Manage account access, administrative roles, and system privileges.
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-[#755a1a]" /> Refresh
          </button>
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, or phone..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#755a1a]"
          />
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        {visible.map((user) => (
          <article
            key={user.uid}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition-all hover:shadow-md flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-base font-bold border border-slate-200 shrink-0">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-base truncate">
                  {user.fullName || "Unnamed user"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 font-mono truncate">
                  {user.email ?? user.phoneNumber ?? user.uid}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200"
                    >
                      {role}
                    </span>
                  ))}
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      user.accountStatus === "active"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-red-50 text-red-800 border-red-200"
                    }`}
                  >
                    {label(user.accountStatus)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100 lg:pt-0 lg:border-t-0">
              <button
                type="button"
                disabled={busy === user.uid}
                onClick={() =>
                  void mutate(user, {
                    accountStatus:
                      user.accountStatus === "active" ? "suspended" : "active",
                  })
                }
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                  user.accountStatus === "active"
                    ? "bg-red-50 text-red-800 border border-red-200 hover:bg-red-100"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                {user.accountStatus === "active"
                  ? "Suspend Account"
                  : "Reactivate Account"}
              </button>

              <button
                type="button"
                disabled={busy === user.uid}
                onClick={() =>
                  void mutate(user, {
                    roles: user.roles.includes("admin")
                      ? user.roles.filter((role) => role !== "admin")
                      : [...user.roles, "admin"],
                  })
                }
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {user.roles.includes("admin") ? "Remove admin" : "Make admin"}
              </button>

              <button
                type="button"
                disabled={busy === user.uid}
                onClick={() =>
                  void mutate(user, {
                    roles: user.roles.includes("partner")
                      ? user.roles.filter((role) => role !== "partner")
                      : [...user.roles, "partner"],
                  })
                }
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {user.roles.includes("partner")
                  ? "Remove partner"
                  : "Make partner"}
              </button>
            </div>
          </article>
        ))}

        {!visible.length && (
          <div className="py-16 rounded-2xl border border-slate-200 bg-white flex flex-col items-center justify-center text-center">
            <div className="h-14 w-14 bg-slate-100 rounded-full flex items-center justify-center mb-3 text-slate-400">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-base font-bold text-slate-900">
              No matching {kind}s
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Try adjusting your search criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyDrawer({
  propertyId,
  onClose,
  onChanged,
}: {
  propertyId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const load = () => {
    void api(`/api/admin/properties/${propertyId}`)
      .then(setDetail)
      .catch((cause) => setError(cause.message));
    void api(`/api/admin/properties/${propertyId}/preview-urls`)
      .then((data) =>
        setUrls(
          Object.fromEntries(
            data.urls.map((item: { id: string; url: string }) => [
              item.id,
              item.url,
            ])
          )
        )
      )
      .catch(() => {});
  };

  useEffect(load, [propertyId]);

  const act = async (url: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      await api(url, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (form: FormData) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/properties/${propertyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          publicPhone: form.get("phone"),
          publicEmail: form.get("email"),
          checkInTime: form.get("checkIn"),
          checkOutTime: form.get("checkOut"),
          floors: Number(form.get("floors")),
          totalPhysicalRooms: Number(form.get("rooms")),
        }),
      });
      load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  };

  if (!detail)
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs p-4 flex justify-end">
        <div className="h-full w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-[#0b1f3a]" />
            <p className="text-slate-600 font-bold text-sm">Loading property workspace...</p>
          </div>
        </div>
      </div>
    );

  const property = detail.property;
  const reviewAsset = (
    type: "media" | "documents",
    id: string,
    decision: "approve" | "reject"
  ) =>
    void act(
      `/api/admin/properties/${propertyId}/assets/${type}/${id}/review`,
      { decision, ...(decision === "reject" ? { reason } : {}) }
    );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4 flex justify-end animate-in fade-in duration-200">
      <section className="h-full w-full max-w-4xl overflow-y-auto bg-slate-50 p-5 sm:p-6 lg:p-8 shadow-2xl sm:rounded-2xl animate-in slide-in-from-right-8 duration-300">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#755a1a]">
              Property Workspace
            </p>
            <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
              {property.name}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-800">
                Status: {label(textValue(property.status))} · Approval:{" "}
                {label(textValue(property.approvalStatus))}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
          >
            Close Workspace
          </button>
        </header>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs mb-6">
          <h3 className="font-bold text-slate-900 text-sm mb-3">Moderation Actions</h3>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/review`, {
                  decision: "approve",
                })
              }
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors disabled:opacity-50 shadow-2xs"
            >
              Approve & List Property
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/review`, {
                  decision: "request_changes",
                  reason,
                })
              }
              className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-amber-950 hover:bg-amber-500 transition-colors disabled:opacity-50 shadow-2xs"
            >
              Request Changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/review`, {
                  decision: "reject",
                  reason,
                })
              }
              className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50 shadow-2xs"
            >
              Reject Listing
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/lifecycle`, {
                  action:
                    property.status === "active"
                      ? "pause"
                      : property.status === "paused"
                      ? "resume"
                      : property.status === "archived"
                      ? "restore"
                      : "archive",
                })
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-2xs"
            >
              {property.status === "active"
                ? "Pause"
                : property.status === "paused"
                ? "Resume"
                : property.status === "archived"
                ? "Restore"
                : "Archive"}
            </button>
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-700">
            Notes / Reason for changes or rejection:
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-[#755a1a] shadow-2xs"
              placeholder="Provide clear notes for the partner on what must be resolved..."
              rows={2}
            />
          </label>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs mb-6">
          <h3 className="font-bold text-slate-900 text-base mb-4">Listing Details</h3>
          <form
            action={(form) => void save(form)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <AdminField
              label="Property Name"
              name="name"
              value={property.name}
            />
            <AdminField
              label="Public Phone"
              name="phone"
              value={property.publicPhone}
            />
            <AdminField
              label="Public Email"
              name="email"
              value={property.publicEmail}
              type="email"
            />
            <AdminField
              label="Floors"
              name="floors"
              value={property.floors}
              type="number"
            />
            <AdminField
              label="Total Physical Rooms"
              name="rooms"
              value={property.totalPhysicalRooms}
              type="number"
            />
            <AdminField
              label="Check-In Time"
              name="checkIn"
              value={property.checkInTime}
              type="time"
            />
            <AdminField
              label="Check-Out Time"
              name="checkOut"
              value={property.checkOutTime}
              type="time"
            />
            <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
              Property Description
              <textarea
                name="description"
                defaultValue={textValue(property.description)}
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-[#755a1a]"
              />
            </label>
            <div className="sm:col-span-2 pt-2">
              <button
                disabled={busy}
                className="rounded-xl bg-[#0b1f3a] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#07172b] transition-colors"
              >
                Save Listing Edits
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs mb-6">
          <h3 className="font-bold text-slate-900 text-base mb-4">
            Rooms, Rates & Policies
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <InfoList
              title="Room Types"
              items={detail.roomTypes.map(
                (item) =>
                  `${item.name} · ${item.totalInventory ?? item.inventory ?? 0} rooms`
              )}
            />
            <InfoList
              title="Rate Plans"
              items={detail.ratePlans.map(
                (item) =>
                  `${item.name} · ₹${((item.basePricePaise ?? 0) / 100).toLocaleString("en-IN")}`
              )}
            />
            <InfoList
              title="Policies"
              items={detail.policies.map(
                (item) => textValue(item.name) ?? "Untitled policy"
              )}
            />
          </div>
        </section>

        <AssetSection
          title="Property Photos"
          assets={detail.media}
          urls={urls}
          type="media"
          onReview={reviewAsset}
        />
        <div className="h-6" />
        <AssetSection
          title="Private KYC Documents"
          assets={detail.documents}
          urls={urls}
          type="documents"
          onReview={reviewAsset}
        />
        <div className="h-10" />
      </section>
    </div>
  );
}

function AdminField({
  label: fieldLabel,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: unknown;
  type?: string;
}) {
  return (
    <label className="block text-xs font-bold text-slate-700">
      {fieldLabel}
      <input
        required
        name={name}
        type={type}
        defaultValue={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-[#755a1a] shadow-2xs"
      />
    </label>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        {title}
      </p>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="text-xs text-slate-700 font-medium">
              • {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">None added</p>
      )}
    </div>
  );
}

function AssetSection({
  title,
  assets,
  urls,
  type,
  onReview,
}: {
  title: string;
  assets: AdminRecord[];
  urls: Record<string, string>;
  type: "media" | "documents";
  onReview: (
    type: "media" | "documents",
    id: string,
    decision: "approve" | "reject"
  ) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
      <h3 className="font-bold text-slate-900 text-base mb-4">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => {
          const status =
            type === "media"
              ? (asset.moderationStatus ?? asset.status)
              : asset.status;
          return (
            <article
              key={asset.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col group"
            >
              <div className="aspect-video bg-slate-100 relative overflow-hidden">
                {urls[asset.id] && asset.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[asset.id]}
                    alt={asset.fileName ?? title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <a
                    href={urls[asset.id]}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <FileCheck className="h-8 w-8 mb-1.5 text-[#755a1a]" />
                    <span className="text-xs font-bold">Open Document</span>
                  </a>
                )}
                <div className="absolute top-2 right-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold backdrop-blur-md shadow-xs border ${
                      status === "approved"
                        ? "bg-emerald-100/90 text-emerald-800 border-emerald-200"
                        : status === "pending"
                        ? "bg-amber-100/90 text-amber-900 border-amber-200"
                        : "bg-red-100/90 text-red-900 border-red-200"
                    }`}
                  >
                    {label(status)}
                  </span>
                </div>
              </div>
              <div className="p-3.5 flex-1 flex flex-col">
                <p
                  className="truncate text-xs font-bold text-slate-900"
                  title={asset.fileName ?? asset.documentType}
                >
                  {asset.fileName ?? asset.documentType}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {label(asset.category ?? asset.documentType)}
                </p>
                <div className="mt-auto pt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onReview(type, asset.id, "approve")}
                    className="flex-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors px-3 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-200"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onReview(type, asset.id, "reject")}
                    className="flex-1 rounded-xl bg-red-50 hover:bg-red-100 transition-colors px-3 py-1.5 text-xs font-bold text-red-800 border border-red-200"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!assets.length && (
          <div className="sm:col-span-2 lg:col-span-3 py-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
            <ImageIcon className="h-7 w-7 mb-1.5 text-slate-300" />
            <p className="text-xs font-medium">No {type} uploaded yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}
