"use client";
/* eslint-disable @next/next/no-img-element */
import { resolveResponse } from "@/lib/stay/response";
import { OfferingGuestPreview } from "./offering-guest-preview";
import { offeringPriceLabel } from "@/lib/stay/pricing";
import { OfferingFields, TemplateLibrary } from "./offering-fields";
import { useEffect, useId, useRef, useState } from "react";
import {
  Loader2,
  LayoutGrid,
  List,
  Plus,
  Search,
  Sparkles,
  Clock3,
  CheckCircle2,
  SlidersHorizontal,
  Zap,
  Copy,
  Pencil,
  Pause,
  Play,
  Gift,
  PauseCircle,
  IndianRupee,
  Building2,
  Moon,
  Clock,
} from "lucide-react";
import { Drawer } from "@/components/partner/dashboard/drawer";
import { CategoryIcon } from "./category-icon";
import { PartnerRequestQueue } from "./partner-request-queue";
import { catalogRows, noticeLabel } from "@/lib/stay/workspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/customer/offer";
import {
  type Offering,
  type OfferingInput,
  offeringSchema,
  offeringCategories,
  offeringCategoryLabels,
  offeringCategory,
} from "@/lib/stay/contracts";
import { TravelerChips } from "./personalization-picker";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
const initial: OfferingInput = {
  name: "",
  description: "",
  kind: "item",
  travelerCategories: [],
  roomTypeIds: [],
  bookingModes: ["overnight", "hourly"],
  unitPricePaise: 0,
  maxQuantity: 1,
  advanceNoticeMinutes: 0,
  confirmation: "approval",
  variants: [],
  status: "active",
};
export function PartnerCustomizationsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty, currency }) =>
        selectedProperty ? (
          <Customizations
            key={selectedProperty.id}
            propertyId={selectedProperty.id}
            propertyName={selectedProperty.name}
            currency={currency}
            timezone={selectedProperty.timezone || "Asia/Kolkata"}
          />
        ) : (
          <p>Select or create a property first.</p>
        )
      }
    </PartnerShell>
  );
}

