import { afterEach, describe, expect, it, vi } from "vitest";
import { browserSearchPage, canUseSearchSnapshot, rememberSearchSnapshot } from "@/lib/customer/browser-search";
import { catalogSearchFromParams } from "@/lib/customer/catalog-search-input";
import { searchBaseKey, type ClientSearchSnapshot } from "@/lib/customer/search-snapshot";
import type { CatalogCandidate } from "@/lib/customer/catalog-selection";
import type { SearchOffer } from "@/lib/customer/offer";

const query = "destination=Kanpur&checkIn=2027-01-15&checkOut=2027-01-16";
const input = (extra = "") => catalogSearchFromParams(new URLSearchParams(`${query}&${extra}`));
function offer(id: string, price: number, amenities: string[], refundable = false): SearchOffer {
  return { roomTypeId: id, ratePlanId: id, roomName: id, beds: [{ bedType: "double", count: 1 }],
    amenityCodes: amenities, totalPaise: price, subtotalPaise: price, taxPaise: 0, customerFeePaise: 0,
    breakfastIncluded: refundable, cancellation: { freeCancellation: refundable, deadline: refundable ? "2027-01-14T00:00:00Z" : null, feePercent: refundable ? 0 : 100, name: id },
    startAt: "2027-01-15T08:30:00Z", endAt: "2027-01-16T05:30:00Z", timezone: "Asia/Kolkata",
    nights: 1, durationMinutes: 1260, bookingMode: "overnight", validUntil: Date.now() + 30_000 };
}
function candidate(id: string, rating: number, offers: SearchOffer[], propertyType = "hotel"): CatalogCandidate {
  return { id, slug: id, name: id, propertyType, city: "Kanpur", state: null, ratingAverage: rating, ratingCount: 2,
    minimumPricePaise: offers[0].totalPaise, currency: "INR", coverImageUrl: null, coverImageSrcSet: "",
    coverImageWidth: 1, coverImageHeight: 1, amenityCodes: offers[0].amenityCodes, freeCancellation: false, offer: offers[0], offers };
}
function snapshot(): ClientSearchSnapshot {
  return { version: 1, complete: true, baseKey: searchBaseKey(input()), serverNow: Date.now(), evaluatedAt: Date.now(),
    expiresAt: Date.now() + 30_000, candidates: [
      candidate("Garden", 4, [offer("basic", 50000, ["wifi"]), offer("premium", 80000, ["wifi", "parking"], true)]),
      candidate("River", 4.5, [offer("river", 60000, ["parking"], true)], "resort"),
    ] };
}
afterEach(() => vi.restoreAllMocks());
describe("complete browser search snapshots", () => {
  it("selects the correct room, cancellation and price together before price filtering", () => {
    const data = snapshot(); rememberSearchSnapshot(data, 0);
    const page = browserSearchPage(data, `${query}&amenity=Wi-Fi&amenity=parking&freeCancellation=true`);
    expect(page.total).toBe(1);
    expect(page.properties[0]).toMatchObject({ id: "Garden", minimumPricePaise: 80000, freeCancellation: true,
      offer: { roomTypeId: "premium", breakfastIncluded: true } });
    expect(page.properties[0]).not.toHaveProperty("offers");
    expect(browserSearchPage(data, `${query}&amenity=parking&maxPricePaise=70000`).properties.map(card => card.id)).toEqual(["River"]);
    expect(browserSearchPage(data, `${query}&minPricePaise=70000`).total).toBe(0);
  });
  it("filters and paginates the whole set, exposes alternative amenities, and restores excluded hotels", () => {
    const data = snapshot(); rememberSearchSnapshot(data, 0);
    expect(browserSearchPage(data, `${query}&propertyType=hotel&minRating=4`).availableAmenities).toContain("parking");
    const page = browserSearchPage(data, `${query}&sort=price_low_to_high&limit=1`);
    expect(page.total).toBe(2); expect(page.properties[0].id).toBe("Garden");
    expect(browserSearchPage(data, `${query}&sort=price_low_to_high&limit=1`, page.nextCursor!).properties[0].id).toBe("River");
    expect(browserSearchPage(data, `${query}&amenity=pool`).total).toBe(0);
    expect(browserSearchPage(data, query).total).toBe(2);
  });
  it("rejects expired, incomplete, oversized and mismatched snapshots without extending deadlines", () => {
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const data = snapshot(); rememberSearchSnapshot(data, 1000);
    expect(canUseSearchSnapshot(data, input("sort=top_reviewed&amenity=wifi"))).toBe(true);
    expect(canUseSearchSnapshot(data, { ...input(), adults: 3 })).toBe(false);
    expect(canUseSearchSnapshot(data, { ...input(), checkIn: "2027-01-17" })).toBe(false);
    now += 29_001;
    rememberSearchSnapshot(data, 0);
    expect(canUseSearchSnapshot(data, input())).toBe(false);
    const incomplete = { ...snapshot(), complete: false } as unknown as ClientSearchSnapshot;
    rememberSearchSnapshot(incomplete, 0); expect(canUseSearchSnapshot(incomplete, input())).toBe(false);
    const oversized = snapshot(); oversized.candidates = Array(101).fill(oversized.candidates[0]);
    rememberSearchSnapshot(oversized, 0); expect(canUseSearchSnapshot(oversized, input())).toBe(false);
    const missingOffers = snapshot(); missingOffers.candidates[0].offers = [];
    rememberSearchSnapshot(missingOffers, 0); expect(canUseSearchSnapshot(missingOffers, input())).toBe(false);
  });
});
