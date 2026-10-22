"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Map, SlidersHorizontal, X, Check, BadgeCheck } from "lucide-react";
import { queryKeys } from "@/lib/query/keys";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import type { CatalogPage } from "@/lib/customer/catalog";
import { amenityLabel } from "@/lib/customer/amenities";
import { formatMoney } from "@/lib/customer/offer";
import { SiteHeader } from "@/components/shared/site-header";
import { TravelSearch } from "@/components/search/travel-search";
import { LoginModal } from "@/components/auth/login-modal";
import { useSavedHotels } from "@/components/wishlist/use-saved-hotels";
import { StayCard } from "./stay-card";

const SearchMap = dynamic(() => import("./search-map"), { ssr: false, loading: () => <p className="rounded-xl bg-white p-8">Loading map…</p> });
const sorts = [
  ["top_picks", "Our top picks"], ["homes_and_apartments", "Homes & apartments first"],
  ["price_low_to_high", "Price (lowest first)"], ["price_high_to_low", "Price (highest first)"],
  ["best_reviewed_lowest_price", "Best reviewed & lowest price"], ["rating_high_to_low", "Guest rating (high to low)"],
  ["rating_low_to_high", "Guest rating (low to high)"], ["rating_and_price", "Guest rating and price"],
  ["distance_from_downtown", "Distance from destination"], ["top_reviewed", "Most reviewed"], ["business_traveler_picks", "Business traveler picks"],
];
const propertyTypes = [["hotel", "Hotel"], ["resort", "Resort"], ["villa", "Villa"], ["apartment", "Apartment"]];

