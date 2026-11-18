import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cashTotals,
  closingFlags,
  dayCommand,
  shiftCommand,
} from "@/lib/partner/closing/domain";
import { can } from "@/lib/partner/pms/domain";
import { localParts } from "@/lib/booking/domain";
import {
  describeCashTransaction,
  formatFriendlyTimezone,
  isDefinitiveClosingError,
  parseRupeesToPaise,
  tryParseRupeesToPaise,
} from "@/lib/partner/closing/client-types";
afterEach(() => vi.unstubAllEnvs());
describe("shift accounting", () => {
  it("separates collections, physical returns and historical corrections", () => {
    const r = (
      id: string,
      type: string,
      amountPaise: number,
      cashEffectPaise: number,
    ) => ({ id, shiftId: "s", type, amountPaise, cashEffectPaise });
    expect(
      cashTotals([
        r("1", "collection", 10001, 10001),
        r("2", "refund", 3000, -3000),
        r("3", "reversal", 2000, 0),
        r("4", "reversal", 1000, -1000),
      ]),
    ).toEqual({
      collectedPaise: 9001,
      returnedPaise: 3000,
      correctionsPaise: 3000,
      sourceCount: 4,
    });
    expect(() => cashTotals([r("x", "refund", 100, 100)])).toThrow();
  });
  it("allows only the fixed operating and management roles", () => {
    for (const role of ["owner", "manager", "cashier"])
      expect(can(role, "shift.operate")).toBe(true);
    for (const role of ["receptionist", "housekeeper", "maintenance"])
      expect(can(role, "shift.operate")).toBe(false);
    expect(can("cashier", "closing.manage")).toBe(false);
    expect(can("cashier", "shift.history")).toBe(false);
    expect(can("manager", "closing.manage")).toBe(true);
  });
  it.each([undefined, "", "false", "true"])("is available regardless of legacy environment settings (%s)", (value) => {
    vi.stubEnv("PARTNER_CASHIER_SHIFTS", value);
    vi.stubEnv("PARTNER_DAILY_CLOSING", value);
    expect(closingFlags()).toEqual({shifts:true,daily:true});
  });
  it("rejects fractional paise and invalid calendar days", () => {
    expect(
      shiftCommand.safeParse({ action: "open", openingPaise: 1.1 }).success,
    ).toBe(false);
    expect(
      shiftCommand.safeParse({ action: "open", openingPaise: 0 }).success,
    ).toBe(true);
    expect(
      dayCommand.safeParse({
        date: "2026-02-30",
        version: "a".repeat(64),
        note: "",
        acknowledge: true,
      }).success,
    ).toBe(false);
  });
  it("dates midnight activity using the hotel timezone", () => {
    expect(
      localParts(Date.parse("2026-11-14T18:29:59Z"), "Asia/Kolkata").date,
    ).toBe("2026-11-14");
    expect(
      localParts(Date.parse("2026-11-14T18:30:00Z"), "Asia/Kolkata").date,
    ).toBe("2026-11-15");
  });
  it("parses rupees to paise with trim and validates caps accurately", () => {
    expect(parseRupeesToPaise("  100.01 ")).toBe(10001);
    expect(parseRupeesToPaise("0")).toBe(0);
    expect(parseRupeesToPaise("19.99")).toBe(1999);
    expect(() => parseRupeesToPaise("1000000.01")).toThrow("Amount cannot exceed ₹10,00,000.");
    expect(() => parseRupeesToPaise("-1")).toThrow("Enter an exact nonnegative amount");
    expect(() => parseRupeesToPaise("abc")).toThrow("Enter an exact nonnegative amount");
    expect(tryParseRupeesToPaise("50.50")).toEqual({ ok: true, paise: 5050 });
    expect(tryParseRupeesToPaise("bad").ok).toBe(false);
  });
  it("describes cash transactions with human-readable labels and signed amounts", () => {
    expect(
      describeCashTransaction({ type: "collection", amountPaise: 150000, cashEffectPaise: 150000 }),
    ).toEqual({
      label: "Cash collected",
      tone: "emerald",
      signedCashEffect: "+₹1,500.00",
      hasDrawerImpact: true,
    });
    expect(
      describeCashTransaction({ type: "refund", amountPaise: 50000, cashEffectPaise: -50000 }),
    ).toEqual({
      label: "Cash refunded",
      tone: "rose",
      signedCashEffect: "-₹500.00",
      hasDrawerImpact: true,
    });
    expect(
      describeCashTransaction({ type: "reversal", amountPaise: 30000, cashEffectPaise: -30000 }),
    ).toEqual({
      label: "Same-shift reversal",
      tone: "amber",
      signedCashEffect: "-₹300.00",
      hasDrawerImpact: true,
    });
    expect(
      describeCashTransaction({ type: "reversal", amountPaise: 30000, cashEffectPaise: 0 }),
    ).toEqual({
      label: "Past-shift correction",
      tone: "slate",
      signedCashEffect: "No drawer impact",
      hasDrawerImpact: false,
    });
  });
  it("formats friendly timezones and checks definitive error codes", () => {
    expect(formatFriendlyTimezone("Asia/Kolkata")).toBe("India Time (IST)");
    expect(formatFriendlyTimezone("America/New_York")).toBe("Local time (New York)");
    expect(isDefinitiveClosingError("FORBIDDEN")).toBe(true);
    expect(isDefinitiveClosingError("UNKNOWN_NETWORK_ERROR")).toBe(false);
  });
});
