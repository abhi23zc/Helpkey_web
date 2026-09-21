import { catalogSearchSchema, searchCatalogPage } from "@/lib/customer/catalog";
import { cachedPublic } from "@/lib/api/cache";
import { withApiHandler } from "@/lib/api/handler";

async function get(request: Request) {
  try {
    const url = new URL(request.url);
    const amenities = url.searchParams.getAll("amenity");
    const input = catalogSearchSchema.parse({
      destination: url.searchParams.get("destination") ?? "",
      checkIn: url.searchParams.get("checkIn") || undefined,
      checkOut: url.searchParams.get("checkOut") || undefined,
      adults: url.searchParams.get("adults") ?? 2,
      children: url.searchParams.get("children") ?? 0,
      infants: url.searchParams.get("infants") ?? 0,
      placeId: url.searchParams.get("placeId") || undefined,
      placeName: url.searchParams.get("placeName") || undefined,
      placeAddress: url.searchParams.get("placeAddress") || undefined,
      placeLat: url.searchParams.get("placeLat") || undefined,
      placeLng: url.searchParams.get("placeLng") || undefined,
      amenities,
      propertyType: url.searchParams.get("propertyType") || undefined,
      minPricePaise: url.searchParams.get("minPricePaise") || undefined,
      maxPricePaise: url.searchParams.get("maxPricePaise") || undefined,
      minRating: url.searchParams.get("minRating") || undefined,
      sort: url.searchParams.get("sort") || undefined,
      limit: url.searchParams.get("limit") ?? 24,
      cursor: url.searchParams.get("cursor") || undefined,
    });
    const page = await cachedPublic(["search", Buffer.from(JSON.stringify(input)).toString("base64url")], () => searchCatalogPage(input));
    return Response.json(page);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid search." }, { status: 422 }); }
}

export const GET = withApiHandler(get, { route: "/api/search/properties", cache: "public" });
