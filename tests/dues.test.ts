import { describe, expect, it } from "vitest";
import {
  allocate,
  duesPosition,
  rupeesSchema,
  validatePaymentDate,
  referenceKey,
  type Position,
} from "@/lib/dues/domain";
import { paymentHistory } from "@/lib/accounting/payments";
import { accountingFixture } from "./helpers/accounting";
import { assess } from "@/lib/accounting/domain";
import { summary, type Journal } from "@/lib/accounting/posting";
function position(
  id: string,
  amount: number,
  firstRecordedAt = "2026-11-24T00:00:00Z",
): Position {
  return {
    bookingId: id,
    reference: id,
    duesPaise: amount,
    firstRecordedAt,
    fingerprint: id,
    status: "Outstanding",
    collectible: true,
    reasons: [],
    details: {
      earnedCommissionPaise: amount,
      guestOutstandingPaise: 0,
      serviceIssues: [],
    },
  };
}
describe("hotel dues rules", () => {
  it("accepts precise positive rupee amounts and rejects blank, zero, excess precision and unsafe amounts", () => {
    expect(rupeesSchema.parse("350")).toBe(35000);
    expect(rupeesSchema.parse("0.01")).toBe(1);
    expect(rupeesSchema.parse("12.30")).toBe(1230);
    for (const value of [
      "",
      " ",
      "0",
      "-1",
      "1.001",
      "NaN",
      "1e3",
      "10000000.01",
    ])
      expect(rupeesSchema.safeParse(value).success).toBe(false);
  });
  it("allocates oldest first with consistent ties and leaves the correct remaining dues", () => {
    const allocation = allocate(
      [position("B", 30000), position("A", 20000)],
      35000,
    );
    expect(
      allocation.map((a) => [a.bookingId, a.amountPaise, a.afterPaise]),
    ).toEqual([
      ["A", 20000, 0],
      ["B", 15000, 15000],
    ]);
    expect(
      allocate(
        [
          position("A", 20000, "2026-11-25"),
          position("B", 30000, "2026-11-24"),
        ],
        35000,
      ).map((a) => a.bookingId),
    ).toEqual(["B", "A"]);
  });
  it("rejects overpayment and unresolved bookings", () => {
    expect(() => allocate([position("A", 20000)], 20001)).toThrow();
    expect(() =>
      allocate([{ ...position("A", 20000), collectible: false }], 1),
    ).toThrow();
    expect(() =>
      allocate([{ ...position("A", 20000), firstRecordedAt: null }], 1),
    ).toThrow();
  });
  it("uses saved accounting recognition as dues, with no new commission calculation", () => {
    const f = accountingFixture(0, 210000),
      expected = assess("booking", f.b, f.agreement, f.proof, f.sources);
    const journal = [
      ...expected.effects.map((e) => ({ ...e, id: e.key })),
      {
        id: "recognition",
        key: "recognition",
        type: "recognition",
        lines: expected.recognition,
      },
    ].map((e) => ({
      ...e,
      recordedAt: "2026-11-24T00:00:00Z",
      bookingId: "booking",
      propertyId: "hotel",
      currency: "INR",
    })) as Journal[];
    const evidence = {
      booking: f.b,
      agreement: f.agreement,
      proof: f.proof,
      sources: f.sources,
      journal,
      state: {
        enrolledAt: "yes",
        status: "recognized",
        processedAt: "yes",
        recognitionId: "recognition",
        summary: summary(journal),
      },
    };
    expect(duesPosition("booking", evidence)).toMatchObject({
      duesPaise: 20000,
      collectible: true,
    });
    evidence.state.summary.duesPaise = 30000;
    expect(duesPosition("booking", evidence).collectible).toBe(false);
  });
  it("compares references within hotel and method, trimming whitespace and normalizing case", () => {
    expect(referenceKey("hotel", "upi", " ref123 ")).toBe(
      referenceKey("hotel", "upi", "REF123"),
    );
    expect(referenceKey("hotel", "upi", "REF123")).not.toBe(
      referenceKey("other", "upi", "REF123"),
    );
    expect(referenceKey("hotel", "upi", "REF123")).not.toBe(
      referenceKey("hotel", "cash", "REF123"),
    );
  });
  it("rejects impossible and hotel-local future payment dates and missing timezone", () => {
    const now = new Date("2026-11-24T23:30:00Z");
    expect(() =>
      validatePaymentDate("2026-11-25", "Asia/Kolkata", now),
    ).not.toThrow();
    expect(() =>
      validatePaymentDate("2026-11-26", "Asia/Kolkata", now),
    ).toThrow();
    expect(() =>
      validatePaymentDate("2026-02-30", "Asia/Kolkata", now),
    ).toThrow();
    expect(() => validatePaymentDate("2026-11-24", null, now)).toThrow();
  });
});

describe("dues payment history", () => {
  it("keeps all booking links and one stable total for a payment allocated across bookings", () => {
    const entries = [
      { id: "a", bookingId: "A", amountPaise: 20000 },
      { id: "b", bookingId: "B", amountPaise: 15000 },
    ].map((e) => ({
      ...e,
      type: "dues_payment",
      sourcePath: "hotelDuesPaymentsV1/receipt",
      occurredAt: "2026-11-24T00:00:00Z",
    })) as Journal[];
    const rows = paymentHistory(entries, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bookingIds: ["A", "B"],
      amountPaise: 35000,
      direction: "in",
    });
    expect(paymentHistory([...entries].reverse(), [])[0]).toEqual(rows[0]);
    const corrected = paymentHistory(
      entries.map((e) => ({
        ...e,
        type: "dues_correction",
        sourcePath: "hotelDuesCorrectionsV1/receipt",
      })),
      [],
    );
    expect(corrected[0]).toMatchObject({
      bookingIds: ["A", "B"],
      amountPaise: 35000,
      direction: "record_only",
      status: "Corrected",
    });
  });
});
