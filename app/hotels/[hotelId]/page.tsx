export default async function Page(props: PageProps<"/hotels/[hotelId]">) {
  const { hotelId } = await props.params;
  const { LiveHotelDetail } = await import("@/components/hotel/live-hotel-detail");
  return <LiveHotelDetail slug={hotelId} />;
}
