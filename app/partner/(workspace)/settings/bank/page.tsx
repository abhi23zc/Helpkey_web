"use client";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
import { ReadinessWorkspace } from "@/components/payouts/readiness-workspace";
export default function Page() {
  return (
    <PartnerShell>
      {({ selectedProperty }) =>
        selectedProperty?.role === "owner" ? (
          <ReadinessWorkspace
            key={selectedProperty.id}
            propertyId={selectedProperty.id}
            owner
          />
        ) : (
          <p>Only the hotel owner can manage bank details.</p>
        )
      }
    </PartnerShell>
  );
}
