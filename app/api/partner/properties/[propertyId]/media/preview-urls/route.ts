import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { createR2ReadUrl } from "@/lib/r2";

const rawGET = async function GET(_request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/media/preview-urls">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });

  try {
    const { propertyId } = await params;
    await propertyOwner(user.uid, propertyId);
    const ids = [...new Set(new URL(_request.url).searchParams.getAll("id"))].filter(Boolean).slice(0, 20);
    if (!ids.length) return Response.json({ error: "At least one media id is required." }, { status: 400 });
    const media = await adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get();
    const previews = await Promise.all(media.docs
      .filter((document) => ids.includes(document.id) && document.data().kind === "property_image")
      .map(async (document) => ({ id: document.id, ...await createR2ReadUrl(document.data().r2ObjectKey), mimeType: document.data().mimeType ?? "application/octet-stream", fileName: document.data().fileName ?? "image" })));
    return Response.json({ previews }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load photo previews." }, { status: 422 });
  }
}

export const GET = withApiHandler(rawGET, { route: "/api/partner/properties/[propertyId]/media/preview-urls", auth: "strict", requireAuth: true, cache: "private" });
