import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { getPrivateObject } from "@/lib/r2";
async function get(
  _request: Request,
  { params }: { params: Promise<{ propertyId: string; imageId: string }> },
) {
  const { propertyId, imageId } = await params;
  if (!/^[^/]{1,180}$/.test(propertyId) || !/^[a-f0-9-]{36}$/.test(imageId))
    return new Response(null, { status: 404 });
  const propertyRef = adminDb.collection("properties").doc(propertyId);
  const [property, image, offerings] = await Promise.all([
    propertyRef.get(),
    propertyRef.collection("stayImages").doc(imageId).get(),
    propertyRef
      .collection("stayCustomizations")
      .where("imageId", "==", imageId)
      .limit(100)
      .get(),
  ]);
  const user = await getAuthenticatedUser();
  const member = user
    ? await adminDb
        .collection("propertyMemberships")
        .doc(`${propertyId}_${user.uid}`)
        .get()
    : null;
  const owner =
    member?.get("status") === "active" && member?.get("role") === "owner";
  const publicImage =
    property.get("status") === "active" &&
    property.get("approvalStatus") === "approved" &&
    property.get("isBookable") === true &&
    offerings.docs.some((o) => o.get("status") === "active");
  if (!image.exists || (!owner && !publicImage))
    return new Response(null, { status: 404 });
  try {
    return new Response(Buffer.from(await getPrivateObject(image.get("key"))), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
export const GET = withApiHandler(get, {
  route: "/api/stay-images/[propertyId]/[imageId]",
  auth: "read",
  requireAuth: false,
  cache: "private",
});
