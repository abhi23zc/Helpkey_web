import { describe, expect, it } from "vitest";
import { reservationEligibility } from "@/lib/partner/reservations/eligibility";
import {
  collectionRestriction,
  amendmentRestriction,
} from "@/lib/partner/reservations/action-rules";
import { permissions } from "@/lib/partner/pms/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
const now = Date.parse("2026-11-14T00:00:00Z");
const base = {
  bookingStatus: "confirmed",
  inventoryEngine: "interval_v1",
  startAt: "2026-11-15T00:00:00Z",
  totalPaise: 10000,
  paidPaise: 1000,
};
const eligibility = (patch: RecordData = {}) =>
  reservationEligibility(
    { ...base, ...patch },
    permissions,
    { allocation: true, payments: true, amendments: true },
    now,
  );
describe("shared command availability", () => {
  it("blocks collection until refunds are resolved, without blocking valid in-house collection", () => {
    const b = { ...base, bookingStatus: "checked_in", refundDuePaise: 100 };
    expect(eligibility({ bookingStatus: "checked_in" }).collect.allowed).toBe(
      true,
    );
    expect(eligibility(b).collect.blockers[0]).toMatchObject({
      code: collectionRestriction(b)?.code,
      message: "Resolve pending refunds before collecting more money.",
    });
  });
  it("blocks collecting a fully settled balance and allows collecting returned money", () => {
    expect(eligibility({ paidPaise: 10000 }).collect.blockers[0].code).toBe(
      "OVERPAYMENT",
    );
    expect(
      eligibility({ paidPaise: 10000, refundedPaise: 1000 }).collect.allowed,
    ).toBe(true);
  });
  it.each(["cancelled", "no_show", "expired", "pending_payment"])(
    "does not advertise collection for %s",
    (status) => {
      expect(
        eligibility({ bookingStatus: status }).collect.blockers[0].code,
      ).toBe("COLLECTION_NOT_ALLOWED");
    },
  );
  it.each([
    { bookingStatus: "checked_in" },
    { startAt: "2026-11-13T00:00:00Z" },
    { inventoryReleased: true },
    { inventoryEngine: "legacy" },
    { startAt: "invalid" },
  ])("restricts amendments using the same stay gates: %j", (patch) => {
    expect(eligibility(patch).amend.blockers[0].code).toBe(
      "AMENDMENT_NOT_ALLOWED",
    );
    expect(amendmentRestriction({ ...base, ...patch }, now)?.code).toBe(
      "AMENDMENT_NOT_ALLOWED",
    );
  });
  it.each([
    { customizations: [{ id: "extra" }] },
    { extrasTotalPaise: 1 },
    { customizationCreditPaise: 1 },
    { couponId: "coupon" },
    { couponDiscountPaise: 1 },
    { refundDuePaise: 1 },
  ])("explains unresolved amendment agreements: %j", (patch) => {
    expect(eligibility(patch).amend.blockers[0].code).toBe(
      "RESOLVE_AGREEMENTS_FIRST",
    );
  });
  it("retains allowed future amendments and requires agreed times for assignment", () => {
    expect(eligibility().amend.allowed).toBe(true);
    expect(eligibility({ startAt: null }).assign.blockers[0].code).toBe(
      "ASSIGNMENT_NOT_ALLOWED",
    );
  });
  it("prioritizes role/feature blockers over private booking restrictions", () => {
    const b = { ...base, refundDuePaise: 100 };
    expect(
      reservationEligibility(
        b,
        [],
        { allocation: true, payments: true, amendments: true },
        now,
      ).collect.blockers,
    ).toEqual([
      {
        code: "FORBIDDEN",
        category: "permission",
        message:
          "Your hotel role does not permit this action. Ask the hotel owner for help.",
        resolution: null,
      },
    ]);
    expect(
      reservationEligibility(
        b,
        permissions,
        { allocation: true, payments: false, amendments: false },
        now,
      ).collect.blockers[0].code,
    ).toBe("FEATURE_UNAVAILABLE");
  });
});

it("does not attach check-in policy explanations to a stay that is already checked in", () => {
  const action = reservationEligibility(
    { ...base, bookingStatus: "checked_in" },
    permissions,
    { allocation: true, payments: true, amendments: true },
    now,
    { policies: { requireCleanRoom: true } },
  ).checked_in;
  expect(action.blockers.map((b) => b.code)).toEqual([
    "RESERVATION_STATE_CONFLICT",
  ]);
});
