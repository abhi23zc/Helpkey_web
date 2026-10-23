import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingItineraryPage } from "@/components/trips/booking-itinerary-page";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { bookingForGuest } from "@/lib/bookings";

export const metadata: Metadata = {
  title: "Booking Details | Helpkey",
  description: "View your confirmed hotel booking, payment details, and arrival information.",
};

export default async function Page({ params }: PageProps<"/trips/[bookingId]">) {
  const user = await requireAuthenticatedUser();
  const { bookingId } = await params;
  let booking;

  try {
    booking = await bookingForGuest(user.uid, bookingId);
  } catch {
    notFound();
  }

  return <BookingItineraryPage initialBooking={booking} />;
}
