import { createHash } from "crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

type Kind = "property" | "review" | "all";
const argv = process.argv.slice(2);
const args = new Set(argv);
const value = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = args.has("--apply");
if (apply === args.has("--dry-run")) throw new Error("Choose exactly one of --dry-run or --apply");
const kind = (value("--asset-type") ?? "all") as Kind;
if (!(["property", "review", "all"] as const).includes(kind)) throw new Error("--asset-type must be property, review, or all");
const limit = Math.min(500, Math.max(1, Number(value("--limit") ?? 100)));
const cursor = value("--cursor");
async function main() {
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase admin configuration is missing");
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

const targets = [
  ...(kind !== "review" ? [{ collection: "mediaAssets", assetType: "property_image" as const, statusField: "moderationStatus" }] : []),
  ...(kind !== "property" ? [{ collection: "reviewPhotos", assetType: "review_photo" as const, statusField: "status" }] : []),
];
const report = { scanned: 0, queued: 0, alreadyPublished: 0, invalid: 0, nextCursor: null as string | null };
for (const target of targets) {
  let query = db.collection(target.collection).where(target.statusField, "==", "approved").orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  for (const doc of snapshot.docs) {
    report.scanned++;
    report.nextCursor = doc.id;
    const data = doc.data();
    const checksum = data.checksum;
    if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/i.test(checksum) || typeof data.r2ObjectKey !== "string" || (target.assetType === "property_image" && data.kind !== "property_image")) { report.invalid++; continue; }
    if (data.publication?.status === "published" && data.publication?.sourceChecksum === checksum && ["thumb", "card", "large"].every((name) => typeof data.publication?.variants?.[name]?.objectKey === "string")) { report.alreadyPublished++; continue; }
    const id = createHash("sha256").update(`publish:${doc.id}:${checksum}`).digest("hex");
    if (apply) {
      const batch = db.batch();
      const now = FieldValue.serverTimestamp();
      batch.set(db.collection("mediaPublicationJobs").doc(id), { operation: "publish", assetType: target.assetType, assetId: doc.id, sourceCollection: target.collection, sourceObjectKey: data.r2ObjectKey, sourceChecksum: checksum, status: "queued", attempts: 0, notBefore: Timestamp.now(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, createdAt: now, updatedAt: now }, { merge: true });
      batch.set(doc.ref, { publication: { status: "queued", sourceChecksum: checksum, variants: {}, attempts: 0, lastErrorCode: null, queuedAt: now, publishedAt: null, updatedAt: now } }, { merge: true });
      await batch.commit();
    }
    report.queued++;
  }
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Media backfill failed");
  process.exitCode = 1;
});
