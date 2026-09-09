import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import sharp from "sharp";
import { UnrecoverableError, type Job } from "bullmq";
import { maxAttempts, retryDelays } from "./config";
import { db } from "./firebase";
import type { PublicationJob } from "./queue";
import { deletePublicObject, getPrivateObject, headPrivateObject, headPublicObject, purgePublicUrls, putPublicObject } from "./r2";

type VariantName = "thumb" | "card" | "large";
type Variant = { objectKey: string; width: number; height: number; byteSize: number; mimeType: "image/webp" };
const variants: Record<VariantName, { width: number; quality: number }> = { thumb: { width: 384, quality: 72 }, card: { width: 960, quality: 78 }, large: { width: 1920, quality: 82 } };
const sourceLimit = 25 * 1024 * 1024, pixelLimit = 40_000_000;
const terminalCodes = new Set(["MEDIA_CHECKSUM_MISMATCH", "MEDIA_UNSUPPORTED_TYPE", "MEDIA_DECODE_FAILED", "MEDIA_DIMENSIONS_INVALID", "MEDIA_NOT_APPROVED"]);
function cleanChecksum(value: unknown) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null; }
function objectPrefix(job: PublicationJob) { return `${job.assetType === "property_image" ? "properties" : "reviews"}/${job.assetId}/${job.sourceChecksum}`; }
function code(error: unknown) { const message = error instanceof Error ? error.message : "MEDIA_PUBLICATION_FAILED"; return ["MEDIA_SOURCE_MISSING", "MEDIA_CHECKSUM_MISMATCH", "MEDIA_UNSUPPORTED_TYPE", "MEDIA_DECODE_FAILED", "MEDIA_DIMENSIONS_INVALID", "MEDIA_NOT_APPROVED", "MEDIA_STALE_JOB", "CACHE_PURGE_FAILED"].includes(message) ? message : "MEDIA_PUBLICATION_FAILED"; }

