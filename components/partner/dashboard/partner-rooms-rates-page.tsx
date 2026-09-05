"use client";

import { PartnerRoomsRatesView } from "./partner-rooms-rates-view";
import { PartnerShell } from "./partner-shell";

export function PartnerRoomsRatesPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) => (
        <PartnerRoomsRatesView
          propertyId={selectedProperty?.id}
          propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
        />
      )}
    </PartnerShell>
  );
}
