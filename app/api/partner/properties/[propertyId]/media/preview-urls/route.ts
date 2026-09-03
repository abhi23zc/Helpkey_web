import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { createR2ReadUrl } from "@/lib/r2";

export async function GET(_request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/media/preview-urls">) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });

  try {
    const { propertyId } = await params;
    await propertyOwner(user.uid, propertyId);
    const media = await adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).get();
    const previews = media.docs
      .filter((document) => document.data().kind === "property_image")
      .map((document) => ({ id: document.id, ...createR2ReadUrl(document.data().r2ObjectKey) }));
    return Response.json({ previews });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load photo previews." }, { status: 422 });
  }
}
