import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { createPrivateReadUrl, PRIVATE_PREVIEW_MAX_SECONDS } from "@/lib/r2";
import { enforceRateLimit } from "@/lib/api/rate-limit";

const rawGET = async function GET(_request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/media/preview-urls">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });

  try {
    const { propertyId } = await params;
    await propertyOwner(user.uid, propertyId);
    const ids = [...new Set(new URL(_request.url).searchParams.getAll("id"))].filter(Boolean).slice(0, 20);
    if (!ids.length) return Response.json({ error: "At least one media id is required." }, { status: 400 });
    const media = await adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get();
    const eligible = media.docs.filter((document) => ids.includes(document.id) && document.data().kind === "property_image" && typeof document.data().r2ObjectKey === "string");
    // One combined rate-limit charge for the batch instead of one per object.
    if (eligible.length) await enforceRateLimit({ bucket: "private-media", identifier: user.uid, limit: 60, windowSeconds: 60, failClosed: true, cost: eligible.length });
    const previews = await Promise.all(eligible.map(async (document) => ({ id: document.id, ...await createPrivateReadUrl(document.data().r2ObjectKey, { maxSeconds: PRIVATE_PREVIEW_MAX_SECONDS, skipRateLimit: true }), mimeType: document.data().mimeType ?? "application/octet-stream", fileName: document.data().fileName ?? "image" })));
    return Response.json({ previews }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load photo previews." }, { status: 422 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/partner/properties/[propertyId]/media/preview-urls", auth: "strict", requireAuth: true, cache: "private" });
