import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Redis from "ioredis";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { Worker } from "bullmq";
import { createDeliveryQueues, closeDelivery, type DeliveryQueues } from "@/lib/background/delivery";
import { recoverBackground } from "@/lib/background/recovery";
import { writeProjection } from "@/lib/background/enqueue";
import { taskFromRecord, bookingTaskId } from "@/lib/background/booking-jobs";
import { backgroundKey } from "@/lib/background/config";
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.TEST_REDIS_URL;
describe.skipIf(!enabled)("direct queue delivery (real Redis + Firestore emulator)", { timeout: 30000 }, () => {
  let db: Firestore, redis: Redis, queues: DeliveryQueues;
  const children: ChildProcess[] = [], servers: Server[] = [];
  async function waitFor(check: () => Promise<boolean>, maximum = 10000) {
    const end = Date.now() + maximum;
    while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error("WORKER_WAIT_TIMEOUT");
  }
  async function startWorker(respond?: (body: Record<string, unknown>) => unknown) {
    process.env.CRON_SECRET = "local-queue-test";
    const { POST } = await import("@/app/api/internal/bookings/tasks/route");
    const server = createServer(async (request, response) => {
      try {
        let body = ""; for await (const chunk of request) body += chunk;
        const result = respond ? Response.json(respond(JSON.parse(body))) : await POST(new Request("http://localhost/api/internal/bookings/tasks", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": request.headers["x-cron-secret"] as string }, body }));
        response.writeHead(result.status, { "Content-Type": "application/json" }); response.end(await result.text());
      } catch { response.writeHead(500); response.end(); }
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("NO_SERVER_ADDRESS");
    const child = spawn(process.execPath, ["dist/workers/bookings/runner.js"], { env: { ...process.env, BOOKING_WORKER_URL: `http://127.0.0.1:${address.port}` }, stdio: "pipe" });
    children.push(child); child.stdout?.resume(); child.stderr?.resume();
    return child;
  }
  beforeAll(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:") || !process.env.TEST_REDIS_URL?.startsWith("redis://127.0.0.1:")) throw new Error("Local test services required");
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-queue";
    process.env.BACKGROUND_MODE = "queue"; process.env.QUEUE_REDIS_URL = process.env.TEST_REDIS_URL;
    process.env.BULLMQ_PREFIX = `queue-test-${randomUUID()}`;
    process.env.HELPKEY_ENV = `queue-test-${randomUUID()}`;
    db = (await import("@/lib/firebase/admin")).adminDb;
    redis = new Redis(process.env.TEST_REDIS_URL!, { maxRetriesPerRequest: null });
    queues = createDeliveryQueues(redis);
  });
  afterEach(async () => {
    for (const child of children.splice(0)) {
      child.kill("SIGTERM");
      await new Promise<void>(resolve => { const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 5000); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
    }
    for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve()));
    await closeDelivery(); process.env.QUEUE_REDIS_URL = process.env.TEST_REDIS_URL;
    for (const queue of Object.values(queues)) await queue.obliterate({ force: true });
    await redis.del(...["queue-generation", "rebuild-progress", "rebuild-requested", "recovery-status"].map(key => backgroundKey(key)), backgroundKey("leader", "background-recovery"));
    for (const collection of ["projectionOutbox", "projectionState", "bookings", "bookingNotificationOutbox", "notifications", "propertyMemberships", "refunds", "mediaPublicationOutbox"]) {
      const rows = await db.collection(collection).get(); for (const row of rows.docs) await db.recursiveDelete(row.ref);
    }
  });
  afterAll(async () => { await closeDelivery(); await Promise.all(Object.values(queues ?? {}).map(queue => queue.close())); await redis?.quit(); await db?.terminate(); });
  it("immediately delivers committed projections without a discovery query", async () => {
    const batch = db.batch(), id = writeProjection(db, batch, "cache_invalidation", "hotel");
    await batch.commit();
    const jobs = await queues.projection.getJobs(["waiting"]);
    expect(jobs).toHaveLength(1); expect(jobs[0].data.eventId).toBe(id);
    expect((await db.collection("projectionOutbox").doc(id).get()).get("status")).toBe("dispatched");
  });
  it("reconstructs future booking timers after losing all Redis jobs", async () => {
    const ref = db.collection("bookings").doc("future-booking"), expiresAt = Timestamp.fromMillis(Date.now() + 600000);
    await db.batch().create(ref, { bookingStatus: "pending_payment", expiresAt, paymentReconciliationPending: false }).commit();
    const task = taskFromRecord("expiry", ref.id, (await ref.get()).data()!)!;
    expect(await (await queues.expiry.getJob(bookingTaskId(task)))?.getState()).toBe("delayed");
    await queues.expiry.obliterate({ force: true });
    expect(await queues.expiry.getJob(bookingTaskId(task))).toBeUndefined();
    await recoverBackground(db, queues, { rebuild: true });
    expect(await (await queues.expiry.getJob(bookingTaskId(task)))?.getState()).toBe("delayed");
  });
  it("keeps a committed change recoverable during Redis outage", async () => {
    await closeDelivery(); process.env.QUEUE_REDIS_URL = "redis://127.0.0.1:1";
    const batch = db.batch(), id = writeProjection(db, batch, "cache_invalidation", "hotel");
    const started = Date.now(); await batch.commit(); expect(Date.now() - started).toBeLessThan(5000);
    expect((await db.collection("projectionOutbox").doc(id).get()).get("recoverable")).toBe(true);
    await closeDelivery(); process.env.QUEUE_REDIS_URL = process.env.TEST_REDIS_URL;
    await db.collection("projectionOutbox").doc(id).update({ nextRecoveryAt: Timestamp.fromMillis(0) });
    await recoverBackground(db, queues);
    expect(await queues.projection.getWaitingCount()).toBe(1);
  });
  it("does not expire a confirmed booking when its old expiry task arrives", async () => {
    const ref = db.collection("bookings").doc("paid");
    await ref.set({ bookingStatus: "confirmed", expiresAt: Timestamp.fromMillis(Date.now() - 10000) });
    const { executeBookingTask } = await import("@/lib/booking/tasks");
    expect(await executeBookingTask({ kind: "expiry", recordId: ref.id, revision: 0, dueAt: Date.now() - 10000 })).toMatchObject({ outcome: "stale" });
    expect((await ref.get()).get("bookingStatus")).toBe("confirmed");
  });
  it("processes notifications by ID and preserves read state on duplicate delivery", async () => {
    const ref = db.collection("bookingNotificationOutbox").doc("booking_confirmed");
    await db.batch().create(ref, { bookingId: "booking", propertyId: "hotel", guestId: "guest", bookingStatus: "confirmed", status: "pending", attempts: 0, nextAttemptAt: Timestamp.now() }).commit();
    const task = taskFromRecord("notifications", ref.id, (await ref.get()).data()!)!;
    const { executeBookingTask } = await import("@/lib/booking/tasks");
    expect(await executeBookingTask(task)).toMatchObject({ outcome: "completed" });
    const notification = db.collection("notifications").doc(`${ref.id}_guest`), readAt = Timestamp.now();
    await notification.update({ readAt }); await executeBookingTask(task);
    expect((await notification.get()).get("readAt").toMillis()).toBe(readAt.toMillis());
  });
  it("advances a reconciliation revision without invalidating the expiry timer", async () => {
    const ref = db.collection("bookings").doc("two-timers"), expiresAt = Timestamp.fromMillis(Date.now() + 600000);
    await db.batch().create(ref, { bookingStatus: "pending_payment", expiresAt, paymentReconciliationPending: true, nextReconcileAt: Timestamp.fromMillis(Date.now() + 60000) }).commit();
    const before = (await ref.get()).data()!;
    await db.runTransaction(async tx => { await tx.get(ref); tx.update(ref, { nextReconcileAt: Timestamp.fromMillis(Date.now() + 120000) }); });
    const after = (await ref.get()).data()!;
    expect(after.backgroundRevisions.expiry).toBe(before.backgroundRevisions.expiry);
    expect(after.backgroundRevisions.payments).toBe(before.backgroundRevisions.payments + 1);
    expect(bookingTaskId(taskFromRecord("expiry", ref.id, after)!)).toBe(bookingTaskId(taskFromRecord("expiry", ref.id, before)!));
  });
  it("executes a delayed notification through the real worker and authenticated HTTP handler", async () => {
    await startWorker();
    const ref = db.collection("bookingNotificationOutbox").doc("delayed_confirmed"), dueAt = Date.now() + 500;
    await db.batch().create(ref, { bookingId: "delayed", propertyId: "hotel", guestId: "guest", bookingStatus: "confirmed", status: "pending", attempts: 0, nextAttemptAt: Timestamp.fromMillis(dueAt) }).commit();
    await waitFor(async () => (await ref.get()).get("status") === "completed");
    const notification = await db.collection("notifications").doc(`${ref.id}_guest`).get();
    expect(notification.exists).toBe(true); expect(notification.get("createdAt").toMillis()).toBeGreaterThanOrEqual(dueAt);
  });
  it("schedules a successor revision through the real booking worker", async () => {
    let calls = 0;
    await startWorker(body => { calls++; return calls === 1 ? { outcome: "rescheduled", next: { ...body, revision: Number(body.revision) + 1, dueAt: Date.now() + 200 } } : { outcome: "completed" }; });
    const task = { kind: "payments" as const, recordId: "reschedule", revision: 0, dueAt: Date.now() };
    await queues.payments.add("payments", task, { jobId: bookingTaskId(task) });
    await waitFor(async () => calls === 2);
    expect(calls).toBe(2);
  });
  it("rebuilds future timers on recovery-process startup without frequent discovery scans", async () => {
    const ref = db.collection("bookings").doc("startup-future");
    await ref.set({ bookingStatus: "pending_payment", expiresAt: Timestamp.fromMillis(Date.now() + 600000) });
    const child = spawn(process.execPath, ["dist/workers/shared/recovery-runner.js"], { env: process.env, stdio: "pipe" });
    children.push(child); child.stdout?.resume(); child.stderr?.resume();
    await waitFor(async () => !!await redis.get(backgroundKey("recovery-status")), 15000);
    const status = JSON.parse((await redis.get(backgroundKey("recovery-status")))!);
    expect(status).toMatchObject({ rebuild: true, queryCalls: 6, failures: [] });
    const task = taskFromRecord("expiry", ref.id, (await ref.get()).data()!)!;
    expect(await (await queues.expiry.getJob(bookingTaskId(task)))?.getState()).toBe("delayed");
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(JSON.parse((await redis.get(backgroundKey("recovery-status")))!).at).toBe(status.at);
  });
  it("surfaces an exhausted job as durable attention and legacy polling does not revive it", async () => {
    const ref = db.collection("bookings").doc("exhausted");
    await ref.set({ bookingStatus: "pending_payment", expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    const task = taskFromRecord("expiry", ref.id, (await ref.get()).data()!)!;
    const job = await queues.expiry.add("expiry", task, { jobId: bookingTaskId(task), attempts: 1 });
    const worker = new Worker(queues.expiry.name, async () => { throw new Error("TRANSPORT_EXHAUSTED"); }, { connection: redis, prefix: process.env.BULLMQ_PREFIX });
    worker.on("error", () => {});
    try { await waitFor(async () => await job.getState() === "failed"); } finally { await worker.close(); }
    await recoverBackground(db, queues);
    expect((await ref.get()).get("backgroundAttention.expiry")).toBe(true);
    expect(taskFromRecord("expiry", ref.id, (await ref.get()).data()!)).toBeUndefined();
    const { expirePendingBookings } = await import("@/lib/bookings");
    expect(await expirePendingBookings("system:test")).toMatchObject({ examined: 0, expired: 0 });
    expect((await ref.get()).get("bookingStatus")).toBe("pending_payment");
  });
});
