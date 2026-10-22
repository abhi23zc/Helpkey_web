import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {} }));
import { minimumAvailablePrice, minimumAvailableOffer } from "@/lib/booking/search-availability";
import { allocateIntervals, evaluateStay } from "@/lib/booking/domain";

const input = { checkIn: "2026-02-01", checkOut: "2026-02-02", adults: 2, children: 0, infants: 0 };
const snapshot = (path: string, data?: Record<string, unknown>) => ({ id: path.split("/").at(-1), ref: { path }, exists: !!data, data: () => data, get: (key: string) => data?.[key] });
function fixture(interval = false) {
  const settings = { status: "active", approvalStatus: "approved", isBookable: true, timezone: "Asia/Kolkata", bookingModes: ["overnight", "hourly"], ...(interval ? { inventoryEngine: "interval_v1" } : {}) };
  const room = { propertyId: "hotel", status: "active", maxAdults: 2, totalInventory: 1 };
  const rates = [
    { propertyId: "hotel", status: "active", roomTypeId: "room", basePricePaise: 10000, taxBasisPoints: 1000, customerFeePaise: 500 },
    { propertyId: "hotel", status: "active", roomTypeId: "room", basePricePaise: 20000 },
  ];
  const records = new Map<string, Record<string, unknown>>([["roomTypes/room", room]]);
  const get = vi.fn(async () => ({ docs: rates.map((rate, i) => snapshot(`ratePlans/${i}`, rate)) }));
  const getAll = vi.fn(async (...refs: { path: string }[]) => refs.map(ref => snapshot(ref.path, records.get(ref.path))));
  const query = { where: () => query, limit: () => query, get };
  const collection = vi.fn((name: string) => {
    if (!["ratePlans", "roomTypes", "inventoryCalendars", "roomNightInventory", "cancellationPolicies"].includes(name)) throw new Error(`UNEXPECTED_READ:${name}`);
    return { ...query, doc: (id: string) => ({ path: `${name}/${id}` }) };
  });
  return { db: { collection, getAll } as unknown as Firestore, property: snapshot("properties/hotel", settings) as unknown as QueryDocumentSnapshot, records, room, rates, settings, get, getAll };
}

describe("live search availability", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("matches quote pricing including taxes/fees and reads shared room/inventory once per request", async () => {
    const f = fixture();
    expect(await minimumAvailablePrice(f.db, f.property, input)).toBe(evaluateStay(input, f.settings, f.room, f.rates[0]).totalPaise);
    expect(f.getAll.mock.calls.map(args => args.map(ref => ref.path))).toEqual([["roomTypes/room"], ["roomNightInventory/hotel_room_2026-02-01"]]);
    f.records.set("roomNightInventory/hotel_room_2026-02-01", { reserved: 1 });
    expect(await minimumAvailablePrice(f.db, f.property, input)).toBeNull();
  });
  it("checks every night and excludes inactive, foreign and over-capacity rooms", async () => {
    const f = fixture();
    f.records.set("roomNightInventory/hotel_room_2026-02-02", { reserved: 1 });
    expect(await minimumAvailablePrice(f.db, f.property, { ...input, checkOut: "2026-02-03" })).toBeNull();
    expect(await minimumAvailablePrice(f.db, f.property, { ...input, adults: 3 })).toBeNull();
    f.room.propertyId = "other";
    expect(await minimumAvailablePrice(f.db, f.property, input)).toBeNull();
    f.room.propertyId = "hotel"; f.room.status = "inactive";
    expect(await minimumAvailablePrice(f.db, f.property, input)).toBeNull();
  });
  it("honors interval reservations, blocks, stop-sell and cleaning buffers", async () => {
    const f = fixture(true);
    expect(await minimumAvailablePrice(f.db, f.property, input)).toBe(11500);
    const stay = evaluateStay(input, f.settings, f.room, f.rates[0]);
    const last = allocateIntervals(stay.startAt, stay.inventoryEndAt, stay.timezone).at(-1)!;
    const path = `inventoryCalendars/hotel_room_${last.date}`;
    for (const data of [{ reserved: { [last.intervals.at(-1)!]: 1 } }, { blocked: { [last.intervals.at(-1)!]: 1 } }, { stopSell: true }]) {
      f.records.set(path, data);
      expect(await minimumAvailablePrice(f.db, f.property, input)).toBeNull();
    }
  });
  it("evaluates exact hourly durations and requires the interval engine", async () => {
    const f = fixture(true);
    const hourly = { ...input, bookingMode: "hourly" as const, arrivalTime: "10:00", durationMinutes: 120 };
    Object.assign(f.rates[0], { bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 2, pricePaise: 30000 }] });
    expect(await minimumAvailablePrice(f.db, f.property, hourly)).toBe(33500);
    expect(await minimumAvailablePrice(f.db, f.property, { ...hourly, durationMinutes: 180 })).toBeNull();
    f.settings.inventoryEngine = undefined;
    expect(await minimumAvailablePrice(f.db, f.property, hourly)).toBeNull();
  });
  it("returns the selected room and its own policy, breakfast, beds, amenities and total", async () => {
    const f = fixture();
    Object.assign(f.room, { name: "Twin room", bedConfigurations: [{ bedType: "single", count: 2 }], amenityIds: ["wifi"] });
    Object.assign(f.rates[0], { cancellationPolicyId: "paid", breakfastIncluded: false });
    Object.assign(f.rates[1], { cancellationPolicyId: "free", breakfastIncluded: true });
    f.records.set("cancellationPolicies/paid", { propertyId: "hotel", status: "active", refundableUntilHours: 24, cancellationFeePercent: 50 });
    f.records.set("cancellationPolicies/free", { propertyId: "hotel", status: "active", refundableUntilHours: 24, cancellationFeePercent: 0 });
    const standard = await minimumAvailableOffer(f.db, f.property, input);
    expect(standard).toMatchObject({ ratePlanId: "0", roomName: "Twin room", beds: [{ bedType: "single", count: 2 }], totalPaise: 11500, breakfastIncluded: false, cancellation: { freeCancellation: false } });
    const flexible = await minimumAvailableOffer(f.db, f.property, input, { freeCancellation: true, amenities: ["wifi"], codesById: new Map() });
    expect(flexible).toMatchObject({ ratePlanId: "1", totalPaise: 20000, breakfastIncluded: true, amenityCodes: ["wifi"], cancellation: { freeCancellation: true } });
    expect(await minimumAvailableOffer(f.db, f.property, input, { amenities: ["swimming_pool"] })).toBeNull();
  });
  it("does not sell a rate with a missing or foreign referenced cancellation policy", async () => {
    const f = fixture();
    f.rates.splice(1);
    Object.assign(f.rates[0], { cancellationPolicyId: "policy" });
    expect(await minimumAvailableOffer(f.db, f.property, input)).toBeNull();
    f.records.set("cancellationPolicies/policy", { propertyId: "other", status: "active", refundableUntilHours: 0, cancellationFeePercent: 0 });
    expect(await minimumAvailableOffer(f.db, f.property, input)).toBeNull();
  });
  it("omits malformed rates while keeping usable alternatives", async () => {
    const f = fixture();
    Object.assign(f.rates[0], { taxBasisPoints: -100 });
    expect((await minimumAvailableOffer(f.db, f.property, input))?.totalPaise).toBe(20000);
  });
  it("propagates infrastructure errors instead of reporting sold out", async () => {
    const f = fixture();
    f.getAll.mockRejectedValueOnce(new Error("UNAVAILABLE"));
    await expect(minimumAvailablePrice(f.db, f.property, input)).rejects.toThrow("UNAVAILABLE");
  });
});
