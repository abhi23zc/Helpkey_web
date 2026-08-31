import type { Metadata } from "next";
import { WishlistPage } from "@/components/wishlist/wishlist-page";

export const metadata: Metadata = {
  title: "My Favorites | Helpkey",
  description: "Manage and compare your saved hotel stays with Helpkey.",
};

export default function Page() {
  return <WishlistPage />;
}
