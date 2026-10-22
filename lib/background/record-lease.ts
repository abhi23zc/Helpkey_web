import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
/** Extends a claimed record without allowing an old owner to overwrite a new claim. */
export function renewRecordLease(ref: DocumentReference, owner: string, dueField: string, leaseMs = 90_000) {
  let stopped = false, pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (!pending && !stopped) pending = ref.firestore.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.leaseOwner !== owner || current.leaseExpiresAt?.toMillis() <= Date.now()) return;
      const expiresAt = Timestamp.fromMillis(Date.now() + leaseMs);
      tx.update(ref, { leaseExpiresAt: expiresAt, [dueField]: expiresAt });
    }).catch(error => console.error(JSON.stringify({ event: "record.lease_renew_failed", id: ref.id, error: error instanceof Error ? error.message : "UNKNOWN" }))).finally(() => { pending = undefined; });
  }, 20_000);
  return async () => { stopped = true; clearInterval(timer); await pending; };
}
