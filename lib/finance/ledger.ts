import { createHash } from "node:crypto";
import { z } from "zod";

export const ledgerAccounts = ["customer_obligation", "helpkey_cash", "hotel_cash", "refund_obligation", "hotel_entitlement", "helpkey_revenue", "hotel_charges", "statutory_liability", "provider_expense", "hotel_receipts", "hotel_credit", "internal_offsets"] as const;
export type LedgerAccount = typeof ledgerAccounts[number];
const amount = z.number().int().nonnegative().safe();
export const journalLineSchema = z.object({ account: z.enum(ledgerAccounts), debitPaise: amount, creditPaise: amount, bookingId: z.string().nullable(), agreementId: z.string().nullable(), chargeLineId: z.string().nullable(), allocationId: z.string().nullable() }).strict();
export type JournalLine = z.infer<typeof journalLineSchema>;
export type Journal = { id: string; propertyId: string; currency: "INR"; eventKey: string; fingerprint: string; sourceRef: string; actorId: string; reason: string; createdAt: string; effectiveAt: string; revision: number; reversalOf: string | null; ruleRef: string | null; assessmentRef: string | null; lines: JournalLine[] };
export type Projection = { revision: number; balances: Record<LedgerAccount, number> };
export function fingerprint(value: unknown): string {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, stable(x)])) : v;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
export function money(n: number) { return amount.parse(n); }
export function line(account: LedgerAccount, debitPaise: number, creditPaise: number, refs: Partial<Pick<JournalLine, "bookingId" | "agreementId" | "chargeLineId" | "allocationId">> = {}): JournalLine {
  return journalLineSchema.parse({ account, debitPaise, creditPaise, bookingId: null, agreementId: null, chargeLineId: null, allocationId: null, ...refs });
}
export function transfer(debit: LedgerAccount, credit: LedgerAccount, n: number, refs?: Parameters<typeof line>[3]) { money(n); return n ? [line(debit, n, 0, refs), line(credit, 0, n, refs)] : []; }
export function assertBalanced(lines: JournalLine[]) {
  if (!lines.length) throw new Error("EMPTY_JOURNAL");
  let debit = BigInt(0), credit = BigInt(0);
  for (const raw of lines) { const l = journalLineSchema.parse(raw); if ((l.debitPaise > 0) === (l.creditPaise > 0)) throw new Error("INVALID_JOURNAL_LINE"); debit += BigInt(l.debitPaise); credit += BigInt(l.creditPaise); }
  if (debit !== credit || debit > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("UNBALANCED_JOURNAL");
}
export function emptyProjection(): Projection { return { revision: 0, balances: Object.fromEntries(ledgerAccounts.map(a => [a, 0])) as Projection["balances"] }; }
export function applyJournal(before: Projection, journal: Journal): Projection {
  assertBalanced(journal.lines);
  if (journal.revision !== before.revision + 1 || journal.currency !== "INR") throw new Error("JOURNAL_SEQUENCE_CONFLICT");
  const result: Projection = { revision: journal.revision, balances: { ...before.balances } };
  for (const l of journal.lines) { const n = BigInt(result.balances[l.account]) + BigInt(l.debitPaise) - BigInt(l.creditPaise); if (n < -BigInt(Number.MAX_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MONEY_OVERFLOW"); result.balances[l.account] = Number(n); }
  return result;
}
export function replay(journals: Journal[]) { return journals.reduce(applyJournal, emptyProjection()); }
export function reversedLines(journal: Journal) { return journal.lines.map(l => ({ ...l, debitPaise: l.creditPaise, creditPaise: l.debitPaise })); }
export type OutstandingLine = { agreementId: string; lineId: string; acceptedAt: string; outstandingPaise: number; helpkeyOwned: boolean; requestId: string | null };
/** Stable oldest-agreement, then saved line order. Persist the result with the source event. */
export function allocateReceipt(amountPaise: number, lines: OutstandingLine[], requestIds?: string[]) {
  let remaining = money(amountPaise);
  const allocations = lines.map((l, index) => ({ ...l, index })).sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt) || a.agreementId.localeCompare(b.agreementId) || a.index - b.index).flatMap(l => {
    if (requestIds && !requestIds.includes(l.requestId ?? "")) return [];
    const n = Math.min(remaining, money(l.outstandingPaise)); remaining -= n;
    return n ? [{ agreementId: l.agreementId, lineId: l.lineId, amountPaise: n, helpkeyOwned: l.helpkeyOwned }] : [];
  });
  return { allocations, unallocatedPaise: remaining };
}
