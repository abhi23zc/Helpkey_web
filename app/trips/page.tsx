import type { Metadata } from "next";
import { MyBookingsPage } from "@/components/trips/my-bookings-page";

export const metadata: Metadata = {
  title: "My Bookings | Helpkey",
  description: "Manage your upcoming hotel stays and review past trips.",
};

export default function Page() {
  return <MyBookingsPage />;
}
