import { datePriceId } from "@/lib/booking/date-prices";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), queries: [] as string[], rateLimit: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceRateLimit: state.rateLimit }));
vi.mock("@/lib/customer/search-cache", () => ({ searchDigest: JSON.stringify, cachedSearch: async (_key: string, read: () => Promise<unknown>) => read() }));
vi.mock("@/lib/firebase/admin", () => {
  const doc = (path: string) => ({ id: path.split("/").at(-1)!, ref: { path }, exists: state.records.has(path), data: () => state.records.get(path), get: (key: string) => state.records.get(path)?.[key] });
  const collection = (name: string) => {
    const filters: { field: string; op: string; value: unknown }[] = []; let count = Infinity;
    const query = {
      where: (field: string, op: string, value: unknown) => { filters.push({ field, op, value }); return query; },
      limit: (n: number) => { count = n; return query; }, orderBy: () => query, doc: (id: string) => ({ path: `${name}/${id}` }),
      get: async () => { state.queries.push(name); const docs = [...state.records.keys()].filter(path => path.startsWith(`${name}/`) && filters.every(({ field, op, value }) => op === "in" ? (value as unknown[]).includes(state.records.get(path)?.[field]) : state.records.get(path)?.[field] === value)).slice(0, count).map(doc); return { docs, size: docs.length }; },
    }; return query;
  };
  return { adminDb: { collection, getAll: async (...refs: { path: string }[]) => refs.map(ref => doc(ref.path)) } };
});
import { GET } from "@/app/api/search/hourly-options/route";
import { GET as bookable } from "@/app/api/properties/[slug]/bookable/route";
import { ApiException } from "@/lib/api/errors";
vi.mock("@/lib/services/public-stay", () => ({ loadBookableProperty: vi.fn(async (_slug, stay) => ({ rooms: [], hourlyDurations: [], stay })) }));
import { loadBookableProperty } from "@/lib/services/public-stay";
import { bookingFailure } from "@/lib/booking/api-error";
const publicProperty = { status: "active", approvalStatus: "approved", isBookable: true, normalizedCity: "goa", bookingModes: ["hourly"], inventoryEngine: "interval_v1", ownerId: "private-owner" };
const room = { propertyId: "hotel", status: "active", totalInventory: 1 };
const rate = { propertyId: "hotel", roomTypeId: "room", status: "active", bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 3, pricePaise: 33333 }, { hours: 6, pricePaise: 55555 }] };
const get = (query = "") => GET(new Request(`http://localhost/api/search/hourly-options${query}`), {});
describe("Category 9 public configured search choices", () => {
  beforeEach(() => {
    state.records.clear(); state.queries = []; state.rateLimit.mockReset(); vi.mocked(loadBookableProperty).mockClear();
    state.records.set("properties/hotel", publicProperty); state.records.set("roomTypes/room", room); state.records.set("ratePlans/rate", rate);
  });
  it("exposes deduplicated configured durations and server step without prices or private data", async () => {
    state.records.set("ratePlans/second", { ...rate, durationPrices: [{ hours: 3, pricePaise: 99999 }, { hours: 1, pricePaise: 20000 }] });
    const response = await get("?destination=Goa"); const body = await response.json();
    expect(response.status).toBe(200); expect(body.data.durationMinutes).toEqual([60, 180, 360]); expect(body.data.arrivalStepMinutes).toBe(15);
    expect(JSON.stringify(body)).not.toMatch(/pricePaise|ownerId|private-owner/);
    expect(state.queries).not.toContain("bookings"); expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("filters public hotels by destination and excludes inactive listings and wrong-property rooms", async () => {
    expect((await (await get("?destination=Delhi")).json()).data.durationMinutes).toEqual([]);
    state.records.set("roomTypes/room", { ...room, propertyId: "other" });
    expect((await (await get()).json()).data.durationMinutes).toEqual([]);
    state.records.set("properties/hotel", { ...publicProperty, isBookable: false });
    expect((await (await get()).json()).data.durationMinutes).toEqual([]);
  });
  it.each([[], [{ hours: 1.5, pricePaise: 100 }], [{ hours: 3, pricePaise: -1 }], [{ hours: 3, pricePaise: 10 }, { hours: 3, pricePaise: 20 }]].map(durationPrices => ({ durationPrices })))("never invents options for malformed prices $durationPrices", async ({ durationPrices }) => {
    state.records.set("ratePlans/rate", { ...rate, durationPrices });
    expect((await (await get()).json()).data.durationMinutes).toEqual([]);
  });
  it("uses configured date-specific durations and rejects invalid arrival dates", async () => {
    state.records.set("ratePlans/rate", { ...rate, datePricingEnabled: true });
    state.records.set(`rateDatePrices/${datePriceId("hotel", "rate", "2027-01-15")}`, { durationPrices: [{ hours: 4, pricePaise: 70000 }] });
    expect((await (await get("?checkIn=2027-01-15")).json()).data.durationMinutes).toEqual([240]);
    expect((await (await get("?checkIn=2027-01-16")).json()).data.durationMinutes).toEqual([180, 360]);
    expect((await get("?checkIn=2027-02-30")).status).toBe(422);
  });
  it.each([undefined, null, "1", "invalid", NaN, Infinity, 0, -1])("excludes rooms with invalid inventory %s", async totalInventory => {
    state.records.set("roomTypes/room", { ...room, totalInventory });
    expect((await (await get()).json()).data.durationMinutes).toEqual([]);
  });
  it("fails explicitly instead of silently truncating a broad search", async () => {
    for (let i = 0; i < 1001; i++) state.records.set(`properties/p${i}`, publicProperty);
    expect((await get()).status).toBe(422);
    expect((await (await get()).json()).error.code).toBe("NARROW_SEARCH_FILTERS");
  });
  it("enforces bounds and rate limits before reading the catalog", async () => {
    expect((await get(`?destination=${"a".repeat(121)}`)).status).toBe(422); expect(state.queries).toEqual([]);
    state.rateLimit.mockRejectedValueOnce(new ApiException("RATE_LIMITED", 429, "Too many requests."));
    expect((await get()).status).toBe(429); expect(state.queries).toEqual([]);
  });
  it("allows explicit incomplete configuration reads but rejects incomplete availability requests", async () => {
    const context = { params: Promise.resolve({ slug: "garden" }) };
    const response = await bookable(new Request("http://localhost/api/properties/garden/bookable?bookingMode=hourly&configurationOnly=true&adults=2&infants=1"), context);
    expect(response.status).toBe(200); expect(loadBookableProperty).toHaveBeenCalledWith("garden", { bookingMode: "hourly", adults: 2, children: 0, infants: 1 }, undefined);
    expect((await bookable(new Request("http://localhost/api/properties/garden/bookable?bookingMode=hourly"), context)).status).toBe(422);
  });
  it.each(["OUTSIDE_ARRIVAL_WINDOW", "OUTSIDE_OPERATING_WINDOW", "MIDNIGHT_CROSSING_NOT_ALLOWED", "ARRIVAL_TOO_FAR_AHEAD", "ARRIVAL_WEEKDAY_NOT_ALLOWED", "BOOKING_MODE_NOT_AVAILABLE"])("preserves actionable %s without exposing arbitrary errors", code => {
    expect(bookingFailure(new Error(code), "Stay unavailable").code).toBe(code);
    expect(bookingFailure(new Error("private stack details"), "Stay unavailable").code).toBe("BOOKING_FAILED");
  });
});
