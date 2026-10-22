import { enqueueProjection } from "@/lib/projections";
import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { deletePrivateObject } from "@/lib/r2";
import { photoCategoryValues, isRoomPhoto } from "@/lib/partner/photo-requirements";
import { invalidatePublic } from "@/lib/api/cache";

const schema = z
  .object({
    altText: z.string().max(125).optional(),
    makeCover: z.literal(true).optional(),
    category: z.enum(photoCategoryValues).optional(),
    roomTypeId: z.string().min(1).max(128).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
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
    await adminDb.runTransaction(async tx => {
      const [media, property, rooms, membership] = await Promise.all([
        tx.get(mediaRef), tx.get(propertyRef),
        tx.get(adminDb.collection("roomTypes").where("propertyId", "==", propertyId)),
        tx.get(adminDb.collection("propertyMemberships").doc(`${propertyId}_${user.uid}`)),
      ]);
      if (!property.exists || (membership.get("status") !== "active" || membership.get("role") !== "owner")) throw new Error("FORBIDDEN");
      if (!media.exists || media.get("propertyId") !== propertyId || media.get("kind") !== "property_image") throw new Error("MEDIA_NOT_FOUND");
      if (input.makeCover && !["pending", "approved"].includes(media.get("moderationStatus") ?? media.get("status"))) throw new Error("Choose a pending or approved property photo as the cover.");
      const now = FieldValue.serverTimestamp();
      const update: Record<string, unknown> = { updatedAt: now, updatedBy: user.uid };
      if (input.altText !== undefined) update.altText = input.altText;
      if (input.category !== undefined || input.roomTypeId !== undefined) {
        const category = input.category ?? media.get("category");
        const selected = input.roomTypeId !== undefined ? input.roomTypeId : media.get("roomTypeId");
        if (!isRoomPhoto(category) && input.roomTypeId) throw new Error("Only bedroom and bathroom photos can be assigned to a room type.");
        const roomTypeId = isRoomPhoto(category) ? selected : null;
        if (isRoomPhoto(category) && !roomTypeId) throw new Error("Choose the room type for this photo.");
        if (roomTypeId && !rooms.docs.some(room => room.id === roomTypeId && room.get("status") !== "archived")) throw new Error("ROOM_TYPE_NOT_FOUND");
        Object.assign(update, { category, roomTypeId: roomTypeId ?? null });
        for (const room of rooms.docs) {
          const previous: string[] = room.get("mediaIds") ?? [];
          const mediaIds = previous.filter(id => id !== mediaId);
          if (room.id === roomTypeId) mediaIds.push(mediaId);
          if (previous.includes(mediaId) || room.id === roomTypeId || room.get("coverMediaId") === mediaId) {
            const cover = room.get("coverMediaId");
            tx.update(room.ref, { mediaIds, coverMediaId: cover === mediaId && room.id !== roomTypeId ? mediaIds[0] ?? null : cover || (room.id === roomTypeId && category === "room" ? mediaId : null), updatedAt: now, updatedBy: user.uid });
          }
        }
      }
      tx.update(mediaRef, update);
      if (input.makeCover) tx.update(propertyRef, { coverMediaId: mediaId, updatedAt: now, updatedBy: user.uid });
      enqueueProjection(tx, "property_search", propertyId, 1, { components: ["cover"] });
    });

    await invalidatePublic("property:*", "home", "search:*");

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
    enqueueProjection(batch, "property_search", propertyId, 1, { components: ["cover"] });
    await batch.commit();
    await deletePrivateObject(mediaData.r2ObjectKey).catch(() => {});
    return Response.json({ ok: true, mediaId, coverMediaId: fallbackCoverId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove photo." }, { status: 422 });
  }
}

export const PATCH = withApiHandler(rawPATCH, { route: "/api/partner/properties/[propertyId]/media/[mediaId]", auth: "strict", requireAuth: true, cache: "private" });
export const DELETE = withApiHandler(rawDELETE, { route: "/api/partner/properties/[propertyId]/media/[mediaId]", auth: "strict", requireAuth: true, cache: "private" });
