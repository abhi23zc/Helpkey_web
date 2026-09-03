import { PartnerOnboarding } from "@/components/partner/partner-onboarding";
import { requireAuthenticatedUser } from "@/lib/auth/session";
export default async function Page() { await requireAuthenticatedUser(); return <PartnerOnboarding />; }
