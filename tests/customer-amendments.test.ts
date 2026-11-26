import { describe, expect, it } from "vitest";
import {
  acceptPrice,
  allocationDifference,
  cancellationDeadline,
  canInitializeEditPolicy,
  customerEditingAvailable,
  editBlocker,
  guestPatch,
  requiredAdvance,
  snapshotPolicy,
  validateOccupants,
} from "@/lib/booking/amendments/domain";
import { remainingCancellationRefund } from "@/lib/stay/domain";
import { registrationFacts } from "@/lib/partner/reservations/operational-policies";
const price = (totalPaise: number, taxBasisPoints = 0) => ({
  subtotalPaise: totalPaise,
  taxPaise: 0,
  taxBasisPoints,
  customerFeePaise: 0,
  totalPaise,
});
const policy = () =>
  snapshotPolicy(
    {
      ...price(200000),
      startAt: "2030-01-10T10:00:00Z",
      paymentMode: "deposit",
      depositBasisPoints: 2500,
      ratePlan: { id: "rate" },
      cancellationPolicy: { refundableUntilHours: 24 },
    },
    {},
    {},
    null,
  );
describe("customer amendment policy", () => {
  it("makes a complete legacy online booking globally editable without a flag", () => {
    const legacy = {
      ...price(200000),
      source: "online",
      inventoryEngine: "interval_v1",
      propertyId: "hotel",
      roomType: { id: "room" },
      ratePlan: { id: "rate" },
      startAt: "2030-01-10T10:00:00Z",
      paymentMode: "full",
      depositBasisPoints: 10000,
    };
    expect(canInitializeEditPolicy(legacy)).toBe(true);
    expect(customerEditingAvailable(legacy)).toBe(true);
    expect(customerEditingAvailable({ ...legacy, source: "manual_partner" })).toBe(false);
  });
  it("makes edited names authoritative for every occupant category at the front desk", () => {
    const b = { adults: 1, children: 1, infants: 1, leadGuest: { adultGuestNames: ["Old Guest"], adultAadhaarLastFour: ["1234"] } };
    const guests = {
      occupants: [
        { name: "New Guest", ageGroup: "adult" as const },
        { name: "Child Guest", ageGroup: "child" as const },
        { name: "Infant Guest", ageGroup: "infant" as const },
      ],
      bookingContact: { name: "Contact Guest", email: "guest@example.com", phone: "+919876543210" },
    };
    const saved = { ...b, ...guestPatch(b, guests) };
    expect(registrationFacts(saved)).toMatchObject({ complete: true, missing: { adult: 0, child: 0, infant: 0 }, occupants: guests.occupants });
    expect(saved.leadGuest.adultAadhaarLastFour).toBeNull();
  });
  it("raises the accepted floor only through accepted agreements and retains its components", () => {
    const initial = price(200000);
    const higher = acceptPrice(price(250000), initial);
    expect(initial.totalPaise).toBe(200000);
    expect(higher.accepted.totalPaise).toBe(250000);
    expect(acceptPrice(price(150000), higher.accepted)).toEqual({
      accepted: higher.accepted,
      retainedDifferencePaise: 100000,
    });
  });
  it("requires assistance for incompatible retained taxes", () =>
    expect(() => acceptPrice(price(100000, 500), price(200000, 1200))).toThrow(
      "TAX_TREATMENT_REQUIRES_ASSISTANCE",
    ));
  it.each([
    ["full", 250000],
    ["deposit", 62500],
    ["pay_at_property", 0],
  ])("preserves %s payment arrangement", (paymentMode, expected) =>
    expect(
      requiredAdvance(250000, {
        paymentMode: String(paymentMode),
        depositBasisPoints: 2500,
      }),
    ).toBe(expected),
  );
  it("reserves only additional intervals and accounts for category changes", () => {
    const old = [{ date: "2030-01-01", intervals: ["1", "2"] }],
      proposed = [{ date: "2030-01-01", intervals: ["2", "3"] }];
    expect(allocationDifference(proposed, old, true)).toEqual([
      { date: "2030-01-01", intervals: ["3"] },
    ]);
    expect(allocationDifference(proposed, old, false)).toEqual(proposed);
  });
  it("closes at the cutoff and at early actual check-in", () => {
    const p = policy(),
      b = {
        editPolicy: { ...p, cutoffHours: 2 },
        bookingStatus: "confirmed",
        inventoryEngine: "interval_v1",
        startAt: "2030-01-10T10:00:00Z",
      };
    expect(editBlocker(b, Date.parse("2030-01-10T08:00:00Z"))).toBe(
      "EDITING_CLOSED",
    );
    expect(editBlocker(b, Date.parse("2030-01-10T08:00:00Z"), true)).toBeNull();
    expect(
      editBlocker(
        { ...b, actualCheckInAt: "2030-01-10T07:00:00Z" },
        Date.parse("2030-01-10T07:00:00Z"),
        true,
      ),
    ).toBe("EDITING_CLOSED");
  });
  it("does not reopen or extend cancellation rights", () => {
    const p = policy();
    const later = cancellationDeadline(
      p,
      "2030-02-10T10:00:00Z",
      { refundableUntilHours: 24 },
      Date.parse("2030-01-08T10:00:00Z"),
    );
    expect(later.cancellationDeadline).toBe(p.cancellationDeadline);
    expect(
      cancellationDeadline(
        p,
        "2030-02-10T10:00:00Z",
        { refundableUntilHours: 24 },
        Date.parse("2030-01-09T11:00:00Z"),
      ).cancellationExpired,
    ).toBe(true);
    expect(
      remainingCancellationRefund(
        {
          checkIn: "2030-02-10",
          startAt: "2030-02-10T10:00:00Z",
          paidPaise: 200000,
          cancellationPolicy: {
            refundableUntilHours: 24,
            cancellationFeePercent: 0,
          },
          editPolicy: { ...later, cancellationExpired: true },
        },
        Date.parse("2030-01-10T10:00:00Z"),
        false,
      ),
    ).toBe(0);
  });
  it("requires names for every selected occupant category", () =>
    expect(() =>
      validateOccupants({
        adults: 1,
        children: 1,
        infants: 0,
        occupants: [{ name: "Guest", ageGroup: "adult" }],
      }),
    ).toThrow("GUEST_COUNT_MISMATCH"));
  it("keeps legacy and discounted bookings on assistance but allows eligible name changes", () => {
    expect(editBlocker({}, Date.now())).toBe("HOTEL_ASSISTANCE_REQUIRED");
    const b = {
      editPolicy: policy(),
      bookingStatus: "confirmed",
      inventoryEngine: "interval_v1",
      startAt: "2030-01-10T10:00:00Z",
      couponId: "discount",
    };
    expect(editBlocker(b, Date.now())).toBe("HOTEL_ASSISTANCE_REQUIRED");
    expect(editBlocker(b, Date.now(), true)).toBeNull();
  });
});
