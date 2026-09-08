import "server-only";

import { createHash, randomUUID } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { adminDb } from "@/lib/firebase/admin";
import { deletePublicObject, getPrivateObject, headPrivateObject, headPublicObject, publicMediaUrl, purgePublicUrls, putPublicObject } from "@/lib/r2";

export type ImageVariantName = "thumb" | "card" | "large";
export type ImageVariant = { objectKey: string; width: number; height: number; byteSize: number; mimeType: "image/webp" };
export type PublicationStatus = "private" | "queued" | "processing" | "published" | "unpublishing" | "failed";
export type PublicImageDto = { id: string; imageUrl: string; imageSrcSet: string; width: number; height: number; altText: string };

const variantOptions: Record<ImageVariantName, { width: number; quality: number }> = {
  thumb: { width: 384, quality: 72 }, card: { width: 960, quality: 78 }, large: { width: 1920, quality: 82 },
};
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_ATTEMPTS = 6;
const RETRY_MINUTES = [1, 5, 15, 60, 360];
type AssetType = "property_image" | "review_photo";
type SourceCollection = "mediaAssets" | "reviewPhotos";
type Operation = "publish" | "unpublish";

export function publicationJobId(operation: Operation, assetId: string, checksum: string) {
  return createHash("sha256").update(`${operation}:${assetId}:${checksum}`).digest("hex");
}

export function enqueuePublicationInTransaction(tx: FirebaseFirestore.Transaction, input: { operation: Operation; assetType: AssetType; assetId: string; sourceCollection: SourceCollection; sourceObjectKey: string; sourceChecksum: string }) {
  const now = FieldValue.serverTimestamp();
  const jobId = publicationJobId(input.operation, input.assetId, input.sourceChecksum);
  tx.set(adminDb.collection("mediaPublicationJobs").doc(jobId), { ...input, status: "queued", attempts: 0, notBefore: Timestamp.now(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, createdAt: now, updatedAt: now }, { merge: true });
  tx.set(adminDb.collection(input.sourceCollection).doc(input.assetId), { publication: { status: input.operation === "publish" ? "queued" : "unpublishing", sourceChecksum: input.sourceChecksum, ...(input.operation === "publish" ? { variants: {} } : {}), attempts: 0, lastErrorCode: null, queuedAt: now, publishedAt: null, updatedAt: now } }, { merge: true });
  return jobId;
}

function cleanChecksum(value: unknown) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null; }
function prefix(assetType: AssetType, id: string, checksum: string) { return `${assetType === "property_image" ? "properties" : "reviews"}/${id}/${checksum}`; }

export function publishedImageDto(id: string, data: FirebaseFirestore.DocumentData, altText = ""): PublicImageDto | null {
  if ((data.moderationStatus ?? data.status) !== "approved" || data.publication?.status !== "published") return null;
  const checksum = cleanChecksum(data.publication?.sourceChecksum);
  const assetPrefix = data.kind === "property_image" ? "properties" : "reviews";
  const items = (Object.keys(variantOptions) as ImageVariantName[]).flatMap((name) => {
    const item = data.publication?.variants?.[name] as ImageVariant | undefined;
    if (!checksum || !item || item.mimeType !== "image/webp" || !item.objectKey?.startsWith(`${assetPrefix}/${id}/${checksum}/`)) return [];
    try { return [{ name, item, url: publicMediaUrl(item.objectKey) }]; } catch { return []; }
  });
  const card = items.find((item) => item.name === "card") ?? items.at(-1);
  return card ? { id, imageUrl: card.url, imageSrcSet: items.map(({ item, url }) => `${url} ${item.width}w`).join(", "), width: card.item.width, height: card.item.height, altText } : null;
}

