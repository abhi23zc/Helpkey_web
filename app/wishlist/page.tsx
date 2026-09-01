import type { Metadata } from "next";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { WishlistPage } from "@/components/wishlist/wishlist-page";

export const metadata: Metadata = {
  title: "My Favorites | Helpkey",
  description: "Manage and compare your saved hotel stays with Helpkey.",
};

export default async function Page() {
  await requireAuthenticatedUser();

  return <WishlistPage />;
}
