import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { deletePrivateObject } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("x-cron-secret") !== expected) return Response.json({ error: "CRON_UNAUTHORIZED" }, { status: 401 });
  const expired = await adminDb.collection("pendingUploads").where("expiresAt", "<=", Date.now()).limit(100).get();
  let objectsDeleted = 0;
  let cleanupFailures = 0;
  for (const item of expired.docs) {
    const key = item.data().objectKey;
    try {
      if (typeof key === "string") { await deletePrivateObject(key); objectsDeleted++; }
      await item.ref.delete();
    } catch { cleanupFailures++; }
  }
  const leases = await adminDb.collection("mediaPublicationJobs").where("status", "==", "processing").where("leaseExpiresAt", "<=", Timestamp.now()).limit(100).get();
  const batch = adminDb.batch();
  for (const job of leases.docs) batch.update(job.ref, { status: "retryable", leaseOwner: null, leaseExpiresAt: null, notBefore: Timestamp.now() });
  if (!leases.empty) await batch.commit();
  return Response.json({ pendingUploadsDeleted: expired.size - cleanupFailures, objectsDeleted, cleanupFailures, expiredLeasesRecovered: leases.size });
}
