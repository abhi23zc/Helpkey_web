import { z } from "zod";
import { ApiException } from "../../api/errors";
import type { BillingEntry } from "../billing/domain";
import type { RecordData } from "../dashboard/domain";
const text = z.string().trim().min(1).max(500);
const money = z.number().int().nonnegative().max(100_000_000);
const indianStateCode = z
  .string()
  .regex(
    /^(0[1-9]|[12][0-9]|3[0-8]|97)$/,
    "Use a supported Indian state/territory code. Foreign supplies are unavailable.",
  );
const gstin = z
  .string()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/);
export const identity = z
  .object({
    name: text,
    address: text,
    state: text,
    stateCode: indianStateCode,
    gstin: z.union([gstin, z.literal("")]),
    deliveryAddress: text,
  })
  .strict();
export const settingsSchema = z
  .object({
    country: z.literal("IN"),
    legalName: text,
    address: text,
    state: text,
    stateCode: indianStateCode,
    contact: text,
    registration: z.enum([
      "unregistered",
      "registered",
      "composition",
      "exempt",
    ]),
    gstin: z.union([gstin, z.literal("")]),
    irpRequired: z.boolean(),
    accountantConfirmed: z.literal(true),
    invoiceSeries: z.string().regex(/^[A-Za-z][A-Za-z0-9/-]{0,3}$/),
    creditSeries: z.string().regex(/^[A-Za-z][A-Za-z0-9/-]{0,3}$/),
    invoiceStart: z.number().int().min(1).max(999999),
    creditStart: z.number().int().min(1).max(999999),
    signatory: text,
    signatoryDesignation: text,
    footer: z.string().trim().max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.invoiceSeries === v.creditSeries)
      ctx.addIssue({
        code: "custom",
        message: "Use separate invoice and credit-note series.",
      });
    if (
      v.registration === "registered" &&
      (!v.gstin || !v.gstin.startsWith(v.stateCode))
    )
      ctx.addIssue({
        code: "custom",
        message: "A matching seller GSTIN and state code are required.",
      });
    if (v.registration === "unregistered" && v.gstin)
      ctx.addIssue({
        code: "custom",
        message: "Unregistered sellers cannot collect GST.",
      });
  });
export type InvoiceSettings = z.infer<typeof settingsSchema>;
export const particular = z
  .object({
    sourceId: text,
    description: text,
    quantity: z.number().int().positive().max(10000),
    unit: text,
    taxablePaise: money,
    cgstPaise: money,
    sgstPaise: money,
    igstPaise: money,
    cgstRate: z.number().min(0).max(100),
    sgstRate: z.number().min(0).max(100),
    igstRate: z.number().min(0).max(100),
    sac: z.string().regex(/^\d{6}$/),
    placeOfSupply: text,
    placeOfSupplyCode: indianStateCode,
    reverseCharge: z.literal(false),
    sellerConfirmed: z.literal(true),
    provenance: text,
  })
  .strict();
