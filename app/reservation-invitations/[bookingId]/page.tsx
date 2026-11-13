import { CustomerBookingLink } from "@/components/partner/customer-booking-link";
export const metadata = {
  title: "Link hotel reservation | Helpkey",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  return <CustomerBookingLink bookingId={(await params).bookingId} />;
}
