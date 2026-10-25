import { catalogSearchFromParams, searchCatalogPage } from "@/lib/customer/catalog";
import { withApiHandler } from "@/lib/api/handler";

export const GET = withApiHandler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  return Response.json(await searchCatalogPage(catalogSearchFromParams(params), { includeClientSnapshot: params.get("includeClientSnapshot") === "true" }));
}, { route: "/api/search/properties", cache: "private" });
