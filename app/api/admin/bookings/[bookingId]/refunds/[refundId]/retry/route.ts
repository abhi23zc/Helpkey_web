import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { backgroundMode } from "@/lib/background/config";
import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { processRefund } from "@/lib/booking/processing";
async function post(_request: Request, { params }: { params: Promise<{ bookingId: string; refundId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await requireAdmin(user.uid);
  const { bookingId, refundId } = await params;
  const refund = (await adminDb.collection("refunds").doc(refundId).get()).data();
  if (!refund || refund.bookingId !== bookingId) return Response.json({ error: "REFUND_NOT_FOUND" }, { status: 404 });
  if (refund.status === "failed") return Response.json({ error: "Provider rejected this refund. Reconcile with the provider before creating another attempt." }, { status: 409 });
  await adminDb.runTransaction(async tx => {
    const ref = adminDb.collection("refunds").doc(refundId), current = (await tx.get(ref)).data();
    if (!current || current.bookingId !== bookingId || ["failed", "processed"].includes(current.status) || current.leaseExpiresAt?.toMillis() > Date.now()) return;
    tx.update(ref, { status: "retry", "backgroundAttention.refunds": false, "backgroundFailures.refunds": 0, nextAttemptAt: Timestamp.now(), retriedBy: user.uid, retriedAt: FieldValue.serverTimestamp() });
  });
  if (backgroundMode() === "legacy") await processRefund(refundId);
  return Response.json({ ok: true });
}
export const POST = withApiHandler(post, { route: "/api/admin/bookings/[bookingId]/refunds/[refundId]/retry", auth: "strict", requireAuth: true, cache: "private" });
