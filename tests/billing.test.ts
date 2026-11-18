import { describe, expect, it } from "vitest";
import {
  billingCommand,
  reconciliation,
  remainingEntry,
  type BillingEntry,
} from "@/lib/partner/billing/domain";
import { stayFinancials } from "@/lib/stay/domain";
import { netBalance } from "@/lib/partner/reservations/domain";
import { reservationEligibility } from "@/lib/partner/reservations/eligibility";
import { rolePermissions } from "@/lib/partner/pms/domain";
const booking = {
  totalPaise: 10000,
  paidPaise: 5000,
  refundedPaise: 1000,
  refundDuePaise: 500,
  customizationCreditPaise: 1000,
  billingNetPaise: 2000,
  billingOpenCount: 1,
  bookingStatus: "checked_in",
};
const entry: BillingEntry = {
  id: "charge",
  amountPaise: 2000,
  type: "charge",
  originalEntryId: null,
};
const receipt = { id: "cash", type: "collection", amountPaise: 5000 };
describe("connected reservation billing", () => {
  it("uses one balance formula with hotel charges, existing credits and reserved refunds", () => {
    expect(stayFinancials(booking)).toEqual({
      effectiveTotalPaise: 11000,
      netPaidPaise: 3500,
      balanceDuePaise: 7500,
    });
    expect(netBalance(booking)).toBe(7000);
    const model = reconciliation(
      booking,
      [entry],
      [
        { ...receipt, amountPaise: 4500 },
        { id: "return", type: "refund", receiptId: "cash", amountPaise: 1000 },
      ],
      [{ id: "online", status: "captured", amountPaise: 500 }],
      [
        {
          id: "refund",
          paymentId: "online",
          amountPaise: 500,
          status: "pending",
        },
      ],
    );
    expect(model.warnings).toEqual([]);
    expect(model.reservation.pendingRefundPaise).toBe(500);
    expect(model.reservation.completedRefundPaise).toBe(1000);
    expect(
      model.refunds.some((r) => r.id === "return" && r.status === "completed"),
    ).toBe(true);
  });
  it("never counts authorization or failed attempts as received; retains authoritative money", () => {
    const model = reconciliation(
      booking,
      [entry],
      [],
      [{ id: "attempt", status: "authorized", amountPaise: 5000 }],
      [],
    );
    expect(model.reservation.receivedPaise).toBe(5000);
    expect(model.reservation.ledgerReceivedPaise).toBe(0);
    expect(model.warnings.join(" ")).toContain("receipt history needs review");
  });
  it("excludes reversals from received money and keeps pending distinct from completed", () => {
    const model = reconciliation(
      { totalPaise: 10000, paidPaise: 0 },
      [],
      [
        receipt,
        { id: "rev", receiptId: "cash", type: "reversal", amountPaise: 5000 },
      ],
      [],
      [],
    );
    expect(model.warnings).toEqual([]);
    expect(model.reservation.receivedPaise).toBe(0);
  });
  it("compensates original entries without mutating them", () => {
    const compensation: BillingEntry = {
      id: "void",
      amountPaise: -2000,
      originalEntryId: "charge",
      type: "compensation",
    };
    expect(remainingEntry(entry, [entry, compensation])).toBe(0);
    expect(entry.amountPaise).toBe(2000);
    expect(
      reconciliation({ totalPaise: 10000 }, [entry, compensation], [], [], [])
        .warnings,
    ).toEqual([]);
  });
  it("counts a combined service capture once and deduplicates allocation identities", () => {
    const a = {
      paymentId: "combined",
      requestId: "one",
      quoteVersion: 1,
      amountPaise: 2000,
      status: "paid",
    };
    const b = { ...a, requestId: "two", amountPaise: 3000 };
    const model = reconciliation(
      {
        totalPaise: 10000,
        stayPaymentReceipts: [a, b, a],
        customizations: [
          {
            id: "requested",
            agreementVersion: 2,
            settlement: "awaiting_customer",
            status: "requested",
            quote: { status: "offered", amountPaise: 9999 },
          },
        ],
      },
      [],
      [],
      [
        {
          id: "combined",
          status: "captured",
          stayQuote: true,
          amountPaise: 5000,
        },
      ],
      [],
    );
    expect(model.services.receivedPaise).toBe(5000);
    expect(model.services.totalPaise).toBe(0);
    expect(model.services.allocations).toHaveLength(2);
    expect(model.serviceWarnings).toContain(
      "Duplicate service receipt allocation combined:one:1; counted once.",
    );
    expect(model.serviceWarnings.join(" ")).toContain(
      "charge history needs review",
    );
    expect(model.services.refundableExcessPaise).toBe(0);
    expect(model.reservation.receivedPaise).toBe(0);
  });
  it.each([undefined, 2])(
    "retains paid quoted service charges for agreement version %s without double counting",
    (agreementVersion) => {
      const request = {
        id: "pickup",
        name: "Airport pickup",
        status: "confirmed",
        settlement: "paid",
        agreementVersion,
        quote: {
          version: 1,
          status: "accepted",
          amountPaise: 2000,
          paymentId: "capture",
          paymentStatus: "paid",
        },
      };
      const allocation = {
        requestId: "pickup",
        quoteVersion: 1,
        paymentId: "capture",
        amountPaise: 2000,
        status: "paid",
      };
      const model = reconciliation(
        {
          totalPaise: 10000,
          customizations: [request],
          stayPaymentReceipts: [allocation],
        },
        [],
        [],
        [
          {
            id: "capture-doc",
            paymentId: "capture",
            amountPaise: 2000,
            stayQuote: true,
            status: "captured",
          },
        ],
        [],
      );
      expect(model.serviceWarnings).toEqual([]);
      expect(model.services).toMatchObject({
        totalPaise: 2000,
        receivedPaise: 2000,
        balanceDuePaise: 0,
        refundableExcessPaise: 0,
      });
      expect(model.services.agreements).toHaveLength(1);
      expect(model.components.bookedExtras).toEqual([]);
    },
  );
  it.each(["refund_pending", "refunded"])(
    "preserves legacy service %s allocations without recommending another refund",
    (status) => {
      const model = reconciliation(
        {
          totalPaise: 10000,
          customizations: [
            {
              id: "pickup",
              status: "cancelled",
              settlement: "paid",
              quote: {
                version: 1,
                status: "accepted",
                amountPaise: 2000,
                paymentId: "capture",
                paymentStatus: status,
              },
            },
          ],
          stayPaymentReceipts: [
            {
              requestId: "pickup",
              quoteVersion: 1,
              paymentId: "capture",
              amountPaise: 2000,
              status,
            },
          ],
        },
        [],
        [],
        [{ id: "capture", amountPaise: 2000, stayQuote: true, status }],
        [
          {
            id: "refund",
            paymentId: "capture",
            amountPaise: 2000,
            stayQuote: true,
            status: status === "refunded" ? "processed" : "pending",
          },
        ],
      );
      expect(model.serviceWarnings).toEqual([]);
      expect(model.services).toMatchObject({
        totalPaise: 0,
        receivedPaise: 2000,
        balanceDuePaise: 0,
        refundableExcessPaise: 0,
        completedRefundPaise: status === "refunded" ? 2000 : 0,
        pendingRefundPaise: status === "refund_pending" ? 2000 : 0,
      });
    },
  );
  it("retains a legacy paid quote with missing receipt history and requires review", () => {
    const model = reconciliation(
      {
        totalPaise: 10000,
        customizations: [
          {
            id: "pickup",
            status: "confirmed",
            settlement: "paid",
            quote: {
              version: 1,
              status: "accepted",
              amountPaise: 2000,
              paymentId: "capture",
              paymentStatus: "paid",
            },
          },
        ],
      },
      [],
      [],
      [],
      [],
    );
    expect(model.services).toMatchObject({
      totalPaise: 2000,
      receivedPaise: 2000,
      refundableExcessPaise: 0,
    });
    expect(model.serviceWarnings.join(" ")).toContain("paid quote snapshot");
    expect(model.serviceWarnings.join(" ")).toContain(
      "no confirmed capture history",
    );
  });
  it("credits create unreserved refundable excess without moving money", () => {
    const credit: BillingEntry = {
      id: "credit",
      amountPaise: -2000,
      originalEntryId: null,
      type: "credit",
    };
    const model = reconciliation(
      {
        totalPaise: 10000,
        paidPaise: 10000,
        billingNetPaise: -2000,
        billingOpenCount: 1,
      },
      [credit],
      [{ ...receipt, amountPaise: 10000 }],
      [],
      [],
    );
    expect(model.reservation.refundableExcessPaise).toBe(2000);
    expect(model.reservation.completedRefundPaise).toBe(0);
  });
  it("checkout and cancellation eligibility see the same posted adjustments", () => {
    const result = reservationEligibility(
      booking,
      rolePermissions.owner,
      { allocation: true, payments: true, amendments: true },
      Date.now(),
      { policies: { requireSettledBalance: true } },
    );
    expect(
      result.checked_out.blockers.some(
        (b) => b.code === "RESERVATION_BALANCE_DUE",
      ),
    ).toBe(true);
    const cancelled = reservationEligibility(
      { ...booking, bookingStatus: "confirmed" },
      rolePermissions.owner,
      { allocation: true, payments: true, amendments: true },
      Date.now(),
    );
    expect(cancelled.cancelled.reason).toContain("Billing review required");
  });
  it("limits posting and adjusting to owners/managers without broadening cashier access", () => {
    for (const role of ["owner", "manager"] as const)
      expect(rolePermissions[role]).toContain("billing.adjust");
    for (const role of ["cashier", "receptionist"] as const)
      expect(rolePermissions[role]).not.toContain("billing.post");
    expect(rolePermissions.cashier).not.toContain("reservation.read");
  });
  it("rejects fractional and unsafe amounts, tax fields and missing explanations", () => {
    const input = {
      action: "post",
      expectedRevision: 0,
      category: "other",
      description: "Agreed charge",
      amountPaise: 100,
      details: { explanation: "Agreed incident charge" },
    };
    expect(billingCommand.safeParse(input).success).toBe(true);
    for (const amountPaise of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(billingCommand.safeParse({ ...input, amountPaise }).success).toBe(
        false,
      );
    expect(billingCommand.safeParse({ ...input, taxPaise: 100 }).success).toBe(
      false,
    );
    expect(billingCommand.safeParse({ ...input, details: {} }).success).toBe(
      false,
    );
  });
  it("deduplicates confirmed provider source references without manufacturing balancing money", () => {
    const model = reconciliation(
      { totalPaise: 10000, paidPaise: 5000 },
      [],
      [],
      [
        {
          id: "source",
          paymentId: "provider-payment",
          status: "captured",
          amountPaise: 5000,
        },
        {
          id: "duplicate",
          paymentId: "provider-payment",
          status: "captured",
          amountPaise: 5000,
        },
      ],
      [],
    );
    expect(model.reservation.ledgerReceivedPaise).toBe(5000);
    expect(model.warnings).toContain(
      "Duplicate capture source provider-payment; counted once.",
    );
  });
  it("counts mixed legacy and version-two services from one capture and duplicate allocations only once", () => {
    const requests = [undefined, 2].map((agreementVersion, index) => ({
      id: `service-${index}`,
      name: "Transport",
      agreementVersion,
      status: "confirmed",
      settlement: "paid",
      quote: {
        version: 1,
        status: "accepted",
        amountPaise: 2000,
        paymentId: "combined",
        paymentStatus: "paid",
      },
    }));
    const receipts = requests.map((r) => ({
      requestId: r.id,
      quoteVersion: 1,
      paymentId: "combined",
      amountPaise: 2000,
      status: "paid",
    }));
    const model = reconciliation(
      {
        totalPaise: 10000,
        customizations: requests,
        stayPaymentReceipts: [...receipts, receipts[0]],
      },
      [],
      [],
      [
        {
          id: "combined",
          amountPaise: 4000,
          stayQuote: true,
          status: "captured",
        },
      ],
      [],
    );
    expect(model.services).toMatchObject({
      totalPaise: 4000,
      receivedPaise: 4000,
      balanceDuePaise: 0,
      refundableExcessPaise: 0,
    });
    expect(model.services.allocations).toHaveLength(2);
    expect(model.serviceWarnings).toEqual([
      "Duplicate service receipt allocation combined:service-0:1; counted once.",
    ]);
  });
  it("requires review instead of offering a refund when a legacy receipt no longer matches its quoted charge", () => {
    const model = reconciliation(
      {
        totalPaise: 10000,
        customizations: [
          {
            id: "pickup",
            status: "confirmed",
            settlement: "paid",
            quote: {
              version: 2,
              status: "accepted",
              amountPaise: 1000,
              paymentId: "capture",
              paymentStatus: "paid",
            },
          },
        ],
        stayPaymentReceipts: [
          {
            requestId: "pickup",
            quoteVersion: 1,
            paymentId: "capture",
            amountPaise: 2000,
            status: "paid",
          },
        ],
      },
      [],
      [],
      [
        {
          id: "capture",
          amountPaise: 2000,
          stayQuote: true,
          status: "captured",
        },
      ],
      [],
    );
    expect(model.serviceWarnings.join(" ")).toContain(
      "charge history needs review",
    );
    expect(model.services.refundableExcessPaise).toBe(0);
  });
});
