import { describe, expect, it } from "vitest";
import {
  bankSchema,
  commercialTerms,
  readinessStatus,
  businessComplete,
  requiresBankAcknowledgement,
} from "@/lib/payout-readiness/domain";
import {
  encryptAccount,
  decryptAccount,
  protectedFingerprint,
  bankStorageAvailable,
} from "@/lib/payout-readiness/crypto";
const bank = {
  holderName: "Example Owner",
  accountNumber: "001234567890",
  confirmation: "001234567890",
  ifsc: "HDFC0001234",
  bankName: "Example Bank",
};
describe("payout readiness and private encryption", () => {
  it("preserves leading zeroes and rejects mismatched confirmation and malformed accounts", () => {
    expect(bankSchema.parse(bank).accountNumber).toBe("001234567890");
    for (const patch of [
      { confirmation: "1234567890" },
      { accountNumber: "00 1234567890" },
      { ifsc: "HDFC1001234" },
    ])
      expect(bankSchema.safeParse({ ...bank, ...patch }).success).toBe(false);
  });
  it("prioritises incomplete setup, then bank review", () => {
    expect(
      readinessStatus(
        { business: true, bank: true, commercial: false },
        { business: false, bank: false, commercial: false },
      ),
    ).toMatchObject({ status: "Setup incomplete", next: "commercial" });
    expect(
      readinessStatus(
        { business: true, bank: true, commercial: true },
        { business: false, bank: false, commercial: false },
      ).next,
    ).toBe("bank");
    expect(
      readinessStatus(
        { business: true, bank: true, commercial: true },
        { business: true, bank: true, commercial: true },
      ).status,
    ).toBe("Ready for payouts");
  });
  it("reviews effective relevant terms including inheritance, excluding dues and unused weekdays", () => {
    const global = {
      commissionBasisPoints: 1000,
      commissionBasis: "rooms" as const,
      marketplaceCommission: true,
      directCommission: false,
      walkInCommission: false,
      payoutCycle: "daily" as const,
      payoutDelayDays: 2,
      minimumPayoutPaise: 0,
    };
    const a = commercialTerms(global, {});
    expect(a.complete).toBe(true);
    expect(
      commercialTerms(
        { ...global, duesGraceDays: 10, payoutWeekday: "monday" },
        {},
      ).fingerprintInput,
    ).toBe(a.fingerprintInput);
    expect(
      commercialTerms(global, { payoutDelayDays: 2 }).fingerprintInput,
    ).not.toBe(a.fingerprintInput);
    expect(
      commercialTerms({ ...global, payoutCycle: "weekly" }, {}).complete,
    ).toBe(false);
  });
  it("allows a business profile without tax registration and requires a usable identity", () => {
    const b = {
      source: "profile" as const,
      businessName: "Sample",
      address: {
        line1: "123 Road",
        city: "Pune",
        state: "Maharashtra",
        postalCode: "411001",
      },
      contact: "+919876543210",
      registration: null,
      gstin: null,
      pan: null,
      state: null,
      stateCode: null,
    };
    expect(businessComplete(b)).toBe(true);
    expect(businessComplete({ ...b, contact: "" })).toBe(false);
    expect(businessComplete({ ...b, registration: "registered" })).toBe(false);
  });
  it("authenticates encrypted accounts against ownership and fails closed without a dedicated key", () => {
    const previous = process.env.HOTEL_BANK_ENCRYPTION_KEY;
    try {
      process.env.HOTEL_BANK_ENCRYPTION_KEY = "a1".repeat(32);
      const encrypted = encryptAccount(bank.accountNumber, "hotel/owner");
      expect(JSON.stringify(encrypted)).not.toContain(bank.accountNumber);
      expect(decryptAccount(encrypted, "hotel/owner")).toBe(bank.accountNumber);
      expect(() => decryptAccount(encrypted, "hotel/new-owner")).toThrow();
      expect(protectedFingerprint(bank.accountNumber)).not.toContain(
        bank.accountNumber,
      );
      delete process.env.HOTEL_BANK_ENCRYPTION_KEY;
      expect(bankStorageAvailable()).toBe(false);
      expect(() => encryptAccount(bank.accountNumber, "hotel/owner")).toThrow();
    } finally {
      if (previous === undefined) delete process.env.HOTEL_BANK_ENCRYPTION_KEY;
      else process.env.HOTEL_BANK_ENCRYPTION_KEY = previous;
    }
  });
  it("supports local passphrases without changing existing hexadecimal key encryption", () => {
    const previous = process.env.HOTEL_BANK_ENCRYPTION_KEY;
    try {
      process.env.HOTEL_BANK_ENCRYPTION_KEY = "local-test-passphrase";
      expect(bankStorageAvailable()).toBe(true);
      const encrypted = encryptAccount(bank.accountNumber, "local/hotel");
      expect(decryptAccount(encrypted, "local/hotel")).toBe(bank.accountNumber);
      process.env.HOTEL_BANK_ENCRYPTION_KEY = "short";
      expect(bankStorageAvailable()).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.HOTEL_BANK_ENCRYPTION_KEY;
      else process.env.HOTEL_BANK_ENCRYPTION_KEY = previous;
    }
  });
  it("requires an acknowledgement for unknown and changed baselines", () => {
    expect(requiresBankAcknowledgement(null, "v1")).toBe(true);
    expect(
      requiresBankAcknowledgement(
        { ...bank, maskedAccount: "•••• 7890", version: "v1" },
        "v2",
      ),
    ).toBe(true);
    expect(
      requiresBankAcknowledgement(
        { ...bank, maskedAccount: "•••• 7890", version: "v1" },
        "v1",
      ),
    ).toBe(false);
  });
});
