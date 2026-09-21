"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { apiFetch } from "@/lib/api/client";

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
  const client = useQueryClient();
  const key = queryKeys.notifications(false);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications?limit=20", { signal, cache: "no-store" }), refetchInterval: () => typeof document !== "undefined" && document.visibilityState === "visible" ? pollMs : false, refetchOnWindowFocus: true, staleTime: 10_000 });
  const items = useMemo(() => query.data?.notifications ?? [], [query.data?.notifications]);
  const unreadCount = query.data?.unreadCount ?? 0;
  const mutation = useMutation({ mutationFn: (ids: string[]) => apiFetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }), onMutate: async (ids) => { await client.cancelQueries({ queryKey: key }); const previous = client.getQueryData(key); client.setQueryData(key, { notifications: items.map((item) => ids.includes(item.id) ? { ...item, readAt: new Date().toISOString() } : item), unreadCount: Math.max(0, unreadCount - ids.length) }); return { previous }; }, onError: (_error, _ids, context) => client.setQueryData(key, context?.previous), onSettled: () => client.invalidateQueries({ queryKey: key }) });

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      await mutation.mutateAsync(ids);
    },
    [mutation],
  );

  const markAllRead = useCallback(() => {
    const unreadIds = items.filter((item) => item.readAt == null).map((item) => item.id);
    return markRead(unreadIds);
  }, [items, markRead]);

  return { items, unreadCount, loading: query.isLoading, refresh: query.refetch, markRead, markAllRead };
}
