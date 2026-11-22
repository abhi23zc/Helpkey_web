import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { fingerprint, replay, type Journal } from "./ledger";
import type { BookingAccount } from "./source-integration";
/** Read-only, consistent Firestore snapshot. Reports differences; never repairs them. */
export async function reconcileAccount(db: Firestore, propertyId: string) {
  if (!propertyId || propertyId.includes("/")) throw new Error("INVALID_PROPERTY");
  return db.runTransaction(async tx => {
    const ref = db.collection("financeAccounts").doc(propertyId);
    const [account, history, states, assessments] = await Promise.all([tx.get(ref), tx.get(ref.collection("journals").orderBy("revision")), tx.get(ref.collection("bookings")), tx.get(ref.collection("assessments"))]);
    const discrepancies: { kind: string; reference: string; detail: string }[] = [];
    const journals = history.docs.map(d => d.data() as Journal);
    try { if (fingerprint(replay(journals)) !== fingerprint(account.get("projection"))) discrepancies.push({ kind: "projection", reference: ref.path, detail: "Journal replay differs from stored account projection" }); }
    catch (error) { discrepancies.push({ kind: "journal", reference: ref.path, detail: error instanceof Error ? error.message : "Invalid journal history" }); }
    const keys = new Set<string>();
    for (const j of journals) {
      const payload = { propertyId: j.propertyId, eventKey: j.eventKey, sourceRef: j.sourceRef, actorId: j.actorId, reason: j.reason, effectiveAt: undefined, reversalOf: j.reversalOf, ruleRef: j.ruleRef, assessmentRef: j.assessmentRef, lines: j.lines };
      if (fingerprint(payload) !== j.fingerprint || fingerprint({ propertyId, eventKey: j.eventKey }) !== j.id) discrepancies.push({ kind: "fingerprint", reference: j.id, detail: "Journal identity or payload fingerprint differs" });
      if (!(await tx.get(db.doc(j.sourceRef))).exists) discrepancies.push({ kind: "source", reference: j.sourceRef, detail: "Journal source record missing" });
      if (keys.has(j.eventKey)) discrepancies.push({ kind: "duplicate_event", reference: j.id, detail: "Source event posted more than once" }); keys.add(j.eventKey); }
    for (const doc of states.docs) {
      const s = doc.data() as BookingAccount, b = await tx.get(db.collection("bookings").doc(doc.id));
      if (!b.get("accounting.included") || b.get("propertyId") !== propertyId) discrepancies.push({ kind: "inclusion", reference: doc.ref.path, detail: "Source booking marker or property does not match account" });
      const [agreements, adjustments] = await Promise.all([tx.get(b.ref.collection("financialAgreements")), tx.get(b.ref.collection("financialAdjustments"))]);
      for (const a of agreements.docs) {
        for (const l of a.get("publicCalculation.lines") ?? []) if (!s.lines.some(x => x.agreementId === a.id && x.lineId === l.id && x.grossPaise === l.totalPaise)) discrepancies.push({ kind: "agreement", reference: a.ref.path, detail: "Saved obligation line absent or inconsistent" });
      }
      for (const l of s.lines) {
        const reductions = adjustments.docs.filter(a => a.get("originalAgreementId") === l.agreementId && a.get("originalLineId") === l.lineId).reduce((n, a) => n + a.get("totalPaise"), 0);
        if (l.reducedPaise !== reductions) discrepancies.push({ kind: "reduction", reference: `${doc.id}/${l.agreementId}/${l.lineId}`, detail: "Linked reductions differ from projection" });
        const online = s.allocations.filter(a => a.agreementId === l.agreementId && a.lineId === l.lineId && a.source === "helpkey").reduce((n, a) => n + a.amountPaise - a.reversedPaise, 0);
        const hotel = s.allocations.filter(a => a.agreementId === l.agreementId && a.lineId === l.lineId && a.source === "hotel").reduce((n, a) => n + a.amountPaise - a.reversedPaise, 0);
        if (online !== l.fundedPaise || hotel !== l.hotelFundedPaise) discrepancies.push({ kind: "allocation", reference: doc.ref.path, detail: "Receipt allocations do not match funded line totals" });
      }
      for (const a of s.allocations) {
        const source = await tx.get(db.collection(a.source === "helpkey" ? "paymentAttempts" : "propertyPayments").doc(a.receiptId));
        if (!source.exists || source.get("bookingId") !== doc.id || source.get("propertyId") !== propertyId) discrepancies.push({ kind: "receipt_source", reference: a.receiptId, detail: "Allocation source missing or belongs to another property/booking" });
      }
    }
    const counterKeys = [...new Set(assessments.docs.filter(d => d.get("status") === "complete" && typeof d.get("counterKey") === "string").map(d => d.get("counterKey") as string))];
    for (const key of counterKeys) {
      const counter = await tx.get(db.collection("financeAssessmentCounters").doc(key));
      const all = await tx.get(db.collectionGroup("assessments").where("counterKey", "==", key));
      const total = all.docs.reduce((n, a) => n + a.get("basePaise") - (a.get("counterReversedPaise") ?? 0), 0);
      if (counter.get("basePaise") !== total) discrepancies.push({ kind: "counter", reference: key, detail: "Shared participant counter differs from saved assessments" });
    }
    return { contractVersion: 3, propertyId, accountRevision: account.get("revision") ?? 0, journalRevision: account.get("projection.revision") ?? 0, checkedAt: new Date().toISOString(), sourceBookings: states.size, journals: history.size, discrepancies, repaired: false };
  }, { readOnly: true });
}
