import { JoinPage } from "@/components/join/join-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Helpkey Partner Portal | List Your Hotel & Earn More",
  description:
    "Join Helpkey as a hotel or property partner host. Manage bookings, set custom rates, and grow your revenue.",
};

export default function Page() {
  return <JoinPage />;
}
