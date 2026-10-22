"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import type { WishlistIds, WishlistPage } from "@/lib/customer/wishlist";

export function useSavedHotels(propertyIds: string[], requestLogin: () => void) {
  const { appUser } = useAuth();
  const uid = appUser?.uid;
  const client = useQueryClient();
  const previousUser = useRef(uid);
  const pendingSave = useRef<string | null>(null);
  const account = useRef(uid);
  useEffect(() => { account.current = uid; }, [uid]);
  const [error, setError] = useState("");
  const ids = [...new Set(propertyIds)].sort();
  const queryKey = ["wishlist", uid, "ids", ids] as const;
  const saved = useQuery({
    queryKey, enabled: !!uid && ids.length > 0,
    queryFn: async ({ signal }) => {
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
      const results = await Promise.all(batches.map(batch => {
        const params = new URLSearchParams({ ids: "true" });
        batch.forEach(id => params.append("propertyId", id));
        return apiFetch<WishlistIds>(`/api/wishlist?${params}`, { signal });
      }));
      return { propertyIds: results.flatMap(result => result.propertyIds) };
    }, staleTime: 60_000, retry: false,
  });
  const mutation = useMutation({
    mutationFn: async ({ id, remove }: { id: string; remove: boolean }) => {
      await apiFetch(`/api/wishlist/${encodeURIComponent(id)}`, { method: remove ? "DELETE" : "PUT" });
    },
    onMutate: async ({ id, remove }) => {
      setError("");
      await client.cancelQueries({ queryKey: ["wishlist", uid] });
      const snapshots = client.getQueriesData<WishlistIds | InfiniteData<WishlistPage>>({ queryKey: ["wishlist", uid] });
      snapshots.forEach(([key, value]) => {
        if (value && "propertyIds" in value) client.setQueryData(key, { propertyIds: remove ? value.propertyIds.filter(value => value !== id) : [...new Set([...value.propertyIds, id])] });
        if (remove && value && "pages" in value) client.setQueryData(key, { ...value, pages: value.pages.map(page => ({ ...page, items: page.items.filter(item => item.propertyId !== id) })) });
      });
      return { snapshots, uid };
    },
    onError: (cause, variables, context) => {
      if (context?.uid !== account.current) return;
      context?.snapshots.forEach(([key, value]) => client.setQueryData(key, value));
      setError(cause instanceof Error ? cause.message : "Unable to update saved hotels. Please try again.");
      if (cause instanceof ApiClientError && cause.status === 401) { pendingSave.current = variables.remove ? null : variables.id; requestLogin(); }
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.uid === account.current) void client.invalidateQueries({ queryKey: ["wishlist", context?.uid] });
    },
  });
  useEffect(() => {
    if (previousUser.current && previousUser.current !== uid) {
      void client.cancelQueries({ queryKey: ["wishlist", previousUser.current] });
      client.removeQueries({ queryKey: ["wishlist", previousUser.current] });
    }
    const accountChanged = previousUser.current !== uid;
    previousUser.current = uid;
    if (accountChanged && uid && pendingSave.current) {
      const id = pendingSave.current;
      pendingSave.current = null;
      mutation.mutate({ id, remove: false });
    }
  }, [uid, client, mutation]);
  return {
    savedIds: new Set(uid ? saved.data?.propertyIds ?? [] : []),
    busy: mutation.isPending || (!!uid && saved.isPending && ids.length > 0),
    error: error || (saved.error ? "Unable to load saved hotels. Refresh to try again." : ""),
    toggle: (id: string) => {
      if (!uid) { pendingSave.current = id; requestLogin(); return; }
      if (mutation.isPending) return;
      mutation.mutate({ id, remove: saved.data?.propertyIds.includes(id) ?? false });
    },
    remove: (id: string) => { if (uid && !mutation.isPending) mutation.mutate({ id, remove: true }); },
    resumePending: () => {
      if (uid && pendingSave.current) {
        const id = pendingSave.current; pendingSave.current = null;
        mutation.mutate({ id, remove: false });
      }
    },
    cancelPending: () => { pendingSave.current = null; },
  };
}
