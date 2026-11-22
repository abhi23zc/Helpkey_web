import "server-only";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { financeAccess } from "./service";
import { financeReadiness } from "./readiness";
import { offsetEligibleFunds } from "./offsets";
import { emptyProjection, fingerprint, reversedLines, transfer, type Journal } from "./ledger";
import { accountSummary, eligibleAllocations, type AccountHold } from "./accounts";
import { assessLine, type BookingAccount } from "./source-integration";
import { PostingUnit } from "./posting";
import { allocate, checked, halfUp } from "./calculation";
import { outstandingDues, allocateDues } from "./dues";
import { assessmentPreview, deductionRuleSchema } from "./assessments";
import { syntheticProject } from "./tax-configuration";
const id = z.string().min(1).max(200).regex(/^[^/]+$/), amount = z.number().int().nonnegative().safe();
const base = { mutationId: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/), expectedRevision: amount, reason: z.string().trim().min(3).max(2000) };
export const accountCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("accounting_activation"), enabled: z.boolean() }).strict(),
  z.object({ ...base, action: z.literal("rule_draft"), rule: deductionRuleSchema }).strict(),
  z.object({ ...base, action: z.enum(["rule_review", "rule_publish"]), ruleRef: id }).strict(),
  z.object({ ...base, action: z.literal("rule_preview"), rule: deductionRuleSchema, basePaise: amount, counterBeforePaise: amount }).strict(),
  z.object({ ...base, action: z.literal("assessment_resolve"), bookingId: id, assessmentId: id, ruleRef: id }).strict(),
  z.object({ ...base, action: z.literal("provider_fee"), bookingId: id, captureId: id, amountPaise: amount, evidence: z.string().trim().min(3).max(2000) }).strict(),
  z.object({ ...base, action: z.literal("hotel_receipt"), amountPaise: amount.refine(v => v > 0), reference: z.string().trim().min(3).max(300), evidence: z.string().trim().min(3).max(2000), receivedAt: z.string().datetime() }).strict(),
  z.object({ ...base, action: z.literal("hold"), amountPaise: amount.refine(v => v > 0), bookingId: id.nullable(), releaseCondition: z.string().trim().min(3).max(2000) }).strict(),
  z.object({ ...base, action: z.literal("release_hold"), holdId: id }).strict(),
  z.object({ ...base, action: z.literal("reverse"), recordId: id }).strict(),
  z.object({ ...base, action: z.literal("offset_dues") }).strict(),
  z.object({ ...base, action: z.literal("retention_resolve"), bookingId: id, lines: z.array(z.object({ agreementId: id, lineId: id, retainedTaxablePaise: amount, retainedTaxPaise: amount, refundedPaise: amount, collectionSource: z.enum(["helpkey", "hotel", "mixed"]), hotelRetainedPaise: amount.optional(), taxTreatment: z.string().trim().min(3).max(1000) }).strict()).min(1).max(100) }).strict(),
]);
const root = (propertyId: string) => adminDb.collection("financeAccounts").doc(propertyId);
export async function accountReadiness(tx: FirebaseFirestore.Transaction, propertyId: string) { return financeReadiness(adminDb, tx, propertyId); }
export async function readAccount(uid: string, propertyId: string, admin: boolean) {
  if (!id.safeParse(propertyId).success) throw new ApiException("NOT_FOUND", 404);
  return adminDb.runTransaction(async tx => {
    await financeAccess(uid, propertyId, admin, tx);
    const [account, bookingDocs, holdDocs, ready, assessmentDocs, records] = await Promise.all([tx.get(root(propertyId)), tx.get(root(propertyId).collection("bookings")), tx.get(root(propertyId).collection("holds")), accountReadiness(tx, propertyId), tx.get(root(propertyId).collection("assessments").where("status", "==", "pending")), tx.get(root(propertyId).collection("commands").orderBy("createdAt", "desc").limit(100))]);
    const now = new Date().toISOString(), bookings = bookingDocs.docs.map(d => d.data() as BookingAccount);
    const summary = accountSummary(account.get("projection") ?? emptyProjection(), bookings, holdDocs.docs.map(d => ({ id: d.id, ...d.data() }) as AccountHold), ready.policy, ready.ready, now);
    const statements = bookings.map(b => ({ bookingId: b.bookingId, reference: b.reference, status: b.status, actualCheckOutAt: b.actualCheckOutAt, financialResolvedAt: b.financialResolvedAt, retentionPending: b.retentionPending, grossChargesPaise: b.lines.reduce((n, l) => n + l.grossPaise - l.reducedPaise, 0), customerUnpaidPaise: b.lines.reduce((n, l) => n + l.outstandingPaise, 0), lines: b.lines.map(l => ({ agreementId: l.agreementId, lineId: l.lineId, kind: l.kind, grossPaise: l.grossPaise, reducedPaise: l.reducedPaise, commissionPaise: l.recognizedCommissionPaise, assessment: l.assessment, eligibleAt: l.eligibleAt, assessmentId: l.assessmentId })), offsetsPaise: b.allocations.reduce((n, a) => n + a.offsetPaise, 0) }));
    const publicSummary = { ...summary, allocations: undefined };
    return { contractVersion: 3, propertyId, accountRevision: account.get("revision") ?? 0, calculationTimestamp: now, ...publicSummary, readiness: ready.readiness, bookings: statements, ...(admin ? { allocations: summary.allocations, pendingAssessments: assessmentDocs.docs.map(d => ({ id: d.id, ...d.data() })), records: records.docs.map(d => ({ id: d.id, ...d.data() })) } : {}) };
  });
}
export async function accountTransactions(uid: string, propertyId: string, admin: boolean, cursor?: string) {
  if (!id.safeParse(propertyId).success) throw new ApiException("NOT_FOUND", 404);
  return adminDb.runTransaction(async tx => {
    await financeAccess(uid, propertyId, admin, tx);
    const account = await tx.get(root(propertyId));
    const revision = account.get("projection.revision") ?? 0;
    let after = revision + 1;
    if (cursor) {
      let raw: unknown; try { raw = JSON.parse(Buffer.from(cursor, "base64url").toString()); } catch { throw new ApiException("INVALID_CURSOR", 400); }
      const parsed = z.object({ propertyId: z.literal(propertyId), revision: amount, before: amount }).strict().safeParse(raw);
      if (!parsed.success) throw new ApiException("INVALID_CURSOR", 400);
      if (parsed.data.revision !== revision) throw new ApiException("FINANCE_CONFLICT", 409, "Account changed. Reload the statement."); after = parsed.data.before;
    }
    const docs = await tx.get(root(propertyId).collection("journals").where("revision", "<", after).orderBy("revision", "desc").limit(26));
    const rows = docs.docs.slice(0, 25).map(d => d.data() as Journal);
    const bookingIds = [...new Set(rows.flatMap(j => j.lines.flatMap(l => l.bookingId ? [l.bookingId] : [])))];
    const bookingRefs = await Promise.all(bookingIds.map(b => tx.get(root(propertyId).collection("bookings").doc(b))));
    const references = new Map(bookingRefs.map(b => [b.id, b.get("reference")]));
    return { contractVersion: 3, accountRevision: account.get("revision") ?? 0, calculationTimestamp: new Date().toISOString(), transactions: rows.map(j => admin ? j : { date: j.effectiveAt, description: j.reason, reference: references.get(j.lines.find(l => l.bookingId)?.bookingId ?? "") ?? "Hotel account", amountPaise: j.lines.reduce((n, l) => n + l.debitPaise, 0), reversal: !!j.reversalOf }), nextCursor: docs.size > 25 ? Buffer.from(JSON.stringify({ propertyId, revision, before: rows.at(-1)!.revision })).toString("base64url") : null };
  });
}
function conflict() { throw new ApiException("FINANCE_CONFLICT", 409, "Account changed. Your draft is retained; reload and review before retrying."); }
export async function mutateAccount(uid: string, propertyId: string | undefined, raw: unknown) {
  const c = accountCommandSchema.parse(raw), globalAction = c.action.startsWith("rule_") || c.action === "accounting_activation";
  if (globalAction === !!propertyId || propertyId && !id.safeParse(propertyId).success) throw new ApiException("INVALID_ACCOUNT_SCOPE", 422);
  return adminDb.runTransaction(async tx => {
    await financeAccess(uid, propertyId, true, tx, true);
    const scope = propertyId ? root(propertyId) : adminDb.doc("financeConfiguration/deductions");
    const mutationId = fingerprint({ uid, mutationId: c.mutationId }), mutation = scope.collection("commands").doc(mutationId);
    const prior = await tx.get(mutation), payload = fingerprint(c);
    if (prior.exists) { if (prior.get("fingerprint") !== payload) throw new ApiException("MUTATION_REUSED", 409); return prior.get("result"); }
    if (c.action === "rule_preview") return { preview: assessmentPreview(c.rule, c.basePaise, c.counterBeforePaise) };
    const current = await tx.get(scope), revision = current.get("revision") ?? 0;
    if (revision !== c.expectedRevision) conflict();
    const now = new Date().toISOString(), unit = new PostingUnit(adminDb, tx, now);
    const updatedStates: BookingAccount[] = [];
    let result: Record<string, unknown> = { revision: revision + 1 };
    const post = async (key: string, lines: ReturnType<typeof transfer>, refs: Parameters<PostingUnit["event"]>[6] = {}) => unit.event(propertyId!, `${c.action}:${mutationId}:${key}`, mutation.path, lines, uid, c.reason, refs);
    if (c.action === "accounting_activation") {
      tx.set(adminDb.doc("financeConfiguration/accounting"), { enabled: c.enabled, revision: revision + 1, updatedBy: uid, updatedAt: now, reason: c.reason });
    } else if (c.action === "rule_draft") {
      if (c.rule.synthetic && !syntheticProject()) throw new ApiException("SYNTHETIC_PRODUCTION_RULE", 422);
      const ref = adminDb.collection("financeDeductionRules").doc(`${c.rule.id}_${c.rule.version}`);
      if ((await tx.get(ref)).exists) throw new ApiException("IMMUTABLE_RULE_VERSION", 409);
      tx.create(ref, { rule: c.rule, state: "draft", draftedBy: uid, draftedAt: now });
    } else if (c.action === "rule_review" || c.action === "rule_publish") {
      const ref = adminDb.collection("financeDeductionRules").doc(c.ruleRef), d = await tx.get(ref);
      if (d.get("state") !== (c.action === "rule_review" ? "draft" : "reviewed")) throw new ApiException("INVALID_RULE_STATE", 409);
      if (d.get("rule.synthetic") && !syntheticProject()) throw new ApiException("SYNTHETIC_PRODUCTION_RULE", 422);
      if (c.action === "rule_review") tx.update(ref, { state: "reviewed", reviewedBy: uid, reviewedAt: now, reviewReason: c.reason });
      else { tx.update(ref, { state: "published", publishedBy: uid, publishedAt: now, publicationReason: c.reason }); tx.set(scope, { active: [...new Set([...(current.get("active") ?? []).filter((r: string) => !r.startsWith(`${d.get("rule.id")}_`)), c.ruleRef])] }, { merge: true }); }
    } else if (c.action === "hold") {
      if (c.bookingId && !(await tx.get(root(propertyId!).collection("bookings").doc(c.bookingId))).exists) throw new ApiException("NOT_FOUND", 404);
      tx.create(root(propertyId!).collection("holds").doc(mutationId), { amountPaise: c.amountPaise, bookingId: c.bookingId, reason: c.reason, responsibleAdmin: uid, releaseCondition: c.releaseCondition, releasedAt: null, createdAt: now });
    } else if (c.action === "release_hold") {
      const ref = root(propertyId!).collection("holds").doc(c.holdId), h = await tx.get(ref);
      if (!h.exists || h.get("releasedAt")) throw new ApiException("INVALID_HOLD", 409);
      tx.update(ref, { releasedAt: now, releasedBy: uid, releaseReason: c.reason });
    } else if (c.action === "hotel_receipt") {
      const source = root(propertyId!).collection("receiptReferences").doc(fingerprint(c.reference));
      if ((await tx.get(source)).exists) throw new ApiException("RECEIPT_REFERENCE_REUSED", 409);
      const projection = await unit.projection(propertyId!), dues = Math.max(0, projection.balances.hotel_charges), allocatedPaise = Math.min(dues, c.amountPaise);
      const dueHistory = await tx.get(root(propertyId!).collection("journals").orderBy("revision"));
      const duesAllocations = allocateDues(allocatedPaise, outstandingDues(dueHistory.docs.map(d => d.data() as Journal)));
      const j = await post("receipt", [...transfer("hotel_receipts", "hotel_charges", allocatedPaise), ...transfer("hotel_receipts", "hotel_credit", c.amountPaise - allocatedPaise)]);
      tx.create(source, { recordId: mutationId, reference: c.reference, receivedAt: c.receivedAt });
      result = { ...result, duesAllocations, allocatedPaise, creditPaise: c.amountPaise - allocatedPaise, journalIds: j ? [j.id] : [] };
    } else if (c.action === "reverse") {
      const originalRef = scope.collection("commands").doc(c.recordId), original = await tx.get(originalRef);
      if (!original.exists || original.get("reversedBy") || !["provider_fee", "hotel_receipt"].includes(original.get("action"))) throw new ApiException("REVERSAL_NOT_ALLOWED", 422, "Captured and refunded money requires a confirmed source event.");
      const journals = await Promise.all((original.get("result.journalIds") ?? []).map((j: string) => tx.get(root(propertyId!).collection("journals").doc(j))));
      if (original.get("action") === "hotel_receipt") {
        const credit = original.get("result.creditPaise") ?? 0, projection = await unit.projection(propertyId!);
        if (credit > -projection.balances.hotel_credit) throw new ApiException("CREDIT_ALREADY_USED", 409);
      }
      for (const j of journals) await post(j.id, reversedLines(j.data() as Journal), { reversalOf: j.id });
      if (original.get("action") === "provider_fee") {
        const originalCommand = original.get("command"), stateRef = root(propertyId!).collection("bookings").doc(originalCommand.bookingId), stateDoc = await tx.get(stateRef), state = stateDoc.data() as BookingAccount;
        state.allocations.filter(a => a.receiptId === originalCommand.captureId).forEach(a => { const l = state.lines.find(l => l.agreementId === a.agreementId && l.lineId === a.lineId)!; a.feeResolved = l.providerCharges !== "hotel"; });
        tx.set(stateRef, state);
        tx.delete(root(propertyId!).collection("feeSources").doc(fingerprint(originalCommand.captureId)));
      }
      tx.update(originalRef, { reversedBy: uid, reversalRecord: mutationId, reversedAt: now, reversalReason: c.reason });
    } else if (c.action === "offset_dues") {
      const [states, holds, readiness] = await Promise.all([tx.get(root(propertyId!).collection("bookings")), tx.get(root(propertyId!).collection("holds")), accountReadiness(tx, propertyId!)]);
      const bookings = states.docs.map(d => d.data() as BookingAccount);
      let dues = Math.max(0, (await unit.projection(propertyId!)).balances.hotel_charges);
      const allocations = eligibleAllocations(bookings, holds.docs.map(d => ({ id: d.id, ...d.data() }) as AccountHold), readiness.ready, now).sort((a, b) => (a.eligibleAt ?? "").localeCompare(b.eligibleAt ?? "") || (a.receivedAt ?? "").localeCompare(b.receivedAt ?? "") || a.id.localeCompare(b.id));
      for (const a of allocations) { const n = Math.min(dues, a.eligiblePaise); if (!n) continue; const state = bookings.find(b => b.bookingId === a.bookingId)!; state.allocations.find(x => x.id === a.id)!.offsetPaise += n; dues -= n; await post(a.id, transfer("hotel_entitlement", "hotel_charges", n, { bookingId: a.bookingId, agreementId: a.agreementId, chargeLineId: a.lineId, allocationId: a.id })); }
      bookings.forEach(b => tx.set(root(propertyId!).collection("bookings").doc(b.bookingId), b));
    } else if ("bookingId" in c) {
      const stateRef = root(propertyId!).collection("bookings").doc(c.bookingId), stateDoc = await tx.get(stateRef), bookingRef = adminDb.collection("bookings").doc(c.bookingId), booking = await tx.get(bookingRef);
      if (!stateDoc.exists || booking.get("propertyId") !== propertyId || booking.get("accounting.included") !== true) throw new ApiException("NOT_FOUND", 404);
      const state = stateDoc.data() as BookingAccount;
      if (c.action === "provider_fee") {
        const capture = await tx.get(adminDb.collection("paymentAttempts").doc(c.captureId));
        if (capture.get("bookingId") !== c.bookingId || c.amountPaise > capture.get("amountPaise")) throw new ApiException("INVALID_PROVIDER_FEE", 422);
        const feeRef = root(propertyId!).collection("feeSources").doc(fingerprint(c.captureId));
        if ((await tx.get(feeRef)).exists) throw new ApiException("FEE_ALREADY_RECORDED", 409);
        const allocations = state.allocations.filter(a => a.receiptId === c.captureId);
        const unallocated = capture.get("amountPaise") - allocations.reduce((n, a) => n + a.amountPaise, 0);
        const feeParts = allocate(c.amountPaise, [...allocations.map(a => a.amountPaise), unallocated]);
        const hotelFeePaise = allocations.reduce((n, a, i) => n + (state.lines.find(l => l.agreementId === a.agreementId && l.lineId === a.lineId)?.providerCharges === "hotel" ? feeParts[i] : 0), 0);
        const j = await post("fee", [...transfer("hotel_charges", "helpkey_cash", hotelFeePaise, { bookingId: c.bookingId }), ...transfer("provider_expense", "helpkey_cash", c.amountPaise - hotelFeePaise, { bookingId: c.bookingId })]);
        allocations.forEach(a => { a.feeResolved = true; }); tx.create(feeRef, { captureId: c.captureId, amountPaise: c.amountPaise, hotelFeePaise, helpkeyFeePaise: c.amountPaise - hotelFeePaise, evidence: c.evidence, recordId: mutationId, allocations: allocations.map((a, i) => ({ allocationId: a.id, amountPaise: feeParts[i] })) });
        result = { ...result, journalIds: j ? [j.id] : [] };
      } else if (c.action === "assessment_resolve") {
        const l = state.lines.find(l => l.assessmentId === c.assessmentId && l.assessment === "pending");
        if (!l) throw new ApiException("ASSESSMENT_NOT_PENDING", 409);
        const doc = await tx.get(adminDb.collection("financeDeductionRules").doc(c.ruleRef)), rule = deductionRuleSchema.parse(doc.get("rule"));
        if (rule.category !== l.kind && rule.category !== "commission" || !rule.applicability.jurisdictions.includes(l.jurisdiction) || !rule.applicability.registrations.includes(l.registration) || rule.applicability.propertyIds.length && !rule.applicability.propertyIds.includes(propertyId!) || rule.effectiveFrom > l.acceptedAt.slice(0, 10) || rule.effectiveThrough < l.acceptedAt.slice(0, 10)) throw new ApiException("RULE_NOT_APPLICABLE", 422);
        if (!l.eligibleAt && !state.financialResolvedAt) throw new ApiException("RECOGNITION_PENDING", 409);
        if (l.assessedRuleRefs?.length) throw new ApiException("PARTIAL_ASSESSMENT_REVIEW_REQUIRED", 409);
        l.ruleRefs = [c.ruleRef]; l.ambiguousRules = false;
        await assessLine(adminDb, tx, unit, state, l, c.ruleRef, now);
        tx.set(root(propertyId!).collection("assessments").doc(l.assessmentId), { attachedBy: uid, attachmentReason: c.reason, attachedAt: now }, { merge: true });
      } else if (c.action === "retention_resolve") {
        if (!state.retentionPending || !["cancelled", "no_show"].includes(booking.get("bookingStatus"))) throw new ApiException("RETENTION_NOT_PENDING", 409);
        if (new Set(c.lines.map(l => `${l.agreementId}:${l.lineId}`)).size !== c.lines.length || c.lines.length !== state.lines.length) throw new ApiException("COMPLETE_LINE_BREAKDOWN_REQUIRED", 422);
        let retained = 0, refunds = 0;
        for (const r of c.lines) {
          const l = state.lines.find(l => l.agreementId === r.agreementId && l.lineId === r.lineId);
          if (!l || r.retainedTaxablePaise > l.taxablePaise - (l.taxableReducedPaise ?? 0) || r.retainedTaxPaise > l.grossPaise - l.taxablePaise - (l.reducedPaise - (l.taxableReducedPaise ?? 0)) || r.retainedTaxablePaise + r.retainedTaxPaise + r.refundedPaise > l.grossPaise - l.reducedPaise || (r.collectionSource === "helpkey" ? l.fundedPaise - l.refundReservedPaise : r.collectionSource === "hotel" ? l.hotelFundedPaise : l.fundedPaise + l.hotelFundedPaise - l.refundReservedPaise) < r.retainedTaxablePaise + r.retainedTaxPaise) throw new ApiException("INVALID_RETENTION_COMPONENTS", 422);
          const hotelShare = r.collectionSource === "hotel" ? r.retainedTaxablePaise + r.retainedTaxPaise : r.collectionSource === "mixed" ? r.hotelRetainedPaise ?? 0 : 0;
          const helpkeyShare = r.retainedTaxablePaise + r.retainedTaxPaise - hotelShare;
          if (hotelShare > l.hotelFundedPaise || helpkeyShare < 0 || helpkeyShare > l.fundedPaise - l.refundReservedPaise) throw new ApiException("RETENTION_SOURCE_MISMATCH", 422);
          retained += r.retainedTaxablePaise + r.retainedTaxPaise; refunds += r.refundedPaise;
          const commission = l.kind === "room" && l.taxablePaise ? checked(halfUp(BigInt(l.commissionPaise - l.commissionReversedPaise) * BigInt(r.retainedTaxablePaise), BigInt(l.taxablePaise))) : 0;
          if (l.recognizedCommissionPaise) throw new ApiException("RETENTION_ALREADY_RECOGNIZED", 409);
          await post(`commission:${l.lineId}:${l.agreementId}`, transfer("hotel_charges", "helpkey_revenue", commission, { bookingId: c.bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }));
          l.recognizedCommissionPaise = commission; l.retainedTaxablePaise = r.retainedTaxablePaise; l.retainedGrossPaise = r.retainedTaxablePaise + r.retainedTaxPaise;
          const waived = l.grossPaise - l.reducedPaise - l.retainedGrossPaise - r.refundedPaise;
          if (waived > l.outstandingPaise) throw new ApiException("RETENTION_COLLECTION_MISMATCH", 422);
          await post(`waived:${l.agreementId}:${l.lineId}`, transfer(l.helpkeyOwned ? "helpkey_revenue" : "hotel_entitlement", "customer_obligation", waived, { bookingId: c.bookingId, agreementId: l.agreementId, chargeLineId: l.lineId }));
          l.outstandingPaise -= waived;
          l.eligibleAt = new Date(Math.max(Date.parse(state.scheduledCheckOutAt ?? now), Date.parse(now)) + l.waitHours * 3600000).toISOString();
        }
        const refundDocs = await tx.get(adminDb.collection("refunds").where("bookingId", "==", c.bookingId));
        const totalOriginalGross = state.lines.reduce((n, l) => n + l.grossPaise - l.reducedPaise, 0);
        const outcome = state.retentionOutcome;
        if (outcome && (outcome.retainedPaise !== retained || outcome.refundPaise !== refunds)) throw new ApiException("RETENTION_OUTCOME_MISMATCH", 422);
        if (retained > totalOriginalGross) throw new ApiException("RETENTION_OUTCOME_MISMATCH", 422);
        const knownRefunds = refundDocs.docs.reduce((n, d) => n + d.get("amountPaise"), 0) + (booking.get("propertyRefundedPaise") ?? 0);
        const collected = state.lines.reduce((n, l) => n + l.fundedPaise + l.hotelFundedPaise, 0);
        if (refunds !== knownRefunds || retained + refunds > collected) throw new ApiException("RETENTION_OUTCOME_MISMATCH", 422, "Match saved collections and refund obligations before resolving retention.");
        state.financialResolvedAt = now; state.retentionPending = false;
        for (const l of state.lines.filter(l => !l.helpkeyOwned)) {
          l.ruleRefs = l.retentionRuleRefs ?? []; l.assessedRuleRefs = []; l.assessment = "pending";
          const docs = await Promise.all(l.ruleRefs.map(ref => tx.get(adminDb.collection("financeDeductionRules").doc(ref))));
          l.ambiguousRules = new Set(docs.map(d => d.get("rule.id"))).size !== docs.length;
          tx.set(root(propertyId!).collection("assessments").doc(l.assessmentId), { status: "pending", reason: l.ruleRefs.length ? "Retention assessment" : "Missing reviewed retention rule", ruleRefs: l.ruleRefs }, { merge: true });
          if (l.ruleRefs.length && !l.ambiguousRules) for (const ref of l.ruleRefs) await assessLine(adminDb, tx, unit, state, l, ref, now);
        }
        tx.update(bookingRef, { financialResolvedAt: now });
        tx.set(root(propertyId!).collection("retentionQueue").doc(c.bookingId), { status: "resolved", lines: c.lines, resolvedAt: now, resolvedBy: uid, reason: c.reason });
      }
      state.revision++; tx.set(stateRef, state); updatedStates.push(state);
    }
    if (propertyId && ["provider_fee", "assessment_resolve", "retention_resolve"].includes(c.action)) await offsetEligibleFunds(adminDb, tx, unit, propertyId, updatedStates);
    tx.set(scope, { revision: revision + 1, updatedAt: now }, { merge: true });
    tx.create(mutation, { action: c.action, command: c, actorId: uid, reason: c.reason, fingerprint: payload, result, createdAt: now });
    return result;
  });
}
export async function readAccountConfiguration(uid: string) {
  return adminDb.runTransaction(async tx => {
    await financeAccess(uid, undefined, true, tx);
    const [registry, rules, activation] = await Promise.all([tx.get(adminDb.doc("financeConfiguration/deductions")), tx.get(adminDb.collection("financeDeductionRules").limit(500)), tx.get(adminDb.doc("financeConfiguration/accounting"))]);
    return { revision: registry.get("revision") ?? 0, active: registry.get("active") ?? [], accountingEnabled: activation.get("enabled") === true, rules: rules.docs.map(d => ({ ref: d.id, ...d.data() })) };
  });
}
