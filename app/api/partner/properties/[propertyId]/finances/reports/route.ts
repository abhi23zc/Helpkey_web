import { reservationHandler } from "@/lib/partner/reservations/handler";
import {
  listOwnerDuesReports,
  submitDuesReport,
  withdrawDuesReport,
} from "@/lib/dues/reports";

export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/finances/reports",
  false,
  async (
    request: Request,
    context: { params: Promise<{ propertyId: string }> },
    uid,
  ) => {
    const { propertyId } = await context.params;
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    return Response.json(await listOwnerDuesReports(uid, propertyId, query));
  },
);

export const POST = reservationHandler(
  "/api/partner/properties/[propertyId]/finances/reports",
  true,
  async (
    request: Request,
    context: { params: Promise<{ propertyId: string }> },
    uid,
  ) => {
    const { propertyId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (body?.action === "withdraw") {
      return Response.json(await withdrawDuesReport(uid, propertyId, body));
    }
    return Response.json(await submitDuesReport(uid, propertyId, body), {
      status: 201,
    });
  },
);
