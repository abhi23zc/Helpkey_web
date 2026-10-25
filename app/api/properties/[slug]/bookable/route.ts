import { staySearchSchema } from "@/lib/customer/stay-search";
import { loadBookableProperty } from "@/lib/services/public-stay";
import { withApiHandler } from "@/lib/api/handler";

async function get(request: Request, { params }: RouteContext<"/api/properties/[slug]/bookable">) {
  const { slug } = await params;
  const url = new URL(request.url);
  const stay = staySearchSchema.safeParse({ bookingMode: url.searchParams.get("bookingMode") || undefined, arrivalTime: url.searchParams.get("arrivalTime") || undefined, durationMinutes: url.searchParams.get("durationMinutes") || undefined, checkIn: url.searchParams.get("checkIn") || undefined, checkOut: url.searchParams.get("checkOut") || undefined, adults: url.searchParams.get("adults") ?? 2, children: url.searchParams.get("children") ?? 0, infants: url.searchParams.get("infants") ?? 0 });
  if (!stay.success) return Response.json({ error: "INVALID_STAY_SEARCH" }, { status: 422 });
  const result = await loadBookableProperty(slug, stay.data);
  return result ? Response.json({ ...result, serverNow: Date.now() }) : Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
}

export const GET = withApiHandler(get, { route: "/api/properties/[slug]/bookable", cache: "private" });
