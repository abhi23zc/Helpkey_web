import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingInput, createBookingInput } from "@/lib/booking/contracts";

const fixture = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  transaction: vi.fn(),
  provider: vi.fn(),
  available: true,
}));

vi.mock("@/lib/firebase/admin", () => {
  const snapshot = (path: string) => ({
    id: path.split("/").at(-1)!,
    exists: fixture.records.has(path),
    data: () => fixture.records.get(path),
  });
  return { adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }),
      where: (field: string, _operator: string, value: unknown) => ({ limit: () => ({
        get: async () => ({ docs: [...fixture.records.keys()]
          .filter(path => path.startsWith(`${name}/`) && fixture.records.get(path)?.[field] === value)
          .map(snapshot) }),
      }) }),
    }),
    getAll: async (...refs: { path: string }[]) => refs.map(ref => snapshot(ref.path)),
    runTransaction: fixture.transaction,
  } };
});
vi.mock("@/lib/booking/inventory", () => ({ readAvailability: async () => fixture.available }));
vi.mock("@/lib/media-resolver", () => ({ resolvePublicImage: vi.fn() }));
vi.mock("@/lib/api/cache", () => ({ invalidatePublic: vi.fn() }));
vi.mock("@/lib/booking/notifications", () => ({ enqueueBookingNotification: vi.fn() }));
vi.mock("@/lib/providers/http", () => ({ providerFetch: fixture.provider }));

import { createBooking, quote, quoteWithTiming } from "@/lib/bookings";

const stay = {
  propertySlug: "garden", roomTypeId: "room", ratePlanId: "rate",
  checkIn: "2027-01-15", checkOut: "2027-01-17", adults: 2,
};
const guest = {
  paymentMethod: "online", leadEmail: "guest@example.com", leadPhone: "+919876543210",
  adultGuestNames: ["First Guest", "Second Guest"], adultAadhaarLastFour: ["1234", "5678"],
  bookingContact: { name: "Booking Contact", email: "contact@example.com", phone: "+919876543210" },
  specialRequest: "Quiet room", termsAccepted: true,
};

describe("checkout quote and booking comparison", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    vi.stubEnv("RAZORPAY_KEY_ID", "test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret");
    fixture.records.clear();
    fixture.available = true;
    fixture.transaction.mockReset().mockRejectedValue(new Error("TEST_TRANSACTION_BOUNDARY"));
    fixture.provider.mockReset();
    fixture.records.set("properties/hotel", {
      slug: "garden", status: "active", approvalStatus: "approved", isBookable: true,
      inventoryEngine: "interval_v1", bookingModes: ["overnight", "hourly"], currency: "INR",
    });
    fixture.records.set("roomTypes/room", { propertyId: "hotel", status: "active", maxAdults: 3, totalInventory: 2 });
    fixture.records.set("ratePlans/rate", {
      propertyId: "hotel", roomTypeId: "room", status: "active", basePricePaise: 70000,
      paymentMode: "full", cancellationPolicyId: "policy",
    });
    fixture.records.set("cancellationPolicies/policy", {
      propertyId: "hotel", status: "active", name: "Flexible", refundableUntilHours: 24, cancellationFeePercent: 0,
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("uses identical fingerprints for a quote request and a complete payment submission", async () => {
    const initial = await quote(bookingInput.parse(stay));
    const submission = createBookingInput.parse({
      ...stay, ...guest, expectedTotalPaise: initial.totalPaise, quoteFingerprint: initial.fingerprint,
    });
    // Exercise both public quote entry points, as well as JSON round trips and
    // reordered keys. Personal fields and the old fingerprint must be ignored.
    const reversed = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(submission))).reverse());
    expect((await quoteWithTiming(reversed as typeof submission)).quote.fingerprint).toBe(initial.fingerprint);
    // This sentinel proves real createBooking validation reaches the inventory
    // transaction rather than erroneously throwing QUOTE_CHANGED beforehand.
    await expect(createBooking("guest", submission, "submission-key")).rejects.toThrow("TEST_TRANSACTION_BOUNDARY");
    expect(fixture.transaction).toHaveBeenCalledOnce();
    expect(fixture.provider).not.toHaveBeenCalled();
  });

  it("does not change the fingerprint merely because the quote was refreshed later", async () => {
    const initial = await quote(bookingInput.parse(stay));
    vi.setSystemTime(Date.now() + 60_000);
    const refreshed = await quote(bookingInput.parse(stay));
    expect(refreshed.quotedAt).not.toBe(initial.quotedAt);
    expect(refreshed.expiresAt).not.toBe(initial.expiresAt);
    expect(refreshed.fingerprint).toBe(initial.fingerprint);
  });

  it("also normalizes hourly payment submissions", async () => {
    Object.assign(fixture.records.get("ratePlans/rate")!, {
      bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 3, pricePaise: 40000 }],
    });
    const input = bookingInput.parse({ ...stay, checkOut: undefined, bookingMode: "hourly", arrivalTime: "10:00", durationMinutes: 180 });
    const initial = await quote(input);
    const submission = createBookingInput.parse({ ...input, ...guest, quoteFingerprint: initial.fingerprint });
    expect((await quote(submission)).fingerprint).toBe(initial.fingerprint);
    await expect(createBooking("guest", submission)).rejects.toThrow("TEST_TRANSACTION_BOUNDARY");
  });

  it.each(["price", "cancellation", "payment split", "stay dates", "guest count"])("still rejects a real change to %s before payment", async (change) => {
    const initial = await quote(bookingInput.parse(stay));
    const submission = { ...stay, ...guest, expectedTotalPaise: initial.totalPaise, quoteFingerprint: initial.fingerprint };
    if (change === "price") fixture.records.get("ratePlans/rate")!.basePricePaise = 80000;
    if (change === "cancellation") fixture.records.get("cancellationPolicies/policy")!.refundableUntilHours = 48;
    if (change === "payment split") Object.assign(fixture.records.get("ratePlans/rate")!, { paymentMode: "deposit", depositBasisPoints: 5000 });
    if (change === "stay dates") submission.checkIn = "2027-01-16";
    if (change === "guest count") Object.assign(submission, { adults: 1, adultGuestNames: ["First Guest"], adultAadhaarLastFour: ["1234"] });
    await expect(createBooking("guest", submission)).rejects.toThrow("QUOTE_CHANGED");
    expect(fixture.transaction).not.toHaveBeenCalled();
    expect(fixture.provider).not.toHaveBeenCalled();
  });

  it("rejects sold-out inventory even with the original valid fingerprint", async () => {
    const initial = await quote(bookingInput.parse(stay));
    fixture.available = false;
    await expect(createBooking("guest", { ...stay, ...guest, quoteFingerprint: initial.fingerprint })).rejects.toThrow("SOLD_OUT_FOR_DATES");
    expect(fixture.transaction).not.toHaveBeenCalled();
    expect(fixture.provider).not.toHaveBeenCalled();
  });
});
