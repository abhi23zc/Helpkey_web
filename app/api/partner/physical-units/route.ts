import { adminDb } from "@/lib/firebase/admin";
import { reservationHandler } from "@/lib/partner/reservations/handler";
import { authorize, features } from "@/lib/partner/reservations/access";
import { saveUnit, safeData } from "@/lib/partner/reservations/operations";
import { z } from "zod";
export const GET = reservationHandler(
  "/api/partner/physical-units",
  false,
  async (request, _context, uid) => {
    const propertyId = z
      .string()
      .min(1)
      .max(180)
      .parse(new URL(request.url).searchParams.get("propertyId"));
    await authorize(uid, propertyId);
    const units = await adminDb
      .collection("physicalUnits")
      .where("propertyId", "==", propertyId)
      .get();
    return Response.json({
      units: units.docs.map((d) => ({ id: d.id, ...safeData(d.data()) })),
      features: features(),
    });
  },
);
export const POST = reservationHandler(
  "/api/partner/physical-units",
  true,
  async (request, _context, uid) =>
    Response.json(await saveUnit(uid, await request.json())),
);
