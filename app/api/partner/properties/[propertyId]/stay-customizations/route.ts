import { getAuthenticatedUser } from "@/lib/auth/session";
import { withApiHandler } from "@/lib/api/handler";
import { propertyOwner } from "@/lib/partner/service";
import { adminDb } from "@/lib/firebase/admin";
import { offeringsFor } from "@/lib/stay/catalog";
import { saveOffering } from "@/lib/stay/service";
import { stayError } from "@/lib/stay/api";
type Context = { params: Promise<{ propertyId: string }> };
async function get(_request: Request, { params }: Context) {
  const user = await getAuthenticatedUser();
  if (!user)
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const { propertyId } = await params;
    await propertyOwner(user.uid, propertyId);
    const [offerings, rooms] = await Promise.all([
      offeringsFor(propertyId),
      adminDb
        .collection("roomTypes")
        .where("propertyId", "==", propertyId)
        .get(),
    ]);
    return Response.json({
      offerings,
      rooms: rooms.docs.map((d) => ({
        id: d.id,
        name: d.get("name") ?? "Room",
      })),
    });
  } catch (e) {
    return stayError(e);
  }
}
async function save(request: Request, { params }: Context) {
  const user = await getAuthenticatedUser();
  if (!user)
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const { propertyId } = await params;
    const id = await saveOffering(user.uid, propertyId, await request.json());
    return Response.json({ id });
  } catch (e) {
    return stayError(e);
  }
}
export const GET = withApiHandler(get, {
  route: "/api/partner/properties/[propertyId]/stay-customizations",
  auth: "strict",
  requireAuth: true,
  cache: "private",
});
export const POST = withApiHandler(save, {
  route: "/api/partner/properties/[propertyId]/stay-customizations",
  auth: "strict",
  requireAuth: true,
  cache: "private",
});
