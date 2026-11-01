import { getAuthenticatedUser } from "@/lib/auth/session";
import { withApiHandler } from "@/lib/api/handler";
import { stayError } from "@/lib/stay/api";
import { partnerRequestQueue } from "@/lib/stay/partner-queue";
export const GET = withApiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ propertyId: string }> },
  ) => {
    const user = await getAuthenticatedUser();
    if (!user)
      return Response.json({ error: "Unauthenticated" }, { status: 401 });
    try {
      return Response.json(
        await partnerRequestQueue(
          user.uid,
          (await params).propertyId,
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      );
    } catch (error) {
      return stayError(error);
    }
  },
  {
    route: "/api/partner/properties/[propertyId]/stay-requests",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
