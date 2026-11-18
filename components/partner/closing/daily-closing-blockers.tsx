"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, ShieldAlert } from "lucide-react";
import { parseBlockerString, type BlockerItem } from "./closing-formatters";

type Props = {
  rawBlockers: string[];
  bookingLookup?: Map<string, { confirmationCode?: string; bookingReference?: string; leadGuest?: { name?: string } }>;
  onOpenBooking: (bookingId: string, section?: string) => void;
};

export function DailyClosingBlockers({ rawBlockers, bookingLookup, onOpenBooking }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!rawBlockers || rawBlockers.length === 0) return null;

  const items: BlockerItem[] = rawBlockers.map((str) => parseBlockerString(str, bookingLookup));
  const displayItems = expanded ? items : items.slice(0, 5);
  const remaining = items.length - 5;

  return (
    <section
      role="alert"
      aria-labelledby="blockers-heading"
      className="overflow-hidden rounded-2xl border border-rose-200/90 bg-gradient-to-b from-rose-50/80 to-rose-50/40 p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-600 text-white shadow-2xs">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <h2 id="blockers-heading" className="text-sm font-bold text-rose-950 sm:text-base">
              Action required before closing ({items.length})
            </h2>
            <p className="text-xs text-rose-800/90 font-medium">
              Daily closing permanently freezes financial records. Resolve these items or discrepancies to finalize today’s report.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 divide-y divide-rose-200/50">
        {displayItems.map((item, idx) => (
          <div key={item.id + idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                <strong className="text-xs font-bold text-[#061224]">{item.title}</strong>
              </div>
              <p className="mt-0.5 text-xs text-slate-600 pl-4 [overflow-wrap:anywhere]">{item.detail}</p>
            </div>

            {item.bookingId && (
              <button
                type="button"
                onClick={() => onOpenBooking(item.bookingId!, "payments")}
                className="self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-900 shadow-2xs hover:bg-rose-50 hover:border-rose-400 active:scale-95 transition-all"
              >
                <span>Review payments</span>
                <ExternalLink className="h-3.5 w-3.5 text-rose-700" />
              </button>
            )}
          </div>
        ))}
      </div>

      {remaining > 0 && (
        <div className="mt-3 pt-2 text-center border-t border-rose-200/50">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-xs font-bold text-rose-900 hover:text-rose-950 hover:underline"
          >
            <span>{expanded ? "Show less" : `View all ${items.length} items (${remaining} more)`}</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </section>
  );
}