async function publish(job: FirebaseFirestore.DocumentData) {
  const source = await getPrivateObject(job.sourceObjectKey).catch(() => { throw new Error("MEDIA_SOURCE_MISSING"); });
  if (!source.Body || !source.ContentLength || source.ContentLength > MAX_SOURCE_BYTES) throw new Error("MEDIA_DIMENSIONS_INVALID");
  const input = Buffer.from(await source.Body.transformToByteArray());
  const checksum = createHash("sha256").update(input).digest("hex");
  if (checksum !== job.sourceChecksum) throw new Error("MEDIA_CHECKSUM_MISMATCH");
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try { metadata = await sharp(input, { animated: false, limitInputPixels: MAX_PIXELS, failOn: "warning" }).metadata(); } catch { throw new Error("MEDIA_DECODE_FAILED"); }
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error("MEDIA_DIMENSIONS_INVALID");
  if (!new Set(["jpeg", "png", "webp", "avif", "tiff", "heif"]).has(metadata.format ?? "")) throw new Error("MEDIA_UNSUPPORTED_TYPE");
  const detectedType: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", tiff: "image/tiff", heif: "image/heif" };
  if (source.ContentType && detectedType[metadata.format ?? ""] !== source.ContentType.toLowerCase()) throw new Error("MEDIA_UNSUPPORTED_TYPE");
  const output: Partial<Record<ImageVariantName, ImageVariant>> = {};
  for (const name of Object.keys(variantOptions) as ImageVariantName[]) {
    const options = variantOptions[name]; const objectKey = `${prefix(job.assetType, job.assetId, checksum)}/${name}.webp`;
    const rendered = await sharp(input, { animated: false, limitInputPixels: MAX_PIXELS, failOn: "warning" }).rotate().resize({ width: options.width, withoutEnlargement: true }).webp({ quality: options.quality }).toBuffer({ resolveWithObject: true });
    const existing = await headPublicObject(objectKey).catch(() => null);
    if (existing?.Metadata?.sourcechecksum !== checksum || existing.Metadata?.mediaid !== job.assetId || existing.Metadata?.variant !== name) await putPublicObject(objectKey, rendered.data, { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable", metadata: { sourcechecksum: checksum, mediaid: job.assetId, variant: name } });
    const verified = await headPublicObject(objectKey);
    if (verified.ContentLength !== rendered.data.byteLength || verified.ContentType !== "image/webp" || verified.Metadata?.sourcechecksum !== checksum || verified.Metadata?.mediaid !== job.assetId || verified.Metadata?.variant !== name) throw new Error("MEDIA_PUBLICATION_FAILED");
    output[name] = { objectKey, width: rendered.info.width, height: rendered.info.height, byteSize: rendered.data.byteLength, mimeType: "image/webp" };
  }
  if ((await headPrivateObject(job.sourceObjectKey)).Metadata?.sha256 !== checksum) throw new Error("MEDIA_CHECKSUM_MISMATCH");
  return output;
}

async function unpublish(asset: FirebaseFirestore.DocumentData) {
  const keys = Object.values(asset.publication?.variants ?? {}).flatMap((item) => typeof (item as { objectKey?: unknown })?.objectKey === "string" ? [(item as { objectKey: string }).objectKey] : []);
  await Promise.all(keys.map(deletePublicObject)); await purgePublicUrls(keys);
}

async function deletePartialVariants(job: FirebaseFirestore.DocumentData) {
  const checksum = cleanChecksum(job.sourceChecksum);
  if (!checksum) return;
  await Promise.all((Object.keys(variantOptions) as ImageVariantName[]).map((name) => deletePublicObject(`${prefix(job.assetType, job.assetId, checksum)}/${name}.webp`).catch(() => {})));
}

async function claimJobs(limit: number, workerId: string) {
  const candidates = await adminDb.collection("mediaPublicationJobs").where("status", "in", ["queued", "retryable", "processing"]).limit(limit * 3).get();
  const claimed: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [];
  for (const candidate of candidates.docs) {
    if (claimed.length >= limit) break;
    await adminDb.runTransaction(async (tx) => {
      const current = await tx.get(candidate.ref); const data = current.data(); const now = Timestamp.now();
      if (!data || data.notBefore?.toMillis?.() > now.toMillis() || (data.status === "processing" && data.leaseExpiresAt?.toMillis?.() > now.toMillis())) return;
      tx.update(current.ref, { status: "processing", leaseOwner: workerId, leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + 4 * 60_000), attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      claimed.push({ id: current.id, data: { ...data, attempts: Number(data.attempts ?? 0) + 1 } });
    });
  }
  return claimed;
}

function safeCode(error: unknown) {
  const code = error instanceof Error ? error.message : "MEDIA_PUBLICATION_FAILED";
  return ["MEDIA_SOURCE_MISSING", "MEDIA_CHECKSUM_MISMATCH", "MEDIA_UNSUPPORTED_TYPE", "MEDIA_DECODE_FAILED", "MEDIA_DIMENSIONS_INVALID", "MEDIA_NOT_APPROVED", "MEDIA_STALE_JOB", "CACHE_PURGE_FAILED"].includes(code) ? code : "MEDIA_PUBLICATION_FAILED";
}
function terminal(code: string) { return ["MEDIA_CHECKSUM_MISMATCH", "MEDIA_UNSUPPORTED_TYPE", "MEDIA_DECODE_FAILED", "MEDIA_DIMENSIONS_INVALID", "MEDIA_NOT_APPROVED"].includes(code); }

export async function processPublicationJobs(limit = 10) {
  if (process.env.MEDIA_PUBLICATION_WORKER_ENABLED !== "true") return { claimed: 0, succeeded: 0, retried: 0, dead: 0 };
  const jobs = await claimJobs(Math.min(limit, 10), randomUUID()); const counts = { claimed: jobs.length, succeeded: 0, retried: 0, dead: 0 };
  for (const job of jobs) {
    const jobRef = adminDb.collection("mediaPublicationJobs").doc(job.id); const assetRef = adminDb.collection(job.data.sourceCollection as SourceCollection).doc(job.data.assetId);
    try {
      const asset = await assetRef.get(); const data = asset.data();
      if (!data || data.r2ObjectKey !== job.data.sourceObjectKey || cleanChecksum(data.checksum) !== job.data.sourceChecksum) throw new Error("MEDIA_CHECKSUM_MISMATCH");
      if (job.data.operation === "publish" && (data.moderationStatus ?? data.status) !== "approved") throw new Error("MEDIA_STALE_JOB");
      if (job.data.operation === "unpublish" && (data.moderationStatus ?? data.status) === "approved") throw new Error("MEDIA_STALE_JOB");
      await assetRef.set({ publication: { status: job.data.operation === "publish" ? "processing" : "unpublishing", attempts: job.data.attempts, updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
      const generated = job.data.operation === "publish" ? await publish(job.data) : (await unpublish(data), {});
      await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(assetRef); const current = fresh.data();
        if (!current || current.r2ObjectKey !== job.data.sourceObjectKey || cleanChecksum(current.checksum) !== job.data.sourceChecksum) throw new Error("MEDIA_CHECKSUM_MISMATCH");
        if (job.data.operation === "publish" && ((current.moderationStatus ?? current.status) !== "approved" || current.publication?.status !== "processing")) throw new Error("MEDIA_STALE_JOB");
        if (job.data.operation === "unpublish" && ((current.moderationStatus ?? current.status) === "approved" || current.publication?.status !== "unpublishing")) throw new Error("MEDIA_STALE_JOB");
        tx.update(assetRef, { publication: job.data.operation === "publish" ? { status: "published", sourceChecksum: job.data.sourceChecksum, variants: generated, attempts: job.data.attempts, lastErrorCode: null, queuedAt: current.publication?.queuedAt ?? null, publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } : { status: "private", sourceChecksum: job.data.sourceChecksum, variants: {}, attempts: job.data.attempts, lastErrorCode: null, queuedAt: current.publication?.queuedAt ?? null, publishedAt: null, updatedAt: FieldValue.serverTimestamp() } });
        tx.update(jobRef, { status: "succeeded", leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, updatedAt: FieldValue.serverTimestamp() });
      }); counts.succeeded++;
    } catch (error) {
      const code = safeCode(error); const dead = terminal(code) || job.data.attempts >= MAX_ATTEMPTS;
      if (code === "MEDIA_STALE_JOB") {
        if (job.data.operation === "publish") await deletePartialVariants(job.data);
        await jobRef.update({ status: "succeeded", leaseOwner: null, leaseExpiresAt: null, lastErrorCode: code, updatedAt: FieldValue.serverTimestamp() });
        counts.succeeded++;
        continue;
      }
      if (dead && job.data.operation === "publish") await deletePartialVariants(job.data);
      const delay = RETRY_MINUTES[Math.min(job.data.attempts - 1, RETRY_MINUTES.length - 1)] * 60_000 + Math.floor(Math.random() * 30_000);
      await jobRef.update({ status: dead ? "dead" : "retryable", notBefore: Timestamp.fromMillis(Date.now() + delay), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: code, updatedAt: FieldValue.serverTimestamp() });
      await assetRef.set({ publication: { status: job.data.operation === "publish" ? "failed" : "unpublishing", attempts: job.data.attempts, lastErrorCode: code, updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
      if (dead) counts.dead++; else counts.retried++;
    }
  }
  return counts;
}
