import { randomUUID } from "node:crypto";
import { Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { safeJobId } from "../../lib/background/jobs";
import { LeaseBusy } from "./outbox";

export async function withFencedLease<T>(db: Firestore, identity: string, action: (assert: (tx: Transaction) => Promise<void>) => Promise<T>): Promise<T> {
  const ref = db.collection("backgroundLeases").doc(safeJobId(identity)), owner = randomUUID();
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.expiresAt?.toMillis() > Date.now()) throw new LeaseBusy();
    tx.set(ref, { owner, expiresAt: Timestamp.fromMillis(Date.now() + 90_000) });
  });
  let lost = false, renewal: Promise<void> | undefined;
  const assert = async (tx: Transaction) => {
    const current = (await tx.get(ref)).data();
    if (lost || current?.owner !== owner || current.expiresAt.toMillis() <= Date.now()) throw new LeaseBusy();
  };
  const timer = setInterval(() => {
    if (!renewal) renewal = db.runTransaction(async tx => {
      await assert(tx); tx.update(ref, { expiresAt: Timestamp.fromMillis(Date.now() + 90_000) });
    }).catch(() => { lost = true; }).finally(() => { renewal = undefined; });
  }, 20_000);
  try { return await action(assert); }
  finally {
    clearInterval(timer); await renewal;
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.owner === owner) tx.delete(ref);
    }).catch(error => console.error(JSON.stringify({ event: "lease.release_failed", error: error instanceof Error ? error.message : "UNKNOWN" })));
  }
}
