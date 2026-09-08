import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";
import { createR2ReadUrl } from "@/lib/r2";

export async function GET(_request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/preview-urls">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const { propertyId } = await params; const [media, documents] = await Promise.all([adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get(), adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId).get()]); const eligible = [...media.docs, ...documents.docs].filter((doc) => typeof doc.data().r2ObjectKey === "string"); const urls = await Promise.all(eligible.map(async (doc) => ({ id: doc.id, ...await createR2ReadUrl(doc.data().r2ObjectKey), mimeType: doc.data().mimeType ?? "application/octet-stream", fileName: doc.data().fileName ?? "download" }))); return Response.json({ urls }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load private previews." }, { status: 422 }); }
}
