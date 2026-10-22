import { approvalReadiness } from "@/lib/admin/approval-readiness";
import { withApiHandler } from "@/lib/api/handler";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin, recordReviewEvent } from "@/lib/admin/data";
import { notifyPropertyDecision } from "@/lib/notifications/service";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";
const schema = z.object({ decision: z.enum(["approve", "request_changes", "reject"]), reason: z.string().max(1000).optional() }).strict();
const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/review">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const { propertyId } = await params;
    const input = schema.parse(await request.json());
    if (input.decision !== "approve" && !input.reason?.trim()) throw new Error("REASON_REQUIRED");
    const ref = adminDb.collection("properties").doc(propertyId);

    const result = await adminDb.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const data = current.data();
      if (!current.exists) throw new Error("PROPERTY_NOT_FOUND");
      if (data?.approvalStatus !== "pending") throw new Error("PROPERTY_NOT_PENDING");

      if (input.decision === "approve") {
        const [media, rooms, docs, rates] = await Promise.all([
          tx.get(adminDb.collection("mediaAssets").where("propertyId", "==", propertyId)),
          tx.get(adminDb.collection("roomTypes").where("propertyId", "==", propertyId)),
          tx.get(adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId)),
          tx.get(adminDb.collection("ratePlans").where("propertyId", "==", propertyId)),
        ]);
        const readiness = approvalReadiness(data!, media.docs.map(d => ({ id: d.id, ...d.data() })), rooms.docs.map(d => ({ ...d.data(), id: d.id, name: d.get("name") ?? "Room" })), docs.docs.map(d => d.data()), rates.docs.map(d => d.data()));
        if (!readiness.ready) throw new Error(`REQUIRED_ASSETS_NOT_APPROVED: ${readiness.blockers.join("; ")}`);
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
      enqueueProjection(tx, "property_search", propertyId);

      return {
        ownerId: (data?.partnerId ?? data?.ownerId) as string | undefined,
        propertyName: typeof data?.name === "string" ? data.name : "Your property",
        approvalStatus: update.approvalStatus,
      };
    });
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");

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
    const message = error instanceof Error ? error.message : "Unable to review property."; return Response.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : ["PROPERTY_NOT_FOUND", "ASSET_NOT_FOUND", "MEDIA_NOT_FOUND"].includes(message) ? 404 : 422 });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/admin/properties/[propertyId]/review", auth: "strict", requireAuth: true, cache: "private" });
