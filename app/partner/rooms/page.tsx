import { PartnerRoomsRatesPage } from "@/components/partner/dashboard/partner-rooms-rates-page";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function Page() {
  await requireAuthenticatedUser();
  return <PartnerRoomsRatesPage />;
}
