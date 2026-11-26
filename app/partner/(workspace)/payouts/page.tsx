"use client";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
import { PayoutWorkspace } from "@/components/payouts/workspace";
export default function Page() {
  return <PartnerShell>{({ selectedProperty }) => selectedProperty?.role === "owner" ? <PayoutWorkspace key={selectedProperty.id} propertyId={selectedProperty.id} owner /> : <p>Only the hotel owner can view payouts.</p>}</PartnerShell>;
}
