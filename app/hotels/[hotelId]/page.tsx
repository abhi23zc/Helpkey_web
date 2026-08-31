import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HotelDetailPage } from "@/components/hotel/hotel-detail-page";

const hotels = {
  "the-balmoral-hotel": {
    name: "The Balmoral Hotel",
    description:
      "Experience the epitome of Scottish luxury at The Balmoral. Located at Edinburgh's most prestigious address, No. 1 Princes Street, our landmark hotel offers breathtaking views of Edinburgh Castle. Perfectly tailored for the discerning business traveler, we provide seamless connectivity, sophisticated meeting spaces, and unmatched personal service to ensure your stay is as productive as it is comfortable.",
  },
} as const;

export async function generateStaticParams() {
  return Object.keys(hotels).map((hotelId) => ({ hotelId }));
}

export async function generateMetadata(
  props: PageProps<"/hotels/[hotelId]">
): Promise<Metadata> {
  const { hotelId } = await props.params;
  const hotel = hotels[hotelId as keyof typeof hotels];

  if (!hotel) {
    return {
      title: "Hotel not found | Helpkey",
    };
  }

  return {
    title: `${hotel.name} | Helpkey`,
    description: hotel.description,
  };
}

export default async function Page(props: PageProps<"/hotels/[hotelId]">) {
  const { hotelId } = await props.params;

  if (!(hotelId in hotels)) {
    notFound();
  }

  return <HotelDetailPage hotelId={hotelId} />;
}
