"use client";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
import { AccountingWorkspace } from "@/components/accounting/workspace";
export default function Page() {
  return <PartnerShell>{({ selectedProperty }) => selectedProperty?.role === "owner" ? <AccountingWorkspace key={selectedProperty.id} propertyId={selectedProperty.id} owner /> : <p>Only the hotel owner can view accounting.</p>}</PartnerShell>;
}
