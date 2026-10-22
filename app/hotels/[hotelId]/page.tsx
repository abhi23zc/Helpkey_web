import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { catalogPropertyBySlug } from "@/lib/customer/catalog";
import { loadBookableProperty } from "@/lib/services/public-stay";
import { queryKeys } from "@/lib/query/keys";
import { availabilityParams, staySearchFromParams } from "@/lib/customer/stay-search";

export default async function Page(props: PageProps<"/hotels/[hotelId]">) {
  const { hotelId } = await props.params;
  const raw = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value)) value.forEach((item) => params.append(key, item)); else if (value !== undefined) params.set(key, value); }
  const stay = staySearchFromParams(params);
  const availability = availabilityParams(stay);
  const client = new QueryClient();
  await Promise.all([
    client.prefetchQuery({ queryKey: queryKeys.property(hotelId), queryFn: async () => {
      const property = await catalogPropertyBySlug(hotelId);
      if (!property) throw new Error("PROPERTY_NOT_FOUND");
      return { property };
    }, staleTime: 60_000 }),
    ...(stay ? [client.prefetchQuery({ queryKey: queryKeys.bookable(hotelId, Object.fromEntries(availability)), queryFn: async () => {
      const result = await loadBookableProperty(hotelId, stay);
      if (!result) throw new Error("PROPERTY_NOT_FOUND");
      return result;
    }, staleTime: 30_000 })] : []),
  ]);
  const { LiveHotelDetail } = await import("@/components/hotel/live-hotel-detail");
  return <HydrationBoundary state={dehydrate(client)}><LiveHotelDetail key={hotelId} slug={hotelId} /></HydrationBoundary>;
}
