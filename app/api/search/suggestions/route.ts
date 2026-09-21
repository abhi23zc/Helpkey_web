import { searchSuggestions } from "@/lib/customer/catalog";
import { cachedPublic } from "@/lib/api/cache";
import { withApiHandler } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";

async function get(request: Request) {
  await enforceRateLimit({ bucket: "suggestions-ip", identifier: privateFingerprint(clientIp(request)), limit: 120, windowSeconds: 60 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return Response.json({ suggestions: [] });
  try { return Response.json({ suggestions: await cachedPublic(["suggestions", q.trim().toLocaleLowerCase()], () => searchSuggestions(q)) }); }
  catch { return Response.json({ suggestions: [] }, { status: 200 }); }
}
export const GET = withApiHandler(get, { route: "/api/search/suggestions", cache: "public" });
