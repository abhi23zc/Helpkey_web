import { z } from "zod";
import { reservationHandler } from "@/lib/partner/reservations/handler";
import { commandShift, readShifts } from "@/lib/partner/closing/shifts";
import { hotelId } from "@/lib/partner/closing/daily";
export const GET = reservationHandler(
  "/api/partner/cashier-shifts",
  false,
  async (request, _context, uid) => {
    const p = new URL(request.url).searchParams;
    return Response.json(
      await readShifts(
        uid,
        hotelId.parse(p.get("propertyId")),
        p.get("id")
          ? z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(p.get("id"))
          : undefined,
        p.get("before")
          ? z
              .string()
              .max(180)
              .regex(/^[a-zA-Z0-9_-]+$/)
              .parse(p.get("before"))
          : undefined,
        p.get("sources") === "true",
      ),
    );
  },
);
export const POST = reservationHandler(
  "/api/partner/cashier-shifts",
  true,
  async (request, _context, uid) => {
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return Response.json({ message: "Invalid request body" }, { status: 422 });
    }
    const { propertyId, ...body } = raw as Record<string, unknown>;
    return Response.json(
      await commandShift(
        uid,
        hotelId.parse(propertyId),
        body,
        request.headers.get("idempotency-key") || "",
      ),
    );
  },
);
