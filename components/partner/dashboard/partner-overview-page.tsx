"use client";

import { PartnerOverviewView } from "./partner-overview-view";
import { PartnerShell } from "./partner-shell";
import { useState } from "react";

export function PartnerOverviewPage() {
  const [overviewLoading, setOverviewLoading] = useState(true);

  return (
    <PartnerShell contentLoading={overviewLoading}>
      {({ selectedProperty, businessName, counts, reportingDate }) => (
        <PartnerOverviewView
          key={selectedProperty?.id ?? "pending-property"}
          selectedProperty={selectedProperty}
          propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
          businessName={businessName ?? "Partner"}
          isLive={counts.isLive}
          health={counts.health}
          reportingDate={reportingDate}
          onInitialLoadingChange={setOverviewLoading}
        />
      )}
    </PartnerShell>
  );
}
