import { afterEach, describe, it, expect, vi } from "vitest";
import { features } from "@/lib/partner/reservations/access";
import {
  explicitAdjustment,
  extensionQuote,
  stayChangeInput,
} from "@/lib/partner/reservations/stay-change-domain";
import {
  allocationCounts,
  assignmentHistory,
} from "@/lib/booking/assignment-segments";
import { allocateIntervals } from "@/lib/booking/domain";
import { can } from "@/lib/partner/pms/domain";
import {
  documentSources,
  reductions,
  emptyState,
} from "@/lib/partner/invoices/domain";
import { prepareFolioPosting } from "@/lib/partner/billing/service";
const timezone = "Asia/Kolkata";
afterEach(() => vi.unstubAllEnvs());
describe("in-house stay change rules", () => {
  it.each([undefined, "false", "true"])("enables stay changes without an environment switch (%s)", (value) => {
    vi.stubEnv("PARTNER_RESERVATIONS_STAY_CHANGES", value);
    vi.stubEnv("NODE_ENV", "production");
    expect(features().stayChanges).toBe(true);
  });
  it("keeps management and financial authorities separate from reception moves", () => {
    expect(can("receptionist", "reservation.assign")).toBe(true);
    for (const permission of [
      "reservation.category",
      "reservation.extend",
      "reservation.early_departure",
    ] as const) {
      for (const role of ["owner", "manager"])
        expect(can(role, permission)).toBe(true);
      for (const role of [
        "receptionist",
        "cashier",
        "housekeeper",
        "maintenance",
      ])
        expect(can(role, permission)).toBe(false);
    }
    expect(
      stayChangeInput.safeParse({
        action: "move",
        unitId: "room",
        effectiveAt: "2030-01-01",
      }).success,
    ).toBe(false);
    expect(() =>
      explicitAdjustment({
        action: "category",
        unitId: "r",
        settlement: "complimentary",
        adjustmentPaise: 1,
      }),
    ).toThrow("INVALID_SETTLEMENT");
    expect(() =>
      explicitAdjustment({
        action: "early_departure",
        departure: "now",
        settlement: "reduce",
        adjustmentPaise: 10,
      }),
    ).toThrow("INVALID_SETTLEMENT");
  });
  it("prices only added nights using date prices without a new fee or public notice rules", () => {
    const b = {
      bookingMode: "overnight",
      timezone,
      startAt: "2030-01-01T08:30:00.000Z",
      endAt: "2030-01-02T05:30:00.000Z",
      checkIn: "2030-01-01",
    };
    const q = extensionQuote(
      b,
      { timezone },
      { maxAdults: 2 },
      {
        basePricePaise: 10000,
        datePrices: { "2030-01-02": { basePricePaise: 14000 } },
        taxBasisPoints: 1000,
        customerFeePaise: 999,
        stayRules: { minimumAdvanceMinutes: 100000, maximumAdvanceDays: 0 },
      },
      { action: "extend", departureDate: "2030-01-03" },
      Date.parse("2030-01-02T04:00Z"),
    );
    expect(q.adjustmentPaise).toBe(14000); // Stay evaluation returns entered amounts; shared finance applies tax.
    expect(q.price).not.toHaveProperty("customerFeePaise");
    expect(q.endAt).toBe("2030-01-03T05:30:00.000Z");
    expect(() =>
      extensionQuote(
        b,
        { timezone },
        {},
        { basePricePaise: 1 },
        { action: "extend", departureDate: "2030-02-02" },
        0,
      ),
    ).toThrow();
  });
  it("extends hourly occupancy across midnight only inside the full operating window", () => {
    const b = {
      bookingMode: "hourly",
      timezone,
      checkIn: "2030-01-01",
      startAt: "2030-01-01T16:30:00.000Z",
      endAt: "2030-01-01T18:30:00.000Z",
    };
    const p = { timezone, bookingModes: ["hourly"] },
      r = {
        bookingMode: "hourly",
        pricingModel: "duration",
        durationPrices: [{ hours: 2, pricePaise: 1200 }],
        allowMidnightCrossing: true,
        operatingWindow: { start: "20:00", end: "04:00" },
      };
    expect(
      extensionQuote(
        b,
        p,
        {},
        r,
        { action: "extend", additionalMinutes: 120 },
        Date.parse("2030-01-01T17:30Z"),
      ).endAt,
    ).toBe("2030-01-01T20:30:00.000Z");
    expect(() =>
      extensionQuote(
        b,
        p,
        {},
        { ...r, operatingWindow: { start: "20:00", end: "01:00" } },
        { action: "extend", additionalMinutes: 120 },
        Date.parse("2030-01-01T17:30Z"),
      ),
    ).toThrow("OUTSIDE_OPERATING_WINDOW");
    expect(() =>
      extensionQuote(
        b,
        p,
        {},
        { ...r, allowMidnightCrossing: false },
        { action: "extend", additionalMinutes: 120 },
        Date.parse("2030-01-01T17:30Z"),
      ),
    ).toThrow("MIDNIGHT_CROSSING_NOT_ALLOWED");
  });
  it("requires exact original evidence and counts overlapping room turnover twice", () => {
    const b = {
      propertyId: "p",
      physicalUnitId: "a",
      roomType: { id: "r" },
      startAt: "2030-01-01T10:00:00Z",
      endAt: "2030-01-01T12:00:00Z",
      inventoryEndAt: "2030-01-01T12:30:00Z",
      timezone,
    };
    const allocations = allocateIntervals(
        b.startAt,
        b.inventoryEndAt,
        timezone,
      ),
      hold = {
        propertyId: "p",
        status: "committed",
        quantity: 1,
        roomTypeId: "r",
        allocations,
      };
    expect(() => assignmentHistory(b, hold)).toThrow(
      "ASSIGNMENT_RECONCILIATION_REQUIRED",
    );
    expect(
      assignmentHistory({ ...b, physicalAllocations: allocations }, hold),
    ).toHaveLength(1);
    const first = allocateIntervals(
        b.startAt,
        "2030-01-01T11:37:00Z",
        timezone,
      ),
      second = allocateIntervals(
        "2030-01-01T11:07:00Z",
        b.inventoryEndAt,
        timezone,
      );
    expect(
      [
        ...allocationCounts([
          { roomTypeId: "r", allocations: first },
          { roomTypeId: "r", allocations: second },
        ]).values(),
      ].filter((n) => n === 2),
    ).toHaveLength(3);
  });
  it("links agreed reductions to original invoice sources and rejects documented reversal", () => {
    const b = { totalPaise: 10000, extrasTotalPaise: 0 },
      credit = {
        id: "c",
        type: "credit",
        originalEntryId: null,
        amountPaise: -2000,
        reductionSourceId: "booking",
        stayChangeId: "c",
      };
    const lines = documentSources(b, [credit]),
      state = {
        ...emptyState(),
        claims: { booking: 10000 },
        reductionClaims: { booking: 2000 },
      };
    expect(lines.find((s) => s.id === "booking")?.amountPaise).toBe(8000);
    expect(
      reductions(lines, state).find((s) => s.id === "booking")?.amountPaise,
    ).toBe(2000);
    expect(() =>
      prepareFolioPosting(
        { ...b, billingNetPaise: -2000 },
        [credit],
        [
          {
            ...credit,
            id: "undo",
            type: "compensation",
            originalEntryId: "c",
            amountPaise: 2000,
          },
        ],
        state,
      ),
    ).toThrow("unsupported debit-note");
  });
});
