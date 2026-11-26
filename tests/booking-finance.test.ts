import { describe, expect, it } from "vitest";
import { captureAgreement, chargeState, financeSource, resolveBookingFinance, type CheckoutProof, type Sources } from "@/lib/booking-finance/domain";
import type { Policy } from "@/lib/finance-settings/domain";
import type { Offering } from "@/lib/stay/contracts";
import type { RecordData } from "@/lib/partner/dashboard/domain";
const b = { propertyId: "hotel", roomType: { id: "room" }, ratePlan: { id: "rate" }, subtotalPaise: 200000, taxPaise: 10000, customerFeePaise: 0, extrasTotalPaise: 0, totalPaise: 210000, payableNowPaise: 210000, paidPaise: 0, bookingStatus: "confirmed", customizations: [], startAt: "2026-12-01", endAt: "2026-12-02" };
const policy: Policy = { marketplaceCommission: true, commissionBasis: "rooms", commissionBasisPoints: 1000 };
const empty: Sources = { entries: [], property: [], online: [], refunds: [] };
const snapshot = (booking: RecordData = b, p = policy, overrides: Policy = {}, owner: string | null = "owner", offerings: Offering[] = []) => captureAgreement("booking", booking, owner, offerings, p, overrides, 3, 4, "2026-11-24T00:00:00.000Z");
function proof(booking = b): CheckoutProof { return { bookingId: "booking", propertyId: "hotel", actorId: "owner", agreementVersion: 1, calculationVersion: 1, validated: true, originalChargeState: chargeState(booking), checkoutChargeState: chargeState(booking) }; }
function read(booking: RecordData = b, sources = empty, a = snapshot(booking), p: CheckoutProof | null = null) { const result = resolveBookingFinance(booking, a, p, sources); if (result.status === "historical") throw Error("Missing agreement"); return result; }
describe("immutable booking finance calculations", () => {
  it("inherits sparse defaults and snapshots revision, provenance and explicit zero", () => {
    const a = snapshot(b, policy, { commissionBasisPoints: 0 });
    expect(a.commissionPaise).toBe(0); expect(a.globalRevision).toBe(3); expect(a.hotelRevision).toBe(4);
    expect(a.terms.provenance.commissionBasisPoints).toBe("overridden"); expect(a.terms.provenance.commissionBasis).toBe("inherited");
    policy.commissionBasisPoints = 1500; expect(a.terms.effective.commissionBasisPoints).toBe(0); policy.commissionBasisPoints = 1000;
  });
  it.each([{}, { marketplaceCommission: true }, { marketplaceCommission: true, commissionBasis: "rooms" }, { commissionBasis: "rooms", commissionBasisPoints: 0 }])("keeps missing settings missing: %j", p => {
    expect(snapshot(b, p as Policy).commissionPaise).toBeNull(); expect(snapshot(b, p as Policy).setupReasons.length).toBeGreaterThan(0);
  });
  it("exempts a source without inventing a percentage or basis", () => {
    const a = snapshot(b, { marketplaceCommission: false }); expect(a.commissionPaise).toBe(0); expect(a.terms.effective.commissionBasisPoints).toBeUndefined(); expect(a.setupReasons).toEqual([]);
  });
  it("maps manual reservation and walk-in explicitly and refuses unknown sources", () => {
    expect(financeSource({ source: "manual_partner", reservationPurpose: "reservation" })).toBe("direct");
    expect(financeSource({ source: "manual_partner", reservationPurpose: "walk_in" })).toBe("walk_in");
    expect(financeSource({ source: "manual_partner" })).toBe("unknown"); expect(financeSource({ source: "other" })).toBe("unknown");
    expect(snapshot({ ...b, source: "manual_partner", reservationPurpose: "walk_in" }, { walkInCommission: false }).commissionPaise).toBe(0);
  });
  it.each([[4, 1000, 0], [5, 1000, 1], [6, 1000, 1], [999999999, 9999, 999899999]])("rounds half-up once using BigInt for %s at %s", (amount, rate, commission) => {
    const a = snapshot({ ...b, subtotalPaise: amount, taxPaise: 0, totalPaise: amount, payableNowPaise: amount }, { ...policy, commissionBasisPoints: rate }); expect(a.commissionPaise).toBe(commission);
  });
  it("includes only selected original categories, excludes taxes and pending quotes, rounds aggregate", () => {
    const extra = (id: string, amount: number) => ({ id, offeringId: id, agreementVersion: 2, settlement: "included", totalPaise: amount, preTaxPaise: amount, name: id });
    const offerings = ["food", "transport"].map((id, i) => ({ id, propertyId: "hotel", kind: "service", category: i ? "transport" : "food_drinks" })) as Offering[];
    const booking = { ...b, subtotalPaise: 5, taxPaise: 10000, totalPaise: 10025, extrasTotalPaise: 20, payableNowPaise: 10025, customizations: [extra("food", 5), extra("transport", 15), { ...extra("pending", 90000), settlement: "pending_hotel" }] };
    const a = snapshot(booking, { ...policy, commissionBasis: "rooms_and_extras", eligibleExtraCategories: ["food_drinks"] }, {}, "owner", offerings);
    expect(a.commissionBasisPaise).toBe(10); expect(a.commissionPaise).toBe(1); expect(a.charges).toHaveLength(5); expect(a.excludedCharges).toContain("transport");
    expect(a.charges.find(c => c.id === "food")?.category).toBe("food_drinks");
    offerings[0].category = "transport"; expect(a.charges.find(c => c.id === "food")?.category).toBe("food_drinks");
  });
  it("reviews missing category/pre-tax amounts and ownership without assuming zero", () => {
    const booking = { ...b, totalPaise: 210100, extrasTotalPaise: 100, customizations: [{ id: "x", offeringId: "x", agreementVersion: 2, settlement: "included", totalPaise: 100 }] };
    const a = snapshot(booking, { ...policy, commissionBasis: "rooms_and_extras", eligibleExtraCategories: ["other"] });
    expect(a.commissionPaise).toBeNull(); expect(a.charges.find(c => c.id === "x")?.preTaxPaise).toBeNull(); expect(a.setupReasons.join(" ")).toMatch(/category unavailable/);
    expect(read(b, empty, snapshot(b, policy, {}, null)).positionPaise).toBeNull();
    expect(read(b, empty, snapshot(b, policy, {}, null)).hotelRevenuePaise).toBeNull();
    expect(snapshot({ ...b, subtotalPaise: undefined }).commissionPaise).toBeNull();
  });
  it.each([[210000, 0, 190000], [0, 210000, -20000], [40000, 170000, 20000]])("worked example online %s / hotel %s gives signed position %s", (online, hotel, expected) => {
    const booking = { ...b, payableNowPaise: online, paidPaise: online + hotel };
    const sources = { ...empty, online: online ? [{ id: "pay", status: "captured", amountPaise: online }] : [], property: hotel ? [{ id: "cash", type: "collection", amountPaise: hotel }] : [] };
    const model = read(booking, sources); expect(model.agreement.commissionPaise).toBe(20000); expect(model.outstandingPaise).toBe(0); expect(model.positionPaise).toBe(expected); expect(model.earning).toBe("provisional"); expect(model.guestTaxPassThroughPaise).toBe(10000);
  });
  it("withholds the partial arrangement until the hotel records its collection", () => {
    const booking = { ...b, payableNowPaise: 40000, paidPaise: 40000 };
    const model = read(booking, { ...empty, online: [{ id: "p", status: "captured", amountPaise: 40000 }] });
    expect(model.outstandingPaise).toBe(170000); expect(model.positionPaise).toBeNull(); expect(model.agreement.expectedHotelPaise).toBe(170000);
  });
  it("ignores pending/authorized payments, deduplicates captures and retains history warnings", () => {
    const pending = read(b, { ...empty, online: [{ id: "order", status: "pending", amountPaise: 210000 }, { id: "auth", status: "authorized", amountPaise: 210000 }] }); expect(pending.collections.onlinePaise).toBe(0);
    const booking = { ...b, paidPaise: 210000 };
    const capture = { id: "p", paymentId: "p", status: "captured", amountPaise: 210000 };
    const duplicate = read(booking, { ...empty, online: [capture, { ...capture, id: "callback" }] }); expect(duplicate.collections.onlinePaise).toBe(210000); expect(duplicate.reviewReasons.join()).toMatch(/Duplicate/); expect(duplicate.positionPaise).toBeNull();
  });
  it("nets hotel reversals and shows refunds separately", () => {
    const sources = { ...empty, property: [{ id: "c", type: "collection", amountPaise: 210000 }, { id: "r", type: "reversal", receiptId: "c", amountPaise: 10000 }] };
    const model = read({ ...b, paidPaise: 200000 }, sources); expect(model.collections.hotelPaise).toBe(200000); expect(model.outstandingPaise).toBe(10000);
    const refunded = read({ ...b, paidPaise: 210000, refundedPaise: 10000 }, { ...empty, online: [{ id: "p", status: "captured", amountPaise: 210000 }], refunds: [{ id: "r", paymentId: "p", amountPaise: 10000, status: "processed" }] }); expect(refunded.collections.completedRefundPaise).toBe(10000); expect(refunded.outstandingPaise).toBe(10000); expect(refunded.positionPaise).toBeNull();
  });
  it("separates stayQuote services and suppresses settlement on inconsistent history", () => {
    const model = read({ ...b, paidPaise: 100 }, { ...empty, online: [{ id: "service", stayQuote: true, status: "captured", amountPaise: 100 }] }); expect(model.collections.onlinePaise).toBe(0); expect(model.services.receivedPaise).toBe(100); expect(model.outstandingPaise).toBeNull(); expect(model.positionPaise).toBeNull();
  });
  it("earns only with valid checkout proof, independently of collection", () => {
    const booking = { ...b, bookingStatus: "checked_out" }; expect(read(booking, empty, snapshot(booking), proof()).earning).toBe("earned"); expect(read(booking).earning).toBe("review");
    expect(read(booking, empty, snapshot(booking), { ...proof(), validated: false } as unknown as CheckoutProof).earning).toBe("review");
    expect(read(booking, empty, snapshot(booking, {}), proof()).earnedCommissionPaise).toBeNull();
  });
  it.each(["pending_payment", "payment_failed", "failed", "expired", "cancelled", "no_show"])("does not earn completed-stay commission for %s", bookingStatus => {
    const booking = { ...b, bookingStatus, paidPaise: 210000 };
    const model = read(booking, { ...empty, online: [{ id: "p", status: "captured", amountPaise: 210000 }] });
    expect(model.earning).toBe("not_earned"); expect(model.earnedCommissionPaise).toBeNull(); expect(model.positionPaise).toBeNull();
  });
  it("withholds earning and settlement for unknown lifecycle states", () => {
    const booking = { ...b, bookingStatus: "unrecognized", paidPaise: 210000 };
    const model = read(booking, { ...empty, online: [{ id: "p", status: "captured", amountPaise: 210000 }] });
    expect(model.status).toBe("review"); expect(model.earning).toBe("review"); expect(model.positionPaise).toBeNull();
  });
  it.each([{ endAt: "2026-12-03" }, { roomType: { id: "new" } }, { subtotalPaise: 190000 }, { customizationCreditPaise: 100 }])("retains original commission and reviews changed bookings %j", changes => {
    const model = read({ ...b, ...changes }, empty, snapshot()); expect(model.agreement.commissionPaise).toBe(20000); expect(model.positionPaise).toBeNull(); expect(model.earning).toBe("review");
  });
  it("detects reverted amendments from history and later service agreements", () => {
    expect(read(b, { ...empty, events: [{ type: "reservation_amended" }] }).earning).toBe("review");
    expect(read({ ...b, customizations: [{ settlement: "awaiting_payment", quote: { status: "accepted", amountPaise: 100 } }] }, empty, snapshot()).earning).toBe("review");
  });
  it("withholds nonzero customer-fee ownership and does not invent final payout", () => {
    const booking = { ...b, customerFeePaise: 100, totalPaise: 210100, paidPaise: 210100 };
    const model = read(booking, { ...empty, online: [{ id: "p", status: "captured", amountPaise: 210100 }] }); expect(model.reviewReasons.join()).toMatch(/ownership unresolved: Customer fee/); expect(model.positionPaise).toBeNull(); expect(model.unassessedItems).toContain("Gateway fees");
  });
  it("does not backfill historical agreements", () => { expect(resolveBookingFinance(b, null, null, empty)).toEqual({ status: "historical", message: "Historical finance agreement unavailable" }); });
});
