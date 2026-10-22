import { withBackgroundDelivery } from "../lib/background/commit";
import { writePublication } from "../lib/background/publication";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

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
const db = withBackgroundDelivery(getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })));

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
    if (apply) {
      await db.runTransaction(async tx => {
        const current = (await tx.get(doc.ref)).data();
        if (!current || current[target.statusField] !== "approved" || current.checksum !== checksum || current.r2ObjectKey !== data.r2ObjectKey) return;
        if (current.publication?.requestId && ["queued", "processing", "published"].includes(current.publication.status) && current.publication.sourceChecksum === checksum) return;
        writePublication(db, tx, { operation: "publish", assetType: target.assetType, assetId: doc.id, sourceCollection: target.assetType === "property_image" ? "mediaAssets" : "reviewPhotos", sourceObjectKey: data.r2ObjectKey, sourceChecksum: checksum });
      });
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
