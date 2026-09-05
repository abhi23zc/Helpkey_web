"use client";

import { PartnerReservationsView } from "./partner-reservations-view";
import { PartnerShell } from "./partner-shell";

export function PartnerReservationsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) => (
        <PartnerReservationsView
          propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
        />
      )}
    </PartnerShell>
  );
}
