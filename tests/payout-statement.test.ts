import { describe, expect, it } from "vitest";
import { unknownDeductions } from "@/lib/payouts/domain";
import type { Payout } from "@/lib/payouts/service";
import {
  assessmentFromDraft,
  deductionDraft,
  draftDeductionTotal,
  parseDeductionAmount,
} from "@/lib/payouts/assessment-input";
import {
  renderSettlementStatement,
  settlementResponse,
  settlementStatement,
} from "@/lib/payouts/statement";

function fixture(): Payout & { reviewWarnings: string[] } {
  return {
    id: "private-id",
    propertyId: "hotel",
    hotelName: "Test <Hotel>",
    reference: "HKP-EXAMPLE",
    status: "Prepared",
    createdAt: "2026-11-25T00:00:00Z",
    actorId: "SECRET-ACTOR",
    policy: { timezone: "Asia/Kolkata", hotelRevision: 999 },
    grossPaise: 190000,
    deductionsPaise: 2000,
    finalPaise: 188000,
    bookings: [
      {
        bookingId: "private-booking",
        reference: "BOOKING-A",
        fingerprint: "SECRET-FINGERPRINT",
        grossPaise: 190000,
        deductionsPaise: 2000,
        finalPaise: 188000,
        verifiedOnlinePaise: 210000,
        hotelCollectionsPaise: 0,
        commissionPaise: 20000,
        checkoutAt: "2026-11-23T00:00:00Z",
        savedDelayDays: 2,
        eligibleAt: "2026-11-25T00:00:00Z",
        agreementGlobalRevision: 1,
        agreementHotelRevision: 1,
        assessment: {
          version: 1,
          actorId: "SECRET-ACTOR",
          assessedAt: "2026-11-25T00:00:00Z",
          fingerprint: "SECRET-FINGERPRINT",
          items: {
            commissionTax: {
              status: "amount",
              amountPaise: 0,
              reason: "SECRET-REASON",
            },
            statutory: { status: "not_applicable", reason: "SECRET-REASON" },
            gatewayFees: {
              status: "amount",
              amountPaise: 2000,
              reason: "SECRET-REASON",
            },
            other: {
              status: "amount",
              amountPaise: 0,
              reason: "SECRET-REASON",
            },
          },
        },
      },
    ],
    reviewWarnings: [],
  };
}
describe("deduction review input", () => {
  it("keeps unknown, confirmed zero, amount and not applicable distinct", () => {
    const draft = deductionDraft(unknownDeductions());
    expect(draftDeductionTotal(draft)).toBeNull();
    expect(() => assessmentFromDraft(draft, 190000)).toThrow(
      /Review commission tax/,
    );
    const complete = deductionDraft(fixture().bookings[0].assessment.items);
    expect(complete.commissionTax.choice).toBe("zero");
    expect(complete.statutory.choice).toBe("not_applicable");
    expect(complete.gatewayFees.choice).toBe("amount");
    expect(draftDeductionTotal(complete)).toBe(2000);
    expect(assessmentFromDraft(complete, 190000)).toEqual(
      fixture().bookings[0].assessment.items,
    );
    complete.gatewayFees.amount = "";
    expect(draftDeductionTotal(complete)).toBeNull();
    expect(() => assessmentFromDraft(complete, 190000)).toThrow(
      /Blank amounts/,
    );
  });
  it("parses precise rupees and rejects unsafe, negative and malformed amounts", () => {
    expect(parseDeductionAmount(" 20.01 ")).toBe(2001);
    expect(parseDeductionAmount("0")).toBe(0);
    expect(parseDeductionAmount("10000000")).toBe(1_000_000_000);
    for (const value of [
      "",
      " ",
      "-1",
      "20.001",
      "1e3",
      "Infinity",
      "NaN",
      "10000000.01",
    ])
      expect(() => parseDeductionAmount(value)).toThrow();
  });
  it("requires reasons and a positive payment after deductions", () => {
    const draft = deductionDraft(fixture().bookings[0].assessment.items);
    draft.other.reason = " ";
    expect(() => assessmentFromDraft(draft, 190000)).toThrow(/reason/);
    draft.other.reason = "Verified zero";
    draft.gatewayFees.amount = "1900";
    expect(() => assessmentFromDraft(draft, 190000)).toThrow(/positive/);
    draft.gatewayFees.amount = "1900.01";
    expect(() => assessmentFromDraft(draft, 190000)).toThrow(/positive/);
  });
});
describe("saved settlement statement", () => {
  it("uses saved amounts, itemises categories and omits internal data", () => {
    const p = fixture();
    p.status = "Paid";
    p.payment = {
      paymentDate: "2026-11-25",
      method: "bank_transfer",
      reference: "BANK-REFERENCE",
      notes: "SECRET-NOTES",
      actorId: "SECRET-ACTOR",
      recordedAt: "2026-11-25T00:00:00Z",
    };
    const s = settlementStatement(p),
      html = renderSettlementStatement(s);
    expect(s).toMatchObject({
      grossPaise: 190000,
      deductionsPaise: 2000,
      finalPaise: 188000,
    });
    expect(s.deductions.map((d) => d.status)).toEqual([
      "confirmed_zero",
      "not_applicable",
      "amount",
      "confirmed_zero",
    ]);
    expect(html).toContain("₹1,880.00");
    expect(html).toContain("₹20.00");
    expect(html).toContain("BANK-REFERENCE");
    expect(html).toContain("Payment recorded");
    expect(JSON.stringify(s) + html).not.toMatch(
      /SECRET-|private-booking|hotelRevision|assessedAt/,
    );
    expect(html).toContain("Test &lt;Hotel&gt;");
  });
  it("shows absent historical amounts as unavailable, not zero", () => {
    const p = fixture();
    delete (p.bookings[0] as Partial<(typeof p.bookings)[number]>)
      .commissionPaise;
    delete (
      p.bookings[0].assessment.items as Partial<
        (typeof p.bookings)[number]["assessment"]["items"]
      >
    ).gatewayFees;
    const s = settlementStatement(p);
    expect(s.bookings[0].commissionPaise).toBeNull();
    expect(s.deductions[2]).toMatchObject({
      status: "not_reviewed",
      amountPaise: null,
    });
    expect(renderSettlementStatement(s)).toContain("Not available");
    expect(renderSettlementStatement(s)).toContain("Not reviewed");
  });
  it("preserves lifecycle labels and flags later changes without changing amounts", () => {
    const p = fixture();
    expect(renderSettlementStatement(settlementStatement(p))).toContain(
      "Payment has not been recorded",
    );
    p.status = "Cancelled";
    expect(renderSettlementStatement(settlementStatement(p))).toContain(
      "not evidence of a completed payment",
    );
    p.status = "Paid";
    p.reviewWarnings = ["SECRET-DETAILS"];
    const s = settlementStatement(p);
    expect(s.finalPaise).toBe(188000);
    expect(renderSettlementStatement(s)).toContain(
      "Accounting review required",
    );
    expect(renderSettlementStatement(s)).not.toContain("SECRET-DETAILS");
  });
  it("escapes every untrusted statement field and returns private HTML", async () => {
    const p = fixture(),
      payload = '<img src=x onerror="alert(1)">';
    p.hotelName = payload;
    p.reference = payload;
    p.bookings[0].reference = payload;
    const response = settlementResponse(settlementStatement(p)),
      html = await response.text();
    expect(html).not.toContain(payload);
    expect(html).toContain("&lt;img");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(html).toContain("window.print()");
    expect(html).toContain("thead{display:table-header-group}");
  });
});
