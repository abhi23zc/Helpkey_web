import type { Journal } from "./ledger";
export type DueLot = { journalId: string; lineIndex: number; amountPaise: number; createdAt: string; bookingId: string | null };
/** Credit corrections and prior settlements consume oldest outstanding charges. */
export function outstandingDues(journals: Journal[]): DueLot[] {
  const lots: DueLot[] = [];
  let unappliedCredit = 0;
  for (const j of journals.slice().sort((a, b) => a.revision - b.revision)) for (const [lineIndex, l] of j.lines.entries()) {
    if (l.account !== "hotel_charges") continue;
    if (l.debitPaise) { const n = Math.min(unappliedCredit, l.debitPaise); unappliedCredit -= n; if (l.debitPaise > n) lots.push({ journalId: j.id, lineIndex, amountPaise: l.debitPaise - n, createdAt: j.createdAt, bookingId: l.bookingId }); }
    if (l.creditPaise) { let remaining = l.creditPaise; for (const lot of lots) { const n = Math.min(lot.amountPaise, remaining); lot.amountPaise -= n; remaining -= n; if (!remaining) break; } unappliedCredit += remaining; }
  }
  return lots.filter(l => l.amountPaise > 0);
}
export function allocateDues(amountPaise: number, lots: DueLot[]) {
  let remaining = amountPaise;
  return lots.flatMap(lot => { const n = Math.min(remaining, lot.amountPaise); remaining -= n; return n ? [{ ...lot, amountPaise: n }] : []; });
}
