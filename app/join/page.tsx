import { JoinPage } from "@/components/join/join-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "List Your Property on Helpkey | Join as a Partner Host",
  description:
    "Earn more from every stay. Reach business travelers, families, and couples with Helpkey's hotel & property partner platform.",
};

export default function Page() {
  return <JoinPage />;
}