export function LiveSearchResults() {
  const params = useSearchParams();
  const [mobileFilters, setMobileFilters] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  return <SearchContent key={params.toString()} query={params.toString()} mobileFilters={mobileFilters} setMobileFilters={setMobileFilters} mapOpen={mapOpen} setMapOpen={setMapOpen} />;
}
function SearchContent({ query, mobileFilters, setMobileFilters, mapOpen, setMapOpen }: { query: string; mobileFilters: boolean; setMobileFilters: (value: boolean) => void; mapOpen: boolean; setMapOpen: (value: boolean | ((current: boolean) => boolean)) => void }) {
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const router = useRouter();
  const client = useQueryClient();
  const key = useMemo(() => queryKeys.search({ query }), [query]);
  const search = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => {
      const next = new URLSearchParams(query);
      next.delete("cursor");
      if (pageParam) next.set("cursor", pageParam);
      return apiFetch<CatalogPage>(`/api/search/properties?${next}`, { signal });
    }, initialPageParam: "", getNextPageParam: last => last.hasMore && last.nextCursor ? last.nextCursor : undefined,
    staleTime: state => Math.max(0, (state.state.data?.pages[0]?.expiresAt ?? 0) - Date.now()), retry: false,
  });
  const first = search.data?.pages[0];
  const properties = useMemo(() => search.data?.pages.flatMap(page => page.properties) ?? [], [search.data]);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [price, setPrice] = useState(params.get("maxPricePaise") ?? "");
  const [priceChanged, setPriceChanged] = useState(false);
  const saved = useSavedHotels(properties.map(property => property.id), () => setIsLoginOpen(true));
  const refreshing = search.isFetching && !search.isFetchingNextPage;
  const hasCoordinates = params.has("placeLat") && params.has("placeLng");
  const activeCount = ["maxPricePaise", "minPricePaise", "minRating", "freeCancellation"].filter(name => params.has(name)).length + params.getAll("amenity").length + params.getAll("propertyType").length;
  const push = (name: string, values: string[]) => {
    const next = new URLSearchParams(query);
    next.delete("cursor"); next.delete(name);
    values.forEach(value => next.append(name, value));
    router.push(`/search?${next}`, { scroll: false });
  };
  const toggle = (name: string, value: string) => {
    const values = params.getAll(name);
    push(name, values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  };
  const reset = () => {
    const next = new URLSearchParams(query);
    ["maxPricePaise", "minPricePaise", "minRating", "freeCancellation", "amenity", "propertyType", "cursor"].forEach(name => next.delete(name));
    router.push(`/search?${next}`, { scroll: false });
  };
  useEffect(() => {
    if (!priceChanged) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(query);
      next.delete("cursor");
      if (price) next.set("maxPricePaise", price); else next.delete("maxPricePaise");
      router.push(`/search?${next}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [price, priceChanged, query, router]);
  // Cache expiry means revalidation is needed, not that the visible hotels
  // should disappear. Preserve the current cards while fetching a fresh page.
  const refresh = async () => {
    await client.cancelQueries({ queryKey: key, exact: true });
    client.setQueryData<InfiniteData<CatalogPage, string>>(key, current => current ? {
      ...current, pages: current.pages.slice(0, 1), pageParams: [""],
    } : current);
    await client.refetchQueries({ queryKey: key, exact: true });
  };
  const loadMore = async () => {
    if (first && first.expiresAt <= Date.now()) { await refresh(); return; }
    try { await search.fetchNextPage({ throwOnError: true }); }
    catch (error) {
      if (error instanceof ApiClientError && ["SEARCH_CURSOR_EXPIRED", "SEARCH_CHANGED"].includes(error.code)) await refresh();
    }
  };
  const filters = <div className="space-y-5 text-xs text-[var(--hk-navy)] [&_fieldset]:border-0 [&_fieldset]:border-b [&_fieldset]:border-[var(--hk-border)] [&_fieldset]:pb-4 [&_fieldset]:pt-0 [&_legend]:mb-3 [&_input[type=checkbox]]:accent-[var(--hk-navy)]">
    <div className="flex justify-between"><b className="text-sm text-[var(--hk-ink)]">Filter your results</b>{activeCount > 0 && <button type="button" onClick={reset} className="text-xs underline">Clear all</button>}</div>
    <fieldset className="border-t border-slate-200 pt-4"><legend className="font-semibold">Maximum stay price</legend><p className="mt-2 text-xs text-slate-500">{price ? formatMoney(Number(price)) : "Any price"}</p><input aria-label="Maximum price" type="range" min="10000" max="2000000" step="10000" value={price || "2000000"} onChange={event => { setPrice(event.target.value); setPriceChanged(true); }} className="mt-3 w-full accent-[var(--hk-navy)]" /><button type="button" onClick={() => { setPrice(""); setPriceChanged(true); }} className="text-xs underline">Any price</button></fieldset>
    <fieldset className="space-y-2 border-t border-slate-200 pt-4"><legend className="font-semibold">Guest rating</legend>{[["4.5", "4.5+ Exceptional"], ["4", "4+ Very good"], ["3.5", "3.5+ Good"]].map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="checkbox" checked={params.get("minRating") === value} onChange={() => push("minRating", params.get("minRating") === value ? [] : [value])} />{label}</label>)}</fieldset>
    <fieldset className="space-y-2 border-t border-slate-200 pt-4"><legend className="font-semibold">Property type</legend>{propertyTypes.map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="checkbox" checked={params.getAll("propertyType").map(value => value.toLowerCase()).includes(value)} onChange={() => toggle("propertyType", value)} />{label}</label>)}</fieldset>
    <fieldset className="space-y-2 border-t border-slate-200 pt-4"><legend className="font-semibold">Amenities</legend>{[...new Set([...(first?.availableAmenities ?? []), ...params.getAll("amenity")])].map(value => <label key={value} className="flex items-center gap-2"><input type="checkbox" checked={params.getAll("amenity").includes(value)} onChange={() => toggle("amenity", value)} />{amenityLabel(value)}</label>)}{!first?.availableAmenities.length && <p className="text-xs text-slate-500">Amenities appear when results load.</p>}</fieldset>
    <fieldset className="border-t border-slate-200 pt-4"><legend className="font-semibold">Booking options</legend><label className="mt-2 flex items-start gap-2"><input type="checkbox" disabled={!params.has("checkIn")} checked={params.get("freeCancellation") === "true"} onChange={() => push("freeCancellation", params.get("freeCancellation") === "true" ? [] : ["true"])} />Free cancellation</label>{!params.has("checkIn") && <p className="mt-1 text-xs text-slate-500">Choose dates to check cancellation eligibility.</p>}</fieldset>
  </div>;
  const errorCode = search.error instanceof ApiClientError ? search.error.code : "";
  const restart = errorCode === "SEARCH_CURSOR_EXPIRED" || errorCode === "SEARCH_CHANGED";
  return <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
    <SiteHeader onLoginClick={() => setIsLoginOpen(true)} />
    <section className="border-b border-slate-200 px-4 py-3 sm:px-6"><div className="mx-auto max-w-[1280px]"><TravelSearch initial={params} compact /></div></section>
    <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10"><div className="flex items-start gap-8">
      <aside className="hidden w-[280px] shrink-0 rounded-2xl border border-[var(--hk-border)] bg-white p-5 shadow-[var(--hk-shadow-soft)] lg:sticky lg:top-6 lg:block">{filters}</aside>
      <section className="min-w-0 flex-1" aria-label="Search results">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--hk-gold-strong)]">Find stays</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Hotels in {params.get("destination") || "India"}</h1><p className="mt-1 text-sm text-slate-600" aria-live="polite">{search.isPending || refreshing ? "Checking available stays…" : first && !search.error ? `${first.total} ${first.total === 1 ? "stay" : "stays"} ${params.has("checkIn") ? "available" : "found"}` : "Find your next stay"}</p></div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setMobileFilters(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm lg:hidden"><SlidersHorizontal className="h-4 w-4" />Filters{activeCount ? ` (${activeCount})` : ""}</button><label className="flex items-center gap-2 text-sm font-bold">Sort by <select value={params.get("sort") || "top_picks"} onChange={event => push("sort", [event.target.value])} className="max-w-52 rounded-lg border border-[var(--hk-border)] bg-white px-3 py-2 text-sm font-normal">{sorts.filter(([value]) => value !== "distance_from_downtown" || hasCoordinates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" disabled={!properties.length} aria-pressed={mapOpen} onClick={() => setMapOpen(value => !value)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-2 text-sm disabled:opacity-50"><Map className="h-4 w-4" />{mapOpen ? "Hide map" : "Map"}</button></div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Quick filters">
          {params.has("checkIn") && <button type="button" aria-pressed={params.get("freeCancellation") === "true"} onClick={() => push("freeCancellation", params.get("freeCancellation") === "true" ? [] : ["true"])} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${params.get("freeCancellation") === "true" ? "border-[var(--hk-navy)] bg-[var(--hk-navy)] text-white" : "border-[var(--hk-border)] bg-white"}`}><Check className="h-3.5 w-3.5 text-[var(--hk-success)]" />Free cancellation</button>}
          {(first?.availableAmenities ?? []).slice(0, 5).map(value => <button key={value} type="button" aria-pressed={params.getAll("amenity").includes(value)} onClick={() => toggle("amenity", value)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${params.getAll("amenity").includes(value) ? "border-[var(--hk-navy)] bg-[var(--hk-navy)] text-white" : "border-[var(--hk-border)] bg-white"}`}><BadgeCheck className="h-3.5 w-3.5 text-[var(--hk-success)]" />{amenityLabel(value)}</button>)}
        </div>
        {activeCount > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" aria-label="Active filters"><span className="font-semibold">Active filters:</span>{["maxPricePaise", "minPricePaise", "minRating", "freeCancellation", "amenity", "propertyType"].flatMap(name => params.getAll(name).map(value => <button key={`${name}:${value}`} type="button" onClick={() => push(name, params.getAll(name).filter(item => item !== value))} className="rounded-full border border-slate-200 bg-white px-3 py-1">{name === "maxPricePaise" ? `Under ${formatMoney(Number(value))}` : name === "minPricePaise" ? `From ${formatMoney(Number(value))}` : name === "minRating" ? `Guest rating ${value}+` : name === "freeCancellation" ? "Free cancellation" : amenityLabel(value)} ×</button>))}<button type="button" onClick={reset} className="underline">Clear all</button></div>}
        {saved.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{saved.error}</p>}
        {search.error && (!restart || !properties.length) && <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p>{properties.length || restart ? "We couldn’t update availability. You can keep browsing or try again." : search.error.message || "Unable to load hotels."}</p><button type="button" onClick={() => void refresh()} className="mt-2 font-semibold underline">Try again</button></div>}
        <div className="mt-4 space-y-3">
          {search.isPending && !first ? <ResultsSkeleton /> : <>{mapOpen && <SearchMap properties={properties} total={first?.total ?? properties.length} query={query} savedIds={saved.savedIds} onSave={saved.toggle} saving={saved.busy} />}{properties.map((property, index) => <StayCard accent={index === 0 && (!params.get("sort") || params.get("sort") === "top_picks")} key={property.id} property={property} query={query} saved={saved.savedIds.has(property.id)} onSave={() => saved.toggle(property.id)} saving={saved.busy} />)}{!search.error && properties.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="font-bold">No stays match this search</h2><p className="mt-2 text-sm text-slate-500">Try different dates, another destination, or fewer filters.</p>{activeCount > 0 && <button type="button" onClick={reset} className="mt-3 underline">Clear filters</button>}</div>}</>}
        </div>
        {search.hasNextPage && <div className="mt-6 text-center"><button type="button" disabled={search.isFetching} onClick={() => void loadMore()} className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold disabled:opacity-50">{search.isFetchingNextPage ? "Loading…" : `Show more stays (${properties.length} of ${first?.total})`}</button></div>}
      </section>
    </div></main>
    {mobileFilters && <div className="fixed inset-0 z-50 bg-black/40 lg:hidden"><button type="button" aria-label="Close filters" className="absolute inset-0" onClick={() => setMobileFilters(false)} /><section role="dialog" aria-modal="true" aria-label="Filter hotels" className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-white p-6"><button type="button" onClick={() => setMobileFilters(false)} aria-label="Close filters" className="mb-4 ml-auto block"><X /></button>{filters}</section></div>}
    <LoginModal isOpen={isLoginOpen} onClose={() => { setIsLoginOpen(false); saved.cancelPending(); }} onSuccess={() => { setIsLoginOpen(false); saved.resumePending(); }} />
  </div>;
}
function ResultsSkeleton() {
  return <div aria-busy="true" aria-label="Loading hotels" className="space-y-4">{[0, 1, 2].map(value => <div key={value} className="grid min-h-56 animate-pulse overflow-hidden rounded-2xl border border-[var(--hk-border)] bg-white md:grid-cols-[250px_1fr]"><div className="min-h-32 bg-slate-200" /><div className="space-y-4 p-5"><div className="h-6 w-2/3 rounded bg-slate-200" /><div className="h-3 w-1/2 rounded bg-slate-100" /><div className="h-3 w-3/4 rounded bg-slate-100" /></div></div>)}</div>;
}
