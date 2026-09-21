import { homeCatalog } from "@/lib/customer/catalog";
import { cachedPublic } from "@/lib/api/cache";
import { withApiHandler } from "@/lib/api/handler";

async function get() {
  try { return Response.json(await cachedPublic(["home"], homeCatalog)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load homepage." }, { status: 500 }); }
}
export const GET = withApiHandler(get, { route: "/api/home", cache: "public" });
