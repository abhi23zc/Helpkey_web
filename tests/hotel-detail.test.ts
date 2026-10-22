import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateStay } from "@/lib/booking/domain";
import { guestPoliciesSchema, publicGuestPolicies } from "@/lib/partner/guest-policies";
import { availabilityParams, normalizedStay, staySearchFromParams } from "@/lib/customer/stay-search";
import { formatMoney } from "@/lib/customer/offer";

const fixture = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), reads: [] as string[][], queries: [] as string[], failReads: false, cache: new Map<string, string>() }));
vi.mock("@/lib/customer/catalog", () => ({ amenityCodeMap: async () => new Map() }));
vi.mock("@/lib/redis", () => {
  const redis = {
    get: async (key: string) => fixture.cache.get(key) ?? null,
    mget: async (...keys: string[]) => keys.map(key => fixture.cache.get(key) ?? null),
    set: async (key: string, value: string, _px: string, _duration: number, nx?: string) => { if (nx && fixture.cache.has(key)) return null; fixture.cache.set(key, value); return "OK"; },
    eval: async (_script: string, _count: number, key: string, token: string) => { if (fixture.cache.get(key) === token) fixture.cache.delete(key); return 1; },
  };
  return { cacheKey: (...parts: unknown[]) => parts.join(":"), withRedis: async (fn: (value: typeof redis) => Promise<unknown>) => fn(redis) };
});
vi.mock("@/lib/media-resolver", () => ({ resolvePublicImage: async (id: string) => ({ id, imageUrl: `/media/${id}`, imageSrcSet: "", width: 100, height: 100 }) }));
vi.mock("@/lib/firebase/admin", () => {
  const doc = (path: string) => ({ id: path.split("/").at(-1)!, ref: { path }, exists: fixture.records.has(path), data: () => fixture.records.get(path), get: (key: string) => fixture.records.get(path)?.[key] });
  return { adminDb: {
    getAll: async (...refs: { path: string }[]) => { if (fixture.failReads) throw new Error("DATABASE_UNAVAILABLE"); fixture.reads.push(refs.map(ref => ref.path)); return refs.map(ref => doc(ref.path)); },
    collection: (name: string) => {
      const filters: [string, unknown][] = [];
      const query = {
        where: (field: string, _op: string, value: unknown) => { filters.push([field, value]); return query; },
        limit: () => query,
        doc: (id: string) => ({ path: `${name}/${id}` }),
        get: async () => {
          fixture.queries.push(name);
          const docs = [...fixture.records.keys()].filter(path => path.startsWith(`${name}/`) && filters.every(([field, value]) => fixture.records.get(path)?.[field] === value)).map(doc);
          return { docs, size: docs.length };
        },
      };
      return query;
    },
  } };
});
import { generationKeys } from "@/lib/background/cache";
import { loadBookableProperty } from "@/lib/services/public-stay";

const stay = { checkIn: "2027-01-15", checkOut: "2027-01-17", adults: 2, children: 1, infants: 1 };
const settings = { slug: "garden", status: "active", approvalStatus: "approved", isBookable: true, timezone: "Asia/Kolkata", inventoryEngine: "interval_v1", bookingModes: ["overnight", "hourly"], childrenPolicy: { allowed: true }, ownerId: "secret", onboarding: { private: true } };
const room = { propertyId: "hotel", status: "active", name: "Family room", description: "A room", totalInventory: 2, maxAdults: 3, maxChildren: 2, maxInfants: 1, maxOccupancy: 4, amenityIds: ["wifi"], coverMediaId: "room-photo" };
const rate = { propertyId: "hotel", roomTypeId: "room", status: "active", name: "Flexible", basePricePaise: 12345, paymentMode: "deposit", depositBasisPoints: 2500, taxBasisPoints: 1200, customerFeePaise: 99, cancellationPolicyId: "policy", breakfastIncluded: true };

