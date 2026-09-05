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

    const update: Record<string, unknown> = { ...input, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid };
    // Keep denormalized maxOccupancy consistent when adult/child limits change.
    if (input.maxAdults !== undefined || input.maxChildren !== undefined) {
      const maxAdults = input.maxAdults ?? data?.maxAdults ?? 1;
      const maxChildren = input.maxChildren ?? data?.maxChildren ?? 0;
      update.maxOccupancy = maxAdults + maxChildren;
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
        amenityIds: input.amenityIds ?? data?.amenityIds ?? [],
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update room type." }, { status: 422 });
  }
}
