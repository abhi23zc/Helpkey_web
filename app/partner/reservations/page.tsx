import { PartnerDashboard } from "@/components/partner/partner-dashboard";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function Page() {
  await requireAuthenticatedUser();
  return <PartnerDashboard initialTab="Reservations" />;
}
