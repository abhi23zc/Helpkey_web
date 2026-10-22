import { BookingCheckout } from "@/components/booking/booking-checkout";
import { checkoutInputFromSearchParams } from "@/lib/booking/checkout";
import { checkoutDisplay } from "@/lib/bookings";

export default async function BookingCheckoutPage({
  searchParams,
}: PageProps<"/booking/checkout">) {
  const input = checkoutInputFromSearchParams(await searchParams);
  const display = input ? await checkoutDisplay(input) : null;
  return <BookingCheckout initialInput={input} initialDisplay={display} />;
}
