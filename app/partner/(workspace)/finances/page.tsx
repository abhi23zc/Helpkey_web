"use client";

import { Suspense } from "react";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
import {
  OwnerFinancesPermissionDenied,
  OwnerFinancesWorkspace,
} from "@/components/finances/owner-finances-workspace";

export default function PartnerFinancesPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) =>
        selectedProperty?.role === "owner" ? (
          <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading finances…</div>}>
            <OwnerFinancesWorkspace
              key={selectedProperty.id}
              propertyId={selectedProperty.id}
            />
          </Suspense>
        ) : (
          <OwnerFinancesPermissionDenied />
        )
      }
    </PartnerShell>
  );
}
