import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile/profile-page";

export const metadata: Metadata = {
  title: "Profile | Helpkey",
  description: "Manage your Helpkey account settings, preferences, and payment methods.",
};

export default function Page() {
  return <ProfilePage />;
}
