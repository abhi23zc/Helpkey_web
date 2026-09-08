import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const argv = process.argv.slice(2);
const args = new Set(argv);
const value = (name: string) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = args.has("--apply");
if (apply === args.has("--dry-run")) throw new Error("Choose exactly one of --dry-run or --apply");
const limit = Math.min(500, Math.max(1, Number(value("--limit") ?? 100)));
const cursor = value("--cursor");

function r2Client(accessKeyId: string | undefined, secretAccessKey: string | undefined) {
  const endpoint = process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("R2 credentials are missing");
  return new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
}

async function main() {
  const legacyBucket = process.env.R2_BUCKET_NAME;
  const privateBucket = process.env.R2_PRIVATE_BUCKET_NAME;
  if (!legacyBucket || !privateBucket) throw new Error("Both R2_BUCKET_NAME and R2_PRIVATE_BUCKET_NAME are required");
  if (legacyBucket === privateBucket) throw new Error("Legacy and new private bucket are the same; no copy is needed");
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase admin configuration is missing");
  const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, "legacy-private-copy"));
  const legacy = r2Client(process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY);
  const destination = r2Client(process.env.R2_PRIVATE_ACCESS_KEY_ID, process.env.R2_PRIVATE_SECRET_ACCESS_KEY);
  let query = db.collection("mediaPublicationJobs").where("status", "in", ["queued", "retryable"]).orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const jobs = await query.get();
  const report = { scanned: 0, copied: 0, alreadyPresent: 0, sourceMissing: 0, failed: 0, nextCursor: jobs.docs.at(-1)?.id ?? null };
  for (const job of jobs.docs) {
    report.scanned++;
    const data = job.data();
    const key = typeof data.sourceObjectKey === "string" ? data.sourceObjectKey : null;
    const checksum = typeof data.sourceChecksum === "string" ? data.sourceChecksum : null;
    if (!key || !checksum) { report.failed++; continue; }
    const destinationHead = await destination.send(new HeadObjectCommand({ Bucket: privateBucket, Key: key })).catch(() => null);
    if (destinationHead?.Metadata?.sha256 === checksum) { report.alreadyPresent++; continue; }
    const sourceHead = await legacy.send(new HeadObjectCommand({ Bucket: legacyBucket, Key: key })).catch(() => null);
    if (!sourceHead) { report.sourceMissing++; continue; }
    if (!apply) { report.copied++; continue; }
    try {
      const source = await legacy.send(new GetObjectCommand({ Bucket: legacyBucket, Key: key }));
      if (!source.Body) throw new Error("empty source body");
      const body = Buffer.from(await source.Body.transformToByteArray());
      await destination.send(new PutObjectCommand({ Bucket: privateBucket, Key: key, Body: body, ContentLength: body.byteLength, ContentType: source.ContentType ?? "application/octet-stream", Metadata: { ...(source.Metadata ?? {}), sha256: checksum } }));
      const verified = await destination.send(new HeadObjectCommand({ Bucket: privateBucket, Key: key }));
      if (verified.ContentLength !== body.byteLength || verified.Metadata?.sha256 !== checksum) throw new Error("destination verification failed");
      report.copied++;
    } catch { report.failed++; }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }, null, 2));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Legacy copy failed"); process.exitCode = 1; });
