import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";

const schema = z.object({ action: z.enum(["pause", "resume", "archive", "restore"]) }).strict();
export async function POST(request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/lifecycle">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const { propertyId } = await params; const { action } = schema.parse(await request.json()); const ref = adminDb.collection("properties").doc(propertyId); const current = await ref.get(); if (!current.exists) throw new Error("PROPERTY_NOT_FOUND"); const data = current.data()!; const changes = action === "pause" ? { status: "paused", isBookable: false, pausedAt: FieldValue.serverTimestamp() } : action === "resume" ? { status: "active", isBookable: true, pausedAt: null } : action === "archive" ? { status: "archived", isBookable: false, archivedAt: FieldValue.serverTimestamp() } : { status: data.approvalStatus === "approved" ? "active" : "draft", isBookable: data.approvalStatus === "approved", archivedAt: null }; await ref.update({ ...changes, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update listing." }, { status: 422 }); }
}
