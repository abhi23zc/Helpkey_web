"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Headphones,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { NotificationBell } from "@/components/shared/notification-bell";

type AdminShellContextValue = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, disabled: false },
  { href: "/admin/partners", label: "Partners", icon: ShieldCheck, exact: false, disabled: false },
  { href: "/admin/properties", label: "Properties", icon: Building2, exact: false, disabled: false },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays, exact: false, disabled: true },
  { href: "/admin/users", label: "Users", icon: Users, exact: false, disabled: false },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquare, exact: false, disabled: true },
  { href: "/admin/payments", label: "Payments", icon: WalletCards, exact: false, disabled: true },
  { href: "/admin/support", label: "Support", icon: Headphones, exact: false, disabled: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, exact: false, disabled: true },
] as const;

export function useAdminShell() {
  const context = useContext(AdminShellContext);
  if (!context) {
    throw new Error("useAdminShell must be used inside AdminShell.");
  }
  return context;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isSidebarExpanded = !sidebarCollapsed || sidebarHovered;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const context = useMemo(
    () => ({ searchQuery, setSearchQuery }),
    [searchQuery]
  );

  return (
    <AdminShellContext.Provider value={context}>
      <main
        className={`min-h-screen bg-[#f7f4ee] font-sans text-[#111827] transition-[padding] duration-300 ${
          sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        <aside
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#0a1f3c] text-[#d6e3ff] shadow-xl transition-[width] duration-300 lg:flex ${
            isSidebarExpanded ? "w-64" : "w-20"
          }`}
        >
          <SidebarHeader expanded={isSidebarExpanded} />

          <button
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            className={`mx-3 mt-3 flex h-10 items-center rounded-lg bg-[#06142b]/80 px-3 text-xs font-semibold text-white transition-all hover:bg-[#06142b] active:scale-95 ${
              !isSidebarExpanded ? "justify-center" : "justify-between"
            }`}
            aria-label={sidebarCollapsed ? "Pin sidebar open" : "Collapse sidebar"}
            title={
              sidebarCollapsed
                ? isSidebarExpanded
                  ? "Pin expanded sidebar (Ctrl+B)"
                  : "Expand sidebar (Ctrl+B)"
                : "Collapse sidebar (Ctrl+B)"
            }
          >
            {!isSidebarExpanded ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <span className="flex items-center gap-2">
                  <PanelLeftClose className="h-4 w-4 text-[#d8b46a]" />
                  Collapse
                </span>
                <span className="rounded bg-[#0a1f3c] px-1.5 py-0.5 font-mono text-[9px] text-[#b5c7ea]">
                  Ctrl+B
                </span>
              </>
            )}
          </button>

          <AdminSidebar collapsed={!isSidebarExpanded} />

          <div
            className={`m-3 mb-6 flex items-center gap-3 rounded-xl border border-white/5 bg-[#06142b] p-3 ${
              !isSidebarExpanded ? "justify-center" : ""
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d8b46a] text-sm font-bold text-[#261a00] shadow-sm">
              A
            </div>
            <div className={`min-w-0 flex-1 ${!isSidebarExpanded ? "hidden" : ""}`}>
              <p className="truncate text-xs font-semibold text-white">Admin User</p>
              <p className="truncate text-[10px] text-[#7587a7]">Platform Director</p>
            </div>
            <MoreHorizontal
              className={`h-4 w-4 text-[#7587a7] ${!isSidebarExpanded ? "hidden" : ""}`}
            />
          </div>
        </aside>

        {mobileMenuOpen && <MobileSidebar onClose={() => setMobileMenuOpen(false)} />}

        <header
          className={`sticky top-0 z-30 h-16 border-b border-[#e6e2da] bg-white/90 backdrop-blur-xl transition-[left] duration-300 lg:fixed lg:right-0 lg:h-20 ${
            sidebarCollapsed ? "lg:left-20" : "lg:left-64"
          }`}
        >
          <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2 text-[#44474d] hover:bg-slate-100 lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open mobile menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-2 text-xs text-[#44474d] sm:flex">
                <Building2 className="h-4 w-4 text-[#c6973e]" />
                <span className="text-slate-300">/</span>
                <span className="font-semibold text-[#111827]">Platform Console</span>
                <span className="mx-1 h-3.5 w-px bg-slate-200" />
                <span className="rounded-full border border-[#e6e2da] bg-[#fbf3df] px-2.5 py-1 text-[10px] font-semibold text-[#5b4302]">
                  14:32 UTC
                </span>
              </div>
            </div>

            <div className="relative max-w-md flex-1 px-2 sm:px-4">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search partners, properties, or records..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-8 text-xs outline-none transition-colors placeholder:text-slate-400 focus:border-[#c6973e] focus:bg-white focus:ring-2 focus:ring-[#d8b46a]/20 sm:h-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
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
              <NotificationBell />
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0a1f3c] text-xs font-bold text-white shadow-sm ring-2 ring-[#d8b46a]">
                A
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1700px] px-4 py-6 lg:px-8 lg:pt-24">
          {children}
        </div>
      </main>
    </AdminShellContext.Provider>
  );
}

function SidebarHeader({ expanded }: { expanded: boolean }) {
  return (
    <div
      className={`flex h-20 items-center gap-3 bg-[#06142b] px-5 ${
        !expanded ? "justify-center px-3" : ""
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d8b46a] text-[#261a00] shadow-sm">
        <Building2 className="h-5 w-5" />
      </div>
      <div className={!expanded ? "hidden" : "min-w-0 flex-1"}>
        <div className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-white">
          Helpkey
          <span className="rounded bg-[#755a1a] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Admin
          </span>
        </div>
        <p className="truncate text-[10px] text-[#7587a7]">Hotel admin console</p>
      </div>
    </div>
  );
}

function AdminSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
      {adminNav.map((item) => (
        <SidebarItem key={item.href} item={item} collapsed={collapsed} />
      ))}
    </nav>
  );
}

function MobileSidebar({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <nav className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-[#0a1f3c] p-4 text-[#d6e3ff] shadow-2xl animate-in slide-in-from-left duration-300">
        <div>
          <div className="flex items-center justify-between border-b border-[#06142b] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d8b46a] font-bold text-[#261a00]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Helpkey Admin</h3>
                <p className="text-[10px] text-[#7587a7]">Platform Console</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#7587a7] hover:bg-[#06142b] hover:text-white"
              aria-label="Close mobile menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 space-y-1">
            {adminNav
              .filter((item) => !item.disabled)
              .map((item) => (
                <SidebarItem
                  key={item.href}
                  item={item}
                  collapsed={false}
                  onNavigate={onClose}
                />
              ))}
          </div>
        </div>

        <div className="border-t border-[#06142b] pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-[#06142b] p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d8b46a] text-sm font-bold text-[#261a00]">
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
  );
}

function SidebarItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: (typeof adminNav)[number];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const className = `group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition-all ${
    collapsed ? "justify-center px-2" : ""
  } ${
    active
      ? "border-l-2 border-[#d8b46a] bg-white/10 text-white shadow-md"
      : item.disabled
        ? "cursor-not-allowed text-[#7587a7] opacity-60"
        : "text-[#b5c7ea] hover:bg-[#06142b] hover:text-white"
  }`;

  if (item.disabled) {
    return (
      <button type="button" disabled title={collapsed ? item.label : undefined} className={className}>
        <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
        <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={className}
    >
      <Icon className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${active ? "text-[#d8b46a]" : ""}`} />
      <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
    </Link>
  );
}
