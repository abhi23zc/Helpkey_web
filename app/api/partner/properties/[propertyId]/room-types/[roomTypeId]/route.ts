import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, roomTypePatchSchema } from "@/lib/partner/service";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function PATCH(
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
      const maxInfants = input.maxInfants ?? data?.maxInfants ?? 0;
      update.maxOccupancy = maxAdults + maxChildren + maxInfants;
    }
    await ref.update(update);

    return Response.json({
      ok: true,
      roomType: {
        id: roomTypeId,
        name: input.name ?? data?.name,
        description: input.description ?? data?.description,
        inventory: input.totalInventory ?? data?.totalInventory,
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
