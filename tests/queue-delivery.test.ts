import { afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Queue } from "bullmq";
import { withBackgroundDelivery } from "@/lib/background/commit";
import { bookingTaskId, taskFromRecord } from "@/lib/background/booking-jobs";
import { backgroundMode, queuePrefix, queueRedisUrl } from "@/lib/background/config";
import { ensureBookingTask, type DeliveryQueues } from "@/lib/background/delivery";
import { recoverBackground, recoveryProgress } from "@/lib/background/recovery";
afterEach(() => vi.unstubAllEnvs());
function writer() { const target = { set: vi.fn(), create: vi.fn(), update: vi.fn(), commit: vi.fn(async () => ["committed"]) }; for (const name of ["set", "create", "update"] as const) target[name].mockReturnValue(target); return target; }
const ref = (id: string, collection = "projectionOutbox") => ({ path: `${collection}/${id}` });
describe("post-commit delivery", () => {
  it("enqueues only the successful transaction attempt, after the commit", async () => {
    vi.stubEnv("BACKGROUND_MODE", "queue"); const send = vi.fn(), first = writer(), second = writer();
    const raw = { runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => { await callback(first); expect(send).not.toHaveBeenCalled(); const result = await callback(second); expect(send).not.toHaveBeenCalled(); return result; } };
    const db = withBackgroundDelivery(raw as unknown as Firestore, send);
    let attempt = 0;
    await expect(db.runTransaction(async tx => { tx.set(ref(String(++attempt)) as never, { status: "pending" }); return "saved"; })).resolves.toBe("saved");
    expect(send).toHaveBeenCalledExactlyOnceWith(raw, [{ collection: "projectionOutbox", id: "2" }]);
  });
  it("does not deliver aborted transactions or failed batches", async () => {
    vi.stubEnv("BACKGROUND_MODE", "queue"); const send = vi.fn(), batch = writer(); batch.commit.mockRejectedValue(new Error("ABORT"));
    const raw = { batch: () => batch, runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(writer()) };
    const db = withBackgroundDelivery(raw as unknown as Firestore, send);
    await expect(db.runTransaction(async tx => { tx.set(ref("a") as never, { status: "pending" }); throw new Error("ABORT"); })).rejects.toThrow("ABORT");
    await expect(db.batch().set(ref("b") as never, { status: "pending" }).commit()).rejects.toThrow("ABORT");
    expect(send).not.toHaveBeenCalled();
  });
  it("supports chained batches and preserves successful saves if delivery fails", async () => {
    vi.stubEnv("BACKGROUND_MODE", "hybrid"); const batch = writer(), send = vi.fn().mockRejectedValue(new Error("REDIS_DOWN"));
    const db = withBackgroundDelivery({ batch: () => batch } as unknown as Firestore, send);
    await expect(db.batch().set(ref("a") as never, { status: "pending" }).set(ref("b") as never, { status: "pending" }).commit()).resolves.toEqual(["committed"]);
    expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0][1]).toHaveLength(2);
  });
  it("does not schedule work for leases, nested events or legacy mode", async () => {
    vi.stubEnv("BACKGROUND_MODE", "legacy"); const batch = writer(), send = vi.fn();
    await withBackgroundDelivery({ batch: () => batch } as unknown as Firestore, send).batch().set(ref("a") as never, { status: "pending" }).commit();
    expect(send).not.toHaveBeenCalled();
    vi.stubEnv("BACKGROUND_MODE", "queue");
    await withBackgroundDelivery({ batch: () => batch } as unknown as Firestore, send).batch().update(ref("a", "bookings") as never, { leaseOwner: "lease", nextReconcileAt: Timestamp.now() }).commit();
    expect(send).not.toHaveBeenCalled();
  });
  it("versions payment timers independently from expiry and notifications", async () => {
    vi.stubEnv("BACKGROUND_MODE", "queue"); const batch = writer(), send = vi.fn();
    await withBackgroundDelivery({ batch: () => batch } as unknown as Firestore, send).batch().update(ref("a", "bookings") as never, { nextReconcileAt: Timestamp.now() }).commit();
    expect(batch.update.mock.calls[0][1]).toHaveProperty("backgroundRevisions.payments");
    expect(batch.update.mock.calls[0][1]).not.toHaveProperty("backgroundRevisions.expiry");
  });
});
describe("durable timers and recovery", () => {
  it("discards damaged checkpoints and retains only valid resumable categories", () => {
    expect(recoveryProgress("broken-json")).toEqual({});
    expect(recoveryProgress("[]")).toEqual({});
    expect(recoveryProgress('{"expiry":"cursor","refunds":12,"unknown":"skip"}')).toEqual({ expiry: "cursor" });
  });
  it("keeps old queue prefixes in legacy mode and requires dedicated Redis otherwise", () => {
    vi.stubEnv("BACKGROUND_MODE", "legacy"); vi.stubEnv("REDIS_URL", "redis://cache"); vi.stubEnv("QUEUE_REDIS_URL", "redis://queue");
    expect(queueRedisUrl()).toBe("redis://cache"); expect(queuePrefix()).toBe("helpkey");
    vi.stubEnv("BACKGROUND_MODE", "queue"); expect(queueRedisUrl()).toBe("redis://queue");
    vi.stubEnv("QUEUE_REDIS_URL", ""); expect(queueRedisUrl).toThrow();
    vi.stubEnv("BACKGROUND_MODE", "invalid"); expect(backgroundMode).toThrow();
  });
  it("reconstructs future expiry timers and rejects terminal/attention work", () => {
    const expiresAt = Timestamp.fromMillis(Date.now() + 600000);
    const task = taskFromRecord("expiry", "booking", { bookingStatus: "pending_payment", expiresAt });
    expect(task?.dueAt).toBe(expiresAt.toMillis());
    expect(taskFromRecord("expiry", "booking", { bookingStatus: "confirmed", expiresAt })).toBeUndefined();
    expect(taskFromRecord("expiry", "booking", { bookingStatus: "pending_payment", expiresAt, backgroundAttention: { expiry: true } })).toBeUndefined();
    expect(taskFromRecord("expiry", "booking", { bookingStatus: "pending_payment", expiresAt, expiryRetryAt: Timestamp.fromMillis(expiresAt.toMillis() + 5000) })?.dueAt).toBe(expiresAt.toMillis() + 5000);
  });
  it("deduplicates delayed jobs, repairs incomplete acknowledgements and retains failed jobs", async () => {
    const task = { kind: "expiry" as const, recordId: "booking", revision: 1, dueAt: Date.now() + 600000 };
    const remove = vi.fn(), getState = vi.fn().mockResolvedValue("delayed"), add = vi.fn();
    const queue = { getJob: vi.fn().mockResolvedValue({ getState, remove }), add } as unknown as Queue;
    await ensureBookingTask(queue, task); expect(add).not.toHaveBeenCalled();
    getState.mockResolvedValue("completed"); await ensureBookingTask(queue, task); expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith("expiry", task, expect.objectContaining({ jobId: bookingTaskId(task), delay: expect.any(Number) }));
    add.mockClear(); getState.mockResolvedValue("failed"); await ensureBookingTask(queue, task); expect(add).not.toHaveBeenCalled();
  });
  it("performs exactly six empty discovery queries per recovery sweep", async () => {
    const get = vi.fn().mockResolvedValue({ docs: [], size: 0 });
    const query = { where: () => query, orderBy: () => query, limit: () => query, get };
    const result = await recoverBackground({ collection: () => query } as unknown as Firestore, {} as DeliveryQueues);
    expect(get).toHaveBeenCalledTimes(6); expect(result).toMatchObject({ examined: 0, queryCalls: 6, failures: [] });
  });
  it("paginates past a malformed booking without starving subsequent records", async () => {
    const add = vi.fn(), queues = { expiry: { getJob: vi.fn().mockResolvedValue(undefined), add } } as unknown as DeliveryQueues;
    const docs = Array.from({ length: 101 }, (_, index) => ({ id: index === 0 ? "bad" : `booking-${index}`, data: () => ({ bookingStatus: "pending_payment", expiresAt: Timestamp.fromMillis(0), ...(index === 0 ? { backgroundRevisions: { expiry: -1 } } : {}) }) }));
    const db = { collection: () => {
      let expiry = false, offset = 0;
      const query = { where: (field: string) => { if (field === "bookingStatus") expiry = true; return query; }, orderBy: () => query, limit: () => query, startAfter: () => query,
        get: async () => { const page = expiry ? docs.slice(offset, offset += 100) : []; return { docs: page, size: page.length }; } };
      return query;
    } } as unknown as Firestore;
    const result = await recoverBackground(db, queues);
    expect(result).toMatchObject({ examined: 101, queryCalls: 7, failures: ["bad"] }); expect(add).toHaveBeenCalledTimes(100);
  });
  it("stops opening recovery pages after leadership is lost", async () => {
    const get = vi.fn().mockResolvedValue({ docs: [], size: 0 });
    const query = { where: () => query, orderBy: () => query, limit: () => query, get };
    const assertLeader = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("LOST"));
    await expect(recoverBackground({ collection: () => query } as unknown as Firestore, {} as DeliveryQueues, { assertLeader })).rejects.toThrow("LOST");
    expect(get).toHaveBeenCalledOnce();
  });
});
