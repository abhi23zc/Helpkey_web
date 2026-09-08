import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { privatePreviewDto } from "@/lib/media-resolver";

export async function GET(_request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/kyc/[documentId]/preview">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try { await requireAdmin(user.uid); const { propertyId, documentId } = await params; const document = await adminDb.collection("verificationDocuments").doc(documentId).get(); if (!document.exists || document.data()?.propertyId !== propertyId) return Response.json({ error: "MEDIA_NOT_FOUND" }, { status: 404 }); const preview = await privatePreviewDto(document.id, document.data() ?? {}); if (!preview) return Response.json({ error: "MEDIA_NOT_FOUND" }, { status: 404 }); return Response.json(preview, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "MEDIA_ACCESS_DENIED" }, { status: 403 }); }
}
