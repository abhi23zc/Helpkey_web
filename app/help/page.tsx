import type { Metadata } from "next";
import { HelpPage } from "@/components/help/help-page";

export const metadata: Metadata = {
  title: "Help & Support | Helpkey",
  description: "Find answers about bookings, payments, business travel, and support.",
};

export default function Page() {
  return <HelpPage />;
}
