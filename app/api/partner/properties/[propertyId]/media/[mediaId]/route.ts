import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";

const schema = z
  .object({
    altText: z.string().max(125).optional(),
    makeCover: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => value.altText !== undefined || value.makeCover, {
    message: "NOTHING_TO_UPDATE",
  });

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/partner/properties/[propertyId]/media/[mediaId]">,
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });

  try {
    const { propertyId, mediaId } = await params;
    const propertyRef = await propertyOwner(user.uid, propertyId);
    const input = schema.parse(await request.json());

    const mediaRef = adminDb.collection("mediaAssets").doc(mediaId);
    const media = await mediaRef.get();
    if (!media.exists || media.data()?.propertyId !== propertyId) {
      throw new Error("MEDIA_NOT_FOUND");
    }

    const now = FieldValue.serverTimestamp();

    if (input.altText !== undefined) {
      await mediaRef.update({ altText: input.altText, updatedAt: now, updatedBy: user.uid });
    }

    if (input.makeCover) {
      await propertyRef.update({ coverMediaId: mediaId, updatedAt: now, updatedBy: user.uid });
    }

    return Response.json({ ok: true, mediaId, ...(input.makeCover ? { coverMediaId: mediaId } : {}), ...(input.altText !== undefined ? { altText: input.altText } : {}) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update photo." },
      { status: 422 },
    );
  }
}
