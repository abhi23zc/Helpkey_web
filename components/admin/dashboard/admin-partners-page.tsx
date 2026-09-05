"use client";

import { AlertTriangle, ArrowRight, BadgeCheck, Ban, CheckCircle, Clock3, Eye, FileCheck, FileText, Image as ImageIcon, Landmark, RefreshCw, Search, ShieldCheck, SortDesc, Timer, UserCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi } from "./api";
import { useAdminShell } from "./admin-shell";
import { AdminPropertyReviewDrawer } from "./admin-property-review-drawer";
import { useAdminProperties, useAdminUsers } from "./use-admin-data";
import { label, type PartnerListItem, type Property, type User } from "./types";

export function AdminPartnersPage() {
  const { searchQuery, setSearchQuery } = useAdminShell();
  const usersData = useAdminUsers();
  const propertiesData = useAdminProperties();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const error = usersData.error || propertiesData.error;
  const reload = () => {
    void usersData.reload();
    void propertiesData.reload();
  };

  return (
    <>
      {error && <AdminPageError message={error} />}
      <PartnersPanel
        users={usersData.users}
        properties={propertiesData.properties}
        reload={reload}
        onOpenProperty={setSelectedPropertyId}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
      {selectedPropertyId && (
        <AdminPropertyReviewDrawer
          propertyId={selectedPropertyId}
          onClose={() => setSelectedPropertyId(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}

function AdminPageError({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
      <p>{message}</p>
    </div>
  );
}

function PartnersPanel({
  users,
  properties,
  reload,
  onOpenProperty,
  searchQuery,
  setSearchQuery,
}: {
  users: User[];
  properties: Property[];
  reload: () => void;
  onOpenProperty: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [filter, setFilter] = useState<
    "pending" | "approved" | "changes_requested" | "suspended" | "all"
  >("pending");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sortUrgency, setSortUrgency] = useState(false);
  const [dossierDrawerOpen, setDossierDrawerOpen] = useState(false);

  const partners = useMemo(
    () =>
      users
        .filter((item) => item.roles.includes("partner"))
        .map((user): PartnerListItem => {
          const partnerProperties = properties.filter(
            (property) => property.partnerId === user.uid
          );
          const pendingCount = partnerProperties.filter(
            (property) => property.approvalStatus === "pending"
          ).length;
          const changesCount = partnerProperties.filter(
            (property) => property.approvalStatus === "changes_requested"
          ).length;
          const activeCount = partnerProperties.filter(
            (property) => property.status === "active"
          ).length;
          const primaryProperty = partnerProperties[0] ?? null;
          const city = primaryProperty?.address?.city ?? "Location pending";
          const progress =
            user.accountStatus === "suspended"
              ? 2
              : pendingCount > 0
              ? 4
              : activeCount > 0
              ? 5
              : 3;
          const state: PartnerListItem["state"] =
            user.accountStatus === "suspended"
              ? "suspended"
              : changesCount > 0
              ? "changes_requested"
              : pendingCount > 0
              ? "pending"
              : activeCount > 0
              ? "approved"
              : "all";

          const risk: PartnerListItem["risk"] =
            user.accountStatus === "suspended"
              ? "High"
              : changesCount > 0
              ? "Medium"
              : "Low";

          return {
            user,
            partnerProperties,
            pendingCount,
            changesCount,
            activeCount,
            primaryProperty,
            city,
            progress,
            state,
            risk,
          };
        }),
    [properties, users]
  );

  const counts = {
    all: partners.length,
    pending: partners.filter((item) => item.state === "pending").length,
    approved: partners.filter((item) => item.state === "approved").length,
    changes_requested: partners.filter(
      (item) => item.state === "changes_requested"
    ).length,
    suspended: partners.filter((item) => item.state === "suspended").length,
  };

  const visible = useMemo(() => {
    let list = partners.filter((item) => {
      const matchesFilter = filter === "all" || item.state === filter;
      const matchesSearch = [
        item.user.fullName,
        item.user.email,
        item.user.phoneNumber,
        item.user.uid,
        item.primaryProperty?.name,
        item.city,
      ]
        .filter(Boolean)
        .some((val) =>
          String(val).toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesFilter && matchesSearch;
    });

    if (sortUrgency) {
      list = [...list].sort((a, b) => b.pendingCount - a.pendingCount);
    }
    return list;
  }, [partners, filter, searchQuery, sortUrgency]);

  const selected =
    visible.find((item) => item.user.uid === selectedUid) ?? visible[0] ?? null;

  const handleSelectPartner = (uid: string) => {
    setSelectedUid(uid);
    setDossierDrawerOpen(true);
  };

  const mutate = async (user: User, patch: Record<string, unknown>) => {
    setBusy(user.uid);
    setError("");
    try {
      await adminApi<unknown>(`/api/admin/users/${user.uid}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update partner."
      );
    } finally {
      setBusy(null);
    }
  };

  const tabs: Array<{
    key: typeof filter;
    label: string;
    count: number;
  }> = [
    { key: "pending", label: "Pending Review", count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    {
      key: "changes_requested",
      label: "Changes Requested",
      count: counts.changes_requested,
    },
    { key: "suspended", label: "Suspended", count: counts.suspended },
    { key: "all", label: "All Partners", count: counts.all },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#755a1a]">
              <span>Institutional Compliance</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#755a1a]" />
              <span className="normal-case tracking-normal text-slate-500 font-normal">
                KYC / AML Protocol 3.4
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Partner Verification
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-500">
              Review partner accounts, listing portfolios, and compliance status from one focused queue.
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-[#0b1f3a] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#07172b] transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-[#fed88b]" />
            Refresh
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <PartnerStatCard
            icon={Clock3}
            label="Pending Review"
            value={counts.pending}
            detail="Needs admin action"
          />
          <PartnerStatCard
            icon={BadgeCheck}
            label="Verified"
            value={counts.approved}
            detail="Active partner portfolios"
          />
          <PartnerStatCard
            icon={Ban}
            label="Suspended"
            value={counts.suspended}
            detail="Access restricted"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-2xs border border-slate-200 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                  filter === tab.key
                    ? "bg-[#0b1f3a] text-white shadow-xs"
                    : "text-slate-600 hover:bg-white/70"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    filter === tab.key
                      ? "bg-[#fed88b] text-[#261a00] font-bold"
                      : "bg-white text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search partner, property, city..."
                className="h-9 w-full rounded-xl bg-slate-50 pl-10 pr-4 text-xs outline-none border border-slate-200 focus:border-[#755a1a]"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortUrgency((prev) => !prev)}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold border transition-colors ${
                sortUrgency
                  ? "bg-[#0b1f3a] text-white border-[#0b1f3a]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <SortDesc className="h-4 w-4 text-[#755a1a]" />
              {sortUrgency ? "Sorted by SLA" : "SLA Urgency"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Table + Dossier Container */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/70 px-4 py-3 border-b border-slate-200 text-xs text-slate-600">
            <label className="flex items-center gap-2.5 font-bold uppercase tracking-wider text-[10px]">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-[#0b1f3a]" />
              Batch Selection
            </label>
            <span className="text-slate-500">
              Showing {visible.length ? "1" : "0"}-{visible.length} of{" "}
              {counts[filter]} submissions
            </span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 font-bold">
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">Partner / Entity</th>
                  <th className="px-4 py-3">Verification Docs</th>
                  <th className="px-4 py-3">Portfolio</th>
                  <th className="px-4 py-3">Risk Level</th>
                  <th className="px-4 py-3 text-right">Intake</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((item) => (
                  <PartnerLedgerRow
                    key={item.user.uid}
                    item={item}
                    active={selected?.user.uid === item.user.uid}
                    onSelect={() => handleSelectPartner(item.user.uid)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="divide-y divide-slate-100 lg:hidden">
            {visible.map((item) => (
              <button
                type="button"
                key={item.user.uid}
                onClick={() => handleSelectPartner(item.user.uid)}
                className={`w-full p-4 text-left transition-colors ${
                  selected?.user.uid === item.user.uid ? "bg-slate-100" : "bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <PartnerAvatar name={item.user.fullName} active={selected?.user.uid === item.user.uid} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">
                          {item.user.fullName || "Unnamed partner"}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.primaryProperty?.name ?? "No property linked"}{" "}
                          · {item.city}
                        </p>
                      </div>
                      <PartnerRisk risk={item.risk} />
                    </div>
                    <div className="mt-2">
                      <PartnerProgress progress={item.progress} />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!visible.length && (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="font-bold text-slate-900">
                No partners match this view
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Adjust search query or choose another status tab.
              </p>
            </div>
          )}

          {/* Table Footer Stats Bar */}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#755a1a]" />
                <b>{counts.approved}</b> verified portfolios
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#e6c277]" />
                <b>{counts.pending + counts.changes_requested}</b> pending escalations
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Protocol v3.4 Active
            </span>
          </div>
        </section>

        {/* Desktop Dossier Panel (XL Screens) */}
        <aside className="hidden xl:block space-y-4">
          {selected ? (
            <PartnerDossier
              item={selected}
              busy={busy === selected.user.uid}
              onOpenProperty={onOpenProperty}
              onMutate={mutate}
            />
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xs">
              <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-bold text-slate-900">
                Select a partner to view details
              </p>
            </section>
          )}
        </aside>
      </div>

      {/* Slide-over Drawer Modal for Dossier on Mobile & Tablet (< xl) */}
      {dossierDrawerOpen && selected && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setDossierDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-slate-50 p-4 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-base font-bold text-slate-900">Partner Dossier</h3>
              <button
                type="button"
                onClick={() => setDossierDrawerOpen(false)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PartnerDossier
              item={selected}
              busy={busy === selected.user.uid}
              onOpenProperty={(id) => {
                setDossierDrawerOpen(false);
                onOpenProperty(id);
              }}
              onMutate={mutate}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerStatCard({
  icon: Icon,
  label: statLabel,
  value,
  detail,
}: {
  icon: typeof Timer;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#755a1a]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {statLabel}
        </p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function PartnerLedgerRow({
  item,
  active,
  onSelect,
}: {
  item: PartnerListItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer transition-colors ${
        active ? "bg-blue-50/70" : "hover:bg-slate-50"
      }`}
    >
      <td className="relative px-4 py-3.5 text-center">
        {active && (
          <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#755a1a]" />
        )}
        <input
          type="checkbox"
          checked={active}
          onChange={onSelect}
          className="h-4 w-4 rounded border-slate-300 text-[#0b1f3a]"
        />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <PartnerAvatar name={item.user.fullName} active={active} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-bold text-slate-900">
                {item.user.fullName || "Unnamed partner"}
              </span>
              {item.activeCount > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 border border-amber-200">
                  Live
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {item.primaryProperty?.name ?? "Property onboarding"} · {item.city}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-[#755a1a] truncate">
              {item.user.email ?? item.user.phoneNumber ?? item.user.uid}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <PartnerProgress progress={item.progress} />
      </td>
      <td className="px-4 py-3.5">
        <p className="text-xs font-bold text-slate-900">
          {item.partnerProperties.length} listings
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {item.pendingCount} pending · {item.activeCount} live
        </p>
      </td>
      <td className="px-4 py-3.5">
        <PartnerRisk risk={item.risk} />
      </td>
      <td className="px-4 py-3.5 text-right">
        <button
          type="button"
          className={`ml-auto flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
            active ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function PartnerDossier({
  item,
  busy,
  onOpenProperty,
  onMutate,
}: {
  item: PartnerListItem;
  busy: boolean;
  onOpenProperty: (id: string) => void;
  onMutate: (user: User, patch: Record<string, unknown>) => Promise<void>;
}) {
  const nextProperty =
    item.partnerProperties.find(
      (property) => property.approvalStatus === "pending"
    ) ?? item.primaryProperty;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-1.5 bg-[#0b1f3a]" />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <PartnerAvatar name={item.user.fullName} active size="large" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {item.user.fullName || "Unnamed partner"}
              </h3>
              <PartnerStatus state={item.state} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500 truncate">
              {item.user.email ?? item.user.phoneNumber ?? item.user.uid}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 truncate">
              {item.primaryProperty?.name ?? "No linked property"} · {item.city}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 border border-slate-100">
          <DossierMetric label="Listings" value={item.partnerProperties.length} />
          <DossierMetric label="Pending Review" value={item.pendingCount} />
          <DossierMetric label="Live Portfolio" value={item.activeCount} />
          <DossierMetric label="Risk Level" value={item.risk} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              KYC & Verification Dossier
            </h4>
            <span className="text-xs font-bold text-[#755a1a]">
              {item.progress} / 5 verified
            </span>
          </div>
          <div className="mt-2.5 space-y-2">
            {[
              ["Government ID", item.progress >= 1, FileCheck],
              ["PAN / Tax record", item.progress >= 2, Landmark],
              ["Ownership proof", item.progress >= 3, FileText],
              ["Property photos", item.progress >= 4, ImageIcon],
              ["Final sign-off", item.progress >= 5, CheckCircle],
            ].map(([name, complete, Icon]) => {
              const ItemIcon = Icon as typeof FileCheck;
              return (
                <div
                  key={String(name)}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 border border-slate-100"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#755a1a] shadow-2xs border border-slate-200">
                    <ItemIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {String(name)}
                    </p>
                    <p
                      className={`text-[10px] font-semibold ${
                        complete ? "text-emerald-700" : "text-amber-800"
                      }`}
                    >
                      {complete ? "Verified" : "Action Needed"}
                    </p>
                  </div>
                  {complete ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {nextProperty && (
            <button
              type="button"
              onClick={() => onOpenProperty(nextProperty.id)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#07172b]"
            >
              <Eye className="h-4 w-4 text-[#fed88b]" />
              Review linked property
            </button>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onMutate(item.user, {
                  accountStatus:
                    item.user.accountStatus === "active"
                      ? "suspended"
                      : "active",
                })
              }
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-colors disabled:opacity-50 ${
                item.user.accountStatus === "active"
                  ? "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              {item.user.accountStatus === "active" ? (
                <Ban className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {item.user.accountStatus === "active" ? "Suspend" : "Reactivate"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onMutate(item.user, {
                  roles: item.user.roles.includes("admin")
                    ? item.user.roles.filter((role) => role !== "admin")
                    : [...item.user.roles, "admin"],
                })
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-100 border border-amber-200 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-200 transition-colors disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              {item.user.roles.includes("admin") ? "Remove admin" : "Make admin"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerAvatar({
  name,
  active,
  size = "default",
}: {
  name: string;
  active?: boolean;
  size?: "default" | "large";
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl font-bold border ${
        size === "large" ? "h-11 w-11 text-lg" : "h-9 w-9 text-xs"
      } ${
        active
          ? "bg-[#0b1f3a] text-white border-[#0b1f3a]"
          : "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {(name || "P").charAt(0).toUpperCase()}
    </span>
  );
}

function PartnerProgress({ progress }: { progress: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
        <span>{progress} / 5 Verification</span>
      </div>
      <div className="mt-1 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-slate-100 border border-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            progress < 3
              ? "bg-red-600"
              : progress < 5
              ? "bg-amber-500"
              : "bg-emerald-600"
          }`}
          style={{ width: `${Math.min(progress, 5) * 20}%` }}
        />
      </div>
    </div>
  );
}

function PartnerRisk({ risk }: { risk: "Low" | "Medium" | "High" }) {
  const className =
    risk === "High"
      ? "bg-red-100 text-red-900 border-red-200"
      : risk === "Medium"
      ? "bg-amber-100 text-amber-900 border-amber-200"
      : "bg-emerald-50 text-emerald-800 border-emerald-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {risk} Risk
    </span>
  );
}

function PartnerStatus({ state }: { state: PartnerListItem["state"] }) {
  const text = state === "changes_requested" ? "Changes requested" : label(state);
  return (
    <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
      {text}
    </span>
  );
}

function DossierMetric({
  label: metricLabel,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-slate-500">{metricLabel}</p>
      <p className="mt-0.5 text-xs font-bold text-slate-900">{value}</p>
    </div>
  );
}
