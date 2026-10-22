import { FieldValue, type Query } from "firebase-admin/firestore";
import type { Job } from "bullmq";
import { startingPrice } from "../../lib/booking/duration-pricing";
import { db } from "../media/firebase";
import { publicObjectUrl } from "../media/r2";
import { projectAmenityCodes } from "../../lib/customer/amenities";
import { projectionSchema, projectionStateId, components, type ProjectionComponent } from "../../lib/background/jobs";
import type { ProjectionJob } from "./queue";
import Redis from "ioredis";
import { withFencedLease } from "../shared/lease";
import { executeOutbox, LeaseBusy } from "../shared/outbox";
import { invalidate } from "../shared/invalidate";
import { updateReviews } from "./reviews";

const cacheRedis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: 1, commandTimeout: 5000 });
export async function closeProjectionProcessor() { await cacheRedis.quit(); }
const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
async function all(query: Query) {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let next = query.orderBy("__name__").limit(200); if (cursor) next = next.startAfter(cursor);
    const page = await next.get(); docs.push(...page.docs);
    console.info(JSON.stringify({ event: "projection.source_scan", documentsFetched: page.size, queryCalls: 1 }));
    if (page.size < 200) return docs;
    cursor = page.docs.at(-1);
  }
}
async function propertySearch(propertyId: string, requested: ProjectionComponent[]) {
  const property = await db.collection("properties").doc(propertyId).get();
  if (!property.exists) return {};
  const data = property.data()!, update: Record<string, unknown> = {};
  if (Number(data.searchProjectionVersion ?? 0) < 3) requested = [...components];
  if (requested.includes("identity")) Object.assign(update, {
    normalizedName: normalize(data.name), normalizedCity: normalize(data.address?.city ?? data.city), normalizedState: normalize(data.address?.state ?? data.state),
    freeCancellation: false, // Eligibility is rate- and arrival-specific; calculated by search.
    searchTokens: [...new Set([data.name, data.address?.city, data.address?.state, data.propertyType].flatMap(value => normalize(value).split(/\s+/)).filter(Boolean))].slice(0, 40),
  });
  if (requested.includes("pricing")) {
    const rates = await all(db.collection("ratePlans").where("propertyId", "==", propertyId).where("status", "==", "active"));
    const prices = rates.map(rate => startingPrice(rate.data())).filter((price): price is number => price !== null && Number.isSafeInteger(price) && price >= 0);
    update.minimumPricePaise = prices.length ? Math.min(...prices) : null;
  }
  if (requested.includes("amenities")) {
    const rooms = await all(db.collection("roomTypes").where("propertyId", "==", propertyId).where("status", "==", "active"));
    const ids = [...new Set([...(Array.isArray(data.amenityIds) ? data.amenityIds : []), ...rooms.flatMap(room => Array.isArray(room.data().amenityIds) ? room.data().amenityIds : [])])].filter((id): id is string => typeof id === "string" && !!id && !id.includes("/"));
    const codeById = new Map<string, string>();
    for (let offset = 0; offset < ids.length; offset += 200) {
      const docs = await db.getAll(...ids.slice(offset, offset + 200).map(id => db.collection("amenities").doc(id)));
      for (const doc of docs) if (doc.get("status") !== "archived" && typeof doc.get("code") === "string") codeById.set(doc.id, doc.get("code"));
    }
    update.amenityCodes = projectAmenityCodes(ids, codeById);
    update.propertyAmenityCodes = projectAmenityCodes(Array.isArray(data.amenityIds) ? data.amenityIds : [], codeById);
  }
  if (requested.includes("cover")) {
    const cover = typeof data.coverMediaId === "string" && data.coverMediaId ? await db.collection("mediaAssets").doc(data.coverMediaId).get() : null;
    const asset = cover?.data();
    const published = asset?.propertyId === propertyId && (asset?.moderationStatus ?? asset?.status) === "approved" && asset?.publication?.status === "published";
    const variants = published ? Object.values(asset?.publication?.variants ?? {}).flatMap(value => {
      const variant = value as { objectKey?: string; width?: number; height?: number };
      if (!variant?.objectKey || !variant.width || !variant.height) return [];
      try { return [{ ...variant, url: publicObjectUrl(variant.objectKey) }]; } catch { return []; }
    }).sort((a, b) => a.width! - b.width!) : [];
    const largest = variants.at(-1);
    update.publicCover = largest ? { imageUrl: largest.url, srcSet: variants.map(value => `${value.url} ${value.width}w`).join(", "), width: largest.width, height: largest.height, checksum: asset!.publication.sourceChecksum ?? "" } : null;
  }
  return { ...update, searchProjectionVersion: 3, searchProjectionUpdatedAt: FieldValue.serverTimestamp() };
}
export async function processProjection(job: Job<ProjectionJob>) {
  const data = projectionSchema.parse(job.data), { kind, entityId } = data;
  await executeOutbox(db, job, "projectionOutbox", "projectionJobs", () => withFencedLease(db, `projection:${entityId}:${kind === "review_summary" ? "reviews" : kind}`, async assert => {
    if (kind === "property_search") {
      const ref = db.collection("projectionState").doc(projectionStateId(entityId, kind));
      const state = (await ref.get()).data() ?? {}, requested = state.requested ?? {};
      const dirty = Object.keys(requested).filter(key => requested[key] !== state.applied?.[key]) as ProjectionComponent[];
      const selected = Object.keys(requested).length ? dirty : data.components ?? [...components];
      if (selected.length) {
        const update = await propertySearch(entityId, selected);
        await db.runTransaction(async tx => {
          await assert(tx);
          const current = (await tx.get(ref)).data() ?? {};
          if (JSON.stringify(current.requested ?? {}) !== JSON.stringify(requested)) throw new LeaseBusy();
          if (Object.keys(update).length) tx.set(db.collection("properties").doc(entityId), update, { merge: true });
          tx.set(ref, { applied: requested, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
      }
    } else if (kind === "review_summary") await updateReviews(entityId, data.reviewId, assert);
    else if (kind === "daily_metrics" || kind === "dashboard_summary") {
      const date = new Date().toISOString().slice(0, 10);
      const [bookings, reviews] = await Promise.all([
        db.collection("bookings").where("propertyId", "==", entityId).where("checkIn", ">=", date).count().get(),
        db.collection("propertyReviews").where("propertyId", "==", entityId).where("status", "==", "approved").count().get(),
      ]);
      await db.runTransaction(async tx => { await assert(tx); tx.set(db.collection("propertyDailyMetrics").doc(`${entityId}_${date}`), { propertyId: entityId, date, upcomingReservations: bookings.data().count, reviewCount: reviews.data().count, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
    }
    // Deliberately happens on replays too: a crash after data commit must not lose invalidation.
    const property = await db.collection("properties").doc(entityId).get();
    await invalidate(cacheRedis, entityId, property.get("slug"));
  }));
}
