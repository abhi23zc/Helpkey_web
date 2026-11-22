import type { Firestore, Transaction } from "firebase-admin/firestore";
import { DEFAULT_POLICY, EMPTY_PROFILE, profileReadiness, resolvePolicy, supportingDocumentsValid } from "./domain";
export async function financeReadiness(db: Firestore, tx: Transaction, propertyId: string) {
  const [global, hotel, profile, agreement, docs] = await Promise.all([tx.get(db.doc("financeConfiguration/global")), tx.get(db.doc(`propertyFinance/${propertyId}`)), tx.get(db.doc(`propertyFinance/${propertyId}/profiles/current`)), tx.get(db.doc("financeConfiguration/agreements")), tx.get(db.collection("verificationDocuments").where("propertyId", "==", propertyId))]);
  const p = profile.get("profile") ?? EMPTY_PROFILE;
  const documents = supportingDocumentsValid(p, propertyId, docs.docs.map(d => ({ id: d.id, propertyId: d.get("propertyId"), deletedAt: d.get("deletedAt"), status: d.get("status") })));
  const accepted = agreement.exists && profile.get("acceptance.agreementVersion") === agreement.get("revision") && profile.get("acceptance.profileRevision") === (profile.get("contentRevision") ?? profile.get("revision"));
  const readiness = profileReadiness(p, accepted, profile.get("state") === "manually_reviewed", documents);
  return { ready: readiness.businessDetails && readiness.documents && readiness.manualReview && readiness.agreementAcceptance, readiness, policy: resolvePolicy(global.get("policy") ?? DEFAULT_POLICY, hotel.get("overrides") ?? {}).effective };
}
