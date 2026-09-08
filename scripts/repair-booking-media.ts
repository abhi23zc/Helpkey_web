import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";

const argv = process.argv.slice(2);
const args = new Set(argv);
const value = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = args.has("--apply");
if (apply === args.has("--dry-run")) throw new Error("Choose exactly one of --dry-run or --apply");
const limit = Math.min(500, Math.max(1, Number(value("--limit") ?? 100)));
const cursor = value("--cursor");
async function main() {
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase admin configuration is missing");
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, "booking-media-repair"));
let query = db.collection("bookings").orderBy(FieldPath.documentId()).limit(limit);
if (cursor) query = query.startAfter(cursor);
const snapshot = await query.get();
const report = { scanned: snapshot.size, repaired: 0, alreadyValid: 0, unresolved: 0, nextCursor: snapshot.docs.at(-1)?.id ?? null };
for (const booking of snapshot.docs) {
  const data = booking.data();
  const property = typeof data.propertyId === "string" ? await db.collection("properties").doc(data.propertyId).get() : null;
  const candidateIds = [data.propertyCoverMediaId, property?.data()?.coverMediaId].filter((id, index, all): id is string => typeof id === "string" && Boolean(id) && all.indexOf(id) === index);
  let selected: { id: string; checksum: string } | null = null;
  for (const id of candidateIds) {
    const media = await db.collection("mediaAssets").doc(id).get(); const raw = media.data();
    if (raw && raw.propertyId === data.propertyId && (raw.moderationStatus ?? raw.status) === "approved" && typeof raw.checksum === "string") { selected = { id, checksum: raw.checksum }; break; }
  }
  const hasLegacy = typeof data.propertyCoverImageUrl === "string" || typeof data.coverImageUrl === "string" || typeof data.signedUrl === "string";
  if (selected && data.propertyCoverMediaId === selected.id && data.propertyCoverSourceChecksum === selected.checksum && !hasLegacy) { report.alreadyValid++; continue; }
  if (!selected) { report.unresolved++; continue; }
  if (apply) await booking.ref.update({ propertyCoverMediaId: selected.id, propertyCoverSourceChecksum: selected.checksum, propertyCoverImageUrl: FieldValue.delete(), coverImageUrl: FieldValue.delete(), signedUrl: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  report.repaired++;
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Booking media repair failed");
  process.exitCode = 1;
});
