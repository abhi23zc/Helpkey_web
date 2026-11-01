import sharp from "sharp";
import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner } from "@/lib/partner/service";
import { adminDb } from "@/lib/firebase/admin";
import { putPrivateObject } from "@/lib/r2";
import { FieldValue } from "firebase-admin/firestore";
import { stayError } from "@/lib/stay/api";
async function upload(
  request: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user)
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const { propertyId } = await params;
    await propertyOwner(user.uid, propertyId);
    const file = (await request.formData()).get("image");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 4 * 1024 * 1024
    )
      throw new Error("Choose a JPEG, PNG or WebP image up to 4 MB.");
    const image = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 25000000,
    })
      .rotate()
      .resize(960, 640, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const imageId = crypto.randomUUID(),
      key = `stay-offerings/${propertyId}/${imageId}.webp`;
    await putPrivateObject(key, image, "image/webp");
    await adminDb
      .collection("properties")
      .doc(propertyId)
      .collection("stayImages")
      .doc(imageId)
      .set({ key, ownerId: user.uid, createdAt: FieldValue.serverTimestamp() });
    return Response.json({ imageId });
  } catch (error) {
    return stayError(error);
  }
}
export const POST = withApiHandler(upload, {
  route: "/api/partner/properties/[propertyId]/stay-image",
  auth: "strict",
  requireAuth: true,
  cache: "private",
  bodyLimitBytes: 5 * 1024 * 1024,
});
