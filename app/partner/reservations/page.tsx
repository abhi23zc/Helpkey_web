import { PartnerReservationsPage } from "@/components/partner/dashboard/partner-reservations-page";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function Page() {
  await requireAuthenticatedUser();
  return <PartnerReservationsPage />;
}
