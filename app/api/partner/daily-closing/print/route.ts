import { z } from "zod";
import { reservationHandler } from "@/lib/partner/reservations/handler";
import { hotelId } from "@/lib/partner/closing/daily";
import { printClosing } from "@/lib/partner/closing/print";
export const GET = reservationHandler(
  "/api/partner/daily-closing/print",
  false,
  async (request, _context, uid) => {
    const p = new URL(request.url).searchParams;
    return printClosing(
      uid,
      hotelId.parse(p.get("propertyId")),
      z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(p.get("id")),
      true,
    );
  },
);
