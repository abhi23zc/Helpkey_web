import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner, roomTypeSchema } from "@/lib/partner/service";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { enqueueProjection } from "@/lib/projections";
import { invalidatePublic } from "@/lib/api/cache";

const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/partner/properties/[propertyId]/room-types">) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const { propertyId } = await params; await propertyOwner(user.uid, propertyId); const input = roomTypeSchema.parse(await request.json()); const ref = adminDb.collection("roomTypes").doc(); const batch = adminDb.batch(); batch.set(ref, { propertyId, ...input, bookingModes: ["overnight"], maxOccupancy: input.maxAdults + input.maxChildren, roomSizeSqFt: null, bathroomType: "private", amenityIds: input.amenityIds ?? [], mediaIds: [], coverMediaId: null, status: "active", createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, deletedAt: null }); enqueueProjection(batch, "property_search", propertyId); await batch.commit(); await invalidatePublic("home", "search:*", "bookable:*"); return Response.json({ roomTypeId: ref.id, roomType: { id: ref.id, name: input.name, description: input.description, inventory: input.totalInventory, maxAdults: input.maxAdults, maxChildren: input.maxChildren, maxInfants: input.maxInfants, bedConfigurations: input.bedConfigurations, roomSizeSqFt: null, bathroomType: "private", amenityIds: input.amenityIds ?? [], mediaIds: [], coverMediaId: null, status: "active" } }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create room type." }, { status: 422 }); }
}

export const POST = withApiHandler(rawPOST, { route: "/api/partner/properties/[propertyId]/room-types", auth: "strict", requireAuth: true, cache: "private" });
