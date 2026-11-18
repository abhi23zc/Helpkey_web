import { describe, expect, it } from "vitest";
import { can } from "@/lib/partner/pms/domain";
import {
  documentNumber,
  documentSources,
  emptyState,
  hotelDate,
  reductions,
  settingsBlockers,
  settingsSchema,
  validateParticular,
} from "@/lib/partner/invoices/domain";
import { printDocument } from "@/lib/partner/invoices/print";
import { seller, customer, particulars } from "./fixtures/invoices";
describe("hotel documents", () => {
  it("separates invoice permissions from operational roles", () => {
    for (const role of ["owner", "manager"])
      for (const p of [
        "invoice.settings",
        "invoice.issue",
        "invoice.credit",
        "invoice.read",
      ] as const)
        expect(can(role, p)).toBe(true);
    expect(can("cashier", "invoice.read")).toBe(true);
    for (const p of [
      "invoice.issue",
      "invoice.credit",
      "invoice.settings",
    ] as const)
      expect(can("cashier", p)).toBe(false);
    for (const role of ["receptionist", "housekeeper", "maintenance"])
      expect(can(role, "invoice.read")).toBe(false);
  });
  it("uses hotel-local issuance date and Indian financial-year boundaries", () => {
    expect(hotelDate(new Date("2026-03-31T18:29:59Z"), "Asia/Kolkata")).toEqual(
      { date: "2026-03-31", financialYear: "2025-26" },
    );
    expect(hotelDate(new Date("2026-03-31T18:30:00Z"), "Asia/Kolkata")).toEqual(
      { date: "2026-04-01", financialYear: "2026-27" },
    );
    expect(documentNumber("INV", "2026-27", 1)).toBe("INV/2627/1");
    expect(() => documentNumber("LONG", "2026-27", 10000000)).toThrow();
    expect(
      settingsSchema.safeParse({ ...seller, creditSeries: "INV" }).success,
    ).toBe(false);
  });
  it("blocks unsupported requirements and refuses inferred or inconsistent tax", () => {
    expect(
      settingsBlockers({ ...seller, registration: "composition" }),
    ).not.toHaveLength(0);
    expect(settingsBlockers({ ...seller, irpRequired: true })).not.toHaveLength(
      0,
    );
    expect(validateParticular(particulars(), 10000, seller)).toEqual([]);
    expect(
      settingsSchema.safeParse({ ...seller, stateCode: "96" }).success,
    ).toBe(false);
    expect(
      validateParticular({ ...particulars(), cgstPaise: 500 }, 10500, seller),
    ).not.toHaveLength(0);
    const registered = {
      ...seller,
      registration: "registered" as const,
      gstin: "27ABCDE1234F1Z5",
    };
    const p = {
      ...particulars(),
      cgstRate: 9,
      sgstRate: 9,
      cgstPaise: 900,
      sgstPaise: 900,
    };
    expect(validateParticular(p, 11800, registered)).toEqual([]);
    expect(
      validateParticular({ ...p, cgstPaise: 901 }, 11801, registered),
    ).not.toHaveLength(0);
  });
  it("nets correction families instead of treating gross compensation as a reduction", () => {
    const entries = [
      { id: "a", type: "charge", amountPaise: 2000, originalEntryId: null },
      {
        id: "b",
        type: "compensation",
        amountPaise: -2000,
        originalEntryId: "a",
      },
      {
        id: "c",
        type: "charge",
        amountPaise: 1500,
        originalEntryId: null,
        replacesEntryId: "a",
      },
    ];
    const lines = documentSources({ totalPaise: 10000 }, entries);
    expect(lines.find((l) => l.id === "entry:a")?.amountPaise).toBe(1500);
    expect(
      reductions(lines, { ...emptyState(), claims: { "entry:a": 2000 } }).find(
        (l) => l.id === "entry:a",
      )?.amountPaise,
    ).toBe(500);
  });
  it("preserves exact booked-extra sources and rejects inconsistent legacy credit ownership", () => {
    const b = {
      totalPaise: 12000,
      extrasTotalPaise: 2000,
      customizationCreditPaise: 2000,
      customizations: [
        {
          id: "breakfast",
          name: "Breakfast",
          settlement: "included",
          totalPaise: 2000,
          status: "declined",
        },
      ],
    };
    expect(documentSources(b, [])).toEqual([
      {
        id: "booking",
        description: "Reserved accommodation",
        amountPaise: 10000,
      },
      { id: "extra:breakfast", description: "Breakfast", amountPaise: 0 },
    ]);
    expect(() =>
      documentSources({ ...b, customizationCreditPaise: 1000 }, []),
    ).toThrow();
    expect(() =>
      documentSources({ ...b, extrasTotalPaise: 3000 }, []),
    ).toThrow();
  });
  it("prints only immutable document fields and escapes customer text", () => {
    const html = printDocument({
      seller,
      customer: { ...customer, name: "<script>bad</script>" },
      documentType: "ordinary_invoice",
      invoiceNumber: "INV/2627/1",
      date: "2026-11-14",
      financialYear: "2026-27",
      totalPaise: 10000,
      lines: [{ ...particulars(), sign: 1, amountPaise: 10000 }],
      settlementAtIssuance: { netPaidPaise: 0, balanceDuePaise: 10000 },
      privateNotes: "SECRET",
      guestIdentity: "AADHAAR",
    });
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
    expect(html).not.toContain("SECRET");
    expect(html).not.toContain("AADHAAR");
    expect(html).not.toContain(particulars().provenance);
  });
  it("prints escaped original line references and explicitly labels historical missing references", () => {
    const note = {
      seller,
      customer,
      documentType: "credit_note",
      invoiceNumber: "CN/2627/1",
      date: "2026-11-14",
      financialYear: "2026-27",
      totalPaise: 500,
      original: { number: "INV/2627/1", date: "2026-11-14" },
      reason: "Agreed credit",
      lines: [
        {
          ...particulars("entry:credit", 500),
          sign: 1,
          amountPaise: 500,
          originalLineId: "2<script>",
          originalSourceId: "entry:laundry",
        },
      ],
      settlementAtIssuance: { netPaidPaise: 0, balanceDuePaise: 9500 },
    };
    const html = printDocument(note);
    expect(html).toContain(
      "Original invoice line: 2&lt;script&gt; · source entry:laundry",
    );
    expect(html).not.toContain("2<script>");
    expect(
      printDocument({
        ...note,
        lines: [
          { ...particulars("entry:credit", 500), sign: 1, amountPaise: 500 },
        ],
      }),
    ).toContain(
      "Original line reference unavailable in this historical document.",
    );
  });
});
