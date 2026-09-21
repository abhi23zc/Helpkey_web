import { withApiHandler } from "@/lib/api/handler";
const rawGET = async function GET() {
  return Response.json({ error: "Review moderation is no longer available. Completed-stay reviews publish immediately." }, { status: 410 });
}

export const GET = withApiHandler(rawGET, { route: "/api/admin/reviews", auth: "read", requireAuth: true, cache: "private" });
