import { validDate } from "@/lib/booking/domain";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";
import { withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { publicHourlyOptions } from "@/lib/services/public-hourly-options";

export const GET = withApiHandler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const destination = params.get("destination") ?? "";
  const checkIn = params.get("checkIn") || undefined;
  if (checkIn && !validDate(checkIn)) throw new ApiException("INVALID_DATE", 422, "Choose a valid arrival date.");
  if (destination.length > 120) throw new ApiException("INVALID_SEARCH", 422, "Choose a valid destination.");
  await enforceRateLimit({ bucket: "hourly-options-ip", identifier: privateFingerprint(clientIp(request)), limit: 60, windowSeconds: 60 });
  return Response.json(await publicHourlyOptions(destination, checkIn));
}, { route: "/api/search/hourly-options", cache: "private" });
