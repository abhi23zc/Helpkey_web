import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/search-parity.json";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: {} }));
vi.mock("@/lib/media-resolver", () => ({ resolvePublicImage: vi.fn() }));
// Isolated complete eligible availability snapshot, shared by both client requests.
vi.mock("@/lib/customer/search-cache", async () => {
  const { createHash } = await import("node:crypto");
  const { default: shared } = await import("./fixtures/search-parity.json");
  return {
    searchDigest: (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    cachedSearch: async () => ({ items: shared.candidates, evaluatedAt: shared.evaluatedAt, expiresAt: shared.expiresAt, fingerprint: "fixture", amenities: [] }),
  };
});
import { catalogSearchFromParams, searchCatalogPage, catalogSorts } from "@/lib/customer/catalog";
import { browserSearchPage, rememberSearchSnapshot } from "@/lib/customer/browser-search";

function params(query: Record<string, string | string[] | undefined>) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(query).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)) for (const item of Array.isArray(value) ? value : [value]) result.append(key, item);
  return result;
}
function websiteParams(route: Record<string, string | undefined>) {
  const query = params(Object.fromEntries(Object.entries(route).filter(([key]) => !["propertyTypes", "propertyType", "amenities", "freeCancellation"].includes(key))));
  for (const type of (route.propertyTypes ?? route.propertyType ?? "").split(",").filter(Boolean)) query.append("propertyType", type);
  for (const amenity of (route.amenities ?? "").split(",").filter(Boolean)) query.append("amenity", amenity);
  if (route.freeCancellation === "1") query.set("freeCancellation", "true");
  query.set("limit", "20");
  return query;
}
describe("equivalent website and mobile search contracts", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(fixture.evaluatedAt); });
  afterEach(() => vi.useRealTimers());
  for (const request of fixture.cases) {
    for (const sort of catalogSorts) {
      it(`${request.name}: ${sort}`, async () => {
        const mobile = params({ ...request.query, sort });
        const website = websiteParams({ ...request.route, sort });
        const mobilePage = await searchCatalogPage(catalogSearchFromParams(mobile), { includeClientSnapshot: true });
        const websitePage = await searchCatalogPage(catalogSearchFromParams(website));
        expect(mobilePage.properties).toEqual(websitePage.properties);
        expect(mobilePage.total).toBe(websitePage.total);
        expect(mobilePage.availableAmenities).toEqual(websitePage.availableAmenities);
        expect(mobilePage.availablePropertyTypes).toEqual(["apartment", "hotel", "resort", "villa"]);
        expect(mobilePage.serverNow).toBe(fixture.evaluatedAt);
        if (sort === "top_picks") expect(mobilePage.properties.map(card => card.id)).toEqual(request.expectedIds);
        const snapshot = mobilePage.clientSnapshot!;
        rememberSearchSnapshot(snapshot, 0);
        const browser = browserSearchPage(snapshot, website.toString());
        expect(browser.properties).toEqual(mobilePage.properties);
        expect(browser.total).toBe(mobilePage.total);
        expect(browser.availableAmenities).toEqual(mobilePage.availableAmenities);
        expect(browser.availablePropertyTypes).toEqual(mobilePage.availablePropertyTypes);
        if (request.name === "multiple amenities and types" || request.name === "refundable qualifying offer") {
          const alpha = mobilePage.properties.find(card => card.id === "alpha")!;
          expect(alpha.offer?.ratePlanId).toBe("refundable");
          expect(alpha.offer?.totalPaise).toBe(180000);
          expect(alpha.offer?.payableNowPaise).toBe(90000);
          expect(alpha.offer?.cancellation.freeCancellation).toBe(true);
        }
        if (request.name === "nonrefundable default") expect(mobilePage.properties[0].offer?.ratePlanId).toBe("cheap");
      });
    }
  }
  it("reports full facets and exact total independently of downloaded count", async () => {
    const query = params({ ...fixture.cases[1].query, limit: "1" });
    const page = await searchCatalogPage(catalogSearchFromParams(query));
    expect(page.properties).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.availablePropertyTypes).toContain("villa");
    expect(page.availableAmenities).toEqual(["swimming_pool", "wifi"]);
    query.set("cursor", page.nextCursor!);
    const next = await searchCatalogPage(catalogSearchFromParams(query));
    expect(next.properties[0].id).toBe("beta");
    vi.setSystemTime(fixture.expiresAt);
    await expect(searchCatalogPage(catalogSearchFromParams(query))).rejects.toMatchObject({ code: "SEARCH_CURSOR_EXPIRED" });
  });
});
