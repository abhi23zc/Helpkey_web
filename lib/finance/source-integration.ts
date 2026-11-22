import { syntheticProject } from "./configuration-guard";
import { offsetEligibleFunds } from "./offsets";
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { BufferedWrite } from "./transaction";
import { PostingUnit } from "./posting";
import { allocateReceipt, fingerprint, money, transfer, type OutstandingLine } from "./ledger";
import { assessmentPreview, counterPeriod, deductionRuleSchema, type DeductionRule } from "./assessments";
import { DEFAULT_POLICY, resolvePolicy, type FinancePolicy } from "./domain";
import { checked, halfUp, type ChargeLine } from "./calculation";
type Data = FirebaseFirestore.DocumentData;
export type AccountLine = OutstandingLine & { kind: string; grossPaise: number; taxablePaise: number; taxableReducedPaise?: number; retainedTaxablePaise?: number; retainedGrossPaise?: number; commissionPaise: number; recognizedCommissionPaise: number; reducedPaise: number; voidedPaise?: number; commissionReversedPaise: number; fundedPaise: number; hotelFundedPaise: number; refundReservedPaise: number; waitHours: number; fulfilledAt: string | null; eligibleAt: string | null; providerCharges: string; assessment: "pending" | "complete"; ruleRefs: string[]; assessmentId: string; assessedRuleRefs?: string[]; ambiguousRules?: boolean; retentionRuleRefs?: string[]; jurisdiction: string; registration: string; participant: string | null };
export type FundAllocation = { id: string; receiptId: string; agreementId: string; lineId: string; amountPaise: number; reversedPaise: number; source: "helpkey" | "hotel"; feeResolved: boolean; receivedAt?: string; offsetPaise: number; refundReservedPaise?: number };
export type BookingAccount = { bookingId: string; propertyId: string; reference: string; status: string; actualCheckOutAt: string | null; financialResolvedAt: string | null; scheduledCheckOutAt: string | null; lines: AccountLine[]; allocations: FundAllocation[]; unallocatedPaise: number; unallocatedReceipts?: { receiptId: string; amountPaise: number; reservedPaise: number }[]; retentionPending: boolean; retentionOutcome?: { retainedPaise: number; refundPaise: number }; revision: number };
export const iso = (v: unknown): string | null => v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
// Mirror only the SDK transforms used by booking source patches; unknown transforms fail closed.
function resolveValue(value: unknown, before: unknown, now: string): unknown {
  if (value instanceof FieldValue) {
    if (value.isEqual(FieldValue.serverTimestamp())) return Timestamp.fromDate(new Date(now));
    if (value.isEqual(FieldValue.delete())) return undefined;
    if ("operand" in value && typeof value.operand === "number") return Number(before ?? 0) + value.operand;
    throw new Error("UNSUPPORTED_FINANCE_SOURCE_TRANSFORM");
  }
  return value;
}
function patch(before: Data, w: BufferedWrite, now: string): Data {
  const next = w.method === "set" && !(w.rest[0] as { merge?: boolean } | undefined)?.merge || w.method === "create" ? {} : { ...before };
  if (!w.data || typeof w.data !== "object") throw new Error("FINANCE_OBJECT_PATCH_REQUIRED");
  for (const [key, raw] of Object.entries(w.data)) {
    const path = w.method === "update" ? key.split(".") : [key];
    let target = next;
    for (const k of path.slice(0, -1)) { target[k] = { ...(target[k] ?? {}) }; target = target[k]; }
    const k = path.at(-1)!; const v = resolveValue(raw, target[k], now);
    if (v === undefined) delete target[k]; else target[k] = v;
  }
  return next;
}
export async function integrateFinanceSources(db: Firestore, tx: Transaction, writes: BufferedWrite[]) {
  const now = new Date().toISOString(), unit = new PostingUnit(db, tx, now);
  const ids = new Set<string>();
  for (const w of writes) {
    const p = w.ref.path.split("/");
    if (p[0] === "bookings" && (p[2] === "financialAgreements" || p[2] === "financialAdjustments" || p.length === 2 && (w.method === "delete" || ["accounting", "bookingStatus", "customizations", "paidPaise", "stayPaymentReceipts", "actualCheckOutAt", "financeRecognitionRequestedAt"].some(k => k in w.data)))) ids.add(p[1]);
    else if (["paymentAttempts", "propertyPayments", "refunds"].includes(p[0]) && p.length === 2) {
      const bookingId = w.data.bookingId ?? (await tx.get(w.ref)).get("bookingId");
      if (typeof bookingId === "string") ids.add(bookingId);
    }
  }
  const updated = new Map<string, BookingAccount[]>();
  for (const bookingId of ids) {
    const ref = db.collection("bookings").doc(bookingId), old = await tx.get(ref);
    const bookingWrites = writes.filter(w => w.ref.path === ref.path);
    let b = old.data() ?? {};
    for (const w of bookingWrites) { if (w.method === "delete") throw new Error("ACCOUNTING_BOOKING_DELETE_FORBIDDEN"); b = patch(b, w, now); }
    if (!b.propertyId) continue;
    let marker = old.get("accounting");
    if (!old.exists && bookingWrites.some(w => w.method === "create" || w.method === "set")) {
      const setting = await tx.get(db.collection("financeConfiguration").doc("accounting"));
      marker = { version: 3, included: setting.get("enabled") === true, settingRevision: setting.get("revision") ?? 0, recordedAt: now };
      tx.set(ref, { accounting: marker }, { merge: true });
    }
    // Marker is immutable for included and excluded bookings alike.
    if (old.exists && bookingWrites.some(w => w.data.accounting && fingerprint(w.data.accounting) !== fingerprint(marker ?? null))) throw new Error("IMMUTABLE_ACCOUNTING_MARKER");
    if (!marker?.included) continue;
    if (old.exists && old.get("propertyId") !== b.propertyId) throw new Error("ACCOUNTING_PROPERTY_IMMUTABLE");
    const propertyId = String(b.propertyId), stateRef = unit.account(propertyId).collection("bookings").doc(bookingId);
    const saved = await tx.get(stateRef);
    const previousStateFingerprint = saved.exists ? fingerprint(saved.data()) : null;
    const state: BookingAccount = saved.data() as BookingAccount ?? { bookingId, propertyId, reference: b.confirmationCode ?? bookingId, status: b.bookingStatus, actualCheckOutAt: null, financialResolvedAt: null, scheduledCheckOutAt: iso(b.endAt), lines: [], allocations: [], unallocatedPaise: 0, retentionPending: false, revision: 0 };
    if (state.propertyId !== propertyId) throw new Error("ACCOUNTING_PROPERTY_IMMUTABLE");
    const event = (key: string, source: string, lines: ReturnType<typeof transfer>, actor?: string, reason?: string, refs?: Parameters<PostingUnit["event"]>[6]) => unit.event(propertyId, key, source, lines, actor, reason, refs);
    const agreementWrites = writes.filter(w => w.ref.parent.path === `${ref.path}/financialAgreements`);
    for (const w of agreementWrites) {
      if (w.method !== "create" || (await tx.get(w.ref)).exists) throw new Error("IMMUTABLE_FINANCIAL_AGREEMENT");
      const a = w.data;
      const [g, h, registry, profile, tax] = await Promise.all([tx.get(db.doc("financeConfiguration/global")), tx.get(db.doc(`propertyFinance/${propertyId}`)), tx.get(db.doc("financeConfiguration/deductions")), tx.get(db.doc(`propertyFinance/${propertyId}/profiles/current`)), tx.get(db.doc(`propertyFinance/${propertyId}/taxProfiles/current`))]);
      const policy = resolvePolicy((g.get("policy") ?? DEFAULT_POLICY) as FinancePolicy, h.get("overrides") ?? {}).effective;
      const ruleRefs: string[] = registry.get("active") ?? [];
      const rules = await Promise.all(ruleRefs.map(r => tx.get(db.collection("financeDeductionRules").doc(r))));
      const acceptedAt = iso(a.acceptedAt) ?? now;
      const snapshot = { waitHours: policy.payoutWaitHours, ruleRefs, registryRevision: registry.get("revision") ?? 0, participant: profile.get("profile.pan") ?? null, acceptedAt };
      tx.set(w.ref, { accounting: snapshot }, { merge: true });
      for (const raw of a.publicCalculation.lines as ChargeLine[]) {
        const jurisdiction = tax.get("profile.jurisdiction") ?? "", registration = tax.get("profile.registration") ?? "";
        const date = acceptedAt.slice(0, 10);
        const allApplicable = rules.filter(d => d.get("state") === "published").flatMap(d => { const r = deductionRuleSchema.parse(d.get("rule")); if (r.synthetic && !syntheticProject()) throw new Error("SYNTHETIC_PRODUCTION_RULE"); return (r.category === raw.kind || r.category === "commission" && raw.kind !== "customer_fee") && r.effectiveFrom <= date && r.effectiveThrough >= date && r.applicability.jurisdictions.includes(jurisdiction) && r.applicability.registrations.includes(registration) && (!r.applicability.propertyIds.length || r.applicability.propertyIds.includes(propertyId)) ? [d.id] : []; });
        const normalEvent = raw.kind === "room" ? "checkout" : "fulfilment";
        const applicable = allApplicable.filter(ref => rules.find(d => d.id === ref)!.get("rule.recognitionEvent") === normalEvent);
        const retentionRuleRefs = allApplicable.filter(ref => rules.find(d => d.id === ref)!.get("rule.recognitionEvent") === "retention");
        const ambiguousRules = new Set(applicable.map(ref => rules.find(d => d.id === ref)!.get("rule.id"))).size !== applicable.length;
        const assessmentId = fingerprint({ bookingId, agreementId: w.ref.id, lineId: raw.id });
        const requestId = a.requestId ?? (w.ref.id.startsWith("service_") ? (b.customizations ?? []).find((r: Data) => `service_${fingerprint({ requestId: r.id, version: r.quote?.version })}` === w.ref.id)?.id : null) ?? (w.ref.id.startsWith("service_") ? (b.customizations ?? []).find((r: Data) => `service_${fingerprint({ requestId: r.id, version: r.quote?.version })}` === w.ref.id)?.id : null) ?? (raw.id.startsWith("extra:") ? raw.id.slice(6) : null);
        const request = (b.customizations ?? []).find((r: Data) => r.id === requestId || `service:${r.id}` === raw.id);
        const commission = a.internal.commission.find((c: Data) => c.lineId === raw.id)?.amountPaise ?? 0;
        state.lines.push({ agreementId: w.ref.id, lineId: raw.id, acceptedAt, outstandingPaise: raw.totalPaise, helpkeyOwned: raw.kind === "customer_fee", requestId, kind: raw.kind, grossPaise: raw.totalPaise, taxablePaise: raw.taxablePaise, commissionPaise: commission, recognizedCommissionPaise: 0, reducedPaise: 0, commissionReversedPaise: 0, fundedPaise: 0, hotelFundedPaise: 0, refundReservedPaise: 0, waitHours: policy.payoutWaitHours, fulfilledAt: iso(request?.quote?.financeCharge?.serviceAt ?? request?.inputs?.serviceAt) ?? (raw.kind === "room" ? null : iso(`${raw.serviceDate}T23:59:59.999Z`)), eligibleAt: null, providerCharges: a.internal.providerCharges.allocatedTo, assessment: raw.kind === "customer_fee" ? "complete" : "pending", ruleRefs: applicable, assessmentId, retentionRuleRefs, assessedRuleRefs: [], ambiguousRules, jurisdiction, registration, participant: snapshot.participant });
        if (raw.kind !== "customer_fee") tx.create(unit.account(propertyId).collection("assessments").doc(assessmentId), { bookingId, agreementId: w.ref.id, lineId: raw.id, status: "pending", reason: ambiguousRules ? "Ambiguous reviewed versions" : applicable.length ? "Awaiting recognition event" : "Missing reviewed rule", ruleRefs: applicable, createdAt: now });
        await event(`agreement:${w.ref.path}:${raw.id}`, w.ref.path, transfer("customer_obligation", raw.kind === "customer_fee" ? "helpkey_revenue" : "hotel_entitlement", raw.totalPaise, { bookingId, agreementId: w.ref.id, chargeLineId: raw.id }), a.acceptedBy);
      }
    }
    for (const w of writes.filter(w => w.ref.parent.path === `${ref.path}/financialAdjustments`)) {
      if (w.method !== "create" || (await tx.get(w.ref)).exists) throw new Error("IMMUTABLE_FINANCIAL_ADJUSTMENT");
      const r = w.data, l = state.lines.find(l => l.agreementId === r.originalAgreementId && l.lineId === r.originalLineId);
      if (!l || money(r.taxablePaise) > l.taxablePaise - (l.taxableReducedPaise ?? 0) || r.totalPaise < r.taxablePaise || money(r.totalPaise) > l.grossPaise - l.reducedPaise || money(r.internalCommissionReversalPaise ?? 0) > l.commissionPaise - l.commissionReversedPaise) throw new Error("REDUCTION_EXCEEDS_REMAINING");
      l.reducedPaise += r.totalPaise; l.taxableReducedPaise = (l.taxableReducedPaise ?? 0) + money(r.taxablePaise); l.commissionReversedPaise += r.internalCommissionReversalPaise ?? 0;
      l.outstandingPaise = Math.max(0, l.grossPaise - l.reducedPaise - l.fundedPaise - l.hotelFundedPaise);
      await event(`reduction:${w.ref.path}`, w.ref.path, transfer(l.helpkeyOwned ? "helpkey_revenue" : "hotel_entitlement", "customer_obligation", r.totalPaise, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }), r.acceptedBy, "Linked agreement reduction", { reversalOf: fingerprint({ propertyId, eventKey: `agreement:bookings/${bookingId}/financialAgreements/${l.agreementId}:${l.lineId}` }) });
      const reverse = Math.max(0, l.recognizedCommissionPaise - (l.commissionPaise - l.commissionReversedPaise));
      if (reverse) { await event(`commission-reduction:${w.ref.path}`, w.ref.path, transfer("helpkey_revenue", "hotel_charges", reverse, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }), "system:finance", "Saved commission reversal", { reversalOf: fingerprint({ propertyId, eventKey: `commission:${bookingId}:${l.agreementId}:${l.lineId}` }) }); l.recognizedCommissionPaise -= reverse; }
      // Saved assessment correction treatment is applied only to the affected line.
      const assessmentDocs = await tx.get(unit.account(propertyId).collection("assessments").where("bookingId", "==", bookingId));
      for (const assessed of assessmentDocs.docs.filter(d => d.get("agreementId") === l.agreementId && d.get("lineId") === l.lineId && d.get("status") === "complete" && d.get("ruleRef"))) {
        const assessmentRef = assessed.ref;
        const ruleDoc = await tx.get(db.collection("financeDeductionRules").doc(assessed.get("ruleRef")));
        const rule = deductionRuleSchema.parse(ruleDoc.get("rule"));
        if (rule.correction === "reverse_saved") {
          const previous = assessed.get("reversedPaise") ?? 0;
          const cumulative = l.grossPaise ? checked(halfUp(BigInt(assessed.get("amountPaise")) * BigInt(l.reducedPaise), BigInt(l.grossPaise))) : 0;
          const delta = cumulative - previous;
          await event(`assessment-correction:${w.ref.path}`, w.ref.path, transfer("statutory_liability", "hotel_charges", delta, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }), "system:finance", "Saved assessment correction", { reversalOf: fingerprint({ propertyId, eventKey: `assessment:${assessed.id}` }), ruleRef: assessed.get("ruleRef"), assessmentRef: assessed.ref.path });
          const counterKey = assessed.get("counterKey"), counterRef = db.collection("financeAssessmentCounters").doc(counterKey), counter = await tx.get(counterRef);
          const counterReversedPaise = rule.base === "commission" ? Math.min(assessed.get("basePaise"), l.commissionReversedPaise) : rule.base === "taxable" ? Math.min(assessed.get("basePaise"), l.taxableReducedPaise ?? 0) : Math.min(assessed.get("basePaise"), l.reducedPaise);
          const correctionBase = counterReversedPaise - (assessed.get("counterReversedPaise") ?? 0);
          const advanced = counterAdvances.get(unit) ?? new Map<string, number>();
          const nextBase = Math.max(0, (advanced.get(counterKey) ?? counter.get("basePaise")) - correctionBase);
          advanced.set(counterKey, nextBase); counterAdvances.set(unit, advanced);
          tx.update(counterRef, { basePaise: nextBase, updatedAt: now, revision: (counter.get("revision") ?? 0) + 1 });
          tx.update(assessmentRef, { counterReversedPaise, reversedPaise: cumulative, correctionHistory: [...(assessed.get("correctionHistory") ?? []), { sourceRef: w.ref.path, amountPaise: delta, at: now, treatment: rule.correction }] });
        }
      }
    }
    const sourceEvents = writes.filter(w => ["paymentAttempts", "propertyPayments", "refunds"].includes(w.ref.parent.path));
    for (const w of sourceEvents) {
      const before = await tx.get(w.ref), data = patch(before.data() ?? {}, w, now);
      if (before.exists) for (const field of ["bookingId", "propertyId", "amountPaise", "currency", "paymentId", "receiptId", "type"]) {
        if (fingerprint(before.get(field) ?? null) !== fingerprint(data[field] ?? null)) throw new Error("IMMUTABLE_FINANCIAL_SOURCE");
      }
      if (data.bookingId !== bookingId) continue;
      if (data.propertyId !== undefined && data.propertyId !== propertyId || data.currency !== undefined && data.currency !== "INR") throw new Error("FINANCE_SOURCE_SCOPE_MISMATCH");
      if (w.ref.parent.id === "refunds") {
        const n = money(data.amountPaise), refs = { bookingId };
        if (before.exists && (before.get("amountPaise") !== data.amountPaise || before.get("paymentId") !== data.paymentId || before.get("bookingId") !== data.bookingId)) throw new Error("IMMUTABLE_REFUND_SOURCE");
        if (!before.exists) {
          let remaining = n;
          const allocations = state.allocations.filter(a => a.receiptId === data.paymentId && a.source === "helpkey");
          const reservedLines: ReturnType<typeof transfer> = [];
          for (const a of allocations) {
            const l = state.lines.find(l => l.agreementId === a.agreementId && l.lineId === a.lineId)!;
            if (data.allocationId && l.requestId !== data.allocationId) continue;
            const reserved = Math.min(remaining, a.amountPaise - a.reversedPaise - (a.refundReservedPaise ?? 0));
            a.refundReservedPaise = (a.refundReservedPaise ?? 0) + reserved; l.refundReservedPaise += reserved; remaining -= reserved;
            // Refund obligations take priority over prior internal dues offsets.
            const unwind = Math.max(0, a.offsetPaise - (a.amountPaise - a.reversedPaise - a.refundReservedPaise));
            if (unwind) {
              a.offsetPaise -= unwind;
              const eventKey = `refund-offset-release:${w.ref.path}:${a.id}`;
              await event(eventKey, w.ref.path, transfer("hotel_charges", "hotel_entitlement", unwind, { bookingId, agreementId: a.agreementId, chargeLineId: a.lineId, allocationId: a.id }), "system:finance", "Refund reservation restored previously offset dues");
              tx.create(unit.account(propertyId).collection("offsets").doc(fingerprint(eventKey)), { allocationId: a.id, bookingId, amountPaise: -unwind, sourceRef: w.ref.path, createdAt: now, bankTransfer: false, reason: "Customer refund reservation" });
            }
            reservedLines.push(...transfer(l.helpkeyOwned ? "helpkey_revenue" : "hotel_entitlement", "refund_obligation", reserved, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId, allocationId: a.id }));
          }
          const unallocated = state.unallocatedReceipts?.find(r => r.receiptId === data.paymentId);
          if (remaining > (unallocated ? unallocated.amountPaise - unallocated.reservedPaise : 0)) throw new Error("REFUND_EXCEEDS_ALLOCATED_CAPTURE");
          if (unallocated) unallocated.reservedPaise += remaining;
          await event(`refund-reserve:${w.ref.path}`, w.ref.path, reservedLines);
        }
        if (data.status === "processed" && before.get("status") !== "processed") await event(`refund-confirmed:${w.ref.path}`, w.ref.path, transfer("refund_obligation", "helpkey_cash", n, refs));
        continue;
      }
      if (before.exists) continue; // Captures/receipts are immutable; status updates cannot create money.
      const hotel = w.ref.parent.id === "propertyPayments", n = money(data.amountPaise);
      if (hotel && ["refund", "reversal"].includes(data.type)) {
        let remaining = n;
        for (const a of state.allocations.filter(a => a.receiptId === data.receiptId && a.source === "hotel")) {
          const reversed = Math.min(remaining, a.amountPaise - a.reversedPaise); a.reversedPaise += reversed; remaining -= reversed;
          const l = state.lines.find(l => l.agreementId === a.agreementId && l.lineId === a.lineId)!; l.hotelFundedPaise -= reversed; l.outstandingPaise += reversed;
        }
        if (remaining) throw new Error("RECEIPT_REVERSAL_EXCEEDS_REMAINING");
        await event(`hotel-return:${w.ref.path}`, w.ref.path, transfer("customer_obligation", "hotel_cash", n, { bookingId }), data.actorId, data.reason); continue;
      }
      if (hotel && data.type !== "collection") continue;
      const pendingRefund = writes.some(r => r.ref.parent.id === "refunds" && r.data.paymentId === w.ref.id && r.data.bookingId === bookingId);
      const late = !hotel && (data.status === "refund_pending" || pendingRefund && !data.stayQuote && b.razorpayPaymentId !== w.ref.id);
      const explicitRequests = !hotel && data.stayQuote ? (b.stayPaymentReceipts ?? []).filter((r: Data) => r.paymentId === w.ref.id).map((r: Data) => r.requestId) : undefined;
      const allocated = late ? { allocations: [], unallocatedPaise: n } : allocateReceipt(n, state.lines, explicitRequests);
      for (const part of allocated.allocations) {
        const l = state.lines.find(l => l.agreementId === part.agreementId && l.lineId === part.lineId)!;
        const id = fingerprint({ receipt: w.ref.path, agreementId: l.agreementId, lineId: l.lineId });
        state.allocations.push({ id, receiptId: w.ref.id, agreementId: l.agreementId, lineId: l.lineId, amountPaise: part.amountPaise, reversedPaise: 0, source: hotel ? "hotel" : "helpkey", receivedAt: iso(data.createdAt) ?? now, feeResolved: hotel || l.providerCharges !== "hotel", offsetPaise: 0 });
        if (hotel) l.hotelFundedPaise += part.amountPaise; else l.fundedPaise += part.amountPaise;
        l.outstandingPaise -= part.amountPaise;
        if (hotel && l.helpkeyOwned) await event(`hotel-customer-fee:${w.ref.path}:${id}`, w.ref.path, transfer("hotel_charges", "hotel_cash", part.amountPaise, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }));
        await event(`collection:${w.ref.path}:${id}`, w.ref.path, transfer(hotel ? "hotel_cash" : "helpkey_cash", "customer_obligation", part.amountPaise, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId, allocationId: id }), data.actorId);
      }
      state.unallocatedPaise += allocated.unallocatedPaise;
      if (allocated.unallocatedPaise) state.unallocatedReceipts = [...(state.unallocatedReceipts ?? []), { receiptId: w.ref.id, amountPaise: allocated.unallocatedPaise, reservedPaise: 0 }];
      if (allocated.unallocatedPaise) await event(`unallocated-capture:${w.ref.path}`, w.ref.path, transfer(hotel ? "hotel_cash" : "helpkey_cash", "refund_obligation", allocated.unallocatedPaise, { bookingId }), data.actorId);
    }
    state.status = b.bookingStatus;
    state.scheduledCheckOutAt = iso(b.endAt) ?? state.scheduledCheckOutAt;
    if (["expired", "payment_failed"].includes(b.bookingStatus)) for (const l of state.lines) {
      if (!l.outstandingPaise) continue;
      const n = l.outstandingPaise;
      await event(`void-unfunded:${bookingId}:${l.agreementId}:${l.lineId}`, ref.path, transfer(l.helpkeyOwned ? "helpkey_revenue" : "hotel_entitlement", "customer_obligation", n, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }), "system:finance", "Unfunded expired agreement released");
      l.voidedPaise = (l.voidedPaise ?? 0) + n; l.outstandingPaise = 0;
    }
    state.actualCheckOutAt = iso(b.actualCheckOutAt) ?? state.actualCheckOutAt;
    if (["cancelled", "no_show"].includes(b.bookingStatus)) {
      const refundPaise = state.lines.reduce((n, l) => n + l.refundReservedPaise, 0);
      const retainedPaise = state.lines.reduce((n, l) => n + l.fundedPaise + l.hotelFundedPaise - l.refundReservedPaise, 0);
      const outcome = { retainedPaise, refundPaise };
      if (state.retentionOutcome && fingerprint(outcome) !== fingerprint(state.retentionOutcome)) state.financialResolvedAt = null;
      state.retentionOutcome = outcome;
      state.retentionPending = !state.financialResolvedAt;
      if (state.retentionPending && saved.get("retentionPending") !== true) tx.set(unit.account(propertyId).collection("retentionQueue").doc(bookingId), { bookingId, reference: state.reference, status: "pending", reason: "Founder must allocate saved retention to room, extra and tax components", createdAt: now }, { merge: true });
    }
    for (const l of state.lines) {
      const request = (b.customizations ?? []).find((r: Data) => r.id === l.requestId);
      const fulfilled = l.kind !== "room" && l.fulfilledAt && l.fulfilledAt <= now && !["cancelled", "declined"].includes(request?.status) && !["cancelled", "no_show", "expired", "payment_failed"].includes(b.bookingStatus);
      const recognized = l.kind === "room" ? !!state.actualCheckOutAt : !!fulfilled;
      if (recognized && !l.helpkeyOwned) {
        const commission = l.commissionPaise - l.commissionReversedPaise;
        if (l.recognizedCommissionPaise < commission) { await event(`commission:${bookingId}:${l.agreementId}:${l.lineId}`, ref.path, transfer("hotel_charges", "helpkey_revenue", commission - l.recognizedCommissionPaise, { bookingId, agreementId: l.agreementId, chargeLineId: l.lineId })); l.recognizedCommissionPaise = commission; }
        if (l.assessment === "pending" && l.ruleRefs.length && !l.ambiguousRules) for (const ruleRef of l.ruleRefs) await assessLine(db, tx, unit, state, l, ruleRef, now);
        l.eligibleAt = new Date(Date.parse(l.kind === "room" ? state.actualCheckOutAt! : l.fulfilledAt!) + l.waitHours * 3600000).toISOString();
      }
    }
    updated.set(propertyId, [...(updated.get(propertyId) ?? []), state]);
    if (previousStateFingerprint !== fingerprint(state)) {
      state.revision++;
      tx.set(stateRef, state);
      const projection = await unit.projection(propertyId);
      tx.set(unit.account(propertyId), { projection, revision: FieldValue.increment(1), sourceRevision: FieldValue.increment(1), updatedAt: now }, { merge: true });
    }
  }
  for (const [propertyId, states] of updated) await offsetEligibleFunds(db, tx, unit, propertyId, states);
}
export async function assessLine(db: Firestore, tx: Transaction, unit: PostingUnit, state: BookingAccount, l: AccountLine, ruleRef: string, now: string) {
  if (l.assessedRuleRefs?.includes(ruleRef)) return;
  const doc = await tx.get(db.collection("financeDeductionRules").doc(ruleRef));
  const rule: DeductionRule = deductionRuleSchema.parse(doc.get("rule"));
  if (rule.recognitionEvent !== (state.financialResolvedAt ? "retention" : l.kind === "room" ? "checkout" : "fulfilment")) throw new Error("RULE_RECOGNITION_EVENT_MISMATCH");
  if (rule.synthetic && !syntheticProject()) throw new Error("SYNTHETIC_PRODUCTION_RULE");
  if (doc.get("state") !== "published") throw new Error("REVIEWED_RULE_REQUIRED");
  if (!l.participant && rule.applicability.legalParticipant === "hotel_pan") return;
  const participant = rule.applicability.legalParticipant === "helpkey" ? "helpkey" : l.participant!;
  const recognitionAt = l.kind === "room" ? state.financialResolvedAt ?? state.actualCheckOutAt ?? now : l.fulfilledAt ?? now;
  const key = fingerprint({ rule: rule.id, version: rule.version, participant, period: counterPeriod(rule, recognitionAt), propertyId: rule.threshold?.aggregation === "property" ? state.propertyId : null });
  const counter = db.collection("financeAssessmentCounters").doc(key), before = await tx.get(counter);
  const base = rule.base === "commission" ? l.recognizedCommissionPaise : rule.base === "gross" ? l.retainedGrossPaise ?? (l.grossPaise - l.reducedPaise) : l.retainedTaxablePaise ?? (l.taxablePaise - (l.taxableReducedPaise ?? 0));
  const preview = assessmentPreview(rule, base, before.get("basePaise") ?? 0);
  const childId = `${l.assessmentId}_${fingerprint(ruleRef).slice(0, 16)}`;
  const assessmentRef = unit.account(state.propertyId).collection("assessments").doc(childId);
  // A unit can assess several lines sharing a counter; include buffered advances explicitly.
  const staged = counterAdvances.get(unit) ?? new Map<string, number>();
  const effective = assessmentPreview(rule, base, staged.get(key) ?? preview.counterBeforePaise);
  staged.set(key, effective.counterAfterPaise); counterAdvances.set(unit, staged);
  tx.set(counter, { basePaise: effective.counterAfterPaise, participantHash: fingerprint(participant), period: counterPeriod(rule, recognitionAt), ruleRef, revision: (before.get("revision") ?? 0) + 1, updatedAt: now });
  tx.set(assessmentRef, { ...effective, bookingId: state.bookingId, agreementId: l.agreementId, lineId: l.lineId, status: "complete", ruleRef, counterKey: key, assessedAt: now, reversedPaise: 0 });
  await unit.event(state.propertyId, `assessment:${childId}`, assessmentRef.path, transfer("hotel_charges", "statutory_liability", effective.amountPaise, { bookingId: state.bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }), "system:finance", "Reviewed saved deduction rule", { ruleRef, assessmentRef: assessmentRef.path });
  l.assessedRuleRefs = [...(l.assessedRuleRefs ?? []), ruleRef];
  if (l.ruleRefs.length && l.ruleRefs.every(r => l.assessedRuleRefs!.includes(r))) {
    l.assessment = "complete";
    tx.set(unit.account(state.propertyId).collection("assessments").doc(l.assessmentId), { status: "complete", ruleRefs: l.ruleRefs, assessedAt: now }, { merge: true });
  }
}
const counterAdvances = new WeakMap<PostingUnit, Map<string, number>>();
