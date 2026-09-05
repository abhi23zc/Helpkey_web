"use client";

import { AlertTriangle, Building2, CheckCircle, ChevronRight, CircleAlert, Clock3, FileCheck, Image as ImageIcon, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminShell } from "./admin-shell";
import { AdminPropertyReviewDrawer } from "./admin-property-review-drawer";
import { useAdminProperties } from "./use-admin-data";
import { label, type Property } from "./types";

export function AdminPropertiesPage() {
  const { searchQuery, setSearchQuery } = useAdminShell();
  const { properties, error, reload } = useAdminProperties();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      {error && <AdminPageError message={error} />}
      <PropertiesPanel
        properties={properties}
        reload={reload}
        onOpen={setSelectedId}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
      {selectedId && (
        <AdminPropertyReviewDrawer
          propertyId={selectedId}
          onClose={() => setSelectedId(null)}
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

function PropertiesPanel({
  properties,
  reload,
  onOpen,
  searchQuery,
  setSearchQuery,
}: {
  properties: Property[];
  reload: () => void;
  onOpen: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [filter, setFilter] = useState<
    "pending" | "changes_requested" | "approved" | "rejected" | "all"
  >("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = {
    all: properties.length,
    pending: properties.filter((item) => item.approvalStatus === "pending")
      .length,
    changes_requested: properties.filter(
      (item) => item.approvalStatus === "changes_requested"
    ).length,
    approved: properties.filter((item) => item.approvalStatus === "approved")
      .length,
    rejected: properties.filter((item) => item.approvalStatus === "rejected")
      .length,
  };

  const propertyTypes = Array.from(
    new Set(properties.map((item) => item.propertyType).filter(Boolean))
  );

  const visible = useMemo(
    () =>
      properties.filter(
        (item) =>
          (filter === "all" ||
            item.approvalStatus === filter ||
            (filter === "approved" && item.status === "active")) &&
          (typeFilter === "all" || item.propertyType === typeFilter) &&
          `${item.name} ${item.address?.city ?? ""} ${item.address?.state ?? ""} ${item.propertyType}`
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      ),
    [properties, searchQuery, filter, typeFilter]
  );

  const selected =
    visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  const reviewTabs: Array<{ key: typeof filter; label: string; count: number }> =
    [
      { key: "pending", label: "Pending Review", count: counts.pending },
      {
        key: "changes_requested",
        label: "Changes Needed",
        count: counts.changes_requested,
      },
      { key: "approved", label: "Approved", count: counts.approved },
      { key: "rejected", label: "Rejected", count: counts.rejected },
      { key: "all", label: "All", count: counts.all },
    ];

  return (
    <div className="animate-in space-y-6 pb-10 fade-in duration-300">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
         
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Property Submission Review
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-500">
             
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-[#755a1a]" /> Refresh
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <PropertyReviewStat
            icon={Clock3}
            label="Awaiting approval"
            value={counts.pending}
            detail="Submitted listings"
          />
          <PropertyReviewStat
            icon={CircleAlert}
            label="Changes needed"
            value={counts.changes_requested}
            detail="Returned to partner"
          />
          <PropertyReviewStat
            icon={CheckCircle}
            label="Catalog ready"
            value={counts.approved}
            detail="Approved properties"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
              {reviewTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
                    filter === tab.key
                      ? "bg-[#0b1f3a] text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      filter === tab.key
                        ? "bg-[#fed88b] text-[#261a00]"
                        : "bg-white text-slate-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-80 ">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search property, city, or type..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#755a1a] focus:ring-2 focus:ring-[#755a1a]/15"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-[#755a1a]"
              >
                <option value="all">All property types</option>
                {propertyTypes.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Queue priority order
            </span>
            <span className="text-[11px] font-semibold text-[#755a1a]">
              {visible.length} shown
            </span>
          </div>
          <div className="space-y-3">
            {visible.map((property) => (
              <PropertyQueueCard
                key={property.id}
                property={property}
                active={selected?.id === property.id}
                onSelect={() => setSelectedId(property.id)}
                onOpen={() => onOpen(property.id)}
              />
            ))}
            {!visible.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                <Search className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-3 font-bold text-slate-900">
                  No properties found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Try another status, type, or search term.
                </p>
              </div>
            )}
          </div>
        </section>

        {selected ? (
          <PropertyReviewWorkspace property={selected} onOpen={onOpen} />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 font-bold text-slate-900">
              Select a property to review
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function PropertyReviewStat({
  icon: Icon,
  label: statLabel,
  value,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#755a1a]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {statLabel}
        </p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

function PropertyQueueCard({
  property,
  active,
  onSelect,
  onOpen,
}: {
  property: Property;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const completeness = propertyCompleteness(property);
  return (
    <article
      className={`relative rounded-2xl border bg-white p-4 shadow-2xs transition-all ${
        active
          ? "border-[#e6c277] ring-2 ring-[#ffdf9f]"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      }`}
    >
     
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0b1f3a] text-sm font-bold text-white shadow-xs">
            {property.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#755a1a]">
                  {label(property.propertyType)}
                </p>
                <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">
                  {property.name}
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {property.address?.city ?? "Location pending"}
                </p>
              </div>
              <PropertyStatusBadge property={property} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-700">
                #{property.id.slice(-6).toUpperCase()}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-700">
                {label(property.status)}
              </span>
              {property.submittedAt && (
                <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold">
                  Submitted
                </span>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>Readiness</span>
                <span
                  className={
                    completeness >= 80
                      ? "text-emerald-700"
                      : completeness >= 50
                      ? "text-amber-800"
                      : "text-slate-600"
                  }
                >
                  {completeness}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    completeness >= 80
                      ? "bg-emerald-600"
                      : completeness >= 50
                      ? "bg-[#755a1a]"
                      : "bg-amber-500"
                  }`}
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-200"
      >
        Full review <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

function PropertyReviewWorkspace({
  property,
  onOpen,
}: {
  property: Property;
  onOpen: (id: string) => void;
}) {
  const completeness = propertyCompleteness(property);
  const city = property.address?.city ?? "Location pending";
  const state =
    property.approvalStatus === "approved"
      ? property.status
      : property.approvalStatus;

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#ffdf9f] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#5b4302]">
                Audit ID: HK-{property.id.slice(-5).toUpperCase()}
              </span>
              <PropertyStatusBadge property={property} />
            </div>
            <h3 className="mt-3 text-2xl font-bold text-slate-900">
              {property.name}
            </h3>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <Building2 className="h-4 w-4 text-[#755a1a]" />
              {city}
              {property.address?.state ? `, ${property.address.state}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpen(property.id)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0b1f3a] px-4 text-sm font-bold text-white transition-colors hover:bg-[#07172b]"
          >
            Open full review <ChevronRight className="h-4 w-4 text-[#fed88b]" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-100 p-4 sm:grid-cols-4">
          <ReviewFact label="Category" value={label(property.propertyType)} />
          <ReviewFact label="Readiness" value={`${completeness}%`} />
          <ReviewFact label="Lifecycle" value={label(property.status)} />
          <ReviewFact label="Review state" value={label(state)} />
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Quality audit checklist
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Use the full review drawer for media, KYC, room, rate, and policy
              decisions.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {completeness}% ready
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ReviewCheck
            label="Core property details"
            complete={property.name !== "Untitled property"}
            detail="Name, type, lifecycle, and owner record"
          />
          <ReviewCheck
            label="Location confirmation"
            complete={Boolean(property.address?.city)}
            detail="Structured address and market city"
          />
          <ReviewCheck
            label="Partner submission"
            complete={Boolean(property.submittedAt)}
            detail="Submitted listing is ready for admin queue"
          />
          <ReviewCheck
            label="Approval decision"
            complete={property.approvalStatus === "approved"}
            detail="Approve, reject, or request changes"
          />
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-900">Review guidance</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <GuidanceTile
            icon={ImageIcon}
            title="Photos"
            detail="Approve images one by one after checking clarity and relevance."
          />
          <GuidanceTile
            icon={FileCheck}
            title="Documents"
            detail="PAN, government ID, and ownership documents remain private."
          />
          <GuidanceTile
            icon={ShieldCheck}
            title="Publish"
            detail="Approval activates only when all required checks pass."
          />
        </div>
      </article>
    </section>
  );
}

function PropertyStatusBadge({ property }: { property: Property }) {
  const value =
    property.approvalStatus === "approved"
      ? property.status
      : property.approvalStatus;
  const classes =
    value === "active" || value === "approved"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : value === "pending"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : value === "changes_requested" || value === "rejected"
      ? "bg-red-50 text-red-800 border-red-200"
      : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${classes}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label(value)}
    </span>
  );
}

function propertyCompleteness(property: Property) {
  let score = 35;
  if (property.name && property.name !== "Untitled property") score += 15;
  if (property.address?.city) score += 15;
  if (property.submittedAt) score += 15;
  if (property.approvalStatus === "pending") score += 10;
  if (property.approvalStatus === "approved") score += 20;
  if (property.approvalStatus === "changes_requested") score -= 5;
  return Math.max(20, Math.min(score, 100));
}

function ReviewFact({
  label: factLabel,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {factLabel}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ReviewCheck({
  label: checkLabel,
  detail,
  complete,
}: {
  label: string;
  detail: string;
  complete: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          complete
            ? "bg-emerald-100 text-emerald-800"
            : "bg-amber-100 text-amber-800"
        }`}
      >
        {complete ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <Clock3 className="h-4 w-4" />
        )}
      </span>
      <div>
        <p className="text-sm font-bold text-slate-900">{checkLabel}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function GuidanceTile({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof ImageIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-[#e9edff] p-4">
      <Icon className="h-5 w-5 text-[#755a1a]" />
      <h4 className="mt-3 text-sm font-bold text-slate-900">{title}</h4>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

