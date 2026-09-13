"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BedDouble,
  Building2,
  CalendarDays,
  Grid2X2,
  Headphones,
  KeyRound,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Star,
  Tag,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { label: "Overview", href: "/partner/dashboard", icon: Grid2X2 },
  { label: "Reservations", href: "/partner/reservations", icon: CalendarDays },
  { label: "Calendar", href: "", icon: CalendarDays },
  { label: "Rooms", href: "/partner/rooms", icon: BedDouble },
  { label: "Property Listing", href: "/partner/listing", icon: Building2 },
  { label: "Reviews", href: "/partner/reviews", icon: Star },
  { label: "Payouts", href: "", icon: WalletCards },
  { label: "Promotions", href: "", icon: Tag },
  { label: "Messages", href: "", icon: Mail },
  { label: "Settings", href: "", icon: Settings },
] as const;

export function PartnerSidebar({
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
  const pathname = usePathname();
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
          className={`flex h-16 lg:h-20 items-center border-b border-white/10 px-4 transition-all duration-300 ${
            !isExpanded ? "justify-center px-0" : "justify-between px-5"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <KeyRound className="h-7 w-7 shrink-0 text-[#c89b3c]" />
            <div
              className={`transition-opacity duration-300 ${
                !isExpanded ? "hidden" : "block"
              }`}
            >
              <p className="text-lg font-bold uppercase leading-none tracking-wide text-white">
                Helpkey
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[#c89b3c]">
                Partner
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`hidden shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${isExpanded ? "lg:block" : ""}`}
            aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
            title={
              collapsed
                ? isHovered
                  ? "Pin expanded sidebar"
                  : "Expand sidebar"
                : "Collapse sidebar"
            }
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-white/80 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Partner navigation" className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden px-3 py-4">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive = href ? pathname === href : false;
            const baseClass = `group relative flex h-10 w-full items-center rounded-xl text-left text-xs font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
              !isExpanded ? "justify-center px-0" : "gap-3 px-3.5"
            } ${
              isActive
                ? "bg-[#c89b3c]/15 text-white font-bold ring-1 ring-inset ring-[#c89b3c]/55"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`;

            const content = (
              <>
                <Icon
                  className={`h-5 w-5 shrink-0 transition-colors ${
                    isActive ? "text-[#c89b3c]" : "text-slate-400 group-hover:text-white"
                  }`}
                />
                <span
                  className={`truncate transition-opacity duration-200 ${
                    !isExpanded ? "hidden" : "block"
                  }`}
                >
                  {label}
                </span>
                {!href && isExpanded && (
                  <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase text-white/55">
                    Soon
                  </span>
                )}
              </>
            );

            return href ? (
              <Link
                key={label}
                href={href}
                onClick={onClose}
                className={baseClass}
                title={!isExpanded ? label : undefined}
              >
                {content}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                disabled
                className={`${baseClass} cursor-not-allowed opacity-50 hover:bg-transparent hover:text-slate-400`}
                title={!isExpanded ? `${label} — coming soon` : undefined}
              >
                {content}
              </button>
            );
          })}
        </nav>

        <div className={`mt-auto p-3 transition-opacity duration-300 ${!isExpanded ? "hidden" : "block"}`}>
          <div className="rounded-2xl border border-[#c89b3c]/25 bg-[#0d1e38]/80 p-3 backdrop-blur-xs shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[10px] font-bold text-white/80">Synced 2m ago</span>
              </div>
              <ShieldCheck className="h-3.5 w-3.5 text-[#c89b3c]" />
            </div>

            <div className="mt-2.5 border-t border-white/10 pt-2.5">
              <p className="text-[11px] font-bold text-white">Need Support?</p>
              <p className="text-[10px] text-white/60">Partner team is 24/7 active</p>
              <Link
                href="/help"
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#c89b3c]/60 bg-[#c89b3c]/10 py-1.5 text-xs font-bold text-[#c89b3c] transition-all hover:bg-[#c89b3c] hover:text-[#061224] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
              >
                <Headphones className="h-3.5 w-3.5" />
                Contact Support
              </Link>
            </div>
          </div>
        </div>

        <div className={`mt-auto flex justify-center border-t border-white/10 px-3 py-4 ${isExpanded ? "hidden" : "block"}`}>
          <Link
            href="/help"
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#c89b3c]/30 bg-[#0d1e38] text-[#c89b3c] transition-all hover:bg-[#c89b3c] hover:text-[#061224] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
            title="Contact Support"
          >
            <Headphones className="h-4 w-4" />
          </Link>
        </div>
      </aside>
    </>
  );
}
