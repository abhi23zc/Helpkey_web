import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICY, EMPTY_PROFILE } from "@/lib/finance/domain";
import { fingerprint, replay, type Journal } from "@/lib/finance/ledger";
const enabled = /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "");
describe.skipIf(!enabled)("Phase 3 isolated accounting commits", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb, service: typeof import("@/lib/finance/account-service");
  const prefix = `p3_${crypto.randomUUID()}`, hotel = `${prefix}_hotel`, hotel2 = `${prefix}_other`, admin = `${prefix}_admin`, guest = `${prefix}_guest`;
  const globals = ["accounting", "global", "deductions", "agreements"], before = new Map<string, FirebaseFirestore.DocumentData | undefined>();
  let sequence = 0;
  const agreement = { publicCalculation: { lines: [{ id: "room:one", kind: "room", taxablePaise: 10000, taxPaise: 0, totalPaise: 10000, serviceDate: "2026-01-01" }] }, internal: { commission: [{ lineId: "room:one", amountPaise: 1000 }], providerCharges: { allocatedTo: "hotel" } }, acceptedBy: admin, acceptedAt: "2026-01-01T00:00:00.000Z" };
  const rule = { id: `${prefix}_rule`, version: 1, title: "Synthetic no-deduction outcome", legalReference: "Synthetic emulator fixture", synthetic: true, category: "room", recognitionEvent: "checkout", base: "taxable", outcome: "not_applicable", calculation: { kind: "fixed", amountPaise: 0 }, rounding: "half_up_paise", effectiveFrom: "2025-01-01", effectiveThrough: "2028-12-31", applicability: { jurisdictions: ["example"], registrations: ["unregistered"], propertyIds: [], legalParticipant: "hotel_pan" }, threshold: null, correction: "reverse_saved" };
  const command = (action: string, values: Record<string, unknown>, revision: number) => ({ action, mutationId: crypto.randomUUID(), expectedRevision: revision, reason: "Synthetic isolated accounting test", ...values });
  async function rev(propertyId = hotel) { return (await db.doc(`financeAccounts/${propertyId}`).get()).get("revision") ?? 0; }
  async function newBooking(propertyId = hotel) {
    const id = `${prefix}_booking_${++sequence}`;
    await db.runTransaction(async tx => {
      tx.create(db.doc(`bookings/${id}`), { propertyId, bookingStatus: "confirmed", confirmationCode: `HK${sequence}`, endAt: "2026-01-01T12:00:00.000Z", paidPaise: 0, customizations: [] });
      tx.create(db.doc(`bookings/${id}/financialAgreements/original`), agreement);
    });
    return id;
  }
  async function capture(bookingId: string, amountPaise = 10000, paymentId = `${prefix}_capture_${++sequence}`) {
    await db.runTransaction(async tx => { const b = await tx.get(db.doc(`bookings/${bookingId}`)); const old = await tx.get(db.doc(`paymentAttempts/${paymentId}`)); if (old.exists) return; tx.create(db.doc(`paymentAttempts/${paymentId}`), { bookingId, propertyId: b.get("propertyId"), amountPaise, currency: "INR", status: "captured" }); tx.update(b.ref, { paidPaise: amountPaise, razorpayPaymentId: paymentId }); });
    return paymentId;
  }
  beforeAll(async () => {
    db = (await import("@/lib/firebase/admin")).adminDb; service = await import("@/lib/finance/account-service");
    for (const key of globals) before.set(key, (await db.doc(`financeConfiguration/${key}`).get()).data());
    await db.doc(`users/${admin}`).set({ roles: ["admin"], isActive: true, accountStatus: "active" });
    await db.doc(`users/${guest}`).set({ roles: ["customer"], isActive: true, accountStatus: "active" });
    await db.doc("financeConfiguration/accounting").set({ enabled: true, revision: 1 });
    await db.doc("financeConfiguration/global").set({ policy: { ...DEFAULT_POLICY, payoutWaitHours: 0 }, revision: 1 });
    await db.doc("financeConfiguration/agreements").set({ revision: 1 });
    await db.doc("financeConfiguration/deductions").set({ revision: 1, active: [`${rule.id}_1`] });
    await db.doc(`financeDeductionRules/${rule.id}_1`).set({ state: "published", rule });
    for (const propertyId of [hotel, hotel2]) {
      await db.doc(`properties/${propertyId}`).set({ ownerId: `${prefix}_owner`, status: "active" });
      await db.doc(`verificationDocuments/${propertyId}_doc`).set({ propertyId, status: "approved" });
      await db.doc(`propertyFinance/${propertyId}/profiles/current`).set({ revision: 1, contentRevision: 1, state: "manually_reviewed", acceptance: { agreementVersion: 1, profileRevision: 1 }, profile: { ...EMPTY_PROFILE, legalPayeeName: "Synthetic", businessAddress: "Example", businessEmail: "test@example.test", businessPhone: "1234567890", pan: "ABCDE1234F", documentIds: [`${propertyId}_doc`] } });
      await db.doc(`propertyFinance/${propertyId}/taxProfiles/current`).set({ profile: { jurisdiction: "example", registration: "unregistered" } });
    }
  }, 30000);
  afterAll(async () => {
    if (!db) return;
    for (const collection of ["bookings", "paymentAttempts", "propertyPayments", "refunds", "users", "properties", "verificationDocuments", "propertyFinance", "financeAccounts", "financeDeductionRules"]) {
      const docs = await db.collection(collection).orderBy("__name__").startAt(prefix).endAt(prefix + "\uf8ff").get();
      for (const doc of docs.docs) await db.recursiveDelete(doc.ref);
    }
    const counters = await db.collection("financeAssessmentCounters").get();
    for (const c of counters.docs.filter(d => String(d.get("ruleRef")).startsWith(prefix))) await c.ref.delete();
    for (const [key, data] of before) { if (data) await db.doc(`financeConfiguration/${key}`).set(data); else await db.doc(`financeConfiguration/${key}`).delete(); }
  }, 30000);
  it("commits obligations without claiming collected cash and saves the marker", async () => {
    const id = await newBooking(), b = await db.doc(`bookings/${id}`).get(), state = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get();
    expect(b.get("accounting.included")).toBe(true); expect(state.get("lines")[0].outstandingPaise).toBe(10000);
    expect((await db.doc(`financeAccounts/${hotel}`).get()).get("projection.balances.helpkey_cash")).toBe(0);
  });
  it("keeps old bookings and their later services excluded", async () => {
    const id = `${prefix}_legacy`; await db.doc(`bookings/${id}`).set({ propertyId: hotel, bookingStatus: "confirmed", customizations: [] });
    await db.runTransaction(async tx => { tx.create(db.doc(`bookings/${id}/financialAgreements/service_one`), agreement); tx.update(db.doc(`bookings/${id}`), { paidPaise: 10000 }); });
    expect((await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get()).exists).toBe(false);
  });
  it("continues included bookings after deactivation and excludes new bookings", async () => {
    const id = await newBooking(); await db.doc("financeConfiguration/accounting").update({ enabled: false });
    await capture(id); const excluded = await newBooking();
    expect((await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get()).get("allocations")).toHaveLength(1);
    expect((await db.doc(`bookings/${excluded}`).get()).get("accounting.included")).toBe(false);
    await db.doc("financeConfiguration/accounting").update({ enabled: true });
  });
  it("atomically allocates one capture across duplicate concurrent retries", async () => {
    const id = await newBooking(), paymentId = `${prefix}_same_capture`;
    await Promise.all([capture(id, 3000, paymentId), capture(id, 3000, paymentId)]);
    const state = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get(); expect(state.get("allocations")).toHaveLength(1); expect(state.get("lines")[0].outstandingPaise).toBe(7000);
  });
  it("recognizes commission at checkout even when unpaid and holds unknown hotel-paid fees", async () => {
    const id = await newBooking(); await capture(id, 2000);
    await db.runTransaction(async tx => { tx.update(db.doc(`bookings/${id}`), { bookingStatus: "checked_out", actualCheckOutAt: "2026-01-02T00:00:00.000Z" }); });
    const state = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get(); expect(state.get("lines")[0]).toMatchObject({ recognizedCommissionPaise: 1000, assessment: "complete", outstandingPaise: 8000 });
    const account = await service.readAccount(admin, hotel, true); expect(account.allocations!.find(a => a.bookingId === id)!.eligiblePaise).toBe(0);
  });
  it("records fees, rejects duplicate sources, and restores unresolved status on reversal", async () => {
    const id = await newBooking(), captureId = await capture(id);
    const c = command("provider_fee", { bookingId: id, captureId, amountPaise: 100, evidence: "Synthetic provider receipt" }, await rev());
    const result = await service.mutateAccount(admin, hotel, c); expect(await service.mutateAccount(admin, hotel, c)).toEqual(result);
    await expect(service.mutateAccount(admin, hotel, command("provider_fee", { bookingId: id, captureId, amountPaise: 100, evidence: "Duplicate example" }, await rev()))).rejects.toThrow("FEE_ALREADY_RECORDED");
    const records = await db.doc(`financeAccounts/${hotel}`).collection("commands").where("action", "==", "provider_fee").get();
    const record = records.docs.find(d => d.get("command.bookingId") === id)!;
    await service.mutateAccount(admin, hotel, command("reverse", { recordId: record.id }, await rev()));
    expect((await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get()).get("allocations")[0].feeResolved).toBe(false);
  });
  it("reserves refunds through failed provider requests and releases only on confirmed completion", async () => {
    const id = await newBooking(), paymentId = await capture(id), refundId = `${prefix}_refund`;
    await db.runTransaction(async tx => { tx.create(db.doc(`refunds/${refundId}`), { bookingId: id, propertyId: hotel, paymentId, amountPaise: 3000, status: "pending" }); });
    await db.runTransaction(async tx => { tx.update(db.doc(`refunds/${refundId}`), { status: "failed" }); });
    expect((await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get()).get("lines")[0].refundReservedPaise).toBe(3000);
    await db.runTransaction(async tx => { tx.update(db.doc(`refunds/${refundId}`), { status: "processed" }); });
    const journal = await db.doc(`financeAccounts/${hotel}`).collection("journals").where("eventKey", "==", `refund-confirmed:refunds/${refundId}`).get(); expect(journal.size).toBe(1);
  });
  it("preserves excess verified hotel receipts as credit and rejects source reuse", async () => {
    const result = await service.mutateAccount(admin, hotel2, command("hotel_receipt", { amountPaise: 5000, reference: "Unique bank receipt", evidence: "Synthetic proof", receivedAt: new Date().toISOString() }, await rev(hotel2)));
    expect(result.creditPaise).toBe(5000); const account = await service.readAccount(admin, hotel2, true); expect(account.balances.hotelCreditPaise).toBe(5000); expect(account.balances.helpkeyHeldPaise).toBe(0);
    await expect(service.mutateAccount(admin, hotel2, command("hotel_receipt", { amountPaise: 5000, reference: "Unique bank receipt", evidence: "Synthetic proof", receivedAt: new Date().toISOString() }, await rev(hotel2)))).rejects.toThrow("RECEIPT_REFERENCE_REUSED");
  });
  it("rejects stale mutations and customer account access", async () => {
    await expect(service.mutateAccount(admin, hotel, command("hold", { amountPaise: 100, bookingId: null, releaseCondition: "Review" }, 0))).rejects.toThrow("Account changed");
    await expect(service.readAccount(guest, hotel, false)).rejects.toThrow(); await expect(service.readAccount(guest, hotel, true)).rejects.toThrow();
  });
  it("rolls back source records when a journal cannot be balanced safely", async () => {
    const id = `${prefix}_invalid`;
    await expect(db.runTransaction(async tx => {
      tx.create(db.doc(`bookings/${id}`), { propertyId: hotel, bookingStatus: "confirmed" });
      tx.create(db.doc(`bookings/${id}/financialAgreements/original`), { ...agreement, publicCalculation: { lines: [{ ...agreement.publicCalculation.lines[0], totalPaise: 1.5 }] } });
    })).rejects.toThrow();
    expect((await db.doc(`bookings/${id}`).get()).exists).toBe(false);
    expect((await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get()).exists).toBe(false);
  });
  it("treats late captures as cash with a matching refund obligation", async () => {
    const id = await newBooking(), paymentId = `${prefix}_late_capture`;
    await db.runTransaction(async tx => {
      tx.create(db.doc(`paymentAttempts/${paymentId}`), { bookingId: id, propertyId: hotel, amountPaise: 10000, currency: "INR", status: "refund_pending" });
      tx.create(db.doc(`refunds/${paymentId}`), { bookingId: id, propertyId: hotel, paymentId, amountPaise: 10000, status: "pending" });
    });
    const state = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get();
    expect(state.get("allocations")).toEqual([]); expect(state.get("unallocatedPaise")).toBe(10000);
    const docs = await db.doc(`financeAccounts/${hotel}`).collection("journals").where("sourceRef", "==", `paymentAttempts/${paymentId}`).get();
    expect(docs.docs.flatMap(d => d.get("lines")).filter(l => l.account === "refund_obligation").reduce((n, l) => n + l.creditPaise - l.debitPaise, 0)).toBe(10000);
  });
  it("checks stable journal keys and rejects conflicting payload reuse", async () => {
    const { PostingUnit } = await import("@/lib/finance/posting"), { transfer } = await import("@/lib/finance/ledger");
    const post = (n: number) => db.runTransaction(tx => new PostingUnit(db, tx).event(hotel2, "synthetic-key-test", `financeAccounts/${hotel2}`, transfer("provider_expense", "helpkey_cash", n)));
    const a = await post(1), b = await post(1); expect(a!.id).toBe(b!.id);
    await expect(post(2)).rejects.toThrow("FINANCE_EVENT_KEY_REUSED");
  });
  it("serializes shared-participant thresholds across properties and corrects only saved assessments", async () => {
    const ref = `${prefix}_threshold_1`;
    await db.doc(`financeDeductionRules/${ref}`).set({ state: "published", rule: { ...rule, id: `${prefix}_threshold`, outcome: "assess", calculation: { kind: "percentage", basisPoints: 1000 }, threshold: { amountPaise: 15000, period: "calendar_year", aggregation: "participant", treatment: "excess", timezone: "Asia/Kolkata" } } });
    await db.doc("financeConfiguration/deductions").update({ active: [ref] });
    const a = await newBooking(), b = await newBooking(hotel2);
    await Promise.all([a, b].map(bookingId => db.runTransaction(async tx => { tx.update(db.doc(`bookings/${bookingId}`), { bookingStatus: "checked_out", actualCheckOutAt: "2026-01-02T00:00:00.000Z" }); })));
    const states = await Promise.all([db.doc(`financeAccounts/${hotel}/bookings/${a}`).get(), db.doc(`financeAccounts/${hotel2}/bookings/${b}`).get()]);
    const assessments = await Promise.all(states.map((state, i) => db.doc(`financeAccounts/${i ? hotel2 : hotel}/assessments/${state.get("lines")[0].assessmentId}_${fingerprint(ref).slice(0, 16)}`).get()));
    expect(assessments.reduce((n, d) => n + d.get("amountPaise"), 0)).toBe(500);
    const key = assessments[0].get("counterKey"); expect(assessments[1].get("counterKey")).toBe(key);
    expect((await db.doc(`financeAssessmentCounters/${key}`).get()).get("basePaise")).toBe(20000);
    await db.runTransaction(async tx => { tx.create(db.doc(`bookings/${a}/financialAdjustments/correction`), { originalAgreementId: "original", originalLineId: "room:one", totalPaise: 2000, taxablePaise: 2000, internalCommissionReversalPaise: 200, acceptedBy: admin }); });
    expect((await db.doc(`financeAssessmentCounters/${key}`).get()).get("basePaise")).toBe(18000);
    const other = await db.doc(`financeAccounts/${hotel2}/assessments/${states[1].get("lines")[0].assessmentId}_${fingerprint(ref).slice(0, 16)}`).get(); expect(other.data()).toEqual(assessments[1].data());
    await db.doc("financeConfiguration/deductions").update({ active: [`${rule.id}_1`] });
  }, 30000);
  it("assesses combined reviewed deductions separately without double-counting their bases", async () => {
    const refs = [`${prefix}_combined_a_1`, `${prefix}_combined_b_1`];
    for (const [i, ref] of refs.entries()) await db.doc(`financeDeductionRules/${ref}`).set({ state: "published", rule: { ...rule, id: `${prefix}_combined_${i}`, outcome: "assess", calculation: { kind: "percentage", basisPoints: 100 } } });
    await db.doc("financeConfiguration/deductions").update({ active: refs });
    const id = await newBooking(); await db.runTransaction(async tx => { tx.update(db.doc(`bookings/${id}`), { bookingStatus: "checked_out", actualCheckOutAt: "2026-01-02T00:00:00.000Z" }); });
    const state = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get();
    expect(state.get("lines")[0].assessment).toBe("complete"); expect(state.get("lines")[0].assessedRuleRefs).toHaveLength(2);
    const all = await db.doc(`financeAccounts/${hotel}`).collection("assessments").where("bookingId", "==", id).get();
    expect(all.docs.filter(d => d.get("ruleRef")).reduce((n, d) => n + d.get("amountPaise"), 0)).toBe(200);
    await db.doc("financeConfiguration/deductions").update({ active: [`${rule.id}_1`] });
  });
  it("keeps account revisions stable on repeated financial recovery with no new events", async () => {
    const id = await newBooking(); const before = await rev();
    await db.runTransaction(async tx => { tx.update(db.doc(`bookings/${id}`), { financeRecognitionRequestedAt: new Date().toISOString() }); });
    expect(await rev()).toBe(before);
  });
  it("requires a complete retained/refunded breakdown before releasing cancellation funds", async () => {
    const retentionRef = `${prefix}_retention_1`;
    await db.doc(`financeDeductionRules/${retentionRef}`).set({ state: "published", rule: { ...rule, id: `${prefix}_retention`, recognitionEvent: "retention" } });
    await db.doc("financeConfiguration/deductions").update({ active: [retentionRef] });
    const id = await newBooking(), paymentId = await capture(id, 2000);
    await db.runTransaction(async tx => { tx.update(db.doc(`bookings/${id}`), { bookingStatus: "cancelled", endAt: "2027-01-01T12:00:00.000Z" }); tx.create(db.doc(`refunds/${prefix}_retention_refund`), { bookingId: id, propertyId: hotel, paymentId, amountPaise: 500, status: "pending" }); });
    const breakdown = { agreementId: "original", lineId: "room:one", retainedTaxablePaise: 1500, retainedTaxPaise: 0, refundedPaise: 500, collectionSource: "helpkey", taxTreatment: "Reviewed synthetic exempt retained value" };
    await expect(service.mutateAccount(admin, hotel, command("retention_resolve", { bookingId: id, lines: [{ ...breakdown, retainedTaxablePaise: 1800 }] }, await rev()))).rejects.toThrow();
    expect((await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get()).get("retentionPending")).toBe(true);
    await service.mutateAccount(admin, hotel, command("retention_resolve", { bookingId: id, lines: [breakdown] }, await rev()));
    const state = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get();
    expect(state.get("retentionPending")).toBe(false); expect(state.get("lines")[0]).toMatchObject({ recognizedCommissionPaise: 150, outstandingPaise: 0, assessment: "complete", eligibleAt: "2027-01-01T12:00:00.000Z" });
    await db.doc("financeConfiguration/deductions").update({ active: [`${rule.id}_1`] });
  });
  it("revalidates supporting documents at read time without hiding hotel balances", async () => {
    const before = await service.readAccount(admin, hotel, true);
    await db.doc(`verificationDocuments/${hotel}_doc`).update({ status: "rejected" });
    const after = await service.readAccount(admin, hotel, true);
    expect(after.readiness.documents).toBe(false); expect(after.balances.helpkeyHeldPaise).toBe(before.balances.helpkeyHeldPaise); expect(after.scheduleEstimate.preparationAt).toBeNull();
    await db.doc(`verificationDocuments/${hotel}_doc`).update({ status: "approved" });
  });
  it("serializes checkout against refund reservation and restores offset dues for customer money", async () => {
    const id = await newBooking(), paymentId = await capture(id);
    await service.mutateAccount(admin, hotel, command("provider_fee", { bookingId: id, captureId: paymentId, amountPaise: 0, evidence: "Synthetic confirmed zero provider fee" }, await rev()));
    await Promise.all([
      db.runTransaction(async tx => { tx.update(db.doc(`bookings/${id}`), { bookingStatus: "checked_out", actualCheckOutAt: "2026-01-02T00:00:00.000Z" }); }),
      db.runTransaction(async tx => { tx.create(db.doc(`refunds/${prefix}_checkout_race`), { bookingId: id, propertyId: hotel, paymentId, amountPaise: 10000, status: "pending" }); }),
    ]);
    const state = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get();
    expect(state.get("lines")[0].refundReservedPaise).toBe(10000);
    expect(state.get("allocations")[0].offsetPaise).toBe(0);
    const account = await service.readAccount(admin, hotel, true); expect(account.allocations!.find(a => a.bookingId === id)!.availablePaise).toBe(0);
  }, 30000);
  it("unwinds already posted internal offsets before reserving a later full refund", async () => {
    const id = await newBooking(), paymentId = await capture(id);
    await service.mutateAccount(admin, hotel, command("provider_fee", { bookingId: id, captureId: paymentId, amountPaise: 0, evidence: "Synthetic confirmed zero provider fee" }, await rev()));
    await db.runTransaction(async tx => { tx.update(db.doc(`bookings/${id}`), { bookingStatus: "checked_out", actualCheckOutAt: "2026-01-02T00:00:00.000Z" }); });
    const before = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get(), offset = before.get("allocations")[0].offsetPaise;
    expect(offset).toBeGreaterThan(0);
    const chargesBefore = (await db.doc(`financeAccounts/${hotel}`).get()).get("projection.balances.hotel_charges");
    await db.runTransaction(async tx => { tx.create(db.doc(`refunds/${prefix}_after_offset`), { bookingId: id, propertyId: hotel, paymentId, amountPaise: 10000, status: "pending" }); });
    const after = await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get(); expect(after.get("allocations")[0].offsetPaise).toBe(0);
    expect((await db.doc(`financeAccounts/${hotel}`).get()).get("projection.balances.hotel_charges")).toBe(chargesBefore + offset);
  });
  it("keeps immutable rule snapshots after publication changes", async () => {
    const id = await newBooking(); await db.doc("financeConfiguration/deductions").update({ active: [] });
    await db.runTransaction(async tx => { tx.update(db.doc(`bookings/${id}`), { bookingStatus: "checked_out", actualCheckOutAt: new Date().toISOString() }); });
    expect((await db.doc(`financeAccounts/${hotel}/bookings/${id}`).get()).get("lines")[0].assessment).toBe("complete");
    const next = await newBooking(); expect((await db.doc(`financeAccounts/${hotel}/bookings/${next}`).get()).get("lines")[0].ruleRefs).toEqual([]);
  });
  it("reconciles sources, allocations and shared counters without making repairs", async () => {
    const { reconcileAccount } = await import("@/lib/finance/reconciliation");
    const revision = await rev(); const report = await reconcileAccount(db, hotel);
    expect(report.repaired).toBe(false); expect(report.discrepancies).toEqual([]); expect(await rev()).toBe(revision);
  });
  it("matches authoritative replay at a stable account revision", async () => {
    const docs = await db.doc(`financeAccounts/${hotel}`).collection("journals").orderBy("revision").get();
    expect(replay(docs.docs.map(d => d.data() as Journal))).toEqual((await db.doc(`financeAccounts/${hotel}`).get()).get("projection"));
  });
});
