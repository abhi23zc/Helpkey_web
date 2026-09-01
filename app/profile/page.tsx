import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile/profile-page";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Profile | Helpkey",
  description: "Manage your Helpkey account settings, preferences, and payment methods.",
};

export default async function Page() {
  const user = await requireAuthenticatedUser();

  return <ProfilePage user={user} />;
}
