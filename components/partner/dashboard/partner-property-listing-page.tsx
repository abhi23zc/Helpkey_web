"use client";

import { PartnerPropertyListingView } from "./partner-property-listing-view";
import { PartnerShell } from "./partner-shell";

export function PartnerPropertyListingPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) => (
        <div className="space-y-4">
          <PartnerPropertyListingView
            propertyId={selectedProperty?.id}
            propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
          />
        </div>
      )}
    </PartnerShell>
  );
}
