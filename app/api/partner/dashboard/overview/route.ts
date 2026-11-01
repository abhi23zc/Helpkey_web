import { validPageRange } from "@/lib/partner/date-range";
import { z } from "zod";
import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { validDate } from "@/lib/booking/domain";
import { loadOverview } from "@/lib/partner/dashboard/service";
const querySchema = z.object({ propertyId: z.string().min(1).max(200), date: z.string().refine(validDate, "Invalid reporting date"), from: z.string().optional(), to: z.string().optional(), range: z.enum(["daily", "weekly", "monthly"]).default("daily") }).refine(q => (!q.from && !q.to) || validPageRange(q.from, q.to), "Choose a range of 1–31 days");
export const GET = withApiHandler(async request => {
  const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  try { return Response.json(await loadOverview(actorFromRequest().uid, input)); }
  catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") throw new ApiException("FORBIDDEN", 403, "Property access required.");
    console.error("partner.overview.failed", error);
    throw new ApiException("OVERVIEW_UNAVAILABLE", 503, "Dashboard is temporarily unavailable. Please retry.");
  }
}, { route: "/api/partner/dashboard/overview", auth: "read", requireAuth: true, cache: "private" });
