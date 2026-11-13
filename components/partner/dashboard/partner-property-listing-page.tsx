"use client";

import { PartnerPropertyListingView } from "./partner-property-listing-view";
import { PartnerShell } from "./partner-shell";
import { MarketplaceAvailability } from "./marketplace-availability";

export function PartnerPropertyListingPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) => (
        <div className="space-y-5">
        {selectedProperty && <MarketplaceAvailability propertyId={selectedProperty.id} />}
        <PartnerPropertyListingView
          propertyId={selectedProperty?.id}
          propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
        />
        </div>
      )}
    </PartnerShell>
  );
}
