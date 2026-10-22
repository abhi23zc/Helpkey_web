import { catalogSearchFromParams, searchCatalogPage } from "@/lib/customer/catalog";
import { withApiHandler } from "@/lib/api/handler";

export const GET = withApiHandler(async (request: Request) => {
  return Response.json(await searchCatalogPage(catalogSearchFromParams(new URL(request.url).searchParams)));
}, { route: "/api/search/properties", cache: "private" });
