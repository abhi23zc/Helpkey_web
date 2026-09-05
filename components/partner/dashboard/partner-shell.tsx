"use client";

import { Bell, Building2, CalendarDays, Check, ChevronDown, Menu, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PartnerSidebar } from "./partner-sidebar";
import {
  type PartnerDashboardData,
  usePartnerDashboardData,
} from "./use-partner-dashboard-data";

/** Builds up-to-two-letter initials from a display name, e.g. "Daniel Carter" -> "DC". */
function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

const TODAY_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function PropertyDropdown({
  properties,
  selectedId,
  onSelect,
  selectedCover,
}: {
  properties: Array<{ id: string; name: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
  selectedCover: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProperty = useMemo(() => {
    return properties.find((p) => p.id === selectedId) || properties[0];
  }, [properties, selectedId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={dropdownRef} className="relative min-w-[220px]">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-12 w-full items-center justify-between gap-3 rounded-2xl border bg-white px-3.5 shadow-xs transition-all duration-200 ${
          isOpen ? "border-[#c89b3c] ring-1 ring-[#c89b3c]" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative h-7 w-8 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedCover}
              alt={selectedProperty?.name ?? "Property"}
              className="h-full w-full object-cover"
            />
          </div>
          <span className="truncate text-sm font-bold text-[#061224]">
            {selectedProperty?.name ?? "The Balmoral Hotel"}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#c89b3c]" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[240px] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-950/5 animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="max-h-60 overflow-y-auto space-y-1">
            {properties.length ? (
              properties.map((property) => {
                const isSelected = property.id === selectedProperty?.id;
                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => {
                      onSelect(property.id);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-[#fbf5e8] text-[#061224] font-bold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-[#061224]">
                        <Building2 className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <span className="truncate">{property.name}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-[#c89b3c] shrink-0" />}
                  </button>
                );
              })
            ) : (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center justify-between rounded-xl bg-[#fbf5e8] px-3 py-2.5 text-xs font-bold text-[#061224]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-[#061224]">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <span>The Balmoral Hotel</span>
                </div>
                <Check className="h-4 w-4 text-[#c89b3c]" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PartnerShell({
  children,
}: {
  children: (data: PartnerDashboardData) => ReactNode;
}) {
  const data = usePartnerDashboardData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const syncSidebar = () => setSidebarCollapsed(window.innerWidth < 1440);
    syncSidebar();
    window.addEventListener("resize", syncSidebar);
    return () => window.removeEventListener("resize", syncSidebar);
  }, []);

  const displayName = data.user?.fullName?.trim() || "Partner";
  const initials = useMemo(() => toInitials(displayName), [displayName]);
  const today = useMemo(() => TODAY_FORMATTER.format(new Date()), []);
  const coverImage = data.selectedProperty?.coverImageUrl || "/balmoral_hotel.png";

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

      <section className="mx-auto max-w-[1680px] space-y-4 px-3 py-4 sm:px-5 lg:px-6 2xl:px-8">
        <header className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(220px,260px)_minmax(260px,1fr)_auto] xl:items-center">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-[#061224]"
              aria-label="Open partner menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-[#061224]">
              Helpkey Partner
            </h1>
          </div>

          <PropertyDropdown
            properties={data.properties}
            selectedId={data.selectedProperty?.id ?? ""}
            onSelect={data.setSelectedPropertyId}
            selectedCover={coverImage}
          />

          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-xs">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#061224]"
            >
              {today}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </div>

          <div className="hidden h-12 items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-xs md:flex xl:min-w-0">
            <Search className="mr-2.5 h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate text-sm font-medium text-slate-400">
              Search reservations, guests, booking ID...
            </span>
            <span className="ml-auto rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              ⌘K
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 md:justify-self-end">
            <button
              type="button"
              className="relative grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white shadow-xs transition-colors hover:bg-slate-50"
              title="Notifications"
            >
              <Bell className="h-5 w-5 text-[#061224]" />
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#c89b3c] text-[10px] font-bold text-white shadow-xs">
                5
              </span>
            </button>
            {data.user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.user.photoURL}
                alt={displayName}
                className="h-11 w-11 rounded-full object-cover shadow-xs ring-2 ring-[#c89b3c]/30"
              />
            ) : (
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#061224] text-xs font-bold text-white shadow-xs ring-2 ring-[#c89b3c]/30">
                {initials}
              </div>
            )}
            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold leading-tight text-[#061224]">
                {displayName}
              </p>
              <p className="text-[11px] font-semibold text-slate-500">
                Partner Admin
              </p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </div>
        </header>

        {data.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {data.error}
          </div>
        )}

        {children(data)}
      </section>
    </main>
  );
}
