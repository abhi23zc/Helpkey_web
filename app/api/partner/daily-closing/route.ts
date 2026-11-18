import { z } from "zod";
import { reservationHandler } from "@/lib/partner/reservations/handler";
import {
  commandDaily,
  readDaily,
  dailyHistory,
  hotelId,
} from "@/lib/partner/closing/daily";
export const GET = reservationHandler(
  "/api/partner/daily-closing",
  false,
  async (request, _context, uid) => {
    const p = new URL(request.url).searchParams,
      hotel = hotelId.parse(p.get("propertyId"));
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(p.get("page") || 0);
    return Response.json(
      p.get("date")
        ? await readDaily(uid, hotel, p.get("date")!, page)
        : await dailyHistory(
            uid,
            hotel,
            p.get("id")
              ? z
                  .string()
                  .regex(/^[a-f0-9]{64}$/)
                  .parse(p.get("id"))
              : undefined,
            p.get("before")
              ? z
                  .string()
                  .regex(/^[a-f0-9]{64}$/)
                  .parse(p.get("before"))
              : undefined,
            page,
          ),
    );
  },
);
export const POST = reservationHandler(
  "/api/partner/daily-closing",
  true,
  async (request, _context, uid) => {
    const { propertyId, ...body } = await request.json();
    return Response.json(
      await commandDaily(
        uid,
        hotelId.parse(propertyId),
        body,
        request.headers.get("idempotency-key") || "",
      ),
    );
  },
);
