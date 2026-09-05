"use client";

import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Ban, Building2, CalendarDays, CheckCircle, CircleAlert, Clock3, Download, FileCheck, History, ShieldCheck, UserCheck, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi } from "./api";
import { useAdminShell } from "./admin-shell";
import { AdminPropertyReviewDrawer } from "./admin-property-review-drawer";
import { useAdminOverview } from "./use-admin-data";
import { label, type Overview, type Property } from "./types";

type AdminOverviewSection = "Overview" | "Properties" | "Partners" | "Customers";

export function AdminOverviewPage() {
  const router = useRouter();
  const { searchQuery } = useAdminShell();
  const { overview, properties, error, reload } = useAdminOverview();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      {error && <AdminPageError message={error} />}
      <OverviewPanel
        data={overview}
        properties={properties}
        onOpen={setSelectedId}
        onNavigate={(section) => {
          if (section === "Properties") router.push("/admin/properties");
          if (section === "Partners") router.push("/admin/partners");
          if (section === "Customers") router.push("/admin/users");
        }}
        onRefresh={reload}
        searchQuery={searchQuery}
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

function OverviewPanel({
  data,
  properties,
  onOpen,
  onNavigate,
  onRefresh,
  searchQuery,
}: {
  data: Overview | null;
  properties: Property[];
  onOpen: (id: string) => void;
  onNavigate: (section: AdminOverviewSection) => void;
  onRefresh: () => void;
  searchQuery: string;
}) {
  const [velocityTimeframe, setVelocityTimeframe] = useState<"weekly" | "monthly">("weekly");
  const [busyProperty, setBusyProperty] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const metric = data?.metrics ?? {};
  const pending =
    data?.urgentProperties ??
    properties.filter((item) => item.approvalStatus === "pending");

  const filteredProperties = useMemo(() => {
    if (!searchQuery) return properties;
    return properties.filter((p) =>
      `${p.name} ${p.address?.city ?? ""} ${p.propertyType}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    );
  }, [properties, searchQuery]);

  const approveProperty = async (propertyId: string) => {
    setBusyProperty(propertyId);
    setActionError("");
    try {
      await adminApi<unknown>(`/api/admin/properties/${propertyId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      });
      onRefresh();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Unable to approve listing."
      );
    } finally {
      setBusyProperty(null);
    }
  };

  const cards = [
    {
      label: "Total Properties",
      value: properties.length,
      detail: `${pending.length} waiting for review`,
      icon: Building2,
      tint: "bg-blue-50 text-[#0b1f3a]",
    },
    {
      label: "Files To Check",
      value: (metric.pendingPhotos ?? 0) + (metric.pendingDocuments ?? 0),
      detail: "Photos and documents",
      icon: FileCheck,
      tint: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Pending Partners",
      value: metric.partners ?? 0,
      detail: `${metric.pendingListings ?? 0} listing submissions`,
      icon: UserCheck,
      tint: "bg-amber-50 text-amber-800",
    },
    {
      label: "Properties Live",
      value: metric.activeListings ?? 0,
      detail: "Visible to customers",
      icon: Activity,
      tint: "bg-indigo-50 text-indigo-700",
    },
  ];

  return (
    <div className="space-y-5 pb-10 animate-in fade-in duration-300">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Helpkey Admin
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review partners, properties, and files from one dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title="History is not enabled yet."
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-400 shadow-2xs opacity-75"
          >
            <History className="h-4 w-4" />
            History
          </button>
          <button
            type="button"
            disabled
            title="Exports are not enabled yet."
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-400 shadow-2xs opacity-75"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => onNavigate("Customers")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0b1f3a] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#07172b] transition-colors active:scale-95"
          >
            <UserPlus className="h-4 w-4 text-[#fed88b]" />
            Add Admin
          </button>
        </div>
      </header>

      {actionError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <p>{actionError}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Property growth
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  New listings compared with approved live properties.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setVelocityTimeframe("weekly")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    velocityTimeframe === "weekly"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setVelocityTimeframe("monthly")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    velocityTimeframe === "monthly"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div className="mt-5 h-72 w-full overflow-hidden rounded-xl border border-slate-100 bg-white">
              <svg
                viewBox="0 0 760 300"
                className="h-full w-full"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="velocityFill" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#0b1f3a" stopOpacity=".18" />
                    <stop offset="1" stopColor="#0b1f3a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[50, 100, 150, 200, 250].map((line) => (
                  <path
                    key={line}
                    d={`M0 ${line}H700`}
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                  />
                ))}
                {velocityTimeframe === "weekly" ? (
                  <>
                    <path
                      d="M0 230 C70 200 100 95 150 130 S235 160 290 105 S390 145 450 90 S540 125 600 70 S690 125 760 95 L760 300 L0 300 Z"
                      fill="url(#velocityFill)"
                    />
                    <path
                      d="M0 230 C70 200 100 95 150 130 S235 160 290 105 S390 145 450 90 S540 125 600 70 S690 125 760 95"
                      fill="none"
                      stroke="#0b1f3a"
                      strokeWidth="3"
                    />
                    <path
                      d="M0 250 C75 210 125 190 170 170 S260 205 330 165 S410 190 470 150 S550 185 630 135 S700 170 760 150"
                      fill="none"
                      stroke="#c98a21"
                      strokeWidth="2"
                    />
                  </>
                ) : (
                  <>
                    <path
                      d="M0 245 C80 215 140 160 220 170 S340 155 420 110 S560 95 760 60 L760 300 L0 300 Z"
                      fill="url(#velocityFill)"
                    />
                    <path
                      d="M0 245 C80 215 140 160 220 170 S340 155 420 110 S560 95 760 60"
                      fill="none"
                      stroke="#0b1f3a"
                      strokeWidth="3"
                    />
                    <path
                      d="M0 260 C100 225 180 210 270 190 S450 165 760 130"
                      fill="none"
                      stroke="#c98a21"
                      strokeWidth="2"
                    />
                  </>
                )}
              </svg>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#0b1f3a]" />
                  New listings
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-[#c98a21]" />
                  Approved properties
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Updated from live data
              </span>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Recent properties
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("Properties")}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                View all properties
              </button>
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[700px] grid-cols-[.8fr_1.7fr_1fr_1fr_1fr] gap-4 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span>ID</span>
                <span>Property</span>
                <span>Location</span>
                <span>Status</span>
                <span className="text-right">Action</span>
              </div>
              {filteredProperties.slice(0, 5).map((property) => (
                <button
                  type="button"
                  key={property.id}
                  onClick={() => onOpen(property.id)}
                  className="grid w-full min-w-[700px] grid-cols-[.8fr_1.7fr_1fr_1fr_1fr] items-center gap-4 border-t border-slate-100 px-5 py-3 text-left text-xs transition-colors hover:bg-slate-50"
                >
                  <b className="font-mono text-slate-900">
                    #{property.id.slice(-6).toUpperCase()}
                  </b>
                  <span className="min-w-0">
                    <b className="block truncate text-slate-900">{property.name}</b>
                    <small className="text-slate-500">
                      {label(property.propertyType)}
                    </small>
                  </span>
                  <span className="text-slate-600">
                    {property.address?.city ?? "—"}
                  </span>
                  <span className="w-fit rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                    {label(property.approvalStatus)}
                  </span>
                  <span className="justify-self-end font-bold text-[#0b1f3a]">
                    Review
                  </span>
                </button>
              ))}
              {!filteredProperties.length && (
                <p className="py-8 text-center text-sm text-slate-500">
                  No listing activity found.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Approval queue</h3>
              <button
                type="button"
                onClick={() => onNavigate("Properties")}
                className="text-xs font-bold text-[#0b1f3a] hover:text-[#755a1a]"
              >
                View all
              </button>
            </div>
            <div>
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    Partner verification
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                    {pending.length}
                  </span>
                </div>
              </div>
              {pending.slice(0, 4).map((property) => (
                <div
                  key={property.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-800">
                    {property.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {property.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {property.address?.city ?? "Location pending"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busyProperty === property.id}
                      onClick={() => void approveProperty(property.id)}
                      className="rounded-lg bg-[#0b1f3a] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(property.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Review
                    </button>
                  </div>
                </div>
              ))}
              {!pending.length && (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Nothing is waiting for approval.
                </p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Support tickets</h3>
              <button
                type="button"
                disabled
                className="text-xs font-bold text-slate-400"
                title="Support ticket module is not connected yet."
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                {
                  icon: CircleAlert,
                  title: "Payment not received",
                  status: "Open",
                  tone: "bg-red-50 text-red-600 ring-red-100",
                  statusTone: "bg-red-50 text-red-700",
                },
                {
                  icon: Clock3,
                  title: "Property photos not updating",
                  status: "In progress",
                  tone: "bg-amber-50 text-amber-700 ring-amber-100",
                  statusTone: "bg-amber-50 text-amber-800",
                },
                {
                  icon: Users,
                  title: "Partner onboarding issue",
                  status: "Open",
                  tone: "bg-blue-50 text-blue-700 ring-blue-100",
                  statusTone: "bg-blue-50 text-blue-700",
                },
                {
                  icon: CheckCircle,
                  title: "Cancellation policy clarification",
                  status: "Resolved",
                  tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
                  statusTone: "bg-emerald-50 text-emerald-700",
                },
              ].map(({ icon: ItemIcon, title, status, tone, statusTone }) => {
                return (
                  <div
                    key={title}
                    className="flex items-center gap-3 px-5 py-4"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}
                    >
                      <ItemIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {title}
                      </p>
                      <p className="text-xs text-slate-500">Internal support</p>
                    </div>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone}`}
                    >
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Quick actions</h3>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <CommandCard
                icon={UserCheck}
                title="Partners"
                detail="Review partner accounts"
                onClick={() => onNavigate("Partners")}
              />
              <CommandCard
                icon={Building2}
                title="Properties"
                detail="Review submissions"
                onClick={() => onNavigate("Properties")}
              />
              <CommandCard
                icon={CalendarDays}
                title="Bookings"
                detail="Coming soon"
                disabled
              />
              <CommandCard
                icon={Ban}
                title="Block access"
                detail={`${metric.suspendedAccounts ?? 0} blocked`}
                onClick={() => onNavigate("Customers")}
                danger
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({
  label: cardLabel,
  value,
  detail,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Building2;
  tint: string;
}) {
  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {cardLabel}
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold transition-transform group-hover:scale-110 ${tint}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function CommandCard({
  icon: Icon,
  title,
  detail,
  onClick,
  danger,
  disabled,
}: {
  icon: typeof ShieldCheck;
  title: string;
  detail: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl p-3 text-left transition-all ${
        danger
          ? "bg-red-50 text-red-900 border border-red-100 hover:bg-red-100"
          : "bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-50" : "active:scale-95"}`}
    >
      <Icon className="h-4 w-4 text-[#755a1a]" />
      <b className="mt-1.5 block text-xs leading-tight font-bold">{title}</b>
      <span className="mt-0.5 block text-[10px] opacity-75">{detail}</span>
    </button>
  );
}
