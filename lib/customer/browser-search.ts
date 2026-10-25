import type { CatalogPage } from "./catalog";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { catalogSearchFromParams, type CatalogSearch } from "./catalog-search-input";
import { deriveCatalogResults } from "./catalog-selection";
import { searchBaseKey, type ClientSearchSnapshot } from "./search-snapshot";

// Monotonic deadlines prevent clock adjustments from extending inventory life.
const deadlines = new WeakMap<ClientSearchSnapshot, number>();

export function rememberSearchSnapshot(snapshot: ClientSearchSnapshot | undefined, elapsedMs: number) {
  if (!snapshot || deadlines.has(snapshot)) return;
  const remaining = Math.min(30_000, snapshot.expiresAt - snapshot.serverNow) - Math.max(0, elapsedMs);
  deadlines.set(snapshot, performance.now() + Math.max(0, remaining));
}

export function canUseSearchSnapshot(snapshot: ClientSearchSnapshot | undefined, input: CatalogSearch) {
  return !!snapshot && snapshot.version === 1 && snapshot.complete === true &&
    snapshot.baseKey === searchBaseKey(input) && Array.isArray(snapshot.candidates) &&
    snapshot.candidates.length <= 100 && (deadlines.get(snapshot) ?? 0) > performance.now() &&
    snapshot.candidates.every(card => !!card && Array.isArray(card.amenityCodes) &&
      (!input.checkIn || (Array.isArray(card.offers) && card.offers.length > 0)));
}

export function findSearchSnapshot(client: QueryClient, input: CatalogSearch) {
  for (const [key, data] of client.getQueriesData<InfiniteData<CatalogPage>>({ queryKey: ["catalog", "search"] })) {
    const snapshot = data?.pages?.[0]?.clientSnapshot;
    if (!snapshot) continue;
    const updatedAt = client.getQueryState(key)?.dataUpdatedAt ?? 0;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    // API snapshots already have a deadline; hydrated ones deduct age and the
    // initial document's transport time before their first use.
    rememberSearchSnapshot(snapshot, Math.max(0, Date.now() - updatedAt, navigation?.responseEnd ?? 0));
    if (canUseSearchSnapshot(snapshot, input)) return snapshot;
  }
  return undefined;
}

export function browserSearchPage(snapshot: ClientSearchSnapshot, query: string, cursor = ""): CatalogPage {
  const input = catalogSearchFromParams(new URLSearchParams(query));
  const derived = deriveCatalogResults(snapshot.candidates, input);
  const offset = /^local:\d+$/.test(cursor) ? Number(cursor.slice(6)) : 0;
  const properties = derived.properties.slice(offset, offset + input.limit).map(({ offers: _offers, ...card }) => {
    // The complete offer set stays in the snapshot; individual cards expose only
    // the offer selected by the same reducer used on the server.
    void _offers;
    return card;
  });
  const hasMore = offset + properties.length < derived.properties.length;
  return { properties, total: derived.properties.length, hasMore,
    nextCursor: hasMore ? `local:${offset + properties.length}` : null,
    evaluatedAt: snapshot.evaluatedAt,
    expiresAt: Date.now() + Math.max(0, (deadlines.get(snapshot) ?? 0) - performance.now()),
    availableAmenities: derived.availableAmenities, clientSnapshot: snapshot };
}
