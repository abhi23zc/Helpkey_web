import type { Firestore, Transaction } from "firebase-admin/firestore";
import { applyJournal, emptyProjection, fingerprint, type Journal, type JournalLine, type Projection } from "./ledger";
export type Posting = Omit<Journal, "id" | "fingerprint" | "revision" | "createdAt" | "currency">;
/** One unit per transaction. Reads are staged before writes by the commit adapter. */
export class PostingUnit {
  private projections = new Map<string, Projection>();
  private events = new Map<string, Journal>();
  constructor(readonly db: Firestore, readonly tx: Transaction, readonly now = new Date().toISOString()) {}
  pendingJournals() { return [...this.events.values()]; }
  account(propertyId: string) { return this.db.collection("financeAccounts").doc(propertyId); }
  async projection(propertyId: string) {
    if (!this.projections.has(propertyId)) { const s = await this.tx.get(this.account(propertyId)); this.projections.set(propertyId, (s.get("projection") as Projection | undefined) ?? emptyProjection()); }
    return this.projections.get(propertyId)!;
  }
  async post(input: Posting) {
    const id = fingerprint({ propertyId: input.propertyId, eventKey: input.eventKey });
    const payloadFields = { ...input, effectiveAt: undefined };
    const payload = fingerprint(payloadFields);
    const ref = this.account(input.propertyId).collection("journals").doc(id);
    const previous = this.events.get(id) ?? (await this.tx.get(ref)).data() as Journal | undefined;
    if (previous) { if (previous.fingerprint !== payload) throw new Error("FINANCE_EVENT_KEY_REUSED"); return previous; }
    const before = await this.projection(input.propertyId);
    const journal: Journal = { ...input, id, fingerprint: payload, revision: before.revision + 1, currency: "INR", createdAt: this.now };
    const next = applyJournal(before, journal);
    this.tx.create(ref, journal);
    this.tx.set(this.account(input.propertyId), { propertyId: input.propertyId, projection: next, updatedAt: this.now }, { merge: true });
    this.projections.set(input.propertyId, next); this.events.set(id, journal);
    return journal;
  }
  async event(propertyId: string, eventKey: string, sourceRef: string, lines: JournalLine[], actorId = "system:finance", reason = "Confirmed source event", refs: Partial<Pick<Posting, "assessmentRef" | "ruleRef" | "reversalOf">> = {}) {
    if (!lines.length) return null;
    return this.post({ propertyId, eventKey, sourceRef, actorId, reason, effectiveAt: this.now, reversalOf: null, ruleRef: null, assessmentRef: null, ...refs, lines });
  }
}
