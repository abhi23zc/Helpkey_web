import { withApiHandler } from "@/lib/api/handler";
import { actorFromRequest } from "@/lib/api/handler";
import { loadPartnerShell } from "@/lib/services/partner-shell";

const rawGET = async function GET() {
  return Response.json(await loadPartnerShell(actorFromRequest()));
};

export const GET = withApiHandler(rawGET, { route: "/api/partner/dashboard", auth: "read", requireAuth: true, cache: "private" });
