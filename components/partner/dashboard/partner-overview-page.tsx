"use client";

import { PartnerOverviewView } from "./partner-overview-view";
import { PartnerShell } from "./partner-shell";

export function PartnerOverviewPage() {
  return (
    <PartnerShell>
      {({ selectedProperty, businessName, counts }) => (
        <PartnerOverviewView
          selectedProperty={selectedProperty}
          propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
          businessName={businessName ?? "Partner"}
          isLive={counts.isLive}
          health={counts.health}
        />
      )}
    </PartnerShell>
  );
}
