import { describe, expect, it } from "vitest";
import {
  formatActivityType,
  formatPaymentMethod,
  formatOwnership,
  formatMoney,
  formatClosingDate,
  formatClosingDateTime,
  formatPlural,
  parseTotalsKey,
  parseBlockerString,
  computeDailyKpis,
} from "@/components/partner/closing/closing-formatters";

describe("closing formatters and text sanitization", () => {
  it("translates raw database activity tokens into executive user copy", () => {
    expect(formatActivityType("collection")).toBe("Property collection");
    expect(formatActivityType("cash_return_or_property_refund")).toBe("Property refund");
    expect(formatActivityType("correction")).toBe("Receipt reversal");
    expect(formatActivityType("provider_capture")).toBe("Online payment");
    expect(formatActivityType("provider_return")).toBe("Online refund");
  });

  it("translates raw payment methods and ownership enums", () => {
    expect(formatPaymentMethod("cash")).toBe("Cash drawer");
    expect(formatPaymentMethod("upi")).toBe("UPI");
    expect(formatPaymentMethod("card")).toBe("Card terminal");
    expect(formatPaymentMethod("provider")).toBe("Online gateway");

    expect(formatOwnership("reservation")).toBe("Room & stay");
    expect(formatOwnership("supplemental_service")).toBe("Add-on service");
  });

  it("formats paise integers to readable INR currency", () => {
    expect(formatMoney(100000)).toBe("₹1,000.00");
    expect(formatMoney(0)).toBe("₹0.00");
    expect(formatMoney(450)).toBe("₹4.50");
  });

  it("formats dates and datetimes in hotel timezone", () => {
    expect(formatClosingDate("2026-11-15", "Asia/Kolkata")).toBe("15 Nov 2026");
    expect(formatClosingDateTime("2026-11-15T18:30:00Z", "Asia/Kolkata")).toContain("2026");
  });

  it("handles singular and plural labels with correct grammar", () => {
    expect(formatPlural(1, "pending refund")).toBe("1 pending refund");
    expect(formatPlural(3, "pending refund")).toBe("3 pending refunds");
    expect(formatPlural(0, "open shift")).toBe("0 open shifts");
  });

  it("parses slash-delimited activity totals key into distinct categories", () => {
    const parsed = parseTotalsKey("collection / cash / reservation");
    expect(parsed.typeLabel).toBe("Property collection");
    expect(parsed.methodLabel).toBe("Cash drawer");
    expect(parsed.ownershipLabel).toBe("Room & stay");
  });

  it("parses raw blocker strings and extracts human-readable booking info", () => {
    const bookingLookup = new Map([
      ["3rbrjFGTNRcS0Gu3Ej4S", { confirmationCode: "KNP012364", leadGuest: { name: "Deepak" } }],
    ]);

    const blocker = parseBlockerString(
      "3rbrjFGTNRcS0Gu3Ej4S: Received ledger ₹0.00 differs from authoritative booking received ₹900.00: receipt history needs review.",
      bookingLookup,
    );

    expect(blocker.category).toBe("ledger");
    expect(blocker.bookingReference).toBe("KNP012364");
    expect(blocker.guestName).toBe("Deepak");
    expect(blocker.title).toContain("KNP012364 (Deepak)");
  });

  it("correctly computes daily KPIs without mutating sources", () => {
    const model = {
      activityTotals: {
        "collection / cash / reservation": { amountPaise: 50000, count: 2 },
        "cash_return_or_property_refund / cash / reservation": { amountPaise: 10000, count: 1 },
      },
      shiftSummaries: [
        { status: "closed", expectedPaise: 40000, countedPaise: 40000, differencePaise: 0 },
      ],
      unresolved: [
        { reservationBalancePaise: 80000, serviceBalancePaise: 10000 },
      ],
      pendingRefunds: [{ amountPaise: 70000 }],
      blockers: ["Some blocker"],
    };

    const kpis = computeDailyKpis(model);
    expect(kpis.dayCollectionsPaise).toBe(50000);
    expect(kpis.dayRefundsPaise).toBe(10000);
    expect(kpis.dayNetPaise).toBe(40000);
    expect(kpis.daySourceCount).toBe(3);
    expect(kpis.outstandingBalancePaise).toBe(90000);
    expect(kpis.pendingRefundPaise).toBe(70000);
    expect(kpis.blockersCount).toBe(1);
  });
});
