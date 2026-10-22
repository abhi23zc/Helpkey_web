"use client";
import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { SiteHeader } from "@/components/shared/site-header";
import { LoginModal } from "@/components/auth/login-modal";
import { StayCard } from "@/components/search/stay-card";
import { apiFetch } from "@/lib/api/client";
import type { WishlistPage as WishlistResponse } from "@/lib/customer/wishlist";
import { useSavedHotels } from "./use-saved-hotels";

export function WishlistPage() {
  const { appUser, loading } = useAuth();
  const [login, setLogin] = useState(false);
  const hotels = useInfiniteQuery({ queryKey: ["wishlist", appUser?.uid, "pages"], enabled: !!appUser,
    queryFn: ({ pageParam, signal }) => apiFetch<WishlistResponse>(`/api/wishlist${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    initialPageParam: "", getNextPageParam: last => last.hasMore && last.nextCursor ? last.nextCursor : undefined, retry: false,
  });
  const items = hotels.data?.pages.flatMap(page => page.items) ?? [];
  const saved = useSavedHotels(items.map(item => item.propertyId), () => setLogin(true));
  return <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]"><SiteHeader onLoginClick={() => setLogin(true)} /><main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6"><h1 className="text-3xl font-bold">Saved hotels</h1><p className="mt-2 text-sm text-slate-600">Your shortlist, saved across your devices. Choose dates to check current prices and availability.</p>
    {saved.error && <p role="alert" className="mt-4 text-sm text-red-700">{saved.error}</p>}
    {loading || (!!appUser && hotels.isPending) ? <p className="mt-6" aria-busy="true">Loading saved hotels…</p> : !appUser ? <button type="button" onClick={() => setLogin(true)} className="mt-6 rounded-lg bg-[var(--hk-navy)] px-5 py-3 text-white">Sign in to see saved hotels</button> : hotels.error ? <div role="alert" className="mt-6"><p>Unable to load your saved hotels.</p><button type="button" onClick={() => void hotels.refetch()} className="underline">Try again</button></div> : <div className="mt-6 space-y-4">{items.map(item => item.property ? <StayCard key={item.propertyId} property={item.property} saved onSave={() => saved.remove(item.propertyId)} saving={saved.busy} /> : <article key={item.propertyId} className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Hotel currently unavailable</h2><p className="mt-1 text-sm text-slate-500">This saved hotel is no longer available for booking.</p><button type="button" disabled={saved.busy} onClick={() => saved.remove(item.propertyId)} className="mt-3 text-sm underline">Remove from saved hotels</button></article>)}{!items.length && <div className="rounded-xl border border-slate-200 bg-white p-8"><h2 className="font-bold">Start your shortlist</h2><p className="mt-2 text-sm text-slate-500">Tap a hotel’s heart to save it here.</p><Link href="/search" className="mt-4 inline-block underline">Find hotels</Link></div>}</div>}
    {appUser && hotels.hasNextPage && <button type="button" disabled={hotels.isFetchingNextPage} onClick={() => void hotels.fetchNextPage()} className="mt-6 rounded-lg border border-slate-200 bg-white px-5 py-3">{hotels.isFetchingNextPage ? "Loading…" : "Show more saved hotels"}</button>}
  </main><LoginModal isOpen={login} onClose={() => setLogin(false)} /></div>;
}
