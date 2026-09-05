"use client";

import { useCallback, useEffect, useState } from "react";

export type NotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string | null;
};

/**
 * Polls the current user's in-app notifications and exposes the unread count.
 * Refreshes on an interval and on window focus. No realtime layer needed.
 */
export function useNotifications(pollMs = 60_000) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { notifications: NotificationItem[]; unreadCount: number };
      setItems(json.notifications ?? []);
      setUnreadCount(json.unreadCount ?? 0);
    } catch {
      // Best-effort; leave the last known state in place.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Defer the initial fetch a tick so no setState runs synchronously in the
    // effect body; `refresh` itself only sets state after an awaited fetch.
    const kickoff = window.setTimeout(() => {
      if (!cancelled) void refresh();
    }, 0);
    const interval = window.setInterval(() => {
      if (!cancelled) void refresh();
    }, pollMs);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, pollMs]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      // Optimistic: clear locally, then reconcile.
      setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, readAt: new Date().toISOString() } : item)));
      setUnreadCount((count) => Math.max(0, count - ids.length));
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      } finally {
        void refresh();
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(() => {
    const unreadIds = items.filter((item) => item.readAt == null).map((item) => item.id);
    return markRead(unreadIds);
  }, [items, markRead]);

  return { items, unreadCount, loading, refresh, markRead, markAllRead };
}
