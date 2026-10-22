import { recoveryQueries } from "../lib/background/recovery";
/** Read-only: lists index metadata and optionally explains query plans; never creates/deletes indexes or reads result documents. */
import { readFileSync, writeFileSync } from "node:fs";
import { getApp } from "firebase-admin/app";
import { Timestamp, type Firestore, type Query } from "firebase-admin/firestore";
type Index = { name?: string; collectionGroup?: string; queryScope: string; fields: { fieldPath: string; order?: string; arrayConfig?: string }[]; state?: string };
export function normalizedIndex(index: Index) {
  const fields = [...index.fields];
  if (!fields.some(field => field.fieldPath === "__name__")) fields.push({ fieldPath: "__name__", order: [...fields].reverse().find(field => field.order)?.order ?? "ASCENDING" });
  return JSON.stringify({ collectionGroup: index.collectionGroup ?? index.name?.split("/collectionGroups/")[1]?.split("/")[0], queryScope: index.queryScope, fields });
}
function queries(db: Firestore) {
  const output: { label: string; source: string; query: Query }[] = [];
  const add = (label: string, source: string, query: Query) => output.push({ label, source, query: query.limit(1) });
  const value = "__index_audit__", now = Timestamp.now();
  const base = () => db.collection("properties").where("status", "==", "active").where("approvalStatus", "==", "approved").where("isBookable", "==", true);
  for (const city of [false, true]) for (const type of [false, true]) {
    let query = base(); if (city) query = query.where("normalizedCity", "==", value); if (type) query = query.where("propertyType", "==", "hotel");
    add(`catalog.dated.city=${city}.type=${type}`, "lib/customer/catalog.ts:353", query.orderBy("__name__"));
    for (const amenity of [false, true]) for (const field of ["minimumPricePaise", "ratingAverage"]) for (const direction of ["asc", "desc"] as const) {
      let ordered = query; if (amenity) ordered = ordered.where("amenityCodes", "array-contains", "wifi");
      add(`catalog.${field}.${direction}.city=${city}.type=${type}.amenity=${amenity}`, "lib/customer/catalog.ts:386", ordered.orderBy(field, direction).orderBy("__name__", direction));
    }
  }
  for (const field of ["normalizedName", "normalizedCity"]) add(`suggestions.${field}`, "lib/customer/catalog.ts:425", base().where(field, ">=", value).where(field, "<=", `${value}\uf8ff`).orderBy(field));
  add("suggestions.tokens", "lib/customer/catalog.ts:427", base().where("searchTokens", "array-contains", value));
  add("bookings.mine", "app/api/bookings/mine/route.ts:15", db.collection("bookings").where("guestId", "==", value).orderBy("checkIn", "desc").orderBy("__name__", "desc"));
  add("bookings.review-eligibility", "lib/reviews.ts:49", db.collection("bookings").where("guestId", "==", value).where("propertyId", "==", value).where("bookingStatus", "in", ["completed", "checked_out"]));
  for (const status of [false, true]) for (const search of [false, true]) {
    let query: Query = db.collection("bookings"); if (status) query = query.where("bookingStatus", "==", "confirmed"); if (search) query = query.where("searchTokens", "array-contains", value);
    add(`admin.bookings.status=${status}.search=${search}`, "app/api/admin/bookings/route.ts:21", query);
  }
  for (const status of [false, true]) for (const approval of [false, true]) for (const search of [false, true]) {
    let query: Query = db.collection("properties"); if (status) query = query.where("status", "==", "active"); if (approval) query = query.where("approvalStatus", "==", "approved"); if (search) query = query.where("searchTokens", "array-contains", value);
    add(`admin.properties.status=${status}.approval=${approval}.search=${search}`, "app/api/admin/properties/route.ts:22", query.orderBy("__name__"));
  }
  for (const status of [false, true]) for (const array of ["none", "roles", "searchTokens"]) {
    let query: Query = db.collection("users"); if (status) query = query.where("accountStatus", "==", "active"); if (array !== "none") query = query.where(array, "array-contains", value);
    add(`admin.users.status=${status}.array=${array}`, "app/api/admin/users/route.ts:19", query.orderBy("__name__"));
  }
  add("users.active-admin-count", "lib/admin/data.ts:137", db.collection("users").where("roles", "array-contains", "admin").where("accountStatus", "==", "active").where("isActive", "==", true));
  for (const unread of [false, true]) {
    let query = db.collection("notifications").where("userId", "==", value); if (unread) query = query.where("readAt", "==", null);
    add(`notifications.unread=${unread}`, "lib/notifications/service.ts:151", query.orderBy("createdAt", "desc").orderBy("__name__", "desc"));
  }
  add("notifications.unread-count", "lib/notifications/service.ts:162", db.collection("notifications").where("userId", "==", value).where("readAt", "==", null));
  for (const filter of ["all", "awaiting", "positive"]) {
    let query = db.collection("propertyReviews").where("propertyId", "==", value).where("status", "==", "approved");
    if (filter === "awaiting") query = query.where("replyState", "==", "awaiting"); if (filter === "positive") query = query.where("sentiment", "==", "positive");
    add(`reviews.${filter}`, "app/api/partner/reviews/route.ts:35", query.orderBy("submittedAt", "desc").orderBy("__name__", "desc"));
  }
  add("reviews.rebuild", "workers/projections/reviews.ts:19", db.collection("propertyReviews").where("propertyId", "==", value).orderBy("__name__"));
  for (const collection of ["roomTypes", "ratePlans", "cancellationPolicies"]) add(`${collection}.active`, "lib/services/public-stay.ts:31", db.collection(collection).where("propertyId", "==", value).where("status", "==", "active").orderBy("__name__"));
  add("bookings.expiry", "lib/bookings.ts:457", db.collection("bookings").where("bookingStatus", "==", "pending_payment").where("expiresAt", "<=", now));
  add("bookings.reconciliation", "lib/booking/processing.ts:115", db.collection("bookings").where("paymentReconciliationPending", "==", true).where("nextReconcileAt", "<=", now).orderBy("nextReconcileAt"));
  add("refunds.due", "lib/booking/processing.ts:80", db.collection("refunds").where("status", "in", ["pending", "retry", "processing"]).where("nextAttemptAt", "<=", now).orderBy("nextAttemptAt"));
  add("booking-notifications.due", "lib/booking/notifications.ts:9", db.collection("bookingNotificationOutbox").where("status", "in", ["pending", "retry"]).where("nextAttemptAt", "<=", now).orderBy("nextAttemptAt"));
  for (const collection of ["projectionOutbox", "mediaPublicationOutbox"]) add(`${collection}.recovery`, "workers/shared/outbox.ts:11", db.collection(collection).where("recoverable", "==", true).where("nextRecoveryAt", "<=", now).orderBy("nextRecoveryAt"));
  add("media.legacy-recovery", "workers/media/cleanup.ts:18", db.collection("mediaPublicationJobs").where("status", "==", "processing").where("leaseExpiresAt", "<=", now));
  add("inventory.blocks", "app/api/partner/properties/[propertyId]/inventory-blocks/route.ts:28", db.collection("inventoryBlocks").where("propertyId", "==", value).where("roomTypeId", "==", value).where("status", "==", "active"));
  add("memberships.user", "app/api/partner/bookings/route.ts:23", db.collection("propertyMemberships").where("userId", "==", value).where("status", "==", "active"));
  add("memberships.property", "lib/booking/notifications.ts:16", db.collection("propertyMemberships").where("propertyId", "==", value).where("status", "==", "active"));
  add("inventory.capacity-update", "app/api/partner/properties/[propertyId]/room-types/[roomTypeId]/route.ts", db.collection("inventoryCalendars").where("propertyId", "==", value).where("roomTypeId", "==", value));
  add("legacy-inventory.capacity-update", "app/api/partner/properties/[propertyId]/room-types/[roomTypeId]/route.ts", db.collection("roomNightInventory").where("propertyId", "==", value).where("roomTypeId", "==", value));
  add("dashboard.upcoming-count", "workers/projections/processor.ts:90", db.collection("bookings").where("propertyId", "==", value).where("checkIn", ">=", "2026-10-21"));
  add("admin.property-events", "lib/admin/data.ts:36", db.collection("propertyReviewEvents").where("propertyId", "==", value).orderBy("createdAt", "desc"));
  add("kyc.existing-document", "app/api/partner/properties/[propertyId]/kyc/finalize/route.ts:41", db.collection("verificationDocuments").where("propertyId", "==", value).where("documentType", "==", "pan"));
  add("aadhaar.list", "lib/aadhaar-lab.ts:101", db.collection("aadhaarVerificationLab").where("operatorId", "==", value).orderBy("createdAt", "desc"));
  add("aadhaar.operator-limit", "lib/aadhaar-lab.ts:60", db.collection("aadhaarVerificationLab").where("operatorId", "==", value).where("createdAt", ">=", now));
  add("aadhaar.identity-limit", "lib/aadhaar-lab.ts:60", db.collection("aadhaarVerificationLab").where("aadhaarFingerprint", "==", value).where("createdAt", ">=", now));
  for (const rebuild of [false, true]) for (const { collection, kind, query } of recoveryQueries(db, rebuild)) add(`background.${rebuild ? "rebuild" : "recovery"}.${kind ?? collection}`, "lib/background/recovery.ts", query);
  return output;
}
async function main() {
  const args = new Set(process.argv.slice(2)), cloud = args.has("--cloud"), explain = args.has("--explain");
  const local = (JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as { indexes: Index[] }).indexes;
  const groups = new Map<string, number[]>(); local.forEach((index, number) => { const key = normalizedIndex(index); groups.set(key, [...groups.get(key) ?? [], number + 1]); });
  const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), localCount: local.length, localIndexes: local.map((index, i) => ({ number: i + 1, ...index })), equivalentLocalDefinitions: [...groups.values()].filter(group => group.length > 1) };
  let db: Firestore | undefined;
  try {
    if (cloud || explain) {
      if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Cloud audit must not target the emulator");
      const project = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
      if (!project || project !== (process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)) throw new Error("Pass --project=<configured project> explicitly");
      db = (await import("../workers/media/firebase")).db; report.project = project;
      if (cloud) {
        const token = await getApp().options.credential!.getAccessToken();
        const actual: Index[] = []; let page = "";
        do {
          const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes${page ? `?pageToken=${encodeURIComponent(page)}` : ""}`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30_000) });
          const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? `INDEX_LIST_${response.status}`);
          actual.push(...body.indexes ?? []); page = body.nextPageToken ?? "";
        } while (page);
        report.cloudIndexes = actual;
        report.cloudCount = actual.length;
        report.localMissingInCloud = local.map((index, i) => ({ number: i + 1, index })).filter(({ index }) => !actual.some(other => normalizedIndex(other) === normalizedIndex(index)));
        report.cloudNotInLocal = actual.filter(index => !local.some(other => normalizedIndex(other) === normalizedIndex(index)));
      }
      if (explain) {
        const inventory = queries(db), plans: unknown[] = [];
        for (let offset = 0; offset < inventory.length; offset += 3) {
          const batch = await Promise.all(inventory.slice(offset, offset + 3).map(async ({ label, source, query }) => {
            try { const result = await query.explain({ analyze: false }); return { label, source, plan: result.metrics.planSummary }; }
            catch (error) { return { label, source, error: error instanceof Error ? error.message : "EXPLAIN_FAILED" }; }
          })); plans.push(...batch);
        }
        report.plans = plans; report.plannerRequests = inventory.length;
      }
    }
    const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    if (output) { writeFileSync(output, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify({ output, localCount: report.localCount, cloudCount: report.cloudCount, plannerRequests: report.plannerRequests, equivalentLocalDefinitions: report.equivalentLocalDefinitions })); }
    else console.log(JSON.stringify(report, null, 2));
  } finally { await db?.terminate(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "AUDIT_FAILED"); process.exitCode = 1; });
