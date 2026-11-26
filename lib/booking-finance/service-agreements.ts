import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { RecordData } from "../partner/dashboard/domain";
import type { Agreement } from "./domain";
import {
  createServiceAgreement,
  serviceId,
  type ServiceAgreement,
} from "./services";
import { offeringCategory, type Offering } from "../stay/contracts";

/** Read every dependency before invoking the returned write closure. No original agreement is rewritten. */
export async function prepareServiceAgreements(
  db: Firestore,
  tx: Transaction,
  bookingId: string,
  b: RecordData,
  requests: RecordData[],
  actorId: string,
) {
  const root = db.collection("bookingFinanceAgreementsV1").doc(bookingId);
  const original = await tx.get(root);
  const accepted = requests.filter(
    (r) => r.settlement !== "included" && r.quote?.status === "accepted",
  );
  const pending: ServiceAgreement[] = [];
  if (
    original.exists &&
    original.get("bookingId") === bookingId &&
    original.get("propertyId") === b.propertyId
  )
    for (const r of accepted) {
      if (!r.id || !Number.isSafeInteger(r.quote.version)) continue;
      const existing = await tx.get(
        root.collection("services").doc(serviceId(r.id, r.quote.version)),
      );
      if (existing.exists) continue;
      const catalog =
        typeof r.offeringId === "string" &&
        r.offeringId &&
        !r.offeringId.includes("/")
          ? await tx.get(
              db
                .collection("properties")
                .doc(b.propertyId)
                .collection("stayCustomizations")
                .doc(r.offeringId),
            )
          : null;
      // Unlisted services require explicit operator confirmation; never guess ownership.
      if (!catalog?.exists) continue;
      const item = catalog.data()!;
      const category =
        item.version === r.offeringVersion
          ? offeringCategory(item as Offering)
          : null;
      try {
        pending.push(
          createServiceAgreement(original.data() as Agreement, r, {
            category,
            preTaxPaise: Number.isSafeInteger(r.preTaxPaise)
              ? r.preTaxPaise
              : null,
            actorId,
            reason:
              "Accepted hotel service linked to its saved booking terms and property catalog.",
          }),
        );
      } catch {
        /* Missing commercial evidence remains a focused review item. */
      }
    }
  return () => {
    for (const a of pending)
      tx.create(root.collection("services").doc(a.id), a);
  };
}
