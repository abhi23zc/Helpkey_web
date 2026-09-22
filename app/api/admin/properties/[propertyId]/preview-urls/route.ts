import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/admin/data";
import { createPrivateReadUrl, PRIVATE_PREVIEW_MAX_SECONDS } from "@/lib/r2";
import { enforceRateLimit } from "@/lib/api/rate-limit";

const rawGET = async function GET(_request: Request, { params }: RouteContext<"/api/admin/properties/[propertyId]/preview-urls">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { await requireAdmin(user.uid); const { propertyId } = await params; const [media, documents] = await Promise.all([adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get(), adminDb.collection("verificationDocuments").where("propertyId", "==", propertyId).get()]); const eligible = [...media.docs, ...documents.docs].filter((doc) => typeof doc.data().r2ObjectKey === "string"); if (eligible.length) await enforceRateLimit({ bucket: "private-media", identifier: user.uid, limit: 120, windowSeconds: 60, failClosed: true, cost: eligible.length }); const urls = await Promise.all(eligible.map(async (doc) => ({ id: doc.id, ...await createPrivateReadUrl(doc.data().r2ObjectKey, { maxSeconds: PRIVATE_PREVIEW_MAX_SECONDS, skipRateLimit: true }), mimeType: doc.data().mimeType ?? "application/octet-stream", fileName: doc.data().fileName ?? "download" }))); return Response.json({ urls }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load private previews." }, { status: 422 }); }
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/properties/[propertyId]/preview-urls", auth: "strict", requireAuth: true, cache: "private" });
