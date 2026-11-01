import { reservationHandler } from "@/lib/partner/reservations/handler";
import {
  workspace,
  bulk,
  housekeeping,
  maintenance,
  exactAvailability,
  pricingPreview,
  roomHistory,
} from "@/lib/partner/rooms/service";
import { releaseCapacityBlock } from "@/lib/booking/blocks";
import { z } from "zod";
type Context = { params: Promise<{ propertyId: string }> };
const route = "/api/partner/properties/[propertyId]/rooms-workspace";
export const GET = reservationHandler<Context>(
  route,
  false,
  async (request, context, uid) => {
    const { propertyId } = await context.params;
    const q = new URL(request.url).searchParams;
    if (q.get("unitId"))
      return Response.json(
        await roomHistory(uid, propertyId, q.get("unitId")!),
      );
    return Response.json(
      await workspace(
        uid,
        propertyId,
        q.get("start") || "",
        q.get("end") || "",
      ),
    );
  },
);
export const POST = reservationHandler<Context>(
  route,
  true,
  async (request, context, uid) => {
    const { propertyId } = await context.params;
    const body = z
      .object({
        action: z.enum([
          "bulk",
          "housekeeping",
          "maintenance",
          "release",
          "availability",
          "price-quote",
        ]),
        input: z.unknown(),
      })
      .strict()
      .parse(await request.json());
    if (body.action === "bulk")
      return Response.json(await bulk(uid, propertyId, body.input));
    if (body.action === "housekeeping")
      return Response.json(await housekeeping(uid, propertyId, body.input));
    if (body.action === "maintenance")
      return Response.json(await maintenance(uid, propertyId, body.input));
    if (body.action === "price-quote")
      return Response.json(await pricingPreview(uid, propertyId, body.input));
    if (body.action === "availability")
      return Response.json(
        await exactAvailability(uid, propertyId, body.input),
      );
    const input = z
      .object({
        blockId: z
          .string()
          .min(1)
          .max(180)
          .refine((v) => !v.includes("/")),
      })
      .parse(body.input);
    await releaseCapacityBlock(uid, propertyId, input.blockId);
    return Response.json({ ok: true });
  },
);
