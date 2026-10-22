import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { propertyOwner } from "@/lib/partner/service";
import { createCapacityBlock, setStopSell } from "@/lib/booking/blocks";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { validDate } from "@/lib/booking/domain";
import { calendarRef } from "@/lib/booking/inventory";
async function post(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { propertyId } = await params;
  await propertyOwner(user.uid, propertyId);
  try { return Response.json(await createCapacityBlock(user.uid, propertyId, await request.json()), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "INVALID_BLOCK" }, { status: 422 }); }
}
export const POST = withApiHandler(post, { route: "/api/partner/properties/[propertyId]/inventory-blocks", auth: "strict", requireAuth: true, cache: "private" });

async function get(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { propertyId } = await params;
  await propertyOwner(user.uid, propertyId);
  const url = new URL(request.url), roomTypeId = url.searchParams.get("roomTypeId") ?? "", date = url.searchParams.get("date") ?? "";
  if (!roomTypeId || !validDate(date)) return Response.json({ error: "ROOM_AND_DATE_REQUIRED" }, { status: 422 });
  const room = (await adminDb.collection("roomTypes").doc(roomTypeId).get()).data();
  if (room?.propertyId !== propertyId) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  const [calendar, blocks] = await Promise.all([calendarRef(propertyId, roomTypeId, date).get(), adminDb.collection("inventoryBlocks").where("propertyId", "==", propertyId).where("roomTypeId", "==", roomTypeId).where("status", "==", "active").get()]);
  return Response.json({ capacity: room.totalInventory, calendar: calendar.data() ?? {}, blocks: blocks.docs.filter((doc) => doc.data().allocations.some((a: { date: string }) => a.date === date)).map((doc) => ({ id: doc.id, reason: doc.data().reason, quantity: doc.data().quantity, startAt: doc.data().startAt, endAt: doc.data().endAt })) });
}
async function patch(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { propertyId } = await params;
  await propertyOwner(user.uid, propertyId);
  const input = z.object({ roomTypeId: z.string().min(1), date: z.string().refine(validDate), stopSell: z.boolean() }).strict().parse(await request.json());
  await setStopSell(user.uid, propertyId, input.roomTypeId, input.date, input.stopSell);
  return Response.json({ ok: true });
}
export const GET = withApiHandler(get, { route: "/api/partner/properties/[propertyId]/inventory-blocks", auth: "strict", requireAuth: true, cache: "private" });
export const PATCH = withApiHandler(patch, { route: "/api/partner/properties/[propertyId]/inventory-blocks", auth: "strict", requireAuth: true, cache: "private" });
