import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin, recordReviewEvent } from "@/lib/admin/data";
import { notifyPropertyDecision } from "@/lib/notifications/service";
const schema = z.object({ decision: z.enum(["approve", "request_changes", "reject"]), reason: z.string().max(1000).optional() }).strict();
export async function POST(request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/review">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const { propertyId } = await params;
    const input = schema.parse(await request.json());
    if (input.decision !== "approve" && !input.reason?.trim()) throw new Error("REASON_REQUIRED");
    const ref = adminDb.collection("properties").doc(propertyId);

    // Approval requires already-approved assets. Query them BEFORE the
    // transaction (collection queries are not transactional), then re-assert
    // the pending guard inside the transaction to avoid races.
    let approvedMediaCount = 0;
    let approvedDocKinds = new Set<string>();
    if (input.decision === "approve") {
      const [media, docs] = await Promise.all([
        adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get(),
        adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId).get(),
      ]);
      approvedMediaCount = media.docs.filter((doc) => doc.data().moderationStatus === "approved").length;
      approvedDocKinds = new Set(docs.docs.filter((doc) => doc.data().status === "approved").map((d) => d.data().documentType));
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const data = current.data();
      if (!current.exists || data?.approvalStatus !== "pending") throw new Error("PROPERTY_NOT_PENDING");

      if (input.decision === "approve") {
        if (approvedMediaCount < 6 || ["pan", "government_id_front", "government_id_back"].some((kind) => !approvedDocKinds.has(kind))) {
          throw new Error("REQUIRED_ASSETS_NOT_APPROVED");
        }
      }

      const fromApprovalStatus = String(data?.approvalStatus ?? "pending");
      const fromStatus = String(data?.status ?? "pending_review");
      const now = FieldValue.serverTimestamp();

      const update = input.decision === "approve"
        ? { status: "active", approvalStatus: "approved", approvedAt: now, rejectionReason: null, isBookable: true }
        : { status: "draft", approvalStatus: input.decision === "reject" ? "rejected" : "changes_requested", rejectionReason: input.reason, isBookable: false };

      tx.update(ref, { ...update, updatedAt: now, updatedBy: user.uid });

      recordReviewEvent(tx, {
        propertyId,
        actorId: user.uid,
        actorRole: "admin",
        action: input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "changes_requested",
        fromApprovalStatus,
        toApprovalStatus: update.approvalStatus,
        fromStatus,
        toStatus: update.status,
        reason: input.decision === "approve" ? null : input.reason ?? null,
        submissionAttempt: typeof data?.submissionCount === "number" ? data.submissionCount : 0,
      });

      return {
        ownerId: (data?.partnerId ?? data?.ownerId) as string | undefined,
        propertyName: typeof data?.name === "string" ? data.name : "Your property",
        approvalStatus: update.approvalStatus,
      };
    });

    // Best-effort notification, never blocks or rolls back the decision.
    if (result?.ownerId) {
      void notifyPropertyDecision({
        ownerId: result.ownerId,
        propertyId,
        propertyName: result.propertyName,
        approvalStatus: result.approvalStatus,
        reason: input.decision === "approve" ? null : input.reason ?? null,
        actorId: user.uid,
      }).catch((cause) => console.error("notifyPropertyDecision failed", cause));
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to review property." }, { status: 422 });
  }
}
