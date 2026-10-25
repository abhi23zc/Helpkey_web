import "server-only";
import { cachedPublic } from "@/lib/api/cache";
import { catalogPropertyBySlug } from "@/lib/customer/catalog";

/** The page and API share publication/lifecycle invalidation and freshness. */
export function loadPublicHotel(slug: string) {
  return cachedPublic(["property", slug], () => catalogPropertyBySlug(slug));
}
