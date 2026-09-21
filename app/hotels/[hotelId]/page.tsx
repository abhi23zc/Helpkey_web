import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { catalogPropertyBySlug } from "@/lib/customer/catalog";
import { loadBookableProperty } from "@/lib/services/public-stay";
import { queryKeys } from "@/lib/query/keys";
import { staySearchFromParams } from "@/lib/customer/stay-search";

export default async function Page(props: PageProps<"/hotels/[hotelId]">) {
  const { hotelId } = await props.params;
  const raw = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value)) value.forEach((item) => params.append(key, item)); else if (value !== undefined) params.set(key, value); }
  const stay = staySearchFromParams(params);
  const availability = new URLSearchParams();
  if (stay?.checkIn && stay.checkOut) { availability.set("checkIn", stay.checkIn); availability.set("checkOut", stay.checkOut); availability.set("adults", String(stay.adults)); availability.set("children", String(stay.children)); availability.set("infants", String(stay.infants)); }
  const client = new QueryClient();
  const property = await catalogPropertyBySlug(hotelId);
  await Promise.all([
    ...(property ? [client.prefetchQuery({ queryKey: queryKeys.property(hotelId), queryFn: async () => ({ property }), staleTime: 60_000 })] : []),
    client.prefetchQuery({ queryKey: queryKeys.bookable(hotelId, Object.fromEntries(availability)), queryFn: async () => await loadBookableProperty(hotelId, stay ?? { adults: 2, children: 0, infants: 0 }), staleTime: 60_000 }),
  ]);
  const { LiveHotelDetail } = await import("@/components/hotel/live-hotel-detail");
  return <HydrationBoundary state={dehydrate(client)}><LiveHotelDetail slug={hotelId} /></HydrationBoundary>;
}
