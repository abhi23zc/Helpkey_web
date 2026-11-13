import { PmsInvitationPage } from "@/components/partner/pms-invitation-page";
export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };
export default async function Page({ params }: PageProps<"/partner/invitations/[invitationId]">) { return <PmsInvitationPage invitationId={(await params).invitationId} />; }
