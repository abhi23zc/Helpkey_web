import { PartnerReviewsPage } from "@/components/partner/dashboard/partner-reviews-page";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function Page() {
  await requireAuthenticatedUser();
  return <PartnerReviewsPage />;
}
