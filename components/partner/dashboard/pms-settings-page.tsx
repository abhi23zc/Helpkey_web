"use client";

import Link from "next/link";
import { FinanceWorkspace } from "@/components/finance-settings/workspace";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { PartnerShell } from "./partner-shell";
import { InvoiceSettingsEditor } from "./invoice-settings";
import {
  canAccessSection,
  errorMessage,
  pmsButton,
  pmsCard,
  pmsInput,
  settingsHref,
  SettingsSubpageHeader,
  stateLabels,
  usePmsStatus,
  type PmsStatus,
  type SettingsSection,
} from "./settings/settings-shared";
import { SettingsHub } from "./settings/settings-hub";
import { PmsSetupSection } from "./settings/pms-setup-section";
import { OperationalPoliciesSection } from "./settings/operational-policies-section";
import { TeamAccessSection } from "./settings/team-access-section";
import { RoomNumbersSection } from "./settings/room-numbers-section";
import { ActivityLogSection } from "./settings/activity-log-section";

export { pmsButton, pmsCard, pmsInput, stateLabels, type PmsStatus };

function resolveQuerySection(value: string | null): SettingsSection {
  switch (value) {
    case "pms":
    case "setup":
      return "pms";
    case "policies":
      return "policies";
    case "team":
      return "team";
    case "rooms":
      return "rooms";
    case "invoices":
      return "invoices";
    case "finance":
      return "finance";
    case "activity":
      return "activity";
    default:
      return "hub";
  }
}

function SettingsWorkspace({
  propertyId,
  propertyName,
  forcedSection,
}: {
  propertyId: string;
  propertyName?: string;
  forcedSection?: SettingsSection;
}) {
  const params = useSearchParams();
  const section = forcedSection ?? resolveQuerySection(params.get("section"));
  const query = usePmsStatus(propertyId);

  if (query.isPending) {
    return (
      <div className={pmsCard} role="status">
        <p className="text-sm font-medium text-slate-500">
          Checking this hotel’s PMS setup…
        </p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-800"
        role="alert"
      >
        <span>{errorMessage(query.error)}</span>
        <button
          type="button"
          className={pmsButton}
          onClick={() => void query.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  const data = query.data;

  if (!canAccessSection(section, data)) {
    return (
      <section
        role="alert"
        className={`${pmsCard} flex flex-col items-start gap-4`}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e9ddc1] bg-[#fbf5e8] text-[#936c22]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#061224]">
              This settings section is not available for your role
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ask the hotel owner if you need access to this configuration area.
            </p>
          </div>
        </div>
        <Link href={settingsHref("hub", propertyId)} className={pmsButton}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Hotel settings
        </Link>
      </section>
    );
  }

  switch (section) {
    case "finance":
      return <div className="space-y-5"><SettingsSubpageHeader propertyId={propertyId} section="finance" title="Finance Settings" description="View your hotel’s commercial agreement with HelpKey." data={data} /><FinanceWorkspace propertyId={propertyId} owner /></div>;
    case "hub":
      return (
        <SettingsHub
          propertyId={propertyId}
          propertyName={propertyName}
          data={data}
        />
      );
    case "pms":
      return (
        <PmsSetupSection
          propertyId={propertyId}
          propertyName={propertyName}
          data={data}
        />
      );
    case "policies":
      return (
        <OperationalPoliciesSection
          propertyId={propertyId}
          propertyName={propertyName}
          data={data}
        />
      );
    case "team":
      return (
        <TeamAccessSection
          propertyId={propertyId}
          propertyName={propertyName}
          data={data}
        />
      );
    case "rooms":
      return (
        <RoomNumbersSection
          propertyId={propertyId}
          propertyName={propertyName}
          data={data}
        />
      );
    case "activity":
      return (
        <ActivityLogSection
          propertyId={propertyId}
          propertyName={propertyName}
          data={data}
        />
      );
    case "invoices":
      return (
        <div className="space-y-6 pb-10 text-[#061224]">
          <SettingsSubpageHeader
            propertyId={propertyId}
            propertyName={propertyName}
            section="invoices"
            title="Invoice & GST Settings"
            description="Configure India GST registration, seller identity, numbering series, and authorized signatory."
            data={data}
          />
          <InvoiceSettingsEditor
            key={propertyId}
            propertyId={propertyId}
            pmsStatus={data}
          />
        </div>
      );
  }
}

export function PmsSettingsPage({ section }: { section?: SettingsSection }) {
  return (
    <PartnerShell>
      {({ selectedProperty }) =>
        selectedProperty ? (
          <SettingsWorkspace
            propertyId={selectedProperty.id}
            propertyName={selectedProperty.name}
            forcedSection={section}
          />
        ) : (
          <div className={pmsCard}>
            <p className="text-sm font-medium text-slate-600">
              No assigned hotel. Ask the hotel owner for an invitation.
            </p>
          </div>
        )
      }
    </PartnerShell>
  );
}
