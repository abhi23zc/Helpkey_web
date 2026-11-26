import { describe, expect, it } from "vitest";
import { accountingFixture } from "./helpers/accounting";
import {
  createServiceAgreement,
  serviceFinance,
} from "@/lib/booking-finance/services";
import { assess, hash } from "@/lib/accounting/domain";
import { paymentSummary } from "@/lib/stay/payment-summary";
import { paymentHistory } from "@/lib/accounting/payments";
function fixture() {
  const f = accountingFixture(210000, 0);
  const r = {
    id: "extra",
    offeringId: "offering",
    offeringVersion: 1,
    name: "Airport pickup",
    agreementVersion: 2,
    settlement: "paid",
    status: "confirmed",
    quote: {
      version: 1,
      amountPaise: 10000,
      status: "accepted",
      acceptedAt: "2026-11-24T01:00:00Z",
      scope: "Pickup",
      conditions: "Hotel service",
      paymentId: "service-pay",
      paymentStatus: "paid",
    },
  };
  f.b.customizations = [r];
  f.b.stayPaymentReceipts = [
    {
      requestId: r.id,
      quoteVersion: 1,
      paymentId: "service-pay",
      orderId: "service-order",
      amountPaise: 10000,
      status: "paid",
    },
  ];
  f.sources.online.push({
    bookingId: "booking",
    propertyId: "hotel",
    id: "service-pay",
    paymentId: "service-pay",
    orderId: "service-order",
    amountPaise: 10000,
    stayQuote: true,
    currency: "INR",
    status: "captured",
    createdAt: "2026-11-24T01:01:00Z",
  });
  const snapshot = createServiceAgreement(f.agreement, r, {
    category: null,
    preTaxPaise: null,
    actorId: "admin",
    reason: "Verified hotel-owned service",
  });
  f.sources.serviceAgreements = [snapshot];
  return { ...f, r, snapshot };
}
describe("saved service settlement and safe payment summaries", () => {
  it("settles room-only commission plus a separate hotel service", () => {
    const f = fixture();
    const a = assess("booking", f.b, f.agreement, f.proof, f.sources);
    expect(a.reasons).toEqual([]);
    expect(a.status).toBe("recognized");
    expect(a.commissionPaise).toBe(20000);
    expect(a.recognition).toContainEqual({
      account: "hotel_payable",
      debitPaise: 0,
      creditPaise: 200000,
    });
    expect(a.effects.filter((e) => e.type === "capture")).toHaveLength(2);
    expect(a.effects[1].serviceAgreementReference).toBe("extra:v1");
  });
  it("uses saved selected-extra terms, requires pre-tax evidence, and excludes ineligible categories", () => {
    const f = fixture();
    f.agreement.terms.effective = {
      ...f.agreement.terms.effective,
      commissionBasis: "rooms_and_extras",
      eligibleExtraCategories: ["transport"],
    };
    expect(() =>
      createServiceAgreement(f.agreement, f.r, {
        category: "transport",
        preTaxPaise: null,
        actorId: "admin",
        reason: "test",
      }),
    ).toThrow(/pre-tax/);
    expect(
      createServiceAgreement(f.agreement, f.r, {
        category: "transport",
        preTaxPaise: 9000,
        actorId: "admin",
        reason: "test",
      }).commissionPaise,
    ).toBe(900);
    expect(
      createServiceAgreement(f.agreement, f.r, {
        category: "other",
        preTaxPaise: null,
        actorId: "admin",
        reason: "test",
      }).commissionPaise,
    ).toBe(0);
  });
  it("keeps missing terms and changed quotes blocked with actionable service reasons", () => {
    const f = fixture();
    f.sources.serviceAgreements = [];
    expect(serviceFinance(f.b, f.agreement, f.sources).issues[0]).toMatchObject(
      { code: "SERVICE_TERMS_MISSING", requestId: "extra" },
    );
    f.sources.serviceAgreements = [f.snapshot];
    f.r.quote.amountPaise = 12000;
    expect(serviceFinance(f.b, f.agreement, f.sources).issues[0].code).toBe(
      "SERVICE_AGREEMENT_CHANGED",
    );
  });
  it("verifies combined service captures without double counting", () => {
    const f = fixture();
    const second = {
      ...f.r,
      id: "second",
      name: "Breakfast",
      quote: { ...f.r.quote, amountPaise: 5000 },
    };
    f.b.customizations.push(second);
    f.b.stayPaymentReceipts.push({
      ...f.b.stayPaymentReceipts[0],
      requestId: "second",
      amountPaise: 5000,
    });
    f.sources.online[1].amountPaise = 15000;
    f.sources.serviceAgreements!.push(
      createServiceAgreement(f.agreement, second, {
        category: null,
        preTaxPaise: null,
        actorId: "admin",
        reason: "Verified",
      }),
    );
    expect(serviceFinance(f.b, f.agreement, f.sources)).toMatchObject({
      totalPaise: 15000,
      issues: [],
    });
    expect(
      assess("booking", f.b, f.agreement, f.proof, f.sources).effects.filter(
        (e) => e.type === "capture",
      ),
    ).toHaveLength(2);
    f.b.stayPaymentReceipts.push(f.b.stayPaymentReceipts[0]);
    expect(
      serviceFinance(f.b, f.agreement, f.sources).issues.length,
    ).toBeGreaterThan(0);
  });
  it("blocks pending and mismatched refunds; recognises a verified full service refund", () => {
    const f = fixture();
    f.sources.refunds = [
      {
        id: "refund",
        requestId: "extra",
        paymentId: "service-pay",
        bookingId: "booking",
        propertyId: "hotel",
        amountPaise: 10000,
        status: "pending",
        stayQuote: true,
        createdAt: "2026-11-24T02:00:00Z",
      },
    ];
    expect(assess("booking", f.b, f.agreement, f.proof, f.sources).status).toBe(
      "review",
    );
    f.sources.refunds[0].status = "processed";
    f.sources.events = [
      { id: "event", type: "refund_processed", refundId: "refund" },
    ];
    f.r.quote.paymentStatus = "refunded";
    f.b.stayPaymentReceipts[0].status = "refunded";
    f.sources.online[1].status = "refunded";
    f.r.status = "cancelled";
    const a = assess("booking", f.b, f.agreement, f.proof, f.sources);
    expect(a.reasons).toEqual([]);
    expect(a.status).toBe("recognized");
    expect(a.recognition).toContainEqual({
      account: "hotel_payable",
      debitPaise: 0,
      creditPaise: 190000,
    });
    f.sources.refunds[0].amountPaise = 5000;
    expect(assess("booking", f.b, f.agreement, f.proof, f.sources).status).toBe(
      "review",
    );
  });
  it("does not change the original room agreement or apply unpaid/unaccepted offers", () => {
    const f = fixture(),
      original = hash(f.agreement);
    f.b.customizations.push({
      id: "unaccepted",
      settlement: "awaiting_customer",
      quote: { status: "offered", amountPaise: 30000 },
    });
    expect(assess("booking", f.b, f.agreement, f.proof, f.sources).status).toBe(
      "recognized",
    );
    expect(hash(f.agreement)).toBe(original);
    expect(paymentSummary(f.b).addonChargesPaise).toBe(10000);
  });
  it("projects room and service payments safely and rejects duplicate receipts", () => {
    const f = fixture();
    expect(paymentSummary(f.b)).toMatchObject({
      reliable: true,
      roomChargesPaise: 210000,
      addonChargesPaise: 10000,
      totalChargesPaise: 220000,
      grossPaidPaise: 220000,
      outstandingPaise: 0,
    });
    f.b.stayPaymentReceipts.push(f.b.stayPaymentReceipts[0]);
    expect(paymentSummary(f.b)).toMatchObject({
      reliable: false,
      grossPaidPaise: null,
    });
  });
  it("shows actual money events once and keeps calculations out of payment history", () => {
    const f = fixture(),
      a = assess("booking", f.b, f.agreement, f.proof, f.sources);
    const journal = [
      ...a.effects.map((e) => ({
        ...e,
        id: e.key,
        bookingId: "booking",
        propertyId: "hotel",
        recordedAt: e.occurredAt,
        currency: "INR",
      })),
      {
        id: "calc",
        type: "recognition",
        bookingId: "booking",
        amountPaise: 20000,
        status: "review",
      },
    ] as unknown as import("@/lib/accounting/posting").Journal[];
    const history = paymentHistory(journal, [{ ...f.b, id: "booking" }]);
    expect(history).toHaveLength(2);
    expect(history.map((p) => p.status)).toEqual(["Received", "Received"]);
    expect(history[0]).toMatchObject({
      purpose: "Add-on service",
      amountPaise: 10000,
    });
  });
  it("does not hold a booking just because a free request was approved", () => {
    const f = fixture();
    f.b.customizations.push({
      id: "free",
      offeringId: "free",
      offeringVersion: 1,
      settlement: "included",
      agreementVersion: 2,
      unitPricePaise: 0,
      totalPaise: 0,
      status: "confirmed",
    });
    expect(assess("booking", f.b, f.agreement, f.proof, f.sources).status).toBe(
      "recognized",
    );
  });
  it("rejects altered stored commission and duplicate service requests", () => {
    const f = fixture();
    f.snapshot.commissionPaise = 5000;
    expect(serviceFinance(f.b, f.agreement, f.sources).issues[0].code).toBe(
      "SERVICE_AGREEMENT_CHANGED",
    );
    f.snapshot.commissionPaise = 0;
    f.b.customizations.push(f.r);
    expect(
      serviceFinance(f.b, f.agreement, f.sources).issues.some(
        (i) => i.code === "SERVICE_DUPLICATE",
      ),
    ).toBe(true);
  });
});
