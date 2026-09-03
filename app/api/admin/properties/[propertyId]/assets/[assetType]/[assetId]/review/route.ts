import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";

const schema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(2).max(1000).optional() }).strict();
export async function POST(request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/assets/[assetType]/[assetId]/review">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const { propertyId, assetType, assetId } = await params; if (assetType !== "media" && assetType !== "documents") throw new Error("INVALID_ASSET_TYPE"); const input = schema.parse(await request.json()); if (input.decision === "reject" && !input.reason) throw new Error("REJECTION_REASON_REQUIRED"); const ref = adminDb.collection(assetType === "media" ? "mediaAssets" : "verificationDocuments").doc(assetId); const asset = await ref.get(); if (!asset.exists || asset.data()?.propertyId !== propertyId) throw new Error("ASSET_NOT_FOUND"); await ref.update({ ...(assetType === "media" ? { moderationStatus: input.decision === "approve" ? "approved" : "rejected" } : { status: input.decision === "approve" ? "approved" : "rejected" }), reviewReason: input.decision === "reject" ? input.reason : null, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to review asset." }, { status: 422 }); }
}
