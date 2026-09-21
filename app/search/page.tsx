import { LiveSearchResults } from "@/components/search/live-search-results";
import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { catalogSearchSchema, searchCatalogPage } from "@/lib/customer/catalog";
import { queryKeys } from "@/lib/query/keys";

export default async function Page({ searchParams }: PageProps<"/search">) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value)) value.forEach((item) => params.append(key, item)); else if (value !== undefined) params.set(key, value); }
  const input = catalogSearchSchema.safeParse({ ...Object.fromEntries(params), amenities: params.getAll("amenity"), limit: params.get("limit") ?? 24, cursor: params.get("cursor") || undefined });
  const client = new QueryClient();
  if (input.success) await client.prefetchQuery({ queryKey: queryKeys.search({ query: params.toString() }), queryFn: () => searchCatalogPage(input.data), staleTime: 60_000 });
  return <HydrationBoundary state={dehydrate(client)}><Suspense fallback={<main className="min-h-screen bg-[var(--hk-ivory)] p-8" aria-label="Loading search"><div className="mx-auto max-w-[1280px] animate-pulse space-y-6"><div className="h-16 rounded-2xl bg-slate-200" /><div className="grid gap-8 lg:grid-cols-[280px_1fr]"><div className="hidden h-[540px] rounded-2xl bg-slate-200 lg:block" /><div className="space-y-4"><div className="h-16 w-72 rounded bg-slate-200" /><div className="h-56 rounded-2xl bg-slate-200" /><div className="h-56 rounded-2xl bg-slate-200" /></div></div></div></main>}><LiveSearchResults /></Suspense></HydrationBoundary>;
}
