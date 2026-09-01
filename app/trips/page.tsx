import type { Metadata } from "next";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { MyBookingsPage } from "@/components/trips/my-bookings-page";

export const metadata: Metadata = {
  title: "My Bookings | Helpkey",
  description: "Manage your upcoming hotel stays and review past trips.",
};

export default async function Page() {
  await requireAuthenticatedUser();

  return <MyBookingsPage />;
}
