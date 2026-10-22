import Redis from "ioredis";
import { Queue } from "bullmq";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { backgroundMode, queuePrefix, queueRedisUrl } from "./config";
import { projectionSchema, publicationSchema, safeJobId } from "./jobs";
import { bookingKinds, bookingCollection, bookingQueueName, bookingTaskId, taskFromRecord, type BookingTask } from "./booking-jobs";
import { dispatchOutboxDocuments } from "../../workers/shared/outbox";
import type { DeliveryRecord } from "./commit";

export function createDeliveryQueues(redis: Redis) {
  const common = { connection: redis, prefix: queuePrefix(), defaultJobOptions: { attempts: 6, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: { age: 7 * 86400, count: 20000 }, removeOnFail: false } };
  const queues = {
    projection: new Queue(process.env.PROJECTION_QUEUE ?? "helpkey-projections", common),
    media: new Queue(process.env.MEDIA_PUBLICATION_QUEUE ?? "helpkey-media-publication", { ...common, defaultJobOptions: { ...common.defaultJobOptions, backoff: { type: "media-publication" } } }),
    ...Object.fromEntries(bookingKinds.map(kind => [kind, new Queue(bookingQueueName(kind), common)])),
  } as { projection: Queue; media: Queue } & Record<typeof bookingKinds[number], Queue>;
  for (const [name, queue] of Object.entries(queues)) queue.on("error", error => console.error(JSON.stringify({ event: "queue.error", queue: name, error: error.message })));
  return queues;
}
export type DeliveryQueues = ReturnType<typeof createDeliveryQueues>;
export async function ensureBookingTask(queue: Queue, task: BookingTask) {
  const jobId = bookingTaskId(task), existing = await queue.getJob(jobId);
  const state = existing && await existing.getState();
  // Completion without a durable transition is an interrupted acknowledgement; repair it.
  if (state === "completed") await existing!.remove();
  if (!existing || state === "completed" || state === "unknown") await queue.add(task.kind, task, { jobId, delay: Math.max(0, task.dueAt - Date.now()) });
  // Exhausted jobs stay failed until an explicit admin retry changes the durable revision.
  return state === "failed" ? "failed" : "scheduled";
}
export async function deliverSnapshots(db: Firestore, queues: DeliveryQueues, collection: string, docs: QueryDocumentSnapshot[], onlyKind?: string) {
  if (docs.length > 200) {
    for (let offset = 0; offset < docs.length; offset += 200) await deliverSnapshots(db, queues, collection, docs.slice(offset, offset + 200), onlyKind);
    return;
  }
  if (collection === "projectionOutbox" || collection === "mediaPublicationOutbox") {
    const media = collection === "mediaPublicationOutbox";
    const result = await dispatchOutboxDocuments({ db, queue: media ? queues.media : queues.projection, collection, batchSize: 200, recover: true,
      parse: value => media ? publicationSchema.parse(value) : projectionSchema.parse(value),
      id: (data, id) => media ? safeJobId("media", id) : safeJobId(String(data.kind), String(data.entityId), String(data.eventId), String(data.version)),
      name: data => String(data.kind ?? data.operation) }, docs);
    if (result.failures.length) throw new Error(`OUTBOX_DELIVERY_FAILED:${result.failures.length}`);
    return;
  }
  for (const doc of docs) for (const kind of bookingKinds) {
    if (onlyKind && kind !== onlyKind) continue;
    if (bookingCollection(kind) !== collection) continue;
    const task = taskFromRecord(kind, doc.id, doc.data());
    if (task && await ensureBookingTask(queues[kind], task) === "failed") {
      await db.runTransaction(async tx => {
        const current = (await tx.get(doc.ref)).data();
        const latest = current && taskFromRecord(kind, doc.id, current);
        if (latest && bookingTaskId(latest) === bookingTaskId(task)) tx.update(doc.ref, { [`backgroundAttention.${kind}`]: true, lastBackgroundError: "QUEUE_ATTEMPTS_EXHAUSTED" });
      });
    }
  }
}

let clients: { redis: Redis; queues: DeliveryQueues } | undefined;
export async function closeDelivery() {
  const current = clients; clients = undefined;
  if (current) { await Promise.allSettled(Object.values(current.queues).map(queue => queue.close())); current.redis.disconnect(); }
}
export async function deliverRecords(db: Firestore, records: DeliveryRecord[]) {
  if (backgroundMode() === "legacy") return;
  if (clients?.redis.status === "end") await closeDelivery();
  if (!clients) {
    const redis = new Redis(queueRedisUrl(), { lazyConnect: true, enableOfflineQueue: false, connectTimeout: 1000, commandTimeout: 1000, maxRetriesPerRequest: 1, retryStrategy: () => null });
    redis.on("error", () => {});
    clients = { redis, queues: createDeliveryQueues(redis) };
  }
  const current = clients;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    if (current.redis.status === "wait") await current.redis.connect();
    const groups = new Map<string, QueryDocumentSnapshot[]>();
    for (let offset = 0; offset < records.length; offset += 100) {
      const docs = await db.getAll(...records.slice(offset, offset + 100).map(record => db.collection(record.collection).doc(record.id)));
      for (const doc of docs) if (doc.exists) groups.set(doc.ref.parent.id, [...groups.get(doc.ref.parent.id) ?? [], doc as QueryDocumentSnapshot]);
    }
    for (const [collection, docs] of groups) await deliverSnapshots(db, current.queues, collection, docs);
  };
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("ENQUEUE_DEADLINE")), 1500); })]);
    console.info(JSON.stringify({ event: "background.delivered", records: records.length }));
  } finally { if (timer) clearTimeout(timer); }
}
