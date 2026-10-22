import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import Redis from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { writeProjection } from "@/lib/background/enqueue";
import { writePublication } from "@/lib/background/publication";
import { safeJobId, projectionSchema, publicationSchema } from "@/lib/background/jobs";
import { syncContribution, reviewRoot, rollingPeriods } from "@/lib/background/review-store";
import { withFencedLease } from "../workers/shared/lease";
import { dispatchOutbox, executeOutbox, LeaseBusy } from "../workers/shared/outbox";
import { ownedRelease, ownedRenew } from "@/lib/background/cache";
const storage = vi.hoisted(() => ({ privateBytes: Buffer.alloc(0), public: new Map<string, { bytes: Buffer; metadata: Record<string, string> }>(), failPurge: false }));
vi.mock("../workers/media/r2", () => ({
  publicObjectUrl: (key: string) => `https://media.test/${key}`,
  getPrivateObject: async () => ({ Body: { transformToByteArray: async () => storage.privateBytes }, ContentLength: storage.privateBytes.length, ContentType: "image/png" }),
  headPrivateObject: async () => ({ Metadata: { sha256: createHash("sha256").update(storage.privateBytes).digest("hex") } }),
  headPublicObject: async (key: string) => { const item = storage.public.get(key); if (!item) throw new Error("MISSING"); return { ContentLength: item.bytes.length, ContentType: "image/webp", Metadata: item.metadata }; },
  putPublicObject: async (key: string, bytes: Buffer, metadata: Record<string, string>) => { storage.public.set(key, { bytes, metadata }); },
  deletePublicObject: async (key: string) => { storage.public.delete(key); },
  purgePublicUrls: async () => { if (storage.failPurge) throw new Error("CACHE_PURGE_FAILED"); },
}));
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.TEST_REDIS_URL;
describe.skipIf(!enabled)("background recovery (real Redis and Firestore emulator)", { timeout: 30_000 }, () => {
  let db: Firestore, redis: Redis, queue: Queue;
  const properties: string[] = [], workers: Worker[] = [];
  beforeAll(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:") || !process.env.TEST_REDIS_URL?.startsWith("redis://127.0.0.1:")) throw new Error("Local test services required");
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-workers";
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
    process.env.BULLMQ_PREFIX = `test-${randomUUID()}`;
    db = (await import("../workers/media/firebase")).db;
    redis = new Redis(process.env.TEST_REDIS_URL!, { maxRetriesPerRequest: null });
    queue = new Queue(`test-${randomUUID()}`, { connection: redis });
  });
  afterEach(async () => {
    for (const worker of workers.splice(0)) await worker.close();
    await queue.obliterate({ force: true });
    storage.public.clear(); storage.failPurge = false;
    for (const propertyId of properties.splice(0)) {
      for (const collection of ["propertyReviews", "mediaAssets", "ratePlans", "roomTypes"]) {
        const rows = await db.collection(collection).where("propertyId", "==", propertyId).get();
        for (const row of rows.docs) await db.recursiveDelete(row.ref);
      }
      for (const collection of ["projectionOutbox", "mediaPublicationOutbox"]) {
        const rows = await db.collection(collection).where(collection === "projectionOutbox" ? "entityId" : "assetId", "==", propertyId).get();
        for (const row of rows.docs) await row.ref.delete();
      }
      for (const collection of ["properties", "propertyReviewState", "propertyReviewMetrics", "propertyReviewAggregates"]) await db.recursiveDelete(db.collection(collection).doc(propertyId));
    }
  });
  afterAll(async () => {
    await queue?.close(); await redis?.quit();
    await (await import("../workers/projections/processor")).closeProjectionProcessor();
    await db?.terminate();
  });
  async function property() { const id = `worker-${randomUUID()}`; properties.push(id); await db.collection("properties").doc(id).set({ name: "Test hotel", slug: id }); return id; }
  function dispatch(collection = "projectionOutbox", recover = false) {
    return dispatchOutbox({ db, queue, collection, recover, batchSize: 50, parse: value => collection === "projectionOutbox" ? projectionSchema.parse(value) : publicationSchema.parse(value), id: (_data, id) => safeJobId(collection, id), name: data => String(data.kind ?? data.operation) });
  }
  it("recovers missing queue entries, quarantines invalid records, and does not revive exhausted work", async () => {
    const id = await property(), batch = db.batch();
    const event = writeProjection(db, batch, "property_search", id); await batch.commit();
    await dispatch(); const ref = db.collection("projectionOutbox").doc(event);
    expect((await ref.get()).get("status")).toBe("dispatched");
    await queue.obliterate({ force: true }); await ref.update({ nextRecoveryAt: Timestamp.fromMillis(0) });
    await dispatch("projectionOutbox", true); expect(await queue.getJob(safeJobId("projectionOutbox", event))).toBeTruthy();
    await ref.update({ attempts: 6, nextRecoveryAt: Timestamp.fromMillis(0) }); await queue.obliterate({ force: true });
    await dispatch("projectionOutbox", true); expect((await ref.get()).get("status")).toBe("dead");
    const invalid = db.collection("projectionOutbox").doc(); await invalid.set({ status: "pending", entityId: id, kind: "bad" });
    await dispatch(); expect((await invalid.get()).get("status")).toBe("quarantined"); await invalid.delete();
  });
  it("retains invalidation work after data commit and records durable failures before queue retry", async () => {
    const id = await property(), batch = db.batch(); const event = writeProjection(db, batch, "cache_invalidation", id); await batch.commit();
    const fake = { id: safeJobId(event), data: { eventId: event }, attemptsMade: 0 } as Job;
    let effects = 0;
    await expect(executeOutbox(db, fake, "projectionOutbox", "projectionJobs", async () => { effects++; throw new Error("CACHE_DOWN"); })).rejects.toThrow("CACHE_DOWN");
    expect((await db.collection("projectionOutbox").doc(event).get()).get("status")).toBe("retryable");
    await executeOutbox(db, fake, "projectionOutbox", "projectionJobs", async () => { effects++; });
    await executeOutbox(db, fake, "projectionOutbox", "projectionJobs", async () => { effects++; });
    expect(effects).toBe(2);
  });
  it("coalesces edits and refreshes price without loading rooms, media, or all amenities", async () => {
    const id = await property(), ref = db.collection("properties").doc(id);
    await ref.update({ searchProjectionVersion: 2, amenityCodes: ["wifi"], publicCover: { imageUrl: "unchanged" } });
    await db.collection("ratePlans").doc(`${id}-rate`).set({ propertyId: id, status: "active", pricingModel: "nightly", basePricePaise: 120000 });
    const events: string[] = [];
    for (let i = 0; i < 5; i++) { const batch = db.batch(); events.push(writeProjection(db, batch, "property_search", id, 1, { components: ["pricing"] })); await batch.commit(); }
    await dispatch();
    const queued = await queue.getJobs(["waiting"]);
    expect(queued).toHaveLength(1);
    const process = (await import("../workers/projections/processor")).processProjection;
    await process(queued[0]);
    expect((await db.collection("projectionOutbox").doc(events[4]).get()).get("status")).toBe("completed");
    const value = (await ref.get()).data()!;
    expect(value.minimumPricePaise).toBe(120000); expect(value.amenityCodes).toEqual(["wifi"]); expect(value.publicCover.imageUrl).toBe("unchanged");
  });
  it("fences competing leases and prevents old owners from committing", async () => {
    const id = await property();
    await withFencedLease(db, id, async assert => {
      await expect(withFencedLease(db, id, async () => {})).rejects.toBeInstanceOf(LeaseBusy);
      await db.collection("backgroundLeases").doc(safeJobId(id)).update({ owner: "replacement" });
      await expect(db.runTransaction(async tx => { await assert(tx); tx.update(db.collection("properties").doc(id), { name: "stale" }); })).rejects.toBeInstanceOf(LeaseBusy);
    });
    expect((await db.collection("properties").doc(id).get()).get("name")).toBe("Test hotel");
  });
  it("applies review edits once and keeps exact rolling windows current", async () => {
    const id = await property(), generation = "test-generation", reviewId = `${id}-review`, now = Date.now();
    await db.collection("propertyReviewState").doc(id).set({ activeGeneration: generation });
    const ref = db.collection("propertyReviews").doc(reviewId);
    await ref.set({ propertyId: id, status: "approved", rating: 5, text: "clean", submittedAt: Timestamp.fromMillis(now - 7 * 86400000 + 1000) });
    const sync = () => withFencedLease(db, id, assert => syncContribution(db, id, reviewId, generation, assert, true));
    await sync(); await sync();
    expect((await reviewRoot(db, id, generation).get()).get("count")).toBe(1);
    await ref.update({ rating: 2, partnerReply: { text: "Thanks" } }); await sync();
    expect((await reviewRoot(db, id, generation).get()).get("ratingSum")).toBe(2);
    expect((await rollingPeriods(db, id, generation, now))["7"].current.count).toBe(1);
    expect((await rollingPeriods(db, id, generation, now + 2000))["7"].previous.count).toBe(1);
    await ref.delete(); await sync(); expect((await reviewRoot(db, id, generation).get()).get("count")).toBe(0);
  });
  it("rebuilds historical reviews without rewriting them and rejects a stale cutover", async () => {
    const id = await property(), review = db.collection("propertyReviews").doc(`${id}-legacy`);
    await review.set({ propertyId: id, status: "approved", rating: 4, replyState: "awaiting", sentiment: "positive", hasPhotos: false, submittedAt: Timestamp.now() });
    const before = (await review.get()).updateTime;
    const { rebuildReviews } = await import("../workers/projections/reviews");
    await withFencedLease(db, id, assert => rebuildReviews(id, assert));
    expect((await db.collection("properties").doc(id).get()).get("ratingAverage")).toBe(4);
    expect((await review.get()).updateTime?.isEqual(before!)).toBe(true);
    const active = (await db.collection("propertyReviewState").doc(id).get()).get("activeGeneration");
    let assertions = 0;
    await expect(withFencedLease(db, id, assert => rebuildReviews(id, async tx => {
      await assert(tx);
      if (++assertions === 2) await db.collection("propertyReviewState").doc(id).update({ requestedRevision: 1 });
    }))).rejects.toBeInstanceOf(LeaseBusy);
    expect((await db.collection("propertyReviewState").doc(id).get()).get("activeGeneration")).toBe(active);
  });
  it("processes media generations safely through publish/unpublish/republish and ignores old jobs", async () => {
    const id = await property();
    storage.privateBytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
    const checksum = createHash("sha256").update(storage.privateBytes).digest("hex");
    const asset = db.collection("mediaAssets").doc(id);
    await asset.set({ propertyId: id, kind: "property_image", checksum, r2ObjectKey: "private.png", moderationStatus: "approved" });
    const process = (await import("../workers/media/processor")).processPublication;
    async function enqueue(operation: "publish" | "unpublish") {
      let event = ""; await db.runTransaction(async tx => { event = writePublication(db, tx, { operation, assetType: "property_image", assetId: id, sourceCollection: "mediaAssets", sourceObjectKey: "private.png", sourceChecksum: checksum }); });
      const data = (await db.collection("mediaPublicationOutbox").doc(event).get()).data()!;
      return { id: safeJobId("media", event), data: { ...data, outboxId: event }, attemptsMade: 0 } as Job;
    }
    const first = await enqueue("publish"); await process(first);
    expect(storage.public.size).toBe(3); const old = new Set(storage.public.keys());
    await asset.update({ moderationStatus: "rejected" }); const unpublish = await enqueue("unpublish");
    storage.failPurge = true; await expect(process(unpublish)).rejects.toThrow("CACHE_PURGE_FAILED");
    storage.failPurge = false; await process(unpublish); expect(storage.public.size).toBe(0);
    await asset.update({ moderationStatus: "approved" }); const second = await enqueue("publish"); await process(second);
    expect(storage.public.size).toBe(3); expect([...storage.public.keys()].every(key => !old.has(key))).toBe(true);
    await process(first); expect((await asset.get()).get("publication.requestId")).toBe(second.data.requestId);
  });
  it("uses real BullMQ retries without duplicating a completed effect", async () => {
    const id = await property(), batch = db.batch(); const event = writeProjection(db, batch, "cache_invalidation", id); await batch.commit();
    let attempts = 0;
    const worker = new Worker(queue.name, job => executeOutbox(db, job, "projectionOutbox", "projectionJobs", async () => { if (++attempts === 1) throw new Error("temporary"); }), { connection: redis }); workers.push(worker);
    const completed = new Promise<void>((resolve, reject) => { worker.on("completed", () => resolve()); worker.on("error", reject); });
    await queue.add("cache_invalidation", { eventId: event }, { jobId: safeJobId(event), attempts: 2, backoff: { type: "fixed", delay: 50 } });
    await completed; expect(attempts).toBe(2); expect((await db.collection("projectionOutbox").doc(event).get()).get("status")).toBe("completed");
  });
  it("does not release or renew another owner's Redis lock", async () => {
    const key = `test-lock-${randomUUID()}`; await redis.set(key, "new", "PX", 10000);
    expect(await redis.eval(ownedRelease, 1, key, "old")).toBe(0);
    expect(await redis.eval(ownedRenew, 1, key, "old", "90000")).toBe(0);
    expect(await redis.get(key)).toBe("new"); await redis.del(key);
  });
  it("dry-runs and resumes preparation of legacy outboxes and booking due times", async () => {
    const id = await property(), old = db.collection("projectionOutbox").doc(`${id}-legacy`), refund = db.collection("refunds").doc(id);
    await old.set({ kind: "property_search", entityId: id, eventId: old.id, version: 1, status: "pending" });
    await refund.set({ status: "pending" });
    const exhausted = db.collection("projectionOutbox").doc(`${id}-exhausted`), mirror = db.collection("projectionJobs").doc(`${id}-exhausted-mirror`);
    await exhausted.set({ kind: "property_search", entityId: id, eventId: exhausted.id, version: 1, status: "dispatched", bullJobId: mirror.id });
    await mirror.set({ status: "dead", attempts: 6 });
    const run = promisify(execFile), env = { ...process.env, FIREBASE_ADMIN_PROJECT_ID: "demo-helpkey-workers" };
    try {
      await run("node_modules/.bin/tsx", ["scripts/background-migrate.ts", "--dry-run", "--project=demo-helpkey-workers"], { env });
      expect((await refund.get()).get("nextAttemptAt")).toBeUndefined();
      await run("node_modules/.bin/tsx", ["scripts/background-migrate.ts", "--apply", "--restart", "--project=demo-helpkey-workers"], { env });
      expect((await refund.get()).get("nextAttemptAt")).toBeInstanceOf(Timestamp);
      expect((await old.get()).get("recoverable")).toBe(true);
      expect((await exhausted.get()).get("status")).toBe("dead");
      expect((await exhausted.get()).get("recoverable")).toBe(false);
    } finally { await refund.delete(); await old.delete(); await exhausted.delete(); await mirror.delete(); }
  });

});
