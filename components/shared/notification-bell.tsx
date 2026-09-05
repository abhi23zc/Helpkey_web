"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNotifications } from "./use-notifications";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Notification bell with unread badge and a dropdown of recent notifications.
 * Shared by the partner and admin shells.
 */
export function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white shadow-xs transition-colors hover:bg-slate-50"
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell className="h-5 w-5 text-[#061224]" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#c89b3c] px-1 text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-950/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-[#061224]">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#9a6b18] hover:text-[#755a1a]"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs font-medium text-slate-400">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.readAt == null && void markRead([item.id])}
                  className={`block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${item.readAt == null ? "bg-[#fbf5e8]" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {item.readAt == null && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c89b3c]" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#061224]">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-600">{item.body}</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">{relativeTime(item.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
