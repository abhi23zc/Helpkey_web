"use client";
import { AccountWorkspace } from "@/components/finance/account-workspace";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
import { FinanceWorkspace } from "@/components/finance/workspace";
export default function Page() {
  return (
    <PartnerShell>
      {(data) => (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
          <h1 className="text-3xl font-bold">Finance</h1>
          {data.selectedProperty?.permissions?.includes("finance.read") ? (
            <><FinanceWorkspace
              key={data.selectedPropertyId}
              propertyId={data.selectedPropertyId}
            /><AccountWorkspace key={`account-${data.selectedPropertyId}`} propertyId={data.selectedPropertyId} /></>
          ) : (
            <p>Hotel owner access is required to view finance.</p>
          )}
        </div>
      )}
    </PartnerShell>
  );
}
