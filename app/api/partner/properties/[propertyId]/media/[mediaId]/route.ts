import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { deletePrivateObject } from "@/lib/r2";

const schema = z
  .object({
    altText: z.string().max(125).optional(),
    makeCover: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => value.altText !== undefined || value.makeCover, {
    message: "NOTHING_TO_UPDATE",
  });

const rawPATCH = async function PATCH(
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

const rawDELETE = async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/partner/properties/[propertyId]/media/[mediaId]">,
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });

  try {
    const { propertyId, mediaId } = await params;
    const propertyRef = await propertyOwner(user.uid, propertyId);
    const [property, media, rooms] = await Promise.all([
      propertyRef.get(),
      adminDb.collection("mediaAssets").doc(mediaId).get(),
      adminDb.collection("roomTypes").where("propertyId", "==", propertyId).get(),
    ]);
    const propertyData = property.data();
    if (!propertyData || propertyData.status !== "draft" || propertyData.approvalStatus !== "not_submitted") {
      throw new Error("Photos can only be removed while this listing is a draft.");
    }
    const mediaData = media.data();
    if (!media.exists || mediaData?.propertyId !== propertyId || mediaData.kind !== "property_image") {
      throw new Error("MEDIA_NOT_FOUND");
    }

    const remaining = (Array.isArray(propertyData.mediaIds) ? propertyData.mediaIds : [])
      .filter((id: unknown): id is string => typeof id === "string" && id !== mediaId);
    const fallbackCoverId = propertyData.coverMediaId === mediaId ? remaining[0] ?? null : propertyData.coverMediaId ?? null;
    const batch = adminDb.batch();
    batch.delete(media.ref);
    batch.update(propertyRef, {
      mediaIds: remaining,
      coverMediaId: fallbackCoverId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });
    rooms.docs.forEach((room) => {
      const data = room.data();
      const mediaIds = (Array.isArray(data.mediaIds) ? data.mediaIds : []).filter((id: unknown) => id !== mediaId);
      if (mediaIds.length !== (data.mediaIds ?? []).length || data.coverMediaId === mediaId) {
        batch.update(room.ref, {
          mediaIds,
          coverMediaId: data.coverMediaId === mediaId ? mediaIds[0] ?? null : data.coverMediaId ?? null,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        });
      }
    });
    await batch.commit();
    await deletePrivateObject(mediaData.r2ObjectKey).catch(() => {});
    return Response.json({ ok: true, mediaId, coverMediaId: fallbackCoverId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove photo." }, { status: 422 });
  }
}

export const PATCH = withApiHandler(rawPATCH, { route: "/api/partner/properties/[propertyId]/media/[mediaId]", auth: "strict", requireAuth: true, cache: "private" });
export const DELETE = withApiHandler(rawDELETE, { route: "/api/partner/properties/[propertyId]/media/[mediaId]", auth: "strict", requireAuth: true, cache: "private" });
