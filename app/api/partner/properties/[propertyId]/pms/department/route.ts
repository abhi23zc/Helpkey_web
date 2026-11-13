import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { reservationHandler } from "@/lib/partner/reservations/handler";
import { operationalAccess, propertyAccess } from "@/lib/partner/pms/access";
import { housekeeping, maintenance } from "@/lib/partner/rooms/service";
import { releaseCapacityBlock } from "@/lib/booking/blocks";
import { performOperation } from "@/lib/partner/reservations/operations";
import { cashierBookings } from "@/lib/partner/pms/cashier";
type Context = { params: Promise<{ propertyId: string }> };
const route = "/api/partner/properties/[propertyId]/pms/department";
export const GET = reservationHandler<Context>(
  route,
  false,
  async (r, c, uid) => {
    const id = (await c.params).propertyId,
      a = await propertyAccess(uid, id);
    if (a.role === "cashier") {
      const params = new URL(r.url).searchParams;
      return Response.json(await cashierBookings(uid, id, {
        q: params.get("q") || "",
        ...(params.get("cursor") ? { cursor: params.get("cursor") } : {}),
      }));
    }
    await operationalAccess(
      uid,
      id,
      a.role === "housekeeper" ? "housekeeping" : "maintenance",
    );
    const [units, blocks, occupied, rooms] = await Promise.all([
      adminDb.collection("physicalUnits").where("propertyId", "==", id).get(),
      adminDb
        .collection("inventoryBlocks")
        .where("propertyId", "==", id)
        .where("status", "==", "active")
        .get(),
      adminDb
        .collection("bookings")
        .where("propertyId", "==", id)
        .where("bookingStatus", "==", "checked_in")
        .get(),
      adminDb.collection("roomTypes").where("propertyId", "==", id).get(),
    ]);
    return Response.json({
      role: a.role,
      rooms: rooms.docs.map((d) => ({ id: d.id, name: d.get("name") })),
      units: units.docs
        .filter((d) => d.get("status") === "active")
        .map((d) => ({
          id: d.id,
          label: d.get("label"),
          roomTypeId: d.get("roomTypeId"),
          status: d.get("housekeepingStatus") || "unknown",
          revision: d.get("revision") || 0,
          occupied: occupied.docs.some((b) => b.get("physicalUnitId") === d.id),
        })),
      blocks: blocks.docs.map((d) => ({
        id: d.id,
        unitId: d.get("unitId") || null,
        reason: d.get("reason"),
        startAt: d.get("startAt"),
        endAt: d.get("endAt"),
      })),
    });
  },
);
export const POST = reservationHandler<Context>(
  route,
  true,
  async (r, c, uid) => {
    const id = (await c.params).propertyId;
    const body = z
      .object({
        action: z.enum(["housekeeping", "maintenance", "release", "payment"]),
        input: z.unknown(),
      })
      .strict()
      .parse(await r.json());
    if (body.action === "housekeeping")
      return Response.json(await housekeeping(uid, id, body.input));
    if (body.action === "maintenance")
      return Response.json(await maintenance(uid, id, body.input));
    if (body.action === "release") {
      const input = z
        .object({
          blockId: z
            .string()
            .min(1)
            .max(180)
            .refine((s) => !s.includes("/")),
        })
        .strict()
        .parse(body.input);
      await operationalAccess(uid, id, "maintenance");
      await releaseCapacityBlock(uid, id, input.blockId);
      return Response.json({ ok: true });
    }
    const input = z
      .object({
        bookingId: z
          .string()
          .min(1)
          .max(180)
          .refine((s) => !s.includes("/")),
        operation: z.unknown(),
      })
      .strict()
      .parse(body.input);
    const b = await adminDb.collection("bookings").doc(input.bookingId).get();
    if (b.get("propertyId") !== id) throw new ApiException("FORBIDDEN", 403);
    return Response.json(
      await performOperation(
        uid,
        input.bookingId,
        input.operation,
        r.headers.get("idempotency-key") || "",
      ),
    );
  },
);
