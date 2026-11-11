import { describe, expect, it } from "vitest";
import { guestReservationDetails } from "@/lib/booking/guest-details";
const base = {
  propertyName: "Saved hotel",
  propertyAddress: "Saved address",
  checkIn: "2027-01-15",
  checkOut: "2027-01-17",
  timezone: "Asia/Kolkata",
  roomType: { name: "Saved room" },
  ratePlan: { name: "Saved rate" },
  totalPaise: 100000,
  subtotalPaise: 90000,
  taxPaise: 9000,
  customerFeePaise: 1000,
  payableNowPaise: 25000,
  paidPaise: 25000,
  refundDuePaise: 0,
  refundedPaise: 0,
  customizationCreditPaise: 0,
  bookingStatus: "confirmed",
};
describe("customer saved reservation projection", () => {
  it("only projects saved values, falling back to persisted quote data", () => {
    const r = guestReservationDetails({
      ...base,
      quoteSnapshot: {
        propertyPublicPhone: "123456789",
        includedAmenities: { roomAmenities: [{ code: "wifi", label: "WiFi" }] },
      },
    });
    expect(r.savedDetails.propertyAddress).toBe("Saved address");
    expect(r.savedDetails.propertyPublicPhone).toBe("123456789");
    expect(r.savedDetails.amenitySnapshot?.roomAmenities).toEqual([
      { code: "wifi", label: "WiFi" },
    ]);
    expect(guestReservationDetails({}).savedDetails.propertyAddress).toBeNull();
  });
  it("never copies private identity, owner, request input or provider data", () => {
    const r = guestReservationDetails({
      ...base,
      ownerId: "owner-secret",
      leadGuest: { name: "Guest", adultAadhaarLastFour: ["identity-secret"] },
      customizations: [
        {
          name: "Tea",
          inputs: { note: "private-input" },
          quote: { orderId: "order-secret", signature: "signature-secret" },
        },
      ],
      billing: {
        legalName: "Acme",
        gstin: "GST",
        address: { line1: "Street", private: "private-address" },
      },
    });
    for (const value of [
      "owner-secret",
      "identity-secret",
      "order-secret",
      "signature-secret",
      "private-address",
    ])
      expect(JSON.stringify(r)).not.toContain(value);
  });
  it.each([0, 25000, 100000])(
    "uses backend amounts for property/deposit/full payment %s",
    (paidPaise) => {
      expect(
        guestReservationDetails({ ...base, paidPaise }).receiptFinancials,
      ).toMatchObject({
        totalPaise: 100000,
        paidPaise,
        balanceDuePaise: 100000 - paidPaise,
      });
    },
  );
  it("keeps missing and malformed financials null instead of zero", () => {
    const r = guestReservationDetails({
      totalPaise: 100000,
      paidPaise: "100",
      taxPaise: -1,
      customerFeePaise: 1.5,
    });
    expect(r.receiptFinancials).toMatchObject({
      paidPaise: null,
      taxPaise: null,
      customerFeePaise: null,
      balanceDuePaise: null,
      refundedPaise: null,
    });
  });
  it("uses shared cancellation, credit and refund math", () => {
    expect(
      guestReservationDetails({
        ...base,
        bookingStatus: "cancelled",
        paidPaise: 100000,
        refundedPaise: 20000,
        refundDuePaise: 30000,
        customizationCreditPaise: 10000,
      }).receiptFinancials,
    ).toMatchObject({
      totalPaise: 100000,
      effectiveTotalPaise: 90000,
      netPaidPaise: 50000,
      balanceDuePaise: 0,
      refundDuePaise: 30000,
      refundedPaise: 20000,
    });
  });
  it("does not double-count ledger and legacy quote representations", () => {
    const request = {
      id: "r1",
      name: "Pickup",
      quote: {
        paymentId: "pay_extra",
        amountPaise: 10000,
        scope: "Pickup",
        paymentStatus: "paid",
      },
    };
    const receipt = {
      requestId: "r1",
      quoteVersion: 1,
      paymentId: "pay_extra",
      amountPaise: 10000,
      status: "paid",
      scope: "Pickup",
    };
    const r = guestReservationDetails({
      ...base,
      customizations: [request, request],
      stayPaymentReceipts: [receipt, receipt],
    });
    expect(r.receiptFinancials.paidPaise).toBe(25000);
    expect(r.supplementalPayments.paidPaise).toBe(10000);
    expect(r.servicePaymentReceipts).toHaveLength(1);
  });
  it("retains multiple allocations belonging to one combined service payment", () => {
    const r = guestReservationDetails({
      ...base,
      stayPaymentReceipts: [
        {
          requestId: "r1",
          quoteVersion: 1,
          paymentId: "pay_combined",
          amountPaise: 10000,
          status: "paid",
          scope: "Pickup",
        },
        {
          requestId: "r2",
          quoteVersion: 1,
          paymentId: "pay_combined",
          amountPaise: 5000,
          status: "paid",
          scope: "Tea",
        },
      ],
    });
    expect(r.supplementalPayments.paidPaise).toBe(15000);
    expect(r.servicePaymentReceipts).toHaveLength(2);
  });
  it("preserves separately paid service refund states", () => {
    const r = guestReservationDetails({
      ...base,
      stayPaymentReceipts: [
        {
          requestId: "a",
          paymentId: "pa",
          amountPaise: 100,
          status: "refund_pending",
        },
        {
          requestId: "b",
          paymentId: "pb",
          amountPaise: 200,
          status: "refunded",
        },
      ],
    });
    expect(r.supplementalPayments).toMatchObject({
      paidPaise: 300,
      refundDuePaise: 100,
      refundedPaise: 200,
    });
    expect(r.receiptFinancials.refundDuePaise).toBe(0);
  });
  it("preserves awaiting service quotes without treating them as received payments", () => {
    const r = guestReservationDetails({
      ...base,
      customizations: [
        {
          id: "r",
          status: "requested",
          settlement: "awaiting_payment",
          quote: {
            amountPaise: 500,
            status: "accepted",
            expiresAt: "2099-01-01",
          },
        },
      ],
    });
    expect(r.supplementalPayments.awaitingPaymentPaise).toBe(500);
    expect(r.supplementalPayments.paidPaise).toBe(0);
  });
  it("handles malformed optional arrays, policy and billing", () => {
    expect(() =>
      guestReservationDetails({
        ...base,
        customizations: [null, 1, {}],
        stayPaymentReceipts: [null, {}, false],
        amenitySnapshot: { roomAmenities: [null, "x", {}] },
        billing: { address: null },
        cancellationPolicy: "bad",
      }),
    ).not.toThrow();
  });
  it("allowlists original references and excludes separate service attempts and internal fields", () => {
    const r = guestReservationDetails(base, [
      {
        paymentId: "pay_original",
        amountPaise: 25000,
        status: "captured",
        signature: "secret",
      },
      {
        paymentId: "pay_extra",
        amountPaise: 100,
        status: "captured",
        stayQuote: true,
      },
      {
        reference: "UPI-reference",
        amountPaise: 100,
        type: "collection",
        method: "upi",
        actorId: "staff-secret",
      },
    ]);
    expect(r.paymentReferences).toEqual([
      { reference: "pay_original", method: "online" },
      { reference: "UPI-reference", method: "upi" },
    ]);
    expect(JSON.stringify(r)).not.toContain("secret");
  });
  it("does not report zero service totals when recorded payment amounts are malformed", () => {
    const r = guestReservationDetails({
      ...base,
      stayPaymentReceipts: [
        { paymentId: "pay", amountPaise: "1000", status: "paid" },
      ],
    });
    expect(r.servicePaymentsComplete).toBe(false);
    expect(r.supplementalPayments.paidPaise).toBeNull();
  });
  it("keeps saved service choices, timing and guest notes in private details", () => {
    const r = guestReservationDetails({
      ...base,
      customizations: [
        {
          name: "Pickup",
          variantInclusions: "Meet and greet",
          choiceLabels: { vehicle: "Sedan" },
          inputs: {
            serviceAt: "2027-01-15T10:00:00Z",
            people: 2,
            note: "Flight 123",
            secret: "do-not-copy",
          },
        },
      ],
    });
    expect(r.savedDetails.requests[0]).toMatchObject({
      variantInclusions: "Meet and greet",
      choiceLabels: ["Sedan"],
      inputs: { people: 2, note: "Flight 123" },
    });
    expect(JSON.stringify(r)).not.toContain("do-not-copy");
  });
});
