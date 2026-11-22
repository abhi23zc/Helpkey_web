import { DEFAULT_POLICY, EMPTY_PROFILE } from "@/lib/finance/domain";
import { syntheticRules } from "@/lib/finance/development-fixtures";

/** Reviewed zero-tax examples for transaction tests; never called by application code. */
export async function seedTransactionFinance(db: FirebaseFirestore.Firestore, propertyId: string, owner: string, paid: boolean) {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? ""))
    throw new Error("Transaction finance fixtures require a local emulator");
  const rules = syntheticRules().map(r => ({
    ...r, id: `transaction_${r.category}_${r.scope.bookingModes[0]}`,
    treatment: "exempt" as const, components: [],
    reason: "Synthetic zero-tax transaction fixture", scope: { ...r.scope, profileKinds: ["transaction_fixture"] },
  }));
  await db.runTransaction(async tx => {
    const global = db.doc("financeConfiguration/global"), registry = db.doc("financeConfiguration/taxRegistry");
    const [g, active] = await Promise.all([tx.get(global), tx.get(registry)]);
    if (!g.exists) tx.create(global, { revision: 1, policy: DEFAULT_POLICY });
    const refs: { id: string; version: number }[] = active.get("active") ?? [];
    const missing = rules.filter(r => !refs.some(v => v.id === r.id && v.version === r.version));
    for (const rule of missing) tx.set(db.doc(`financeTaxRules/${rule.id}_${rule.version}`), rule);
    if (missing.length) tx.set(registry, { revision: (active.get("revision") ?? 0) + 1, active: [...refs, ...missing.map(r => ({ id: r.id, version: r.version }))] });
  });
  await db.doc(`propertyFinance/${propertyId}`).set({ propertyId, revision: 1, overrides: {
    paymentOptions: [paid ? "advance_online" : "pay_at_property"],
    // Explicit configurable fixed advance retains this suite's refund amounts.
    advance: { kind: "fixed", amountPaise: 45000 },
  } });
  const docId = `${propertyId}_finance`;
  await db.doc(`verificationDocuments/${docId}`).set({ propertyId, status: "approved" });
  await db.doc(`propertyFinance/${propertyId}/profiles/current`).set({ revision: 1, contentRevision: 1, state: "manually_reviewed", profile: {
    ...EMPTY_PROFILE, legalPayeeName: "Transaction fixture", businessAddress: "Mumbai",
    businessEmail: "fixture@example.test", businessPhone: "9876543210", pan: "ABCDE1234F", documentIds: [docId],
  } });
  await db.doc(`propertyFinance/${propertyId}/taxProfiles/current`).set({ revision: 1, profile: {
    jurisdiction: "example", registration: "unregistered", profileKind: "transaction_fixture",
    supplierId: propertyId, invoiceResponsibility: "hotel", reviewedBy: owner,
    reviewedAt: "2026-01-01T00:00:00.000Z", profileContentRevision: 1,
  } });
}

export function transactionCancellation(freeUntil: string) {
  return { freeUntil, lateCharge: { kind: "fixed" as const, amountPaise: 0 },
    noShow: { kind: "fixed" as const, amountPaise: 0 }, taxTreatmentReference: "transaction_cancellation_service:1" };
}
