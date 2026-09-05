import { PartnerOverviewPage } from "@/components/partner/dashboard/partner-overview-page";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function Page() {
  await requireAuthenticatedUser();
  return <PartnerOverviewPage />;
}
