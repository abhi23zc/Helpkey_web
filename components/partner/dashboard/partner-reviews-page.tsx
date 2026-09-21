"use client";

import { PartnerReviewsView } from "./partner-reviews-view";
import { PartnerShell } from "./partner-shell";

export function PartnerReviewsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) => (
        <PartnerReviewsView
          propertyId={selectedProperty?.id}
          propertyName={selectedProperty?.name ?? "The Balmoral Hotel"}
          propertySlug={selectedProperty?.slug}
        />
      )}
    </PartnerShell>
  );
}
