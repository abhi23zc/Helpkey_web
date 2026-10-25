import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { loadPublicHotel } from "@/lib/services/public-hotel";
import { queryKeys } from "@/lib/query/keys";
import { LiveHotelDetail } from "@/components/hotel/live-hotel-detail";

export default async function Page(props: PageProps<"/hotels/[hotelId]">) {
  const { hotelId } = await props.params;
  const client = new QueryClient();
  // Property content can render before date-specific inventory evaluation.
  await client.prefetchQuery({
    queryKey: queryKeys.property(hotelId),
    queryFn: async () => {
      const property = await loadPublicHotel(hotelId);
      if (!property) throw new Error("PROPERTY_NOT_FOUND");
      return { property };
    },
    staleTime: 60_000,
  });
  return <HydrationBoundary state={dehydrate(client)}><LiveHotelDetail key={hotelId} slug={hotelId} /></HydrationBoundary>;
}
