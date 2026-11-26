import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyAccess } from "@/lib/partner/pms/access";
const identifier = z
  .string()
  .min(1)
  .max(180)
  .refine((v) => !v.includes("/"));
const schema = z
  .object({
    revision: z.number().int().nonnegative(),
    cutoffHours: z.number().int().min(0).max(8760),
    reservationsPhone: z
      .string()
      .regex(/^\+\d{6,15}$/)
      .nullable(),
    mappings: z
      .array(
        z
          .object({
            ratePlanId: identifier,
            equivalents: z.array(identifier).max(100),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
type Context = { params: Promise<{ propertyId: string }> };
async function get(uid: string, propertyId: string) {
  await propertyAccess(uid, propertyId, "property.manage");
  const [property, rates, rooms] = await Promise.all([
    adminDb.collection("properties").doc(propertyId).get(),
    adminDb.collection("ratePlans").where("propertyId", "==", propertyId).get(),
    adminDb.collection("roomTypes").where("propertyId", "==", propertyId).get(),
  ]);
  const roomNames = new Map(rooms.docs.map((room) => [room.id, room.get("name")]));
  return {
    revision: property.get("customerEditing.revision") ?? 0,
    cutoffHours: property.get("customerEditing.cutoffHours") ?? 0,
    reservationsPhone:
      property.get("customerEditing.reservationsPhone") ?? null,
    rates: rates.docs
      .filter((d) => d.get("status") === "active")
      .map((d) => ({
        id: d.id,
        name: d.get("name"),
        roomTypeId: d.get("roomTypeId"),
        roomTypeName: roomNames.get(d.get("roomTypeId")) ?? "Room type",
        bookingMode: d.get("bookingMode") ?? "overnight",
        equivalents: d.get("equivalentRatePlanIds") ?? [],
      })),
  };
}
export const GET = withApiHandler(
  async (_request: Request, context: Context) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new ApiException("UNAUTHENTICATED", 401);
    return Response.json(
      await get(user.uid, (await context.params).propertyId),
    );
  },
  {
    route: "/api/partner/properties/[propertyId]/booking-editing",
    auth: "read",
    requireAuth: true,
    cache: "private",
  },
);
export const PATCH = withApiHandler(
  async (request: Request, context: Context) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new ApiException("UNAUTHENTICATED", 401);
    const { propertyId } = await context.params;
    const input = schema.parse(await request.json());
    await adminDb.runTransaction(async (tx) => {
      await propertyAccess(user.uid, propertyId, "property.manage", tx);
      const ref = adminDb.collection("properties").doc(propertyId);
      const p = await tx.get(ref);
      if ((p.get("customerEditing.revision") ?? 0) !== input.revision)
        throw new ApiException("REVISION_CONFLICT", 409);
      const rates = await tx.get(
        adminDb.collection("ratePlans").where("propertyId", "==", propertyId),
      );
      for (const mapping of input.mappings) {
        const source = rates.docs.find((d) => d.id === mapping.ratePlanId);
        if (
          !source ||
          source.get("status") !== "active" ||
          mapping.equivalents.some(
            (id) =>
              !rates.docs.some(
                (d) =>
                  d.id === id &&
                  d.get("status") === "active" &&
                  d.get("roomTypeId") !== source.get("roomTypeId") &&
                  (d.get("bookingMode") ?? "overnight") ===
                    (source.get("bookingMode") ?? "overnight"),
              ),
          )
        )
          throw new ApiException("INVALID_PACKAGE_MAPPING", 422);
      }
      for (const mapping of input.mappings)
        tx.update(adminDb.collection("ratePlans").doc(mapping.ratePlanId), {
          equivalentRatePlanIds: [...new Set(mapping.equivalents)],
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        });
      tx.update(ref, {
        customerEditing: {
          revision: input.revision + 1,
          cutoffHours: input.cutoffHours,
          reservationsPhone: input.reservationsPhone,
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      });
    });
    return Response.json(await get(user.uid, propertyId));
  },
  {
    route: "/api/partner/properties/[propertyId]/booking-editing",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
