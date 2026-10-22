import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import sharp from "sharp";
import { UnrecoverableError, type Job } from "bullmq";
import { db } from "./firebase";
import type { PublicationJob } from "./queue";
import { publicationSchema } from "../../lib/background/jobs";
import { withFencedLease } from "../shared/lease";
import { executeOutbox } from "../shared/outbox";
import { writeProjection } from "../../lib/background/enqueue";
import { deletePublicObject, getPrivateObject, headPrivateObject, headPublicObject, purgePublicUrls, putPublicObject } from "./r2";

type VariantName = "thumb" | "card" | "large";
type Variant = { objectKey: string; width: number; height: number; byteSize: number; mimeType: "image/webp" };
const variants: Record<VariantName, { width: number; quality: number }> = { thumb: { width: 384, quality: 72 }, card: { width: 960, quality: 78 }, large: { width: 1920, quality: 82 } };
const sourceLimit = 25 * 1024 * 1024, pixelLimit = 40_000_000;
const terminalCodes = new Set(["MEDIA_CHECKSUM_MISMATCH", "MEDIA_UNSUPPORTED_TYPE", "MEDIA_DECODE_FAILED", "MEDIA_DIMENSIONS_INVALID", "MEDIA_NOT_APPROVED"]);
function cleanChecksum(value: unknown) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null; }
function objectPrefix(job: PublicationJob) { return `${job.assetType === "property_image" ? "properties" : "reviews"}/${job.assetId}/${job.sourceChecksum}${job.requestId ? `/${job.requestId}` : ""}`; }
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
function variantKeys(asset: FirebaseFirestore.DocumentData) {
  return Object.values(asset.publication?.variants ?? {}).flatMap(value => typeof (value as { objectKey?: unknown })?.objectKey === "string" ? [(value as { objectKey: string }).objectKey] : []);
}
async function removeKeys(keys: string[]) { await Promise.all(keys.map(deletePublicObject)); if (keys.length) await purgePublicUrls(keys); }
async function unpublish(asset: FirebaseFirestore.DocumentData) { await removeKeys([...new Set([...variantKeys(asset), ...(asset.publication?.cleanupKeys ?? [])])]); }

async function deletePartial(job: PublicationJob) { await Promise.all((Object.keys(variants) as VariantName[]).map((name) => deletePublicObject(`${objectPrefix(job)}/${name}.webp`).catch(() => undefined))); }

export async function processPublication(job: Job<PublicationJob>) {
  await executeOutbox(db, job, "mediaPublicationOutbox", "mediaPublicationJobs", async () => {
    const data = publicationSchema.parse(job.data);
    await withFencedLease(db, `media:${data.sourceCollection}:${data.assetId}`, async assert => {
      const ref = db.collection(data.sourceCollection).doc(data.assetId);
      let previous: FirebaseFirestore.DocumentData | undefined;
      const ready = await db.runTransaction(async tx => {
        await assert(tx);
        const asset = (await tx.get(ref)).data(); previous = asset;
        if (!asset || (asset.publication?.requestId && asset.publication.requestId !== data.requestId)) return false;
        if (asset.r2ObjectKey !== data.sourceObjectKey || cleanChecksum(asset.checksum) !== data.sourceChecksum) throw new UnrecoverableError("MEDIA_CHECKSUM_MISMATCH");
        const approved = (asset.moderationStatus ?? asset.status) === "approved";
        if (approved !== (data.operation === "publish")) return false;
        // Resume acknowledgement after a successful commit without generating images again.
        if (data.requestId && ["published", "private"].includes(asset.publication?.status)) return false;
        tx.set(ref, { publication: { status: data.operation === "publish" ? "processing" : "unpublishing", updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
        return true;
      });
      const cleanup = async () => {
        const asset = (await ref.get()).data();
        if (!asset || asset.publication?.requestId !== data.requestId || !asset.publication?.cleanupKeys?.length) return;
        await removeKeys(asset.publication.cleanupKeys);
        await db.runTransaction(async tx => {
          await assert(tx);
          const current = (await tx.get(ref)).data();
          if (current?.publication?.requestId === data.requestId) tx.update(ref, { "publication.cleanupKeys": [] });
        });
      };
      if (!ready) { if (data.requestId && previous?.publication?.requestId === data.requestId) await cleanup(); return; }
      try {
        const generated = data.operation === "publish" ? await publish(data) : (await unpublish(previous!), {});
        const committed = await db.runTransaction(async tx => {
          await assert(tx);
          const current = (await tx.get(ref)).data();
          if (!current || (data.requestId && current.publication?.requestId !== data.requestId) || ((current.moderationStatus ?? current.status) === "approved") !== (data.operation === "publish")) return false;
          if (current.r2ObjectKey !== data.sourceObjectKey || cleanChecksum(current.checksum) !== data.sourceChecksum) throw new UnrecoverableError("MEDIA_CHECKSUM_MISMATCH");
          tx.update(ref, { publication: { ...(data.requestId ? { requestId: data.requestId } : {}), status: data.operation === "publish" ? "published" : "private", sourceChecksum: data.sourceChecksum, variants: generated, cleanupKeys: data.operation === "publish" ? [...new Set([...variantKeys(previous!), ...(previous!.publication?.cleanupKeys ?? [])])] : [], attempts: job.attemptsMade + 1, lastErrorCode: null, queuedAt: current.publication?.queuedAt ?? null, publishedAt: data.operation === "publish" ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() } });
          if (current.propertyId) writeProjection(db, tx, "property_search", current.propertyId, 1, { components: ["cover"] });
          if (data.assetType === "review_photo" && current.propertyId) writeProjection(db, tx, "cache_invalidation", current.propertyId);
          return true;
        });
        if (!committed && data.operation === "publish" && data.requestId) await deletePartial(data);
        // Old generations are kept until replacement commits. They are never the new generation's keys.
        if (committed && data.operation === "publish" && data.requestId) await cleanup();
      } catch (error) {
        const errorCode = code(error);
        await db.runTransaction(async tx => {
          await assert(tx);
          const current = (await tx.get(ref)).data();
          if (current && (!data.requestId || current.publication?.requestId === data.requestId)) tx.set(ref, { publication: { lastErrorCode: errorCode, updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
        });
        if (terminalCodes.has(errorCode)) throw new UnrecoverableError(errorCode);
        throw error;
      }
    });
  });
}
