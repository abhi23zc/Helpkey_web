import { lifecycleActions } from "@/lib/admin/lifecycle";
import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin, recordReviewEvent, type ReviewAction } from "@/lib/admin/data";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";

const schema = z.object({ action: z.enum(["pause", "resume", "archive", "restore"]) }).strict();

const LIFECYCLE_ACTION: Record<z.infer<typeof schema>["action"], ReviewAction> = {
  pause: "paused",
  resume: "resumed",
  archive: "archived",
  restore: "restored",
};

const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/lifecycle">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const { propertyId } = await params;
    const { action } = schema.parse(await request.json());
    const ref = adminDb.collection("properties").doc(propertyId);
    await adminDb.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists) throw new Error("PROPERTY_NOT_FOUND");
      const data = current.data()!;
      if (!lifecycleActions(data).includes(action)) throw new Error("INVALID_LIFECYCLE_TRANSITION");
      const fromStatus = String(data.status ?? "draft");
      const changes = action === "pause"
        ? { status: "paused", isBookable: false, pausedAt: FieldValue.serverTimestamp() }
        : action === "resume"
          ? { status: "active", isBookable: true, pausedAt: null }
          : action === "archive"
            ? { status: "archived", isBookable: false, archivedAt: FieldValue.serverTimestamp() }
            : { status: data.approvalStatus === "approved" ? "active" : data.approvalStatus === "pending" ? "pending_review" : "draft", isBookable: data.approvalStatus === "approved", archivedAt: null };
      tx.update(ref, { ...changes, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
      recordReviewEvent(tx, {
        propertyId,
        actorId: user.uid,
        actorRole: "admin",
        action: LIFECYCLE_ACTION[action],
        fromApprovalStatus: String(data.approvalStatus ?? "not_submitted"),
        toApprovalStatus: String(data.approvalStatus ?? "not_submitted"),
        fromStatus,
        toStatus: String(changes.status),
      });
      enqueueProjection(tx, "property_search", propertyId);
    });
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update listing."; return Response.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : ["PROPERTY_NOT_FOUND", "ASSET_NOT_FOUND", "MEDIA_NOT_FOUND"].includes(message) ? 404 : 422 });
  }
}

export const POST = withApiHandler(rawPOST, { route: "/api/admin/properties/[propertyId]/lifecycle", auth: "strict", requireAuth: true, cache: "private" });
