import { withBackgroundDelivery } from "../lib/background/commit";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";

const argv = process.argv.slice(2);
const args = new Set(argv);
const value = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = args.has("--apply");
if (apply === args.has("--dry-run")) throw new Error("Choose exactly one of --dry-run or --apply");
const limit = Math.min(250, Math.max(1, Number(value("--limit") ?? 100)));
const cursor = value("--cursor");

import { writePublication } from "../lib/background/publication";
import { writeProjection } from "../lib/background/enqueue";

async function main() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase admin configuration is missing");
  const db = withBackgroundDelivery(getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })));
  let query = db.collection("propertyReviews").where("status", "==", "pending").orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const pending = await query.get();
  let publishedPhotos = 0;
  let skipped = 0;

  for (const review of pending.docs) {
    const data = review.data();
    const propertyId = typeof data.propertyId === "string" ? data.propertyId : null;
    if (!propertyId) { skipped++; continue; }
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
        tx.update(photo.ref, { status: "approved", moderatedAt: null, moderatedBy: null });
        writePublication(db, tx, { operation: "publish", assetType: "review_photo", assetId: photo.id, sourceCollection: "reviewPhotos", sourceObjectKey: raw.r2ObjectKey, sourceChecksum: raw.checksum });
        publishedPhotos++;
      }
      writeProjection(db, tx, "review_summary", propertyId, 1, { reviewId: review.id });
    });
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned: pending.size, publishedReviews: pending.size - skipped, queuedPhotos: publishedPhotos, skipped, nextCursor: pending.docs.at(-1)?.id ?? null }, null, 2));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Review migration failed"); process.exitCode = 1; });