export type Particular = z.infer<typeof particular>;
export type SourceLine = {
  id: string;
  description: string;
  amountPaise: number;
};
export type ClaimState = {
  claims: Record<string, number>;
  reductionClaims: Record<string, number>;
  credited: Record<
    string,
    {
      taxablePaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
      amountPaise: number;
    }
  >;
};
export const emptyState = (): ClaimState => ({
  claims: {},
  reductionClaims: {},
  credited: {},
});
/** Correction families retain a stable owner. Compensations plus replacements are netted once. */
export function documentSources(
  b: RecordData,
  entries: BillingEntry[],
): SourceLine[] {
  const roots = entries.filter((e) => !e.originalEntryId);
  const rootOf = (entry: BillingEntry) => {
    let current = entry;
    const seen = new Set<string>();
    while (current.replacesEntryId) {
      if (seen.has(current.id)) throw new Error("Invalid correction family");
      seen.add(current.id);
      const parent = roots.find((e) => e.id === current.replacesEntryId);
      if (!parent) throw new Error("Missing correction family");
      current = parent;
    }
    return current;
  };
  const groups = new Map<string, SourceLine>();
  for (const e of entries.filter((e) => !e.reductionSourceId)) {
    const root = e.originalEntryId
      ? roots.find((r) => r.id === e.originalEntryId)
      : e;
    if (!root) throw new Error("Missing original billing entry");
    const first = rootOf(root);
    const id = `entry:${first.id}`;
    const line = groups.get(id) ?? {
      id,
      description: first.description || "Hotel charge",
      amountPaise: 0,
    };
    line.amountPaise += e.amountPaise;
    groups.set(id, line);
  }
  const extras: RecordData[] = (b.customizations ?? []).filter(
    (r: RecordData) =>
      r.settlement === "included" || (r.agreementVersion !== 2 && !r.quote),
  );
  const extraTotal = extras.reduce((n, r) => n + (r.totalPaise ?? 0), 0);
  const declined = extras
    .filter((r) => r.status === "declined")
    .reduce((n, r) => n + (r.totalPaise ?? 0), 0);
  if (
    extraTotal !== (b.extrasTotalPaise ?? 0) ||
    declined !== (b.customizationCreditPaise ?? 0) ||
    new Set(extras.map((r) => r.id)).size !== extras.length ||
    extras.some(
      (r) => !r.id || !Number.isSafeInteger(r.totalPaise) || r.totalPaise < 0,
    )
  )
    throw new Error("Booked extra source history does not reconcile");
  const lines = [
    {
      id: "booking",
      description: "Reserved accommodation",
      amountPaise: (b.totalPaise ?? 0) - extraTotal,
    },
    ...extras.map((r) => ({
      id: `extra:${r.id}`,
      description: r.name || r.title || "Booked extra",
      amountPaise: r.status === "declined" ? 0 : r.totalPaise,
    })),
    ...groups.values(),
  ];
  const linked = new Map<string, number>();
  for (const e of entries.filter((e) => e.reductionSourceId))
    linked.set(
      e.reductionSourceId,
      (linked.get(e.reductionSourceId) ?? 0) + e.amountPaise,
    );
  for (const [sourceId, amount] of linked) {
    const line = lines.find((l) => l.id === sourceId);
    if (!line || amount > 0 || line.amountPaise + amount < 0)
      throw new Error("Invalid linked accommodation reduction");
    line.amountPaise += amount;
  }
  return lines;
}
export function reductions(lines: SourceLine[], state: ClaimState) {
  return lines.map((line) => ({
    ...line,
    amountPaise: Math.max(0, (state.claims[line.id] ?? 0) - line.amountPaise),
  }));
}
export function particularsTotal(p: Particular) {
  return p.taxablePaise + p.cgstPaise + p.sgstPaise + p.igstPaise;
}
export function validateParticular(
  p: Particular,
  amount: number,
  s: InvoiceSettings,
) {
  const errors: string[] = [];
  if (particularsTotal(p) !== amount)
    errors.push(
      "Accountant-confirmed particulars must exactly match the source amount.",
    );
  if (
    s.registration === "unregistered" &&
    (p.cgstPaise ||
      p.sgstPaise ||
      p.igstPaise ||
      p.cgstRate ||
      p.sgstRate ||
      p.igstRate)
  )
    errors.push("Ordinary invoices cannot collect GST or claim input credit.");
  if (s.registration === "registered") {
    if (!p.cgstRate && !p.igstRate)
      errors.push(
        "Exempt and zero-rated treatments are unavailable in this phase.",
      );
    if (p.igstPaise && (p.cgstPaise || p.sgstPaise))
      errors.push(
        "Mixed interstate and intrastate tax components are unsupported.",
      );
    if (p.cgstRate !== p.sgstRate || p.cgstPaise !== p.sgstPaise)
      errors.push("CGST and SGST particulars must agree.");
    if (
      p.placeOfSupplyCode === s.stateCode
        ? !!p.igstRate
        : !!(p.cgstRate || p.sgstRate)
    )
      errors.push("Tax components must match the confirmed place of supply.");
    for (const [amountKey, rateKey] of [
      ["cgstPaise", "cgstRate"],
      ["sgstPaise", "sgstRate"],
      ["igstPaise", "igstRate"],
    ] as const) {
      if (Math.round((p.taxablePaise * p[rateKey]) / 100) !== p[amountKey])
        errors.push(
          `Unsupported ${rateKey} rounding or inconsistent tax amount.`,
        );
    }
  }
  return errors;
}
export function settingsBlockers(s?: InvoiceSettings | null) {
  if (!s)
    return [
      "Save Invoice settings and confirm applicable requirements with your accountant.",
    ];
  return [
    ...(!["registered", "unregistered"].includes(s.registration)
      ? [
          "Composition and exempt treatments are unavailable. Ask your accountant to review.",
        ]
      : []),
    ...(s.irpRequired
      ? [
          "This transaction requires IRP registration. Issuance is unavailable until an e-invoice integration exists; a local printout is not a replacement.",
        ]
      : []),
  ];
}
export function hotelDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const year = Number(get("year")),
    month = Number(get("month"));
  const start = month >= 4 ? year : year - 1;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    financialYear: `${start}-${String(start + 1).slice(-2)}`,
  };
}
export function documentNumber(series: string, fy: string, next: number) {
  const value = `${series}/${fy.slice(2, 4)}${fy.slice(-2)}/${next}`;
  if (
    !Number.isSafeInteger(next) ||
    next < 1 ||
    !/^[A-Za-z0-9/-]{1,16}$/.test(value)
  )
    throw new Error(
      "Document series exhausted. Contact support; issued numbers cannot be reset.",
    );
  return value;
}
export const detailsSchema = z
  .object({
    customer: identity,
    accountantConfirmed: z.literal(true),
    irpRequired: z.boolean(),
    lines: z.array(particular).max(200),
  })
  .strict();
export type DocumentDetails = z.infer<typeof detailsSchema>;
export const issueSchema = z
  .object({
    action: z.enum(["invoice", "credit_note"]),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
    invoiceId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    reductionId: text.optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    allocations: z
      .array(z.object({ lineId: text, particulars: particular }).strict())
      .max(100)
      .optional(),
  })
  .strict();
export type IssueInput = z.infer<typeof issueSchema>;

/** Shared by invoice settings and the admin business-identity editor. */
export function assertInvoiceIdentityUnlocked(before: InvoiceSettings, after: InvoiceSettings, used: boolean) {
  if (used && (["invoiceSeries", "creditSeries", "invoiceStart", "creditStart", "gstin", "registration"] as const).some(k => before[k] !== after[k]))
    throw new ApiException("INVOICE_REVIEW_REQUIRED", 409, "Issued series, starting numbers and registration identity are locked after first use. Contact support for a new legal seller.");
}
