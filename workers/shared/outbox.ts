import { FieldValue, Timestamp, type Firestore, type DocumentReference, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { UnrecoverableError, type Queue, type Job } from "bullmq";
import { recoveryInterval, retryDelay } from "../../lib/background/config";

type Payload = Record<string, unknown>;
const terminal = new Set(["completed", "succeeded", "dead", "quarantined", "retried"]);
export class LeaseBusy extends Error { constructor() { super("LEASE_BUSY"); } }
export async function dispatchOutbox(options: { db: Firestore; queue: Queue; collection: string; parse: (value: unknown) => Payload; id: (data: Payload, documentId: string) => string; name: (data: Payload) => string; batchSize: number; recover: boolean }) {
  const { db, collection, batchSize } = options;
  const query = options.recover
    ? db.collection(collection).where("recoverable", "==", true).where("nextRecoveryAt", "<=", Timestamp.now()).orderBy("nextRecoveryAt")
    : db.collection(collection).where("status", "==", "pending");
  const page = await query.limit(batchSize).get();
  console.info(JSON.stringify({ event: "outbox.query", collection, recovery: options.recover, documentsFetched: page.size, queryCalls: 1 }));
  return dispatchOutboxDocuments(options, page.docs);
}

export async function dispatchOutboxDocuments(options: { db: Firestore; queue: Queue; collection: string; parse: (value: unknown) => Payload; id: (data: Payload, documentId: string) => string; name: (data: Payload) => string; batchSize: number; recover: boolean }, docs: QueryDocumentSnapshot[]) {
  const { db, queue, collection, batchSize } = options;
  const page = { docs, size: docs.length };
  const failures: string[] = [], handled = new Set<string>();
  for (const document of page.docs) {
    if (handled.has(document.id)) continue;
    const raw = document.data();
    if (terminal.has(raw.status)) continue;
    const groupIds: string[] = Array.isArray(raw.groupIds) ? raw.groupIds : collection === "projectionOutbox" && raw.kind === "property_search"
      ? page.docs.filter(candidate => candidate.get("kind") === raw.kind && candidate.get("entityId") === raw.entityId && !candidate.get("groupRoot")).map(candidate => candidate.id)
      : [document.id];
    const rootId = String(raw.groupRoot ?? document.id);
    if (!groupIds.length || groupIds.length > 200 || groupIds.some(id => typeof id !== "string" || !id || id.includes("/")) || !groupIds.includes(rootId)) {
      await document.ref.set({ status: "quarantined", recoverable: false, lastErrorMessage: "INVALID_DISPATCH_GROUP" }, { merge: true });
      failures.push(document.id); continue;
    }
    for (const id of groupIds) handled.add(id);
    const groupRefs = groupIds.map(id => db.collection(collection).doc(id));
    const closeGroup = async (message: string) => db.runTransaction(async tx => {
      const records = await tx.getAll(...groupRefs);
      for (const record of records) if (record.exists && !terminal.has(record.get("status"))) tx.set(record.ref, { status: "dead", recoverable: false, lastErrorMessage: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    let data: Payload;
    try { data = options.parse({ ...raw, eventId: rootId, outboxId: rootId }); }
    catch (error) {
      await document.ref.set({ status: "quarantined", recoverable: false, lastErrorMessage: error instanceof Error ? error.message.slice(0, 500) : "INVALID_PAYLOAD", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      failures.push(document.id); continue;
    }
    try {
      const jobId = options.id(data, rootId);
      const existing = await queue.getJob(jobId);
      const state = existing ? await existing.getState() : "unknown";
      if (state === "failed") {
        await closeGroup("QUEUE_ATTEMPTS_EXHAUSTED");
        continue;
      }
      // A healthy queue entry needs no Firestore acknowledgement refresh. Keeping
      // its original recovery timestamp also makes genuinely overdue work visible.
      if (existing && state !== "completed" && state !== "unknown" && raw.groupRoot && raw.bullJobId === jobId) continue;
      // A completed queue record with an unfinished outbox is an interrupted acknowledgement.
      if (state === "completed") await existing!.remove();
      if (!existing || state === "completed" || state === "unknown") {
        const attempts = Number(raw.attempts ?? 0);
        if (attempts >= 6) {
          await closeGroup("PROCESSING_ATTEMPTS_EXHAUSTED"); continue;
        }
        await queue.add(options.name(data), { ...data, outboxId: rootId, outboxIds: groupIds }, { jobId, attempts: 6 - attempts, ...(data.operation ? { priority: data.operation === "unpublish" ? 1 : 10 } : {}) });
      }
      await db.runTransaction(async tx => {
        const current = await tx.getAll(...groupRefs);
        for (const record of current) if (record.exists && !terminal.has(record.get("status"))) tx.set(record.ref, { status: "dispatched", groupRoot: rootId, groupIds, bullJobId: jobId, recoverable: true, nextRecoveryAt: Timestamp.now(), dispatchedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    } catch (error) {
      failures.push(document.id);
      await db.runTransaction(async tx => {
        const current = await tx.getAll(...groupRefs);
        for (const record of current) {
          if (!record.exists || terminal.has(record.get("status"))) continue;
          const attempts = Number(record.get("dispatchAttempts") ?? 0) + 1;
          // An unavailable queue is an infrastructure outage, not a processing attempt.
          tx.set(record.ref, { groupRoot: rootId, groupIds, status: "dispatch_retry", recoverable: true, dispatchAttempts: attempts, nextRecoveryAt: Timestamp.fromMillis(Date.now() + retryDelay(attempts, 5000, recoveryInterval())), lastErrorMessage: error instanceof Error ? error.message.slice(0, 500) : "DISPATCH_FAILED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      });
    }
  }
  console.info(JSON.stringify({ event: "outbox.scan", collection, recovery: options.recover, documentsFetched: page.size, queryCalls: 0 }));
  return { examined: page.size, hasMore: page.size === batchSize && failures.length === 0, failures };
}

/** Effects may repeat after crashes; body must be idempotent and fenced. */
export async function executeOutbox(db: Firestore, job: Job, collection: string, mirrorCollection: string, body: () => Promise<void>) {
  const outbox = db.collection(collection).doc(String(job.data.outboxId ?? job.data.eventId ?? job.data.jobId ?? job.id));
  const outboxes: DocumentReference[] = Array.isArray(job.data.outboxIds) ? job.data.outboxIds.map((id: string) => db.collection(collection).doc(id)) : [outbox];
  const mirror = db.collection(mirrorCollection).doc(String(job.data.jobId ?? job.id));
  const current = (await outbox.get()).data();
  if (current && ["completed", "succeeded", "retried"].includes(current.status)) return;
  if (current && ["dead", "quarantined"].includes(current.status)) throw new UnrecoverableError("JOB_REQUIRES_MANUAL_RETRY");
  try {
    await body();
    const batch = db.batch();
    const done = { status: "completed", recoverable: false, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    for (const ref of outboxes) batch.set(ref, done, { merge: true }); batch.set(mirror, { ...job.data, ...done }, { merge: true }); await batch.commit();
  } catch (error) {
    if (error instanceof LeaseBusy) throw error;
    const dead = error instanceof UnrecoverableError;
    await db.runTransaction(async tx => {
      const records = await tx.getAll(...outboxes);
      const latest = records.find(record => record.id === outbox.id)?.data();
      if (latest && terminal.has(latest.status)) return;
      const attempts = Number(latest?.attempts ?? 0) + 1;
      const state = { status: dead || attempts >= 6 ? "dead" : "retryable", recoverable: !dead && attempts < 6, attempts, lastErrorCode: error instanceof Error ? error.message.slice(0, 300) : "UNKNOWN", nextRecoveryAt: Timestamp.fromMillis(Date.now() + recoveryInterval()), updatedAt: FieldValue.serverTimestamp() };
      for (const record of records) if (!terminal.has(record.get("status"))) tx.set(record.ref, state, { merge: true }); tx.set(mirror, { ...job.data, ...state }, { merge: true });
    });
    throw error;
  }
}
