import { FieldValue } from "firebase-admin/firestore";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { BookingAccount } from "./source-integration";
import { PostingUnit } from "./posting";
import { eligibleAllocations, type AccountHold } from "./accounts";
import { financeReadiness } from "./readiness";
import { fingerprint, transfer, type Journal } from "./ledger";
import { outstandingDues, allocateDues } from "./dues";
/** Property-scoped internal offsets. No bank transfer or cross-property credit is possible. */
export async function offsetEligibleFunds(db: Firestore, tx: Transaction, unit: PostingUnit, propertyId: string, updated: BookingAccount[] = []) {
  let dues = Math.max(0, (await unit.projection(propertyId)).balances.hotel_charges);
  if (!dues) return;
  const root = unit.account(propertyId);
  const [states, holds, readiness, history] = await Promise.all([tx.get(root.collection("bookings")), tx.get(root.collection("holds")), financeReadiness(db, tx, propertyId), tx.get(root.collection("journals").orderBy("revision"))]);
  const bookings = new Map(states.docs.map(d => [d.id, d.data() as BookingAccount]));
  updated.forEach(b => bookings.set(b.bookingId, b));
  const eligible = eligibleAllocations([...bookings.values()], holds.docs.map(d => ({ id: d.id, ...d.data() }) as AccountHold), readiness.ready, unit.now).filter(a => a.eligiblePaise > 0).sort((a, b) => (a.eligibleAt ?? "").localeCompare(b.eligibleAt ?? "") || (a.receivedAt ?? "").localeCompare(b.receivedAt ?? "") || a.id.localeCompare(b.id));
  const allJournals = new Map(history.docs.map(d => [d.id, d.data() as Journal]));
  unit.pendingJournals().filter(j => j.propertyId === propertyId).forEach(j => allJournals.set(j.id, j));
  const lots = outstandingDues([...allJournals.values()]);
  for (const a of eligible) {
    const n = Math.min(dues, a.eligiblePaise); if (!n) break;
    const state = bookings.get(a.bookingId)!, saved = state.allocations.find(x => x.id === a.id)!;
    const eventKey = `internal-offset:${a.id}:${saved.offsetPaise}:${n}:${(await unit.projection(propertyId)).revision}`;
    const dueAllocations = allocateDues(n, lots); for (const part of dueAllocations) { const lot = lots.find(l => l.journalId === part.journalId && l.lineIndex === part.lineIndex)!; lot.amountPaise -= part.amountPaise; }
    await unit.event(propertyId, eventKey, root.path, transfer("hotel_entitlement", "hotel_charges", n, { bookingId: a.bookingId, agreementId: a.agreementId, chargeLineId: a.lineId, allocationId: a.id }), "system:finance", "Internal dues offset; awaiting founder approval for remaining funds");
    tx.create(root.collection("offsets").doc(fingerprint(eventKey)), { allocationId: a.id, bookingId: a.bookingId, amountPaise: n, dues: dueAllocations, createdAt: unit.now, bankTransfer: false });
    tx.set(root, { revision: FieldValue.increment(1), updatedAt: unit.now }, { merge: true });
    saved.offsetPaise += n; dues -= n; state.revision++; tx.set(root.collection("bookings").doc(state.bookingId), state);
  }
}
