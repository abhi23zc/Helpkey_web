import { reservationHandler } from "@/lib/partner/reservations/handler";
import { getOwnerReportAttachmentUrl } from "@/lib/dues/reports";

export const GET = reservationHandler(
  "/api/partner/properties/[propertyId]/finances/reports/[reportId]/attachment",
  false,
  async (
    _request: Request,
    context: { params: Promise<{ propertyId: string; reportId: string }> },
    uid,
  ) => {
    const { propertyId, reportId } = await context.params;
    return Response.json(
      await getOwnerReportAttachmentUrl(uid, propertyId, reportId),
    );
  },
);
