import { createHash } from "crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const argv = process.argv.slice(2);
const args = new Set(argv);
const value = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = args.has("--apply");
if (apply === args.has("--dry-run")) throw new Error("Choose exactly one of --dry-run or --apply");
const limit = Math.min(250, Math.max(1, Number(value("--limit") ?? 100)));
const cursor = value("--cursor");

function publicationJobId(assetId: string, checksum: string) {
  return createHash("sha256").update(`publish:${assetId}:${checksum}`).digest("hex");
}

async function main() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase admin configuration is missing");
  const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));
  let query = db.collection("propertyReviews").where("status", "==", "pending").orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const pending = await query.get();
  const propertyIds = new Set<string>();
  let publishedPhotos = 0;
  let skipped = 0;

  for (const review of pending.docs) {
    const data = review.data();
    const propertyId = typeof data.propertyId === "string" ? data.propertyId : null;
    if (!propertyId) { skipped++; continue; }
    propertyIds.add(propertyId);
    const photos = await db.collection("reviewPhotos").where("reviewId", "==", review.id).limit(5).get();
    if (!apply) { publishedPhotos += photos.docs.filter((photo) => photo.data().status === "pending").length; continue; }
    await db.runTransaction(async (tx) => {
      const current = await tx.get(review.ref);
      if (!current.exists || current.data()?.status !== "pending") return;
      const now = FieldValue.serverTimestamp();
      tx.update(review.ref, { status: "approved", photoModerationPending: false, moderationReason: null, moderatedAt: null, moderatedBy: null, updatedAt: now, editHistory: FieldValue.arrayUnion({ action: "published_by_direct_review_migration", at: new Date() }) });
      for (const photo of photos.docs) {
        const raw = photo.data();
        if (raw.status !== "pending" || typeof raw.r2ObjectKey !== "string" || typeof raw.checksum !== "string") continue;
        const id = publicationJobId(photo.id, raw.checksum);
        const publication = { status: "queued", sourceChecksum: raw.checksum, variants: {}, attempts: 0, lastErrorCode: null, queuedAt: now, publishedAt: null, updatedAt: now };
        tx.update(photo.ref, { status: "approved", publication, moderatedAt: null, moderatedBy: null });
        tx.set(db.collection("mediaPublicationJobs").doc(id), { operation: "publish", assetType: "review_photo", assetId: photo.id, sourceCollection: "reviewPhotos", sourceObjectKey: raw.r2ObjectKey, sourceChecksum: raw.checksum, status: "queued", attempts: 0, notBefore: Timestamp.now(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, createdAt: now, updatedAt: now }, { merge: true });
        tx.set(db.collection("mediaPublicationOutbox").doc(id), { operation: "publish", assetType: "review_photo", assetId: photo.id, sourceCollection: "reviewPhotos", sourceObjectKey: raw.r2ObjectKey, sourceChecksum: raw.checksum, jobId: id, bullJobId: `publish:${photo.id}:${raw.checksum}`, status: "pending", dispatchedAt: null, dispatchAttempts: 0, lastDispatchError: null, createdAt: now, updatedAt: now }, { merge: true });
        publishedPhotos++;
      }
    });
  }

  if (apply) {
    for (const propertyId of propertyIds) {
      const reviews = await db.collection("propertyReviews").where("propertyId", "==", propertyId).where("status", "==", "approved").get();
      const buckets = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      let ratingSum = 0;
      for (const review of reviews.docs) {
        const rating = review.data().rating;
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
        ratingSum += rating;
        buckets[String(rating) as keyof typeof buckets]++;
      }
      const count = Object.values(buckets).reduce((total, item) => total + item, 0);
      await db.collection("properties").doc(propertyId).set({ reviewSummary: { count, ratingSum, average: count ? Math.round((ratingSum / count) * 10) / 10 : 0, buckets }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned: pending.size, publishedReviews: pending.size - skipped, queuedPhotos: publishedPhotos, skipped, nextCursor: pending.docs.at(-1)?.id ?? null }, null, 2));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Review migration failed"); process.exitCode = 1; });
