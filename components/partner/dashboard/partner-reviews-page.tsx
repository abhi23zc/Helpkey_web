"use client";

import { PartnerReviewsView } from "./partner-reviews-view";
import { PartnerShell } from "./partner-shell";

export function PartnerReviewsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) => (
        <PartnerReviewsView
          propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
        />
      )}
    </PartnerShell>
  );
}
