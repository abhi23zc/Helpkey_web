import { reservationHandler } from "@/lib/partner/reservations/handler";
import { createDuesReportUploadUrl } from "@/lib/dues/reports";

export const POST = reservationHandler(
  "/api/partner/properties/[propertyId]/finances/reports/upload-url",
  true,
  async (
    request: Request,
    context: { params: Promise<{ propertyId: string }> },
    uid,
  ) => {
    const { propertyId } = await context.params;
    return Response.json(
      await createDuesReportUploadUrl(uid, propertyId, await request.json()),
    );
  },
);
