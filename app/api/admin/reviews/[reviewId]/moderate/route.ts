import { withApiHandler } from "@/lib/api/handler";
const rawPOST = async function POST(request: Request, { params }: RouteContext<"/api/admin/reviews/[reviewId]/moderate">) {
  void request;
  void params;
  return Response.json({ error: "Review moderation is no longer available. Completed-stay reviews publish immediately." }, { status: 410 });
}

export const POST = withApiHandler(rawPOST, { route: "/api/admin/reviews/[reviewId]/moderate", auth: "strict", requireAuth: true, cache: "private" });
