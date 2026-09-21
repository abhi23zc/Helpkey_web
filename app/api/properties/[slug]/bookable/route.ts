import { staySearchSchema } from "@/lib/customer/stay-search";
import { loadBookableProperty } from "@/lib/services/public-stay";
import { withApiHandler } from "@/lib/api/handler";
import { cachedPublic } from "@/lib/api/cache";

async function get(request: Request, { params }: RouteContext<"/api/properties/[slug]/bookable">) {
  const { slug } = await params;
  const url = new URL(request.url);
  const stay = staySearchSchema.safeParse({ checkIn: url.searchParams.get("checkIn") || undefined, checkOut: url.searchParams.get("checkOut") || undefined, adults: url.searchParams.get("adults") ?? 2, children: url.searchParams.get("children") ?? 0, infants: url.searchParams.get("infants") ?? 0 });
  if (!stay.success) return Response.json({ error: "INVALID_STAY_SEARCH" }, { status: 422 });
  const result = await cachedPublic(["bookable", slug, Buffer.from(JSON.stringify(stay.data)).toString("base64url")], () => loadBookableProperty(slug, stay.data), { freshSeconds: 30, staleSeconds: 60 });
  return result ? Response.json(result) : Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
}

export const GET = withApiHandler(get, { route: "/api/properties/[slug]/bookable", cache: "public" });
