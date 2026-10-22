import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner } from "@/lib/partner/service";
import { releaseCapacityBlock } from "@/lib/booking/blocks";
async function remove(_request: Request, { params }: { params: Promise<{ propertyId: string; blockId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { propertyId, blockId } = await params;
  await propertyOwner(user.uid, propertyId);
  await releaseCapacityBlock(user.uid, propertyId, blockId);
  return Response.json({ ok: true });
}
export const DELETE = withApiHandler(remove, { route: "/api/partner/properties/[propertyId]/inventory-blocks/[blockId]", auth: "strict", requireAuth: true, cache: "private" });