describe("hotel detail contracts and evaluation", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2027-01-01"));
    fixture.records.clear(); fixture.cache.clear(); fixture.failReads = false; fixture.reads = []; fixture.queries = [];
    for (const [path, value] of Object.entries({ "properties/hotel": { ...settings }, "roomTypes/room": { ...room }, "ratePlans/flexible": { ...rate }, "ratePlans/standard": { ...rate, basePricePaise: 10000 }, "cancellationPolicies/policy": { propertyId: "hotel", status: "active", name: "Flexible", refundableUntilHours: 24, cancellationFeePercent: 0 }, "mediaAssets/room-photo": { propertyId: "hotel", roomTypeId: "room" } })) fixture.records.set(path, value);
  });
  afterEach(() => vi.useRealTimers());
  it("matches authoritative stay math for every rate, including paise and deposits", async () => {
    const result = (await loadBookableProperty("garden", stay))!;
    const expected = evaluateStay(stay, settings, room, rate);
    expect(result.rooms[0].rates.find(item => item.id === "flexible")).toMatchObject({ totalPaise: expected.totalPaise, subtotalPaise: expected.subtotalPaise, taxPaise: expected.taxPaise, customerFeePaise: 99, payableNowPaise: expected.payableNowPaise, balanceDuePaise: expected.balanceDuePaise, startAt: expected.startAt, endAt: expected.endAt, nights: 2 });
    expect(formatMoney(12345)).toBe("₹123.45");
    expect(result.expiresAt).toBe(Date.now() + 30_000);
    expect(result.ratePlanModes).toEqual({ flexible: "overnight", standard: "overnight" });
    expect(fixture.queries).toEqual(["properties", "roomTypes", "ratePlans", "cancellationPolicies"]);
    const inventory = fixture.reads.flat().filter(path => path.startsWith("inventoryCalendars/"));
    expect(inventory).toHaveLength(3);
    expect(new Set(inventory).size).toBe(inventory.length);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result).not.toHaveProperty("onboarding");
  });
  it("returns configured starting rates without claiming a total, and never uses a property cover for rooms", async () => {
    fixture.records.set("mediaAssets/room-photo", { propertyId: "hotel", roomTypeId: null });
    const result = (await loadBookableProperty("garden", { adults: 2, children: 0, infants: 0 }))!;
    expect(result.rooms[0].rates[0].totalPaise).toBeNull();
    expect(result.rooms[0].imageUrl).toBeNull();
    expect(fixture.reads.flat().some(path => path.startsWith("inventoryCalendars/"))).toBe(false);
  });
  it("enforces explicit children policy at both availability and authoritative evaluation", async () => {
    fixture.records.set("properties/hotel", { ...settings, childrenPolicy: { allowed: false } });
    expect((await loadBookableProperty("garden", stay))?.rooms).toEqual([]);
    expect(() => evaluateStay(stay, { ...settings, childrenPolicy: { allowed: false } }, room, rate)).toThrow("CHILDREN_NOT_ALLOWED");
    expect(() => evaluateStay({ ...stay, children: 0 }, { ...settings, childrenPolicy: { allowed: false } }, room, rate)).toThrow("CHILDREN_NOT_ALLOWED");
    expect(() => evaluateStay(stay, {}, room, rate)).not.toThrow();
  });
  it("enforces infant and combined occupancy limits", async () => {
    expect((await loadBookableProperty("garden", { ...stay, infants: 2 }))?.rooms).toEqual([]);
    expect((await loadBookableProperty("garden", { ...stay, adults: 3, children: 2 }))?.rooms).toEqual([]);
  });
  it("distinguishes infrastructure failures and missing properties from no matching rooms", async () => {
    expect(await loadBookableProperty("unknown", stay)).toBeNull();
    fixture.failReads = true;
    await expect(loadBookableProperty("garden", stay)).rejects.toThrow("DATABASE_UNAVAILABLE");
    fixture.failReads = false;
    fixture.records.set("inventoryCalendars/hotel_room_2027-01-15", { stopSell: true });
    expect((await loadBookableProperty("garden", stay))?.rooms).toEqual([]);
  });
  it("uses zero source reads for the same warm fixture, then refreshes on expiry and partner invalidation", async () => {
    const cold = await loadBookableProperty("garden", stay);
    expect(fixture.queries.length).toBe(4);
    const coldReads = fixture.reads.flat().length;
    expect(coldReads).toBe(4); // One cover and three unique inventory calendars.
    fixture.queries = []; fixture.reads = [];
    expect(await loadBookableProperty("garden", stay)).toEqual(cold);
    expect(fixture.queries).toEqual([]); expect(fixture.reads).toEqual([]);
    fixture.cache.set(generationKeys(["search"])[1], "1");
    await loadBookableProperty("garden", stay);
    expect(fixture.queries.length).toBe(4);
    vi.setSystemTime(Date.now() + 30_001);
    fixture.queries = [];
    await loadBookableProperty("garden", stay);
    expect(fixture.queries.length).toBe(4);
  });
  it("shortens the snapshot at arrival and cancellation cutoffs", async () => {
    const start = Date.parse("2027-01-15T08:30:00Z");
    vi.setSystemTime(start - 24 * 3600_000 - 5_000);
    expect((await loadBookableProperty("garden", stay))?.expiresAt).toBe(start - 24 * 3600_000);
    fixture.cache.clear();
    vi.setSystemTime(start - 5_000);
    expect((await loadBookableProperty("garden", stay))?.expiresAt).toBe(start);
  });
  it("normalizes server and browser keys even without dates and preserves infant counts", () => {
    const parsed = staySearchFromParams(new URLSearchParams("adults=3&children=2&infants=1"));
    expect(Object.fromEntries(availabilityParams(parsed))).toEqual({ bookingMode: "overnight", adults: "3", children: "2", infants: "1" });
    expect(normalizedStay(null)).toEqual(normalizedStay({ adults: 2, children: 0, infants: 0 }));
    expect(staySearchFromParams(new URLSearchParams("checkIn=2027-01-15"))).toBeNull();
  });
});

describe("guest policy validation and public isolation", () => {
  it("preserves unspecified booleans without inventing rules", () => {
    expect(guestPoliciesSchema.parse({})).toEqual({});
    expect(publicGuestPolicies({ ownerId: "secret", childrenPolicy: { allowed: true, internalNote: "private" }, petPolicy: { allowed: "yes" } })).toEqual({ childrenPolicy: { allowed: true }, petPolicy: { allowed: null }, smokingPolicy: { allowed: null }, identityRequirements: { governmentIdRequired: null }, minimumCheckInAge: null, additionalHouseRules: null });
  });
  it("validates age boundaries, integer ages and house-rule length", () => {
    for (const age of [18, 100, null]) expect(guestPoliciesSchema.safeParse({ minimumCheckInAge: age }).success).toBe(true);
    for (const age of [17, 101, 18.5, "21"]) expect(guestPoliciesSchema.safeParse({ minimumCheckInAge: age }).success).toBe(false);
    expect(guestPoliciesSchema.safeParse({ additionalHouseRules: "x".repeat(2001) }).success).toBe(false);
    expect(guestPoliciesSchema.safeParse({ childrenPolicy: { allowed: true, internal: "secret" } }).success).toBe(false);
  });
});
