import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, roomTypePatchSchema } from "@/lib/partner/service";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";

const rawPATCH = async function PATCH(
  request: Request,
  { params }: { params: Promise<{ propertyId: string; roomTypeId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId, roomTypeId } = await params;
    await propertyOwner(user.uid, propertyId);
    const input = roomTypePatchSchema.parse(await request.json());

    const ref = adminDb.collection("roomTypes").doc(roomTypeId);
    const snap = await ref.get();
    const data = snap.data();
    if (!snap.exists || data?.propertyId !== propertyId) throw new Error("ROOM_TYPE_NOT_FOUND");

    if (input.mediaIds || input.coverMediaId) {
      const existingMediaIds = Array.isArray(data?.mediaIds)
        ? data.mediaIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
      const mediaIds = new Set<string>(input.mediaIds ?? existingMediaIds);
      if (input.coverMediaId && !mediaIds.has(input.coverMediaId)) throw new Error("ROOM_COVER_MUST_BE_ASSIGNED");
      const media = await Promise.all([...mediaIds].map((id) => adminDb.collection("mediaAssets").doc(id).get()));
      if (media.some((asset) => !asset.exists || asset.data()?.propertyId !== propertyId || asset.data()?.kind !== "property_image")) {
        throw new Error("INVALID_ROOM_MEDIA");
      }
    }

    const update: Record<string, unknown> = { ...input, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid };
    // Keep denormalized maxOccupancy consistent when adult/child limits change.
    if (input.maxAdults !== undefined || input.maxChildren !== undefined || input.maxInfants !== undefined) {
      const maxAdults = input.maxAdults ?? data?.maxAdults ?? 1;
      const maxChildren = input.maxChildren ?? data?.maxChildren ?? 0;
      update.maxOccupancy = maxAdults + maxChildren;
    }
    const batch = adminDb.batch();
    await adminDb.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      const property = (await tx.get(adminDb.collection("properties").doc(propertyId))).data();
      if (!current || current.propertyId !== propertyId) throw new Error("ROOM_TYPE_NOT_FOUND");
      if (input.totalInventory !== undefined && input.totalInventory < current.totalInventory) {
        const calendars = await tx.get(adminDb.collection("inventoryCalendars").where("propertyId", "==", propertyId).where("roomTypeId", "==", roomTypeId));
        const legacy = property?.inventoryEngine === "interval_v1" ? null : await tx.get(adminDb.collection("roomNightInventory").where("propertyId", "==", propertyId).where("roomTypeId", "==", roomTypeId));
        const firstInterval = Math.floor(Date.now() / (15 * 60000));
        for (const calendar of calendars.docs) {
          const data = calendar.data();
          const keys = new Set([...Object.keys(data.reserved ?? {}), ...Object.keys(data.blocked ?? {})]);
          if ([...keys].some((key) => Number(key) >= firstInterval && (data.reserved?.[key] ?? 0) + (data.blocked?.[key] ?? 0) > input.totalInventory!)) throw new Error("CAPACITY_BELOW_COMMITMENTS");
        }
        if (legacy?.docs.some((doc) => doc.id.slice(-10) >= new Date().toISOString().slice(0, 10) && Number(doc.data().reserved ?? 0) > input.totalInventory!)) throw new Error("CAPACITY_BELOW_COMMITMENTS");
      }
      tx.update(ref, update);
    });
    enqueueProjection(batch, "property_search", propertyId, 1, { components: ["pricing", "amenities"] });
    await batch.commit();
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");

    return Response.json({
      ok: true,
      roomType: {
        id: roomTypeId,
        name: input.name ?? data?.name,
        description: input.description ?? data?.description,
        inventory: input.totalInventory ?? data?.totalInventory,
        bookingModes: input.bookingModes ?? data?.bookingModes ?? ["overnight"],
        cleaningBufferMinutes: input.cleaningBufferMinutes ?? data?.cleaningBufferMinutes ?? 30,
        maxAdults: input.maxAdults ?? data?.maxAdults,
        maxChildren: input.maxChildren ?? data?.maxChildren ?? 0,
        maxInfants: input.maxInfants ?? data?.maxInfants ?? 0,
        bedConfigurations: input.bedConfigurations ?? data?.bedConfigurations ?? [],
        roomSizeSqFt: input.roomSizeSqFt !== undefined ? input.roomSizeSqFt : (data?.roomSizeSqFt ?? null),
        bathroomType: input.bathroomType ?? data?.bathroomType ?? "private",
        amenityIds: input.amenityIds ?? data?.amenityIds ?? [],
        mediaIds: input.mediaIds ?? data?.mediaIds ?? [],
        coverMediaId: input.coverMediaId !== undefined ? input.coverMediaId : (data?.coverMediaId ?? null),
        status: input.status ?? data?.status ?? "active",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update room type." }, { status: 422 });
  }
}

export const PATCH = withApiHandler(rawPATCH, { route: "/api/partner/properties/[propertyId]/room-types/[roomTypeId]", auth: "strict", requireAuth: true, cache: "private" });

const rawDELETE = async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ propertyId: string; roomTypeId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    const { propertyId, roomTypeId } = await params;
    await propertyOwner(user.uid, propertyId);

    const ref = adminDb.collection("roomTypes").doc(roomTypeId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.propertyId !== propertyId) throw new Error("ROOM_TYPE_NOT_FOUND");

    // Cascade: a room type cannot be sold without rate plans, and orphaned rate
    // plans would break search projections, so delete them in the same batch.
    const rates = await adminDb
      .collection("ratePlans")
      .where("propertyId", "==", propertyId)
      .where("roomTypeId", "==", roomTypeId)
      .get();

    const batch = adminDb.batch();
    rates.docs.forEach((doc) => batch.update(doc.ref, { status: "archived", updatedAt: FieldValue.serverTimestamp() }));
    batch.update(ref, { status: "archived", updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    enqueueProjection(batch, "property_search", propertyId, 1, { components: ["pricing", "amenities"] });
    await batch.commit();
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");

    return Response.json({ ok: true, roomTypeId, removedRatePlans: rates.size });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete room type." }, { status: 422 });
  }
}

export const DELETE = withApiHandler(rawDELETE, { route: "/api/partner/properties/[propertyId]/room-types/[roomTypeId]", auth: "strict", requireAuth: true, cache: "private" });
