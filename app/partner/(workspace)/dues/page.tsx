"use client";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
import { DuesWorkspace } from "@/components/dues/workspace";
export default function Page() {
  return (
    <PartnerShell>
      {({ selectedProperty }) =>
        selectedProperty?.role === "owner" ? (
          <DuesWorkspace
            key={selectedProperty.id}
            propertyId={selectedProperty.id}
            owner
          />
        ) : (
          <p>Only the hotel owner can view hotel dues.</p>
        )
      }
    </PartnerShell>
  );
}