function OfferingsSkeleton() {
  return (
    <div role="status" aria-label="Loading offerings" className="space-y-5">
      <span className="sr-only">Loading offerings…</span>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 w-24 rounded-xl bg-slate-100" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 rounded bg-slate-100" />
                <div className="h-11 rounded-xl bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-3 w-3/4 rounded bg-slate-200/60" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="w-2/3 space-y-2">
                  <div className="h-3 w-32 max-w-full rounded bg-slate-100" />
                  <div className="h-4 w-3/4 rounded bg-slate-200/70" />
                </div>
                <div className="h-6 w-14 rounded-full bg-emerald-50" />
              </div>
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-16 rounded bg-slate-200/70" />
              <div className="space-y-2">
                <div className="h-3 w-2/3 rounded bg-slate-100" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
              </div>
              <div className="flex gap-2 pt-4">
                {[0, 1, 2].map((j) => <div key={j} className="h-11 w-20 rounded-xl bg-slate-100" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Customizations({
  propertyId,
  propertyName,
  currency,
  timezone,
}: {
  propertyId: string;
  propertyName: string;
  currency: string;
  timezone: string;
}) {
  const client = useQueryClient();
  const key = ["partner", propertyId, "stay-customizations"];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<{
        offerings: Offering[];
        rooms: { id: string; name: string }[];
        canManage: boolean;
      }>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/stay-customizations`,
        { signal },
      ),
    refetchOnWindowFocus: true,
  });
  const [tab, setTab] = useState("offerings");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("name");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [editing, setEditing] = useState<Offering | "new" | null>(null);
  const [duplicate, setDuplicate] = useState<OfferingInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const rows = query.data?.offerings ?? [];
  const filtered = catalogRows(rows, search, status, category, sort);
  const canManage = query.data?.canManage === true;
  const activeCount = rows.filter((o) => o.status === "active").length;
  const pausedCount = rows.filter((o) => o.status === "paused").length;
  const freeCount = rows.filter(
    (o) =>
      o.unitPricePaise === 0 &&
      !o.variants.some((v) => (v.unitPricePaise ?? 0) > 0),
  ).length;
  const paidCount = rows.length - freeCount;
  const usedCategories = Array.from(
    new Set(rows.map((o) => offeringCategory(o))),
  );
  async function save(
    offering: OfferingInput,
    existing?: Offering,
    closeEditor = true,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setConflict(false);
    setSuccess("");
    try {
      await apiFetch(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/stay-customizations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existing?.id,
            version: existing?.version,
            offering,
          }),
        },
      );
      await client.invalidateQueries({ queryKey: key });
      if (closeEditor) setEditing(null);
      setSuccess(
        closeEditor
          ? "Offering saved."
          : offering.status === "active"
            ? "Offering activated."
            : "Offering paused. Existing bookings are unchanged.",
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Unable to save offering.";
      setError(message);
      setConflict(/changed|conflict/i.test(message));
      await client.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }
  const button =
    "min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50";
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#061224]">Guest Extras & Add-ons</h1>
            {query.data && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {rows.length} total
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {propertyName} · Special comforts, extra amenities, and bookable services for your guests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tab === "offerings" && (
            <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
                className={`h-8 flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  viewMode === "grid"
                    ? "bg-[#061224] text-white shadow-2xs"
                    : "text-slate-600 hover:text-[#061224]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                aria-pressed={viewMode === "table"}
                className={`h-8 flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  viewMode === "table"
                    ? "bg-[#061224] text-white shadow-2xs"
                    : "text-slate-600 hover:text-[#061224]"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Table</span>
              </button>
            </div>
          )}
          {tab === "offerings" && query.isFetching && !query.isPending && (
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" />
              Updating…
            </span>
          )}
          {query.isPending ? (
            <div aria-hidden="true" className="h-10 w-32 rounded-xl bg-slate-200/60 motion-safe:animate-pulse" />
          ) : canManage && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setDuplicate(undefined);
                setEditing("new");
                setConflict(false);
              }}
              className="h-10 inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>Add Extra</span>
            </button>
          )}
        </div>
      </div>
      <div
        className="flex gap-2 border-b border-slate-200"
        aria-label="Customization workspace"
      >
        {[
          ["offerings", "Extras Catalog"],
          ["requests", "Guest Requests Queue"],
        ].map(([id, label]) => (
          <button
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            key={id}
            className={`min-h-11 border-b-2 px-4 text-sm font-semibold transition-all ${
              tab === id
                ? "border-[#b58a32] text-[#061224]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {success && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}
      {error && !editing && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {tab === "requests" ? (
        <PartnerRequestQueue
          propertyId={propertyId}
          currency={currency}
          timezone={timezone}
        />
      ) : query.isPending ? (
        <OfferingsSkeleton />
      ) : (
        <>
          {/* Quick Metrics */}
          {query.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-bold text-[#061224]">{activeCount}</div>
                  <div className="text-xs font-medium text-slate-500">Active Extras</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <PauseCircle className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-bold text-[#061224]">{pausedCount}</div>
                  <div className="text-xs font-medium text-slate-500">Paused Extras</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Gift className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-bold text-[#061224]">{freeCount}</div>
                  <div className="text-xs font-medium text-slate-500">Free Amenities</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <IndianRupee className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-bold text-[#061224]">{paidCount}</div>
                  <div className="text-xs font-medium text-slate-500">Paid Add-ons</div>
                </div>
              </div>
            </div>
          )}

          {/* Search, Filter Toolbar & Quick Category Chips */}
          <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="grid items-center gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search offerings"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bathrobes, chargers, cake, pillows…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-xs sm:text-sm text-[#061224] placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                />
              </div>
              <label className="text-xs font-medium text-slate-500">
                <span className="sr-only">Category</span>
                <select
                  aria-label="Offering category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-[#061224] focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="all">All categories</option>
                  {offeringCategories.map((c) => (
                    <option key={c} value={c}>
                      {offeringCategoryLabels[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                <span className="sr-only">Sort by</span>
                <select
                  aria-label="Sort offerings"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-[#061224] focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="name">Sort: Name (A–Z)</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </label>
              {(search || status !== "all" || category !== "all" || sort !== "name") && (
                <button
                  type="button"
                  className="h-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setCategory("all");
                    setSort("name");
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>

            {/* Quick Status & Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-200 mr-1">
                {[
                  ["all", "All"],
                  ["active", "Active"],
                  ["paused", "Paused"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={status === id}
                    onClick={() => setStatus(id)}
                    className={`h-8 inline-flex items-center justify-center rounded-lg px-3 text-xs font-semibold transition-all ${
                      status === id
                        ? "bg-[#061224] text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="ml-1.5 text-[11px] opacity-75">
                      {query.data
                        ? rows.filter((o) => id === "all" || o.status === id).length
                        : "—"}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCategory("all")}
                className={`h-8 inline-flex items-center justify-center rounded-lg px-3 text-xs font-medium transition-all ${
                  category === "all"
                    ? "bg-amber-100 font-semibold text-amber-900 border border-amber-300 shadow-2xs"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
                }`}
              >
                All Categories
              </button>
              {usedCategories.map((catKey) => {
                const count = rows.filter((o) => offeringCategory(o) === catKey).length;
                if (!count) return null;
                const isSelected = category === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setCategory(isSelected ? "all" : catKey)}
                    className={`h-8 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-amber-100 font-semibold text-amber-900 border border-amber-300 shadow-2xs"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
                    }`}
                  >
                    <CategoryIcon category={catKey} className="h-3.5 w-3.5 text-slate-500" />
                    <span>{offeringCategoryLabels[catKey]}</span>
                    <span className="text-[11px] opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2 text-xs text-slate-500">
            <span className="text-base">💡</span>
            <span>
              Included room amenities belong in Rooms or Property Listing. Changes here apply to future guest bookings.
              {query.data && !canManage ? " Only the property owner can edit this catalog." : ""}
            </span>
          </div>

          {query.isError && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm">
              Offerings could not load.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void query.refetch()}
              >
                Retry
              </button>
            </p>
          )}

          {query.data && !filtered.length && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <h2 className="font-semibold text-slate-800">
                {rows.length ? "No matching extras found" : "No extras added yet"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {rows.length
                  ? "Adjust your search terms or reset the category filters."
                  : "Start with a pre-configured template or create an extra from scratch."}
              </p>
            </div>
          )}

          {/* Cards View vs Table View */}
          {viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {filtered.map((o) => {
                const cat = offeringCategory(o);
                const isFree =
                  o.unitPricePaise === 0 &&
                  !o.variants.some((v) => (v.unitPricePaise ?? 0) > 0);
                return (
                  <article
                    key={o.id}
                    className={`flex min-w-0 flex-col justify-between rounded-2xl border bg-white p-5 shadow-xs transition-all hover:shadow-md ${
                      o.status === "active"
                        ? "border-slate-200"
                        : "border-dashed border-slate-300 opacity-80"
                    }`}
                  >
                    <div>
                      {/* Top Bar: Icon + Category + Active Status Toggle */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <span className="h-7 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-xs font-medium text-slate-700">
                          <CategoryIcon category={cat} className="h-3.5 w-3.5 text-slate-500" />
                          <span>{offeringCategoryLabels[cat]}</span>
                        </span>
                        {canManage && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void save(
                                {
                                  ...oInput(o),
                                  status: o.status === "active" ? "paused" : "active",
                                },
                                o,
                                false,
                              )
                            }
                            title="Click to toggle active status"
                            className={`h-7 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all border ${
                              o.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                o.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                            />
                            <span>{o.status === "active" ? "Active" : "Paused"}</span>
                          </button>
                        )}
                      </div>

                      {/* Title & Image & Description */}
                      <div className="mt-3.5 flex items-start gap-3">
                        {o.imageId && (
                          <img
                            src={`/api/stay-images/${encodeURIComponent(propertyId)}/${o.imageId}`}
                            alt="Offering thumbnail"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                            className="h-14 w-14 shrink-0 rounded-xl object-cover border border-slate-200"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words font-bold text-[#061224] text-base leading-snug">
                            {o.name}
                          </h2>
                          <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-slate-500">
                            {o.description}
                          </p>
                        </div>
                      </div>

                      {/* Price Row */}
                      <div className="mt-3.5 flex items-center justify-between border-t border-slate-100/80 pt-3">
                        <div className="flex items-center gap-1.5">
                          {isFree ? (
                            <span className="h-6 inline-flex items-center rounded-md bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                              FREE
                            </span>
                          ) : (
                            <span className="font-bold text-slate-900 text-sm">
                              {offeringPriceLabel(o, currency)}
                              {o.unitPricePaise > 0 ||
                              o.variants.some((v) => (v.unitPricePaise ?? 0) > 0)
                                ? ` / ${o.pricingUnit ?? "item"}`
                                : ""}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          Max {o.maxQuantity} per booking
                        </span>
                      </div>

                      {/* Attribute Chips */}
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="h-6 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 font-medium text-slate-600">
                          <Clock3 className="h-3 w-3 text-slate-400" />
                          {noticeLabel(o.advanceNoticeMinutes)}
                        </span>
                        <span
                          className={`h-6 inline-flex items-center gap-1 rounded-md px-2 font-medium border ${
                            o.confirmation === "approval"
                              ? "bg-amber-50 text-amber-800 border-amber-200/60"
                              : "bg-blue-50 text-blue-700 border-blue-200/60"
                          }`}
                        >
                          {o.confirmation === "approval" ? "🛎 Hotel Approval" : "⚡ Instant"}
                        </span>
                        <span className="h-6 inline-flex items-center rounded-md bg-slate-100 px-2 font-medium text-slate-500">
                          {o.roomTypeIds.length
                            ? `${o.roomTypeIds.length} rooms`
                            : "All rooms"}
                          {" · "}
                          {o.bookingModes
                            .map((m) => (m === "overnight" ? "Overnight" : "Hourly"))
                            .join(" & ")}
                        </span>
                      </div>
                    </div>

                    {/* Action Row */}
                    {canManage && (
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          disabled={busy}
                          className="h-8 inline-flex items-center gap-1.5 rounded-lg bg-[#061224] px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition-all disabled:opacity-50"
                          onClick={() => {
                            setError("");
                            setConflict(false);
                            setDuplicate(undefined);
                            setEditing(o);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs disabled:opacity-50"
                            onClick={() => {
                              setError("");
                              setConflict(false);
                              setDuplicate({
                                ...oInput(o),
                                name: `${o.name.slice(0, 111)} (copy)`,
                                status: "paused",
                              });
                              setEditing("new");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 text-slate-400" />
                            <span>Duplicate</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={`h-8 inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors shadow-2xs disabled:opacity-50 ${
                              o.status === "active"
                                ? "border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100"
                                : "border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100"
                            }`}
                            onClick={() =>
                              void save(
                                {
                                  ...oInput(o),
                                  status: o.status === "active" ? "paused" : "active",
                                },
                                o,
                                false,
                              )
                            }
                          >
                            {o.status === "active" ? (
                              <>
                                <Pause className="h-3.5 w-3.5 text-amber-600" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Activate</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            /* Table View for Bulk Scanning */
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                    <tr>
                      <th className="py-3 px-4">Item & Category</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Limits & Notice</th>
                      <th className="py-3 px-4">Confirmation</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((o) => {
                      const cat = offeringCategory(o);
                      const isFree =
                        o.unitPricePaise === 0 &&
                        !o.variants.some((v) => (v.unitPricePaise ?? 0) > 0);
                      return (
                        <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                <CategoryIcon category={cat} className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <span className="block font-bold text-slate-900 truncate max-w-xs">
                                  {o.name}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {offeringCategoryLabels[cat]}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {isFree ? (
                              <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                                FREE
                              </span>
                            ) : (
                              <span className="font-bold text-slate-900">
                                {offeringPriceLabel(o, currency)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <div>Max {o.maxQuantity} per booking</div>
                            <div className="text-[11px] text-slate-400">
                              {noticeLabel(o.advanceNoticeMinutes)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${
                                o.confirmation === "approval"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {o.confirmation === "approval" ? "🛎 Approval" : "⚡ Instant"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              disabled={busy || !canManage}
                              onClick={() =>
                                void save(
                                  {
                                    ...oInput(o),
                                    status: o.status === "active" ? "paused" : "active",
                                  },
                                  o,
                                  false,
                                )
                              }
                              className={`h-7 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-all border ${
                                o.status === "active"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  o.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              />
                              <span>{o.status === "active" ? "Active" : "Paused"}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={busy || !canManage}
                                onClick={() => {
                                  setError("");
                                  setConflict(false);
                                  setDuplicate(undefined);
                                  setEditing(o);
                                }}
                                className="h-7 inline-flex items-center gap-1 rounded-md bg-[#061224] px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800 transition-colors shadow-2xs"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy || !canManage}
                                onClick={() => {
                                  setError("");
                                  setConflict(false);
                                  setDuplicate({
                                    ...oInput(o),
                                    name: `${o.name.slice(0, 111)} (copy)`,
                                    status: "paused",
                                  });
                                  setEditing("new");
                                }}
                                className="h-7 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
                              >
                                <Copy className="h-3 w-3 text-slate-400" />
                                <span>Duplicate</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {editing && (
        <OfferingEditor
          key={editing === "new" ? "new" : `${editing.id}-${editing.version}`}
          offering={editing === "new" ? undefined : editing}
          draft={duplicate}
          rooms={query.data?.rooms ?? []}
          currency={currency}
          propertyId={propertyId}
          busy={busy}
          serverError={error}
          conflict={conflict}
          reload={() => {
            void (async () => {
              if (editing === "new") return;
              const result = await query.refetch();
              const latest = result.data?.offerings.find(
                (o) => o.id === editing.id,
              );
              if (
                latest &&
                window.confirm(
                  "Discard your edits and load the latest saved version?",
                )
              ) {
                setEditing(latest);
                setError("");
                setConflict(false);
              }
            })();
          }}
          onSave={(value) =>
            void save(value, editing === "new" ? undefined : editing)
          }
          close={() => setEditing(null)}
        />
      )}
    </div>
  );
}
function oInput(o: Offering): OfferingInput {
  return offeringSchema.parse(
    Object.fromEntries(
      Object.entries(o).filter(
        ([key]) => !["id", "version", "propertyId"].includes(key),
      ),
    ),
  );
}
function OfferingEditor({
  propertyId,
  currency,
  offering,
  draft,
  serverError,
  conflict,
  reload,
  rooms,
  busy,
  onSave,
  close,
}: {
  propertyId: string;
  currency: string;
  offering?: Offering;
  draft?: OfferingInput;
  serverError: string;
  conflict: boolean;
  reload: () => void;
  rooms: { id: string; name: string }[];
  busy: boolean;
  onSave: (v: OfferingInput) => void;
  close: () => void;
}) {
  const [value, setValue] = useState<OfferingInput>(
    draft ?? (offering ? oInput(offering) : initial),
  );
  const [error, setError] = useState("");
  const [started, setStarted] = useState(Boolean(offering || draft));
  const formId = useId();
  const [paid, setPaid] = useState(() => value.unitPricePaise > 0 || value.variants.some(v => (v.unitPricePaise ?? 0) > 0));
  const savedPrices = useRef({ unitPricePaise: value.unitPricePaise, variants: value.variants, pricingUnit: value.pricingUnit });
  const [reviewed, setReviewed] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || serverError)
      feedbackRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
  }, [error, serverError]);
  const base = draft ?? (offering ? oInput(offering) : initial);
  const dirty = JSON.stringify(value) !== JSON.stringify(base);
  const requestClose = () => {
    if (busy || uploading) return;
    close();
  };
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || uploading) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, uploading]);
  const field =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#061224] placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all";
  const issueFor = (path: string) =>
    issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
  function patch(v: Partial<OfferingInput>) {
    setValue((previous) => {
      const next = { ...previous, ...v };
      const config = resolveResponse(next);
      if (next.responseConfig && !config.quantityEnabled && config.responseType === "multiple" && v.variants && previous.maxQuantity === previous.variants.length) next.maxQuantity = Math.max(1, v.variants.length);
      return next;
    });

    setIssues([]);
  }
  return (
    <Drawer
      open
      spacious
      closeOnOutsideClick={false}
      contentClassName="flex flex-col"
      title={offering ? "Edit Extra" : "Create Extra"}
      description="Configure how this extra appears to guests and set its availability rules."
      onClose={requestClose}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="submit"
            form={formId}
            disabled={busy || uploading || !started}
            className="h-11 inline-flex items-center justify-center rounded-xl bg-[#061224] px-5 text-sm font-semibold text-white disabled:opacity-50 shadow-xs hover:bg-slate-800 transition-all"
          >
            {busy ? "Saving…" : offering ? "Save Changes" : "Publish Extra"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={requestClose}
            className="h-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
        </div>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (uploading) {
            setError("Wait for the image upload to complete.");
            return;
          }
          let candidate = value;
          if (value.responseConfig && !["single", "multiple"].includes(value.responseConfig.responseType) && value.variants.length) {
            if (!window.confirm("Saving this response type will remove the configured options and their prices. Continue?")) return;
            candidate = { ...value, variants: [] };
          }
          const parsed = offeringSchema.safeParse(candidate);
          if (!parsed.success) {
            setIssues(
              parsed.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
              })),
            );
            setError("Check the field errors below.");
            return;
          }
          setError("");
          onSave(parsed.data);
        }}
        className={!started ? "flex flex-1 flex-col min-h-0" : "space-y-4"}
      >
        {!started && (
          <div className="flex flex-1 flex-col min-h-0 pb-1">
            <TemplateLibrary
              scratch={() => {
                setReviewed(false);
                setValue({
                  ...initial,
                  formType: "simple",
                  responseConfig: { responseType: "yes_no", quantityEnabled: false },
                  pricingUnit: "item",
                });
                setStarted(true);
              }}
              choose={(t) => {
                setPaid((t.draft.unitPricePaise ?? 0) > 0 || !!t.draft.variants?.some(v => (v.unitPricePaise ?? 0) > 0));
                setReviewed(false);
                setValue({
                  ...initial,
                  confirmation: "approval",
                  formType: "quantity",
                  pricingUnit: "item",
                  ...t.draft,
                });
                setStarted(true);
              }}
            />
            <p className="mt-3 text-xs text-slate-400 shrink-0">
              💡 All extras include applicable taxes and service charges. You can edit availability anytime.
            </p>
          </div>
        )}
        {started && (
          <fieldset disabled={busy} className="space-y-5">
            {/* 1. Basic Details Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#061224] text-white text-xs font-bold">1</span>
                  <h3 className="font-bold text-slate-900 text-sm">Basic Information</h3>
                </div>
                {!offering && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!dirty || window.confirm("Choose another template? Your current draft will be replaced.")) {
                        setReviewed(false);
                        setStarted(false);
                      }
                    }}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-800 underline"
                  >
                    Choose another template
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Extra / Item Name
                  </label>
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    aria-invalid={Boolean(issueFor("name"))}
                    aria-describedby={
                      issueFor("name") ? "offering-error-name" : undefined
                    }
                    value={value.name}
                    placeholder="e.g. Additional Bathrobes, Birthday Cake"
                    onChange={(e) => patch({ name: e.target.value })}
                    className={field}
                  />
                  {issueFor("name") && (
                    <span
                      id="offering-error-name"
                      className="mt-1 block text-xs text-red-700"
                    >
                      {issueFor("name")}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <select
                    aria-label="Category"
                    value={offeringCategory(value)}
                    onChange={(e) => {
                      const cat = e.target.value as OfferingInput["category"];
                      patch({
                        category: cat,
                        kind:
                          cat === "room_preferences"
                            ? "preference"
                            : value.kind === "preference"
                              ? "item"
                              : value.kind,
                      });
                    }}
                    className={field}
                  >
                    {offeringCategories.map((category) => (
                      <option key={category} value={category}>
                        {offeringCategoryLabels[category]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Description for Guests
                  </label>
                  <textarea
                    required
                    rows={2}
                    minLength={3}
                    maxLength={1500}
                    placeholder="Describe what guests can request, when it is provided, or any helpful details..."
                    aria-invalid={Boolean(issueFor("description"))}
                    aria-describedby={
                      issueFor("description")
                        ? "offering-error-description"
                        : undefined
                    }
                    value={value.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    className={field}
                  />
                  {issueFor("description") && (
                    <span
                      id="offering-error-description"
                      className="mt-1 block text-xs text-red-700"
                    >
                      {issueFor("description")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Pricing & Guest Selection Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#061224] text-white text-xs font-bold">2</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Pricing & Guest Selection</h3>
                  <p className="text-xs text-slate-500">Choose the extra type, set your prices, and configure guest choices.</p>
                </div>
              </div>

              <OfferingFields
                value={value}
                patch={patch}
                propertyId={propertyId}
                disabled={busy}
                onUploading={setUploading}
                paid={paid}
                onPaidChange={(nextPaid) => {
                  if (!nextPaid) {
                    savedPrices.current = { unitPricePaise: value.unitPricePaise, variants: value.variants, pricingUnit: value.pricingUnit };
                    patch({ unitPricePaise: 0, pricingUnit: value.formType === "package" ? "package" : "item", variants: value.variants.map(v => ({ ...v, unitPricePaise: null })) });
                  } else {
                    patch({ unitPricePaise: savedPrices.current.unitPricePaise, pricingUnit: savedPrices.current.pricingUnit ?? (value.formType === "package" ? "package" : "item"), variants: value.variants.map(v => ({ ...v, unitPricePaise: savedPrices.current.variants.find(old => old.id === v.id)?.unitPricePaise ?? null })) });
                  }
                  setPaid(nextPaid);
                }}
                issueFor={issueFor}
                currency={currency}
              />
            </div>

            {/* 3. Delivery & Fulfillment Rules Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#061224] text-white text-xs font-bold">3</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Delivery & Fulfillment Rules</h3>
                  <p className="text-xs text-slate-500">Set lead times, order confirmation workflows, and catalog visibility.</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Advance Notice Section */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Required Advance Notice
                    </label>
                    <span className="text-xs text-slate-400">
                      Minimum notice time guests must provide before fulfillment
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative sm:w-48 shrink-0">
                      <input
                        required
                        type="number"
                        min={0}
                        max={525600}
                        aria-invalid={Boolean(issueFor("advanceNoticeMinutes"))}
                        aria-describedby={
                          issueFor("advanceNoticeMinutes")
                            ? "offering-error-advanceNoticeMinutes"
                            : undefined
                        }
                        value={value.advanceNoticeMinutes}
                        onChange={(e) =>
                          patch({ advanceNoticeMinutes: Number(e.target.value) })
                        }
                        className={`${field} pr-14`}
                      />
                      <span className="pointer-events-none absolute right-3.5 top-[calc(50%+3px)] -translate-y-1/2 text-xs font-semibold text-slate-400">
                        min
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:pt-0">
                      {[
                        { label: "⚡ Instant (0m)", value: 0 },
                        { label: "30 min", value: 30 },
                        { label: "1 hour", value: 60 },
                        { label: "2 hours", value: 120 },
                        { label: "4 hours", value: 240 },
                        { label: "24 hours", value: 1440 },
                      ].map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => patch({ advanceNoticeMinutes: preset.value })}
                          className={`h-8 px-2.5 text-xs font-semibold rounded-lg transition-all border ${
                            value.advanceNoticeMinutes === preset.value
                              ? "bg-[#061224] text-white border-[#061224] shadow-2xs"
                              : "bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {issueFor("advanceNoticeMinutes") && (
                    <span
                      id="offering-error-advanceNoticeMinutes"
                      className="mt-1 block text-xs text-red-700"
                    >
                      {issueFor("advanceNoticeMinutes")}
                    </span>
                  )}
                </div>

                {/* Confirmation Workflow & Publishing Status in 2 columns */}
                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Confirmation Workflow
                    </label>
                    <select
                      aria-label="Confirmation"
                      value={value.confirmation}
                      onChange={(e) =>
                        patch({
                          confirmation: e.target
                            .value as OfferingInput["confirmation"],
                        })
                      }
                      className={field}
                    >
                      <option value="immediate">⚡ Immediate confirmation</option>
                      <option value="approval">🛎 Hotel approval required</option>
                    </select>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {value.confirmation === "approval"
                        ? "Requires staff approval before confirmation."
                        : "Automatically confirmed upon guest request."}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Publishing Status
                    </label>
                    <select
                      aria-label="Status"
                      value={value.status}
                      onChange={(e) =>
                        patch({ status: e.target.value as OfferingInput["status"] })
                      }
                      className={field}
                    >
                      <option value="active">Active (Visible to guests)</option>
                      <option value="paused">Paused (Hidden from guests)</option>
                    </select>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {value.status === "active"
                        ? "Guests can view and request this extra in the app."
                        : "Temporarily hidden from guest view."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Availability & Eligibility Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#061224] text-white text-xs font-bold">4</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Availability & Eligibility</h3>
                  <p className="text-xs text-slate-500">Control which rooms, stay modes, and traveler types can access this extra.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Eligible Room Types */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Eligible Room Types
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Select which room types can request this extra.
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {!value.roomTypeIds.length ? "All Rooms" : `${value.roomTypeIds.length} Selected`}
                    </span>
                  </div>

                  <label className={`flex items-center justify-between rounded-xl p-3 border cursor-pointer transition-all ${
                    !value.roomTypeIds.length
                      ? "border-[#061224] bg-[#061224] text-white shadow-2xs"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <Building2 className={`h-4 w-4 ${!value.roomTypeIds.length ? "text-amber-400" : "text-slate-500"}`} />
                      <span className="text-xs font-bold">All room types eligible</span>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-amber-400"
                      checked={!value.roomTypeIds.length}
                      onChange={() => patch({ roomTypeIds: [] })}
                    />
                  </label>

                  {rooms.length > 0 && (
                    <div className="max-h-44 overflow-y-auto space-y-1 rounded-xl border border-slate-200/70 bg-white p-2">
                      {rooms.map((r) => {
                        const isChecked = value.roomTypeIds.includes(r.id);
                        return (
                          <label
                            key={r.id}
                            className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                              isChecked ? "bg-amber-50 text-amber-950 font-semibold" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span>{r.name}</span>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded accent-[#061224]"
                              checked={isChecked}
                              onChange={(e) =>
                                patch({
                                  roomTypeIds: e.target.checked
                                    ? [...value.roomTypeIds, r.id]
                                    : value.roomTypeIds.filter((id) => id !== r.id),
                                })
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Eligible Stay Types */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4.5 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Eligible Stay Types
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Enable for overnight reservations, hourly stays, or both.
                    </p>
                  </div>

                  <div className="space-y-2 pt-0.5">
                    {([
                      {
                        id: "overnight",
                        label: "Overnight Stays",
                        desc: "Standard nightly and multi-day hotel bookings",
                        icon: Moon,
                      },
                      {
                        id: "hourly",
                        label: "Hourly Day-Use Stays",
                        desc: "Short duration and daytime transit room stays",
                        icon: Clock,
                      },
                    ] as const).map((m) => {
                      const isChecked = value.bookingModes.includes(m.id);
                      const Icon = m.icon;
                      return (
                        <label
                          key={m.id}
                          className={`flex items-start gap-3 rounded-xl p-3 border cursor-pointer transition-all ${
                            isChecked
                              ? "border-slate-300 bg-white shadow-2xs"
                              : "border-slate-200 bg-slate-100/60 opacity-60 hover:opacity-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded accent-[#061224]"
                            checked={isChecked}
                            onChange={(e) =>
                              patch({
                                bookingModes: e.target.checked
                                  ? [...value.bookingModes, m.id]
                                  : value.bookingModes.filter((v) => v !== m.id),
                              })
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 text-slate-500" />
                              <span className="text-xs font-bold text-slate-900">{m.label}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{m.desc}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Target Traveler Categories */}
                <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Target Traveler Categories
                  </label>
                  <TravelerChips
                    value={value.travelerCategories}
                    onChange={(travelerCategories) => patch({ travelerCategories })}
                    disabled={busy}
                  />
                </div>
              </div>
            </div>

            {/* 5. Live Guest App Preview & Review */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-amber-200/60">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold">5</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Live Guest App Preview</h3>
                  <p className="text-xs text-slate-500">Preview exactly how guests will see and interact with this extra.</p>
                </div>
              </div>

              <OfferingGuestPreview key={JSON.stringify(value)} value={value} currency={currency} />

              <label className="flex items-start gap-2.5 text-xs font-medium text-slate-700 pt-3 border-t border-amber-200/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span>I reviewed prices, room and stay eligibility, advance notice and confirmation settings.</span>
              </label>
            </div>
          </fieldset>
        )}
        {started && (
          <p className="text-xs text-slate-400">
            💡 All extras include applicable taxes and service charges. You can edit availability anytime.
          </p>
        )}
        <div ref={feedbackRef} className="space-y-3">
          {serverError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {serverError}
              {conflict && (
                <button
                  type="button"
                  className="mt-2 block min-h-11 underline"
                  onClick={reload}
                >
                  Load latest saved version
                </button>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {issues.length > 0 && (
            <ul
              role="alert"
              className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {issues.map((issue, i) => (
                <li key={i}>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>

      </form>
    </Drawer>
  );
}
