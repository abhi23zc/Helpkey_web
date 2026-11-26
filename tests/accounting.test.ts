import { describe, expect, it, vi } from "vitest";
import { assess, assertBalanced, totals } from "@/lib/accounting/domain";
import { cutover, summary } from "@/lib/accounting/posting";
import { accountingFixture } from "./helpers/accounting";
function model(online: number, hotel: number, completed = true, rate = 1000) {
  const f = accountingFixture(online, hotel, completed, rate);
  return assess("booking", f.b, f.agreement, f.proof, f.sources);
}
describe("hotel accounting rules", () => {
  it("rejects impossible cutover dates instead of silently activating on a different day", () => {
    try {
      vi.stubEnv("HOTEL_ACCOUNTING_START_AT", "2026-02-30T00:00:00Z");
      expect(() => cutover()).toThrow("INVALID_ACCOUNTING_START_DATE");
      vi.stubEnv("HOTEL_ACCOUNTING_START_AT", "2026-11-24T00:00:00Z");
      expect(cutover()).toBe("2026-11-24T00:00:00.000Z");
      vi.stubEnv("HOTEL_ACCOUNTING_START_AT", "2026-11-24T00:00:00.123Z");
      expect(cutover()).toBe("2026-11-24T00:00:00.123Z");
    } finally { vi.unstubAllEnvs(); }
  });
  it.each([[210000, 0, 190000, 0], [0, 210000, 0, 20000], [40000, 170000, 20000, 0]])("recognizes supported checkout allocation %s/%s", (online, hotel, payable, dues) => {
    const result = model(online, hotel), s = summary([...result.effects, { lines: result.recognition }]);
    expect(result.reasons).toEqual([]); expect(s.payablePaise).toBe(payable); expect(s.duesPaise).toBe(dues); expect(s.earnedCommissionPaise).toBe(20000); expect(s.pendingOnlinePaise).toBe(0); expect(s.pendingHotelPaise).toBe(0); expect(s.unallocatedCommissionPaise).toBe(0);
  });
  it("leaves unpaid guest money outstanding, and earned commission awaiting allocation", () => {
    const r = model(40000, 0), s = summary([...r.effects, { lines: r.recognition }]);
    expect(s).toMatchObject({ payablePaise: 0, duesPaise: 0, pendingOnlinePaise: 40000, pendingHotelPaise: 0, earnedCommissionPaise: 20000, unallocatedCommissionPaise: 20000 }); expect(r.guestOutstandingPaise).toBe(170000);
  });
  it.each([[210000, 0], [0, 210000], [40000, 170000], [40000, 0]])("does not earn or recognize settlement before checkout %s/%s", (online, hotel) => {
    const r = model(online, hotel, false), s = summary(r.effects);
    expect(r.recognition).toEqual([]); expect(s).toMatchObject({ payablePaise: 0, duesPaise: 0, earnedCommissionPaise: 0, pendingOnlinePaise: online, pendingHotelPaise: hotel });
  });
  it("supports explicit zero and leaves unassessed adjustments outside settlement", () => {
    const r = model(210000, 0, true, 0); expect(summary([...r.effects, { lines: r.recognition }]).payablePaise).toBe(210000); expect(r.commissionPaise).toBe(0);
    expect(r).not.toHaveProperty("gatewayFeesPaise"); expect(r).not.toHaveProperty("finalPayablePaise");
  });
  it("requires saved agreement and valid checkout evidence", () => {
    const f = accountingFixture(210000, 0);
    for (const [a, proof] of [[null, f.proof], [f.agreement, null]] as const) {
      const r = assess("booking", f.b, a, proof, f.sources);
      expect(r.status).toBe("review"); expect(summary([...r.effects, { lines: r.recognition }])).toMatchObject({ payablePaise: 0, earnedCommissionPaise: 0, reviewOnlinePaise: 210000 });
    }
  });
  it("ignores orders and authorizations and refuses foreign-owned or invalid captures", () => {
    const f = accountingFixture(210000, 0);
    for (const patch of [{ status: "authorized" }, { status: "created" }, { propertyId: "other" }, { currency: "USD" }, { amountPaise: -1 }]) {
      const r = assess("booking", f.b, f.agreement, f.proof, { ...f.sources, online: [{ ...f.sources.online[0], ...patch }] }); expect(r.effects).toHaveLength(0); expect(r.status).toBe("review");
    }
  });
  it("returns verified refunds against collection evidence without guessing revised commission", () => {
    const f = accountingFixture(210000, 0); f.b.refundedPaise = 10000;
    f.sources.refunds.push({ id: "refund", bookingId: "booking", propertyId: "hotel", paymentId: "booking-pay", amountPaise: 10000, status: "processed", createdAt: f.b.createdAt });
    const r = assess("booking", f.b, f.agreement, f.proof, f.sources), s = summary([...r.effects, { lines: r.recognition }]);
    expect(s).toMatchObject({ payablePaise: 0, earnedCommissionPaise: 0, reviewOnlinePaise: 200000 }); expect(r.effects.find(e => e.type === "online_refund")?.reverses).toBeTruthy();
  });
  it.each(["cancelled", "no_show"])("retains collections but reviews %s treatment", status => {
    const f = accountingFixture(210000, 0); f.b.bookingStatus = status;
    const r = assess("booking", f.b, f.agreement, f.proof, f.sources); expect(r.status).toBe("review"); expect(summary([...r.effects, { lines: r.recognition }]).payablePaise).toBe(0);
  });
  it("does not allocate later services into the original accommodation agreement", () => {
    const f = accountingFixture(210000, 0); f.sources.online[0].stayQuote = { id: "later" };
    const r = assess("booking", f.b, f.agreement, f.proof, f.sources); expect(r.status).toBe("review"); expect(summary([...r.effects, { lines: r.recognition }]).reviewOnlinePaise).toBe(210000);
  });
  it("rejects unsafe, unbalanced and unsupported journal lines", () => {
    expect(() => assertBalanced([{ account: "hotel_payable", debitPaise: 1, creditPaise: 0 }, { account: "online_clearing", debitPaise: 0, creditPaise: 2 }])).toThrow("UNBALANCED");
    expect(() => totals([{ lines: [{ account: "hotel_dues", debitPaise: -1, creditPaise: 0 }] }])).toThrow("INVALID");
  });
});
