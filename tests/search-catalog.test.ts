import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ properties: [] as Record<string, unknown>[], queries: 0 }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection: (name: string) => {
  const filters: Array<[string, string, unknown]> = [];
  let maximum = 1001;
  const query = {
    where: (field: string, operator: string, value: unknown) => { filters.push([field, operator, value]); return query; },
    orderBy: () => query, limit: (limit: number) => { maximum = limit; return query; },
    get: async () => {
      state.queries++;
      const values = (name === "properties" ? state.properties : []).filter(item => filters.every(([field, operator, value]) => operator !== "==" || item[field] === value)).slice(0, maximum);
      const docs = values.map(item => ({ id: item.id, data: () => item, get: (key: string) => item[key] }));
      return { docs, size: docs.length };
    },
  };
  return query;
} } }));
vi.mock("@/lib/media-resolver", () => ({ resolvePublicImage: vi.fn() }));
vi.mock("@/lib/redis", () => ({ cacheKey: (...parts: unknown[]) => parts.join(":"), withRedis: async () => null }));
import { catalogPropertyBySlug, catalogSearchFromParams, searchCatalogPage } from "@/lib/customer/catalog";
import { browserSearchPage, rememberSearchSnapshot } from "@/lib/customer/browser-search";
import { catalogSorts } from "@/lib/customer/catalog-search-input";

const hotel = (id: string, price: number, rating: number, type = "hotel", amenities = ["wifi"]) => ({ id, slug: id, name: id, status: "active", approvalStatus: "approved", isBookable: true, normalizedName: id, normalizedCity: "test city", address: { city: "Test City" }, propertyType: type, ratingAverage: rating, ratingCount: 2, minimumPricePaise: price, amenityCodes: amenities, propertyAmenityCodes: amenities });
const input = (query = "") => catalogSearchFromParams(new URLSearchParams(`destination=test+city&${query}`));
describe("search selection before pagination", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01")); state.queries = 0;
    state.properties = [hotel("expensive", 90000, 3.5), hotel("cheap", 10000, 4.5), hotel("mid", 40000, 4, "resort", ["parking"])];
  });
  afterEach(() => vi.useRealTimers());
  it("sorts the complete eligible set and reports an exact count", async () => {
    const page = await searchCatalogPage(input("sort=price_low_to_high&limit=1"));
    expect(page.properties.map(value => value.id)).toEqual(["cheap"]);
    expect(page.total).toBe(3); expect(page.hasMore).toBe(true);
    const next = await searchCatalogPage({ ...input("sort=price_low_to_high&limit=1"), cursor: page.nextCursor! });
    expect(next.properties.map(value => value.id)).toEqual(["mid"]);
  });
  it("filters by multiple types, price, amenities and guest rating before limiting", async () => {
    const page = await searchCatalogPage(input("propertyType=hotel&propertyType=resort&maxPricePaise=50000&minRating=4&limit=1"));
    expect(page.total).toBe(2);
    const wifi = await searchCatalogPage(input("amenity=Wi-Fi&minRating=4&limit=1"));
    expect(wifi.total).toBe(1); expect(wifi.properties[0].id).toBe("cheap");
    expect(wifi.availableAmenities).toContain("parking");
  });
  it("binds cursors to filters, result content, and expiry", async () => {
    const page = await searchCatalogPage(input("limit=1"));
    await expect(searchCatalogPage({ ...input("limit=1&sort=price_low_to_high"), cursor: page.nextCursor! })).rejects.toMatchObject({ code: "SEARCH_CURSOR_EXPIRED" });
    state.properties[0].minimumPricePaise = 100;
    await expect(searchCatalogPage({ ...input("limit=1"), cursor: page.nextCursor! })).rejects.toMatchObject({ code: "SEARCH_CURSOR_EXPIRED" });
    const fresh = await searchCatalogPage(input("limit=1"));
    vi.setSystemTime(Date.now() + 30_001);
    await expect(searchCatalogPage({ ...input("limit=1"), cursor: fresh.nextCursor! })).rejects.toMatchObject({ code: "SEARCH_CURSOR_EXPIRED" });
  });
  it("omits private source fields and does not promise cancellation without dates", async () => {
    state.properties[0].ownerId = "private"; state.properties[0].freeCancellation = true;
    const page = await searchCatalogPage(input());
    expect(page.properties[0]).not.toHaveProperty("ownerId");
    expect(page.properties.every(property => !property.freeCancellation && !property.offer)).toBe(true);
    expect((await searchCatalogPage(input("freeCancellation=true"))).total).toBe(0);
  });
  it("exposes only normalized customer-facing policies in hotel details", async () => {
    Object.assign(state.properties[0], { ownerId: "secret-owner", kyc: { number: "secret-id" }, onboarding: { internalNote: "secret-note" }, description: "A stored property description.", childrenPolicy: { allowed: false, internalNote: "secret-policy" }, petPolicy: { allowed: "yes" }, minimumCheckInAge: 21, additionalHouseRules: "Quiet hours after 10pm." });
    const detail = await catalogPropertyBySlug("expensive");
    expect(detail).toMatchObject({ description: "A stored property description.", childrenPolicy: { allowed: false }, petPolicy: { allowed: null }, minimumCheckInAge: 21, additionalHouseRules: "Quiet hours after 10pm." });
    expect(JSON.stringify(detail)).not.toContain("secret");
    expect(detail).not.toHaveProperty("ownerId");
    expect(detail).not.toHaveProperty("onboarding");
  });
  it("asks customers to narrow broad searches instead of truncating them", async () => {
    state.properties = Array.from({ length: 1001 }, (_, i) => hotel(String(i), 100, 4));
    await expect(searchCatalogPage(input())).rejects.toMatchObject({ code: "NARROW_SEARCH_FILTERS", status: 422 });
  });
  it("opts into a complete public snapshot even on a filtered and paginated direct search", async () => {
    state.properties[0].ownerId = "secret-owner";
    const page = await searchCatalogPage(input("amenity=wifi&minRating=4&limit=1"), { includeClientSnapshot: true });
    expect(page.total).toBe(1);
    expect(page.clientSnapshot?.candidates).toHaveLength(3);
    expect(JSON.stringify(page.clientSnapshot)).not.toContain("secret-owner");
    expect((await searchCatalogPage(input())).clientSnapshot).toBeUndefined();
    const snapshot = page.clientSnapshot!;
    rememberSearchSnapshot(snapshot, 0);
    for (const sort of catalogSorts) {
      for (const filters of ["", "&amenity=wifi", "&minRating=4&maxPricePaise=50000", "&propertyType=resort", "&freeCancellation=true"]) {
        const query = `destination=test+city&sort=${sort}&placeLat=26&placeLng=80${filters}`;
        const server = await searchCatalogPage(catalogSearchFromParams(new URLSearchParams(query)));
        const browser = browserSearchPage(snapshot, query);
        expect(browser.properties).toEqual(server.properties);
        expect(browser.total).toBe(server.total);
        expect(browser.availableAmenities).toEqual(server.availableAmenities);
      }
    }
  });
  it("omits complete snapshots above the hotel or byte limits", async () => {
    state.properties = Array.from({ length: 101 }, (_, i) => hotel(String(i), 100, 4));
    expect((await searchCatalogPage(input(), { includeClientSnapshot: true })).clientSnapshot).toBeUndefined();
    state.properties = [hotel("large", 100, 4)];
    state.properties[0].publicCover = { imageUrl: "x".repeat(256 * 1024) };
    expect((await searchCatalogPage(input(), { includeClientSnapshot: true })).clientSnapshot).toBeUndefined();
  });
});
