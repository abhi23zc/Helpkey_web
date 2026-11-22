import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_POLICY, EMPTY_PROFILE } from "@/lib/finance/domain";
import { syntheticRules } from "@/lib/finance/development-fixtures";
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/http", () => ({ providerFetch: provider }));
const isolated = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "");
describe.skipIf(!isolated)("finance v2 isolated Firestore agreements", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  let bookings: typeof import("@/lib/bookings");
  let registry: typeof import("@/lib/finance/tax-configuration");
  const prefix = `phase2_${crypto.randomUUID()}`, propertyId = `${prefix}_hotel`, uid = `${prefix}_guest`, owner = `${prefix}_owner`, admin = `${prefix}_admin`;
  let input: { propertySlug: string; roomTypeId: string; ratePlanId: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number };
  let globalBefore: FirebaseFirestore.DocumentData | undefined, activationBefore: FirebaseFirestore.DocumentData | undefined, registryBefore: FirebaseFirestore.DocumentData | undefined;
  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-phase2";
    process.env.BACKGROUND_MODE = "legacy";
    process.env.RAZORPAY_KEY_ID = "synthetic_key"; process.env.RAZORPAY_KEY_SECRET = "synthetic_secret";
    db = (await import("@/lib/firebase/admin")).adminDb;
    activationBefore = (await db.doc("financeConfiguration/accounting").get()).data();
    await db.doc("financeConfiguration/accounting").set({ enabled: true, revision: 1 });
    bookings = await import("@/lib/bookings"); registry = await import("@/lib/finance/tax-configuration");
    globalBefore = (await db.doc("financeConfiguration/global").get()).data(); registryBefore = (await registry.registryRef().get()).data();
    await db.doc("financeConfiguration/global").set({ revision: 1, policy: { ...DEFAULT_POLICY, paymentOptions: ["full_online", "advance_online", "pay_at_property"] } });
    const rules = syntheticRules();
    for (const r of rules) await registry.ruleRef(r.id, r.version).set(r);
    await registry.registryRef().set({ revision: 1, active: rules.map(r => ({ id: r.id, version: r.version })) });
    await db.doc(`users/${admin}`).set({ roles: ["admin"], isActive: true, accountStatus: "active" });
    await db.doc(`users/${owner}`).set({ roles: ["partner"], isActive: true, accountStatus: "active" });
    await db.doc(`propertyMemberships/${propertyId}_${owner}`).set({ propertyId, userId: owner, role: "owner", status: "active" });
    await db.doc(`users/${uid}`).set({ roles: ["customer"], isActive: true, accountStatus: "active" });
    const checkIn = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), checkOut = new Date(Date.parse(checkIn) + 86400000).toISOString().slice(0, 10);
    input = { propertySlug: propertyId, roomTypeId: `${prefix}_room`, ratePlanId: `${prefix}_rate`, checkIn, checkOut, adults: 1, children: 0, infants: 0 };
    await db.doc(`properties/${propertyId}`).set({ slug: propertyId, name: "Synthetic Hotel", status: "active", approvalStatus: "approved", isBookable: true, inventoryEngine: "interval_v1", timezone: "Asia/Kolkata", bookingModes: ["overnight", "hourly"], currency: "INR" });
    await db.doc(`roomTypes/${input.roomTypeId}`).set({ propertyId, name: "Synthetic room", status: "active", maxAdults: 2, totalInventory: 10 });
    await db.doc(`ratePlans/${input.ratePlanId}`).set({ propertyId, roomTypeId: input.roomTypeId, name: "Reviewed example", status: "active", basePricePaise: 200000, priceReview: { basis: "tax_exclusive", reviewedBy: "example_owner", reviewedAt: "2026-01-01T00:00:00.000Z" }, cancellationPolicyId: `${prefix}_cancel` });
    await db.doc(`cancellationPolicies/${prefix}_cancel`).set({ propertyId, status: "active", name: "Explicit example", description: "Synthetic cancellation terms", refundableUntilHours: 24, cancellationFeePercent: 25, lateCharge: { kind: "percentage", basisPoints: 2500, basis: "final_total" }, noShow: { kind: "fixed", amountPaise: 0 }, taxTreatmentReference: "synthetic_cancellation_service:1" });
    await db.doc(`verificationDocuments/${prefix}_doc`).set({ propertyId, status: "approved" });
    await db.doc(`propertyFinance/${propertyId}/profiles/current`).set({ revision: 1, contentRevision: 1, state: "manually_reviewed", profile: { ...EMPTY_PROFILE, legalPayeeName: "Example", businessAddress: "Example", businessEmail: "test@example.com", businessPhone: "9876543210", pan: "ABCDE1234F", documentIds: [`${prefix}_doc`] } });
    await registry.taxProfileRef(propertyId).set({ revision: 1, profile: { jurisdiction: "example", registration: "unregistered", profileKind: "example", supplierId: propertyId, invoiceResponsibility: "hotel", reviewedBy: "example_admin", reviewedAt: "2026-01-01T00:00:00.000Z", profileContentRevision: 1 } });
  }, 30000);
  afterAll(async () => {
    if (!db) return;
    // Unique test records only; no database reset or historical migration.
    for (const collection of ["financeTaxRules", "propertyMemberships", "properties", "roomTypes", "ratePlans", "cancellationPolicies", "verificationDocuments", "propertyFinance", "users"]) {
      const docs = await db.collection(collection).get();
      for (const doc of docs.docs.filter(d => d.id.startsWith(prefix))) await db.recursiveDelete(doc.ref);
    }
    for (const collection of ["bookings", "inventoryCalendars", "inventoryHolds", "bookingNotificationOutbox", "bookingReferences", "propertyPayments"]) {
      const docs = await db.collection(collection).where("propertyId", "==", propertyId).get();
      for (const doc of docs.docs) await db.recursiveDelete(doc.ref);
    }
    await db.recursiveDelete(db.doc(`financeAccounts/${propertyId}`));
    if (activationBefore) await db.doc("financeConfiguration/accounting").set(activationBefore); else await db.doc("financeConfiguration/accounting").delete();
    if (globalBefore) await db.doc("financeConfiguration/global").set(globalBefore); else await db.doc("financeConfiguration/global").delete();
    if (registryBefore) await registry.registryRef().set(registryBefore); else await registry.registryRef().delete();
  }, 30000);
  async function accepted(selected: "full_online" | "advance_online" | "pay_at_property" = "pay_at_property") {
    const quote = await bookings.quote({ ...input, paymentOption: selected });
    return { ...input, paymentOption: selected, paymentMethod: selected === "pay_at_property" ? "pay_at_property" : "online", leadEmail: "test@example.com", leadPhone: "+919876543210", adultGuestNames: ["Example Guest"], termsAccepted: true, quoteFingerprint: quote.fingerprint, expectedTotalPaise: quote.totalPaise };
  }
  it("stores one immutable agreement for concurrent duplicate submissions and keeps private details out of quote DTO", async () => {
    const body = await accepted(), key = crypto.randomUUID();
    const [a, b] = await Promise.all([bookings.createBooking(uid, body, key), bookings.createBooking(uid, body, key)]);
    expect(a.bookingId).toBe(b.bookingId);
    const agreements = await db.doc(`bookings/${a.bookingId}`).collection("financialAgreements").get();
    expect(agreements.size).toBe(1); expect(agreements.docs[0].get("internal.commissionPaise")).toBe(20000);
    expect(JSON.stringify(a.quote)).not.toContain("commission");
    expect(agreements.docs[0].get("internal.deductions.inputs.accumulatedValue")).toBeNull();
  });
  it("rejects a quote when registry revision changes including newly applicable rules", async () => {
    const body = await accepted(); await registry.registryRef().update({ revision: 2 });
    await expect(bookings.createBooking(uid, body, crypto.randomUUID())).rejects.toThrow("QUOTE_CHANGED");
    await registry.registryRef().update({ revision: 1 });
  });
  it("rejects inherited basis changes until owner re-entry", async () => {
    await db.doc("financeConfiguration/global").update({ "policy.priceEntry": "tax_inclusive", revision: 2 });
    await expect(bookings.quote(input)).rejects.toThrow("PRICE_REVIEW_REQUIRED");
    await db.doc("financeConfiguration/global").update({ "policy.priceEntry": "tax_exclusive", revision: 1 });
  });
  it("uses committed payment amounts on retries after policy/pricing changes", async () => {
    provider.mockResolvedValue(new Response(JSON.stringify({ id: `order_${prefix}` }), { status: 200 }));
    const body = await accepted("advance_online"), key = crypto.randomUUID();
    const created = await bookings.createBooking(uid, body, key);
    expect(created.razorpay?.amount).toBe(55000);
    await db.doc(`ratePlans/${input.ratePlanId}`).update({ basePricePaise: 900000 });
    const recovered = await bookings.createBooking(uid, body, key);
    expect(recovered.razorpay?.amount).toBe(55000); expect(provider).toHaveBeenCalledTimes(1);
    await db.doc(`ratePlans/${input.ratePlanId}`).update({ basePricePaise: 200000 });
  });
  it("publishes immutable reviewed versions, rejects overlap and invalidates prior quotes", async () => {
    const body = await accepted();
    const current = (await registry.registryRef().get()).data()!;
    const rule = { ...syntheticRules()[0], id: `${prefix}_rule`, reviewedBy: admin };
    await registry.mutateTaxConfiguration(admin, { action: "create_version", rule, reason: "Isolated publication test" });
    await expect(registry.mutateTaxConfiguration(admin, { action: "create_version", rule, reason: "Duplicate immutable test" })).rejects.toMatchObject({ code: "IMMUTABLE_RULE_VERSION" });
    const coverage = [{ category: "accommodation", jurisdiction: "example", registration: "unregistered", profileKind: "example", bookingMode: "overnight", from: "2027-01-01", through: "2030-12-31" }];
    const next = { id: rule.id, version: rule.version };
    await expect(registry.mutateTaxConfiguration(admin, { action: "activate", expectedRevision: 1, active: [...current.active, next], coverage, reason: "Overlap must be rejected" })).rejects.toThrow("OVERLAPPING_TAX_RULES");
    const active = [...current.active.filter((r: { id: string }) => r.id !== syntheticRules()[0].id), next];
    await registry.mutateTaxConfiguration(admin, { action: "activate", expectedRevision: 1, active, coverage, reason: "Publish reviewed replacement" });
    await expect(bookings.createBooking(uid, body, crypto.randomUUID())).rejects.toThrow("QUOTE_CHANGED");
    await registry.registryRef().set(current);
  });
  it("classifies negotiated hotel reservations directly and taxes deterministic dated allocations", async () => {
    const manual = { propertyId, roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId, checkIn: input.checkIn, checkOut: new Date(Date.parse(input.checkOut) + 86400000).toISOString().slice(0, 10), adults: 1, guestName: "Direct Guest", negotiatedSubtotalPaise: 220001, negotiatedPriceReason: "Explicit reviewed entry", initialCollectionPaise: 0 };
    const quote = await bookings.quoteManualReservation(owner, manual);
    const created = await bookings.createManualReservation(owner, { ...manual, expectedTotalPaise: quote.totalPaise, quoteFingerprint: quote.fingerprint }, crypto.randomUUID());
    const agreement = (await db.doc(`bookings/${created.id}/financialAgreements/original`).get()).data()!;
    expect(agreement.internal.source).toBe("hotel_direct"); expect(agreement.internal.commissionPaise).toBe(0);
    expect(agreement.publicCalculation.lines.map((l: { enteredUnitPaise: number }) => l.enteredUnitPaise)).toEqual([110001, 110000]);
    expect(agreement.publicCalculation.totalPaise).toBe(242001);
  });
  it("keeps the original agreement immutable and links amendment reversals", async () => {
    const created = await bookings.createBooking(uid, await accepted(), crypto.randomUUID());
    const original = (await db.doc(`bookings/${created.bookingId}/financialAgreements/original`).get()).data();
    const amendments = await import("@/lib/partner/reservations/amendments");
    const preview = await amendments.previewAmendment(owner, created.bookingId, { roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId, checkIn: input.checkIn, checkOut: new Date(Date.parse(input.checkOut) + 86400000).toISOString().slice(0, 10) });
    await amendments.confirmAmendment(owner, created.bookingId, { token: preview.token }, crypto.randomUUID());
    expect((await db.doc(`bookings/${created.bookingId}/financialAgreements/original`).get()).data()).toEqual(original);
    const adjustments = await db.doc(`bookings/${created.bookingId}`).collection("financialAdjustments").get();
    expect(adjustments.size).toBe(1); expect(adjustments.docs[0].get("originalAgreementId")).toBe("original"); expect(adjustments.docs[0].get("originalLineId")).toBe(`room:${input.checkIn}`);
    expect(adjustments.docs[0].get("taxPaise")).toBe(20000);
    expect((await db.doc(`bookings/${created.bookingId}`).collection("financialAgreements").get()).size).toBe(2);
    const history = await (await import("@/lib/finance/booking-history")).publicBookingFinancialHistory(uid, created.bookingId);
    expect(history.stay.totalPaise).toBe(440000); expect(history.stay.taxPaise).toBe(40000);
    expect(JSON.stringify(history)).not.toContain("commission"); expect(JSON.stringify(history)).not.toContain("deductions");
  });
  it("hotel-collected services increase the collectible guest balance", async () => {
    const activation = db.doc("financeConfiguration/accounting"), activationBefore = (await activation.get()).data();
    await activation.set({ enabled: true, revision: 1 });
    try {
    const orderId=`order_review_${prefix}`,paymentId=`pay_review_${prefix}`;
    provider.mockResolvedValue(Response.json({id:orderId}));
    const created=await bookings.createBooking(uid,await accepted('full_online'),crypto.randomUUID());
    const ref=db.doc(`bookings/${created.bookingId}`);
    provider.mockResolvedValue(Response.json({id:paymentId,order_id:orderId,status:'captured',captured:true,amount:220000,currency:'INR'}));
    await bookings.confirmPaidBooking(created.bookingId,{actorId:uid,orderId,paymentId,source:'review'});
    const service=await import('@/lib/stay/requests');
    const serviceAt=`${input.checkIn}T15:00:00.000Z`;
    await service.addUnlistedRequest(uid,created.bookingId,{revision:0,action:'create',request:{name:'Breakfast',note:'Breakfast for one guest',neededAt:serviceAt}});
    let b=(await ref.get()).data()!,request=b.customizations[0];
    await service.decideRequest(owner,created.bookingId,{revision:b.stayRevision,requestId:request.id,action:'quote',amountPaise:50000,scope:'Breakfast for one guest',priceEntryBasis:'tax_exclusive',taxCategory:'food',serviceAt,collection:'hotel',expiresAt:new Date(Date.now()+3600000).toISOString(),cancellationTerms:{freeUntil:new Date(Date.now()+86400000).toISOString(),lateCharge:{kind:'fixed',amountPaise:0},noShow:{kind:'fixed',amountPaise:0},taxTreatmentReference:'synthetic_cancellation_service:1'}},true);
    b=(await ref.get()).data()!;request=b.customizations[0];
    await service.decideRequest(uid,created.bookingId,{revision:b.stayRevision,requestId:request.id,action:'accept',quoteVersion:request.quote.version,expectedTotalPaise:request.quote.amountPaise,quoteFingerprint:request.quote.fingerprint},false);
    b=(await ref.get()).data()!;
    const {netBalance}=await import('@/lib/partner/reservations/domain');
    const {supplementalFinancials}=await import('@/lib/stay/agreements');
    expect(netBalance(b)).toBe(55000);
    expect(b.balanceDuePaise).toBe(55000);
    expect(supplementalFinancials(b.customizations,b.stayPaymentReceipts??[]).totalPaise).toBe(0);
    const {publicBookingFinancialHistory}=await import('@/lib/finance/booking-history');
    expect((await publicBookingFinancialHistory(uid,created.bookingId)).stay.totalPaise).toBe(275000);
    const {documentSources}=await import('@/lib/partner/invoices/domain');
    expect(documentSources(b,[])).toContainEqual(expect.objectContaining({amountPaise:55000,description:'Breakfast'}));
    const {performOperation,bookingOperations}=await import('@/lib/partner/reservations/operations');
    const key=crypto.randomUUID();
    const collection={action:'collect',amountPaise:55000,method:'upi',reference:'service-payment'};
    const [first,duplicate]=await Promise.all([performOperation(owner,created.bookingId,collection,key),performOperation(owner,created.bookingId,collection,key)]);
    expect(first.id).toBe(duplicate.id);
    b=(await ref.get()).data()!;
    expect(netBalance(b)).toBe(0);
    expect((await bookingOperations(owner,created.bookingId)).refundExcessPaise).toBe(0);
    await expect(performOperation(owner,created.bookingId,collection,crypto.randomUUID())).rejects.toMatchObject({code:'OVERPAYMENT'});
    await performOperation(owner,created.bookingId,{action:'reverse',receiptId:first.id,reason:'Incorrect collection entry'},crypto.randomUUID());
    expect(netBalance((await ref.get()).data()!)).toBe(55000);
    await performOperation(owner,created.bookingId,{...collection,amountPaise:27500},crypto.randomUUID());
    expect(netBalance((await ref.get()).data()!)).toBe(27500);
    const account = await db.doc(`financeAccounts/${propertyId}/bookings/${created.bookingId}`).get();
    expect(account.get("allocations").filter((a: { source: string; reversedPaise: number; amountPaise: number }) => a.source === "hotel").reduce((n: number, a: { amountPaise: number; reversedPaise: number }) => n + a.amountPaise - a.reversedPaise, 0)).toBe(27500);
    expect(account.get("lines").reduce((n: number, l: { fundedPaise: number }) => n + l.fundedPaise, 0)).toBe(220000);
    const { reconcileAccount } = await import("@/lib/finance/reconciliation");
    expect((await reconcileAccount(db, propertyId)).discrepancies).toEqual([]);
    } finally {
      if (activationBefore) await activation.set(activationBefore); else await activation.delete();
    }
  });

  it("an Admin hotel override can enable advances over full-online defaults", async () => {
    const g=db.doc('financeConfiguration/global'), h=db.doc(`propertyFinance/${propertyId}`);
    const previous=(await g.get()).data()!;
    try {
      await g.set({...previous,policy:{...previous.policy,paymentOptions:['full_online']}});
      await h.set({revision:1,overrides:{paymentOptions:['full_online','advance_online']}});
      await expect(bookings.quote({...input,paymentOption:'advance_online'})).resolves.toMatchObject({paymentOption:'advance_online'});
    } finally {await g.set(previous);await h.delete();}
  });
  it("serializes a committing agreement with concurrent registry publication", async () => {
    let release!: () => void, observed!: () => void, attempts = 0;
    const gate = new Promise<void>(r => { release = r; }), read = new Promise<void>(r => { observed = r; });
    const work = db.runTransaction(async tx => {
      attempts++; const configuration = await registry.readRegistry(tx);
      if (attempts === 1) { observed(); await gate; }
      tx.set(db.doc(`propertyFinance/${propertyId}`), { seenRegistry: configuration.revision }, { merge: true });
      return configuration.revision;
    });
    await read; const publication = registry.registryRef().update({ revision: 2 }); release();
    const seen = await work; await publication;
    expect([1, 2]).toContain(seen); expect((await db.doc(`propertyFinance/${propertyId}`).get()).get("seenRegistry")).toBe(seen);
    expect((await registry.registryRef().get()).get("revision")).toBe(2); expect(attempts).toBeGreaterThanOrEqual(1);
    await registry.registryRef().update({ revision: 1 });
  }, 15000);
});
