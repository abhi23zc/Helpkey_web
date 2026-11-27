import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { getAdminReportAttachmentUrl } from "@/lib/dues/reports";

export const GET = withApiHandler(
  async (
    request: Request,
    context: { params: Promise<{ reportId: string }> },
  ) => {
    const { reportId } = await context.params;
    const propertyId = new URL(request.url).searchParams.get("propertyId") ?? "";
    return Response.json(
      await getAdminReportAttachmentUrl(
        actorFromRequest().uid,
        propertyId,
        reportId,
      ),
    );
  },
  {
    route: "/api/admin/dues/reports/[reportId]/attachment",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