async function publish(job: PublicationJob) {
  const source = await getPrivateObject(job.sourceObjectKey).catch(() => { throw new Error("MEDIA_SOURCE_MISSING"); });
  if (!source.Body || !source.ContentLength || source.ContentLength > sourceLimit) throw new Error("MEDIA_DIMENSIONS_INVALID");
  const input = Buffer.from(await source.Body.transformToByteArray());
  if (createHash("sha256").update(input).digest("hex") !== job.sourceChecksum) throw new Error("MEDIA_CHECKSUM_MISMATCH");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>; try { meta = await sharp(input, { animated: false, limitInputPixels: pixelLimit, failOn: "warning" }).metadata(); } catch { throw new Error("MEDIA_DECODE_FAILED"); }
  if (!meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new Error("MEDIA_DIMENSIONS_INVALID");
  const contentTypes: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", tiff: "image/tiff", heif: "image/heif" };
  if (!meta.format || !contentTypes[meta.format] || (source.ContentType && contentTypes[meta.format] !== source.ContentType.toLowerCase())) throw new Error("MEDIA_UNSUPPORTED_TYPE");
  const output: Partial<Record<VariantName, Variant>> = {};
  for (const name of Object.keys(variants) as VariantName[]) {
    const options = variants[name], objectKey = `${objectPrefix(job)}/${name}.webp`;
    const rendered = await sharp(input, { animated: false, limitInputPixels: pixelLimit, failOn: "warning" }).rotate().resize({ width: options.width, withoutEnlargement: true }).webp({ quality: options.quality }).toBuffer({ resolveWithObject: true });
    const existing = await headPublicObject(objectKey).catch(() => null);
    if (existing?.Metadata?.sourcechecksum !== job.sourceChecksum || existing.Metadata?.mediaid !== job.assetId || existing.Metadata?.variant !== name) await putPublicObject(objectKey, rendered.data, { sourcechecksum: job.sourceChecksum, mediaid: job.assetId, variant: name });
    const verified = await headPublicObject(objectKey);
    if (verified.ContentLength !== rendered.data.byteLength || verified.ContentType !== "image/webp" || verified.Metadata?.sourcechecksum !== job.sourceChecksum || verified.Metadata?.mediaid !== job.assetId || verified.Metadata?.variant !== name) throw new Error("MEDIA_PUBLICATION_FAILED");
    output[name] = { objectKey, width: rendered.info.width, height: rendered.info.height, byteSize: rendered.data.byteLength, mimeType: "image/webp" };
  }
  if ((await headPrivateObject(job.sourceObjectKey)).Metadata?.sha256 !== job.sourceChecksum) throw new Error("MEDIA_CHECKSUM_MISMATCH");
  return output;
}
async function unpublish(asset: FirebaseFirestore.DocumentData) { const keys = Object.values(asset.publication?.variants ?? {}).flatMap((v) => typeof (v as { objectKey?: unknown })?.objectKey === "string" ? [(v as { objectKey: string }).objectKey] : []); await Promise.all(keys.map(deletePublicObject)); await purgePublicUrls(keys); }
async function deletePartial(job: PublicationJob) { await Promise.all((Object.keys(variants) as VariantName[]).map((name) => deletePublicObject(`${objectPrefix(job)}/${name}.webp`).catch(() => undefined))); }

export async function processPublication(job: Job<PublicationJob>) {
  const data = job.data, attempt = job.attemptsMade + 1, mirror = db.collection("mediaPublicationJobs").doc(job.id!), assetRef = db.collection(data.sourceCollection).doc(data.assetId);
  try {
    const asset = await assetRef.get(), assetData = asset.data();
    if (!assetData || assetData.r2ObjectKey !== data.sourceObjectKey || cleanChecksum(assetData.checksum) !== data.sourceChecksum) throw new Error("MEDIA_CHECKSUM_MISMATCH");
    if (data.operation === "publish" && (assetData.moderationStatus ?? assetData.status) !== "approved") throw new Error("MEDIA_STALE_JOB");
    if (data.operation === "unpublish" && (assetData.moderationStatus ?? assetData.status) === "approved") throw new Error("MEDIA_STALE_JOB");
    await Promise.all([mirror.set({ status: "processing", attempts: attempt, lastErrorCode: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true }), assetRef.set({ publication: { status: data.operation === "publish" ? "processing" : "unpublishing", attempts: attempt, updatedAt: FieldValue.serverTimestamp() } }, { merge: true })]);
    const generated = data.operation === "publish" ? await publish(data) : (await unpublish(assetData), {});
    await db.runTransaction(async (tx) => { const fresh = await tx.get(assetRef), current = fresh.data(); if (!current || current.r2ObjectKey !== data.sourceObjectKey || cleanChecksum(current.checksum) !== data.sourceChecksum) throw new Error("MEDIA_CHECKSUM_MISMATCH"); if (data.operation === "publish" && ((current.moderationStatus ?? current.status) !== "approved" || current.publication?.status !== "processing")) throw new Error("MEDIA_STALE_JOB"); if (data.operation === "unpublish" && ((current.moderationStatus ?? current.status) === "approved" || current.publication?.status !== "unpublishing")) throw new Error("MEDIA_STALE_JOB"); tx.update(assetRef, { publication: data.operation === "publish" ? { status: "published", sourceChecksum: data.sourceChecksum, variants: generated, attempts: attempt, lastErrorCode: null, queuedAt: current.publication?.queuedAt ?? null, publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } : { status: "private", sourceChecksum: data.sourceChecksum, variants: {}, attempts: attempt, lastErrorCode: null, queuedAt: current.publication?.queuedAt ?? null, publishedAt: null, updatedAt: FieldValue.serverTimestamp() } }); tx.set(mirror, { status: "succeeded", attempts: attempt, lastErrorCode: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
  } catch (error) {
    const errorCode = code(error);
    if (errorCode === "MEDIA_STALE_JOB") { if (data.operation === "publish") await deletePartial(data); await mirror.set({ status: "succeeded", attempts: attempt, lastErrorCode: errorCode, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return; }
    const dead = terminalCodes.has(errorCode) || attempt >= maxAttempts;
    if (dead && data.operation === "publish") await deletePartial(data);
    await Promise.all([mirror.set({ status: dead ? "dead" : "retryable", attempts: attempt, lastErrorCode: errorCode, notBefore: dead ? null : new Date(Date.now() + retryDelays[Math.min(job.attemptsMade, retryDelays.length - 1)]), updatedAt: FieldValue.serverTimestamp() }, { merge: true }), assetRef.set({ publication: { status: data.operation === "publish" ? "failed" : "unpublishing", attempts: attempt, lastErrorCode: errorCode, updatedAt: FieldValue.serverTimestamp() } }, { merge: true })]);
    if (dead) throw new UnrecoverableError(errorCode);
    throw new Error(errorCode);
  }
}
