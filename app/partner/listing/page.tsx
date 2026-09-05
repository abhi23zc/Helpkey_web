import { PartnerPropertyListingPage } from "@/components/partner/dashboard/partner-property-listing-page";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function Page() {
  await requireAuthenticatedUser();
  return <PartnerPropertyListingPage />;
}
