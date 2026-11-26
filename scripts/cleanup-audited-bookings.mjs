import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { applyFirestore } from "./booking-cleanup/apply.mjs";
import { makePlan, targetIds, mentions } from "./booking-cleanup/plan.mjs";
const require = createRequire(import.meta.url);
const { initializeApp, cert } = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  GeoPoint,
} = require("firebase-admin/firestore");
const { Queue } = require("bullmq");
const Redis = require("ioredis");
const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (projectId !== "helpkey-a8fab" || process.env.FIRESTORE_EMULATOR_HOST)
  throw Error("Wrong project or emulator target");
const db = getFirestore(
  initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  }),
);
function encode(v) {
  if (v instanceof Timestamp)
    return {
      $type: "timestamp",
      seconds: v.seconds,
      nanoseconds: v.nanoseconds,
    };
  if (v instanceof GeoPoint)
    return { $type: "geo", latitude: v.latitude, longitude: v.longitude };
  if (Buffer.isBuffer(v))
    return { $type: "bytes", base64: v.toString("base64") };
  if (v && typeof v === "object" && v.path && v.firestore)
    return { $type: "reference", path: v.path };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, encode(x)]),
    );
  return v;
}
const same = (a, b) => JSON.stringify(encode(a)) === JSON.stringify(encode(b));
const hash = (v) =>
  createHash("sha256")
    .update(JSON.stringify(encode(v)))
    .digest("hex");
