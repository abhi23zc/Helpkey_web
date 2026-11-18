import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { invalidatePublic } from "@/lib/api/cache";

/** Invalidate all date/queue evaluations for this hotel, preserving other hotels. */
export function invalidateToday(propertyId: string) {
  return invalidatePublic(`partner-today:${propertyId}`);
}

/** Redis effects run only after a successful commit, never inside a retried transaction. */
export async function todayTransaction<T>(
  update: (
    tx: FirebaseFirestore.Transaction,
    changed: (propertyId: unknown) => void,
  ) => Promise<T>,
): Promise<T> {
  const committed = await adminDb.runTransaction(async (tx) => {
    const properties = new Set<string>();
    const result = await update(tx, (id) => {
      if (typeof id === "string" && id && !id.includes("/")) properties.add(id);
    });
    // Blind increments participate in the same commit. A closing transaction reads
    // this document, so any overlapping financial/operational commit retries it.
    for (const propertyId of properties)
      tx.set(
        adminDb.collection("hotelClosingState").doc(propertyId),
        {
          propertyId,
          revision: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return { result, properties: [...properties] };
  });
  await Promise.all(committed.properties.map(invalidateToday));
  return committed.result;
}