const roots = [
  "bookings",
  "bookingFinanceAgreementsV1",
  "bookingReferences",
  "bookingSubmissionClosures",
  "inventoryHolds",
  "paymentAttempts",
  "propertyPayments",
  "refunds",
  "hotelAccountingStateV1",
  "hotelAccountingJournalV1",
  "hotelAccountingRequestsV1",
  "hotelPayoutsV1",
  "hotelPayoutAssessmentsV1",
  "hotelPayoutReservationsV1",
  "hotelPayoutRequestsV1",
  "hotelDuesPaymentsV1",
  "hotelDuesCorrectionsV1",
  "hotelDuesReferencesV1",
  "hotelDuesConfirmationsV1",
  "hotelDuesRequestsV1",
  "bookingNotificationOutbox",
  "notifications",
  "projectionJobs",
  "projectionOutbox",
  "idempotencyKeys",
  "stayQuoteOrders",
  "invoices",
  "cashierShifts",
  "cashierShiftRequests",
  "cashierActiveShifts",
  "dailyClosings",
  "dailyClosingRequests",
  "hotelClosingState",
  "inventoryCalendars",
  "roomNightInventory",
  "physicalUnitCalendars",
];
const protectedRoots = [
  "properties",
  "roomTypes",
  "ratePlans",
  "cancellationPolicies",
  "users",
  "partnerProfiles",
  "propertyMemberships",
  "hotelFinanceSettingsV1",
  "hotelPrivateBanksV1",
  "hotelPayoutReadinessV1",
  "physicalUnits",
  "propertyReviews",
  "reviewPhotos",
  "mediaAssets",
];
async function load() {
  const out = [];
  for (let i = 0; i < roots.length; i += 8)
    await Promise.all(
      roots.slice(i, i + 8).map(async (root) => {
        const s = await db.collection(root).get();
        out.push(
          ...s.docs.map((d) => ({
            path: d.ref.path,
            data: d.data(),
            version: encode(d.updateTime),
          })),
        );
      }),
    );
  async function children(ref) {
    for (const col of await ref.listCollections()) {
      const refs = await col.listDocuments();
      for (let i = 0; i < refs.length; i += 100) {
        const snaps = await db.getAll(...refs.slice(i, i + 100));
        for (const d of snaps) {
          if (d.exists)
            out.push({
              path: d.ref.path,
              data: d.data(),
              version: encode(d.updateTime),
            });
          await children(d.ref);
        }
      }
    }
  }
  const parents = out.filter(
    (d) =>
      d.path.split("/").length === 2 &&
      ["bookings", "bookingFinanceAgreementsV1"].includes(d.path.split("/")[0]),
  );
  await Promise.all(parents.map((d) => children(db.doc(d.path))));
  async function scanChildren(root, childName) {
    const parents = await db.collection(root).get();
    for (let i = 0; i < parents.docs.length; i += 8)
      await Promise.all(
        parents.docs.slice(i, i + 8).map(async (doc) => {
          const children = await doc.ref.collection(childName).get();
          out.push(
            ...children.docs.map((d) => ({
              path: d.ref.path,
              data: d.data(),
              version: encode(d.updateTime),
            })),
          );
        }),
      );
  }
  await Promise.all([
    scanChildren("physicalUnits", "events"),
    scanChildren("properties", "guestProfiles"),
  ]);

  return out;
}
async function protectedHashes() {
  const result = {};
  for (const root of protectedRoots) {
    const s = await db.collection(root).get();
    result[root] = hash(
      s.docs
        .map((d) => ({ path: d.ref.path, data: d.data() }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    );
  }
  return result;
}
async function connections() {
  const qUrl = process.env.QUEUE_REDIS_URL || process.env.REDIS_URL;
  if (!qUrl) throw Error("Queue Redis not configured");
  const connection = new Redis(qUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    retryStrategy: null,
  });
  connection.on("error", () => {});
  await connection.ping();
  const prefix =
    process.env.BULLMQ_PREFIX ||
    `helpkey-${process.env.HELPKEY_ENV || "development"}`;
  const queues = [
    process.env.PROJECTION_QUEUE || "helpkey-projections",
    process.env.MEDIA_PUBLICATION_QUEUE || "helpkey-media-publication",
    ...["expiry", "payments", "refunds", "notifications"].map(
      (k) => "helpkey-booking-" + k,
    ),
  ].map((name) => new Queue(name, { connection, prefix }));
  const cache = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: null,
  });
  cache.on("error", () => {});
  await cache.ping();
  return { connection, queues, cache, prefix };
}
async function queueInventory(c, known) {
  const jobs = [];
  for (const q of c.queues) {
    const rows = await q.getJobs(
      [
        "wait",
        "active",
        "delayed",
        "completed",
        "failed",
        "prioritized",
        "waiting-children",
        "paused",
      ],
      0,
      -1,
    );
    for (const job of rows)
      if (mentions(job.data, known) || mentions(job.id, known)) {
        if (await job.isActive())
          throw Error("Target job still active; writers must be stopped.");
        jobs.push({ queue: q.name, id: job.id, data: job.toJSON() });
      }
  }
  return [...new Map(jobs.map((j) => [j.queue + "/" + j.id, j])).values()];
}
async function cacheInventory(c, known) {
  const found = [];
  let cursor = "0";
  do {
    const [next, keys] = await c.cache.scan(
      cursor,
      "MATCH",
      `helpkey:${process.env.HELPKEY_ENV || "development"}:*`,
      "COUNT",
      100,
    );
    cursor = next;
    for (const key of keys) {
      if ((await c.cache.type(key)) !== "string") continue;
      const value = await c.cache.get(key);
      if (mentions(key, known) || mentions(value, known))
        found.push({ key, value });
    }
  } while (cursor !== "0");
  return found;
}
const mode = process.argv[2] || "--dry-run";
let c;
try {
  if (!["--dry-run", "--apply", "--verify"].includes(mode))
    throw Error("Use --dry-run, --apply or --verify");
  if (mode === "--dry-run") {
    const docs = await load(),
      plan = makePlan(docs);
    if (plan.missingTargets.length)
      throw Error("Targets changed; expected all six bookings.");
    if (plan.deletes.length + plan.repairs.length > 450)
      throw Error("Too many writes for the single atomic cleanup transaction");
    c = await connections();
    const known = new Set([
      ...targetIds,
      ...plan.deletes.map((p) => p.split("/").at(-1)),
    ]);
    const jobs = await queueInventory(c, known),
      cache = await cacheInventory(c, known),
      protectedBefore = await protectedHashes();
    const directory = path.join(
      process.env.HOME,
      ".codex",
      "backups",
      "helpkey-bookings",
      new Date().toISOString().replaceAll(":", "-"),
    );
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const selected = new Set([
      ...plan.deletes,
      ...plan.repairs.map((p) => p.path),
    ]);
    const backup = {
      projectId,
      createdAt: new Date().toISOString(),
      targetIds,
      plan,
      documents: docs
        .filter((d) => selected.has(d.path))
        .map((d) => ({ ...d, data: encode(d.data) })),
      jobs,
      cache,
      queuePrefix: c.prefix,
      protectedBefore,
    };
    fs.writeFileSync(
      path.join(directory, "backup.json"),
      JSON.stringify(backup, null, 2),
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(directory, "restore-notes.txt"),
      "Backup values use tagged timestamp, geo, bytes and reference types. Restore original paths and typed data using Admin SDK; never call application refund/cancellation handlers. Redis job snapshots and cache entries are included. Original document update times are recorded for conflict detection.\n",
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify(
        {
          directory,
          deletes: plan.deletes.length,
          repairs: plan.repairs,
          jobs: jobs.length,
          caches: cache.length,
          shiftIds: plan.shiftIds,
          preservedCandidates: plan.preservedCandidates,
        },
        null,
        2,
      ),
    );
  } else {
    const directory = process.argv[3];
    if (!directory) throw Error("Backup directory required");
    const backup = JSON.parse(
      fs.readFileSync(path.join(directory, "backup.json"), "utf8"),
    );
    if (backup.projectId !== projectId || !same(backup.targetIds, targetIds))
      throw Error("Wrong backup target");
    const progressFile = path.join(directory, "progress.json");
    const progress = fs.existsSync(progressFile)
      ? JSON.parse(fs.readFileSync(progressFile))
      : {};
    const save = () =>
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), {
        mode: 0o600,
      });
    if (mode === "--apply") {
      // Require the local service supervisor to be absent. The operator also checks children before invocation.
      const { execFileSync } = await import("node:child_process");
      const processes = execFileSync("ps", ["-axo", "command"], {
        encoding: "utf8",
      });
      if (
        processes
          .split("\n")
          .some(
            (l) =>
              l.includes("scripts/dev-services.ts") &&
              !l.includes("cleanup-audited-bookings"),
          )
      )
        throw Error("Stop local web/workers before applying");
      if (!progress.firestoreCommitted) {
        await applyFirestore(db, backup, targetIds, encode, same);
        progress.firestoreCommitted = true;
        save();
      }
      c = await connections();
      for (const row of backup.jobs) {
        const q = c.queues.find((q) => q.name === row.queue),
          job = await q.getJob(row.id);
        if (job) {
          if (!same(job.toJSON().data, row.data.data))
            throw Error("Queue payload changed");
          await job.remove();
        }
      }
      for (const row of backup.cache) {
        await c.cache.eval(
          "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
          1,
          row.key,
          row.value,
        );
      }
      for (const p of backup.plan.properties)
        await c.cache.incr(
          `helpkey:${process.env.HELPKEY_ENV || "development"}:v1:generation:property:${p}`,
        );
      progress.redisCleaned = true;
      save();
    }
    const checks = [];
    for (let i = 0; i < backup.plan.deletes.length; i += 100) {
      const s = await db.getAll(
        ...backup.plan.deletes.slice(i, i + 100).map((p) => db.doc(p)),
      );
      if (s.some((d) => d.exists)) throw Error("Deleted document reappeared");
    }
    for (const p of backup.plan.repairs) {
      const d = await db.doc(p.path).get();
      for (const [k, v] of Object.entries(p.patch))
        if (!same(d.get(k), v)) throw Error("Inventory repair differs");
    }
    const current = await db.collection("bookings").get();
    checks.push({ remainingBookings: current.size });
    const protectedAfter = await protectedHashes();
    if (!same(protectedAfter, backup.protectedBefore))
      throw Error("Protected hotel/user/settings documents changed");
    const docs = await load();
    const residual = docs.filter(
      (d) =>
        mentions(d.data, new Set(targetIds)) ||
        mentions(d.path, new Set(targetIds)),
    );
    if (residual.length)
      throw Error(
        "Residual booking references: " + residual.map((d) => d.path).join(","),
      );
    c ??= await connections();
    const known = new Set([
      ...targetIds,
      ...backup.plan.deletes.map((p) => p.split("/").at(-1)),
    ]);
    if ((await queueInventory(c, known)).length)
      throw Error("Target Redis jobs remain");
    progress.verifiedAt = new Date().toISOString();
    progress.checks = checks;
    save();
    console.log(
      JSON.stringify(
        {
          directory,
          deletes: backup.plan.deletes.length,
          repairs: backup.plan.repairs.length,
          removedJobs: backup.jobs.length,
          cacheEntries: backup.cache.length,
          checks,
          protectedCollectionsVerified: protectedRoots.length,
          preservedCandidates: backup.plan.preservedCandidates,
        },
        null,
        2,
      ),
    );
  }
} finally {
  if (c) {
    await Promise.all(c.queues.map((q) => q.close()));
    await c.connection.quit();
    await c.cache.quit();
  }
  await db.terminate();
}
