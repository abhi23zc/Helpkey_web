"use client";
/* eslint-disable @next/next/no-img-element */
import { resolveResponse } from "@/lib/stay/response";
import { OfferingGuestPreview } from "./offering-guest-preview";
import { offeringPriceLabel } from "@/lib/stay/pricing";
import { OfferingFields, TemplateLibrary } from "./offering-fields";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Drawer } from "@/components/partner/dashboard/drawer";
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
  const [editing, setEditing] = useState<Offering | "new" | null>(null);
  const [duplicate, setDuplicate] = useState<OfferingInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const rows = query.data?.offerings ?? [];
  const filtered = catalogRows(rows, search, status, category, sort);
  const canManage = query.data?.canManage === true;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stay Customizations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {propertyName} · Extras and thoughtful touches for every stay.
          </p>
        </div>
        {tab === "offerings" && query.isFetching && !query.isPending && (
          <span role="status" className="inline-flex items-center gap-2 text-xs text-slate-500">
            <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
            Updating offerings…
          </span>
        )}
        {query.isPending ? (
          <div aria-hidden="true" className="h-11 w-36 rounded-xl bg-slate-200/60 motion-safe:animate-pulse" />
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
            className="min-h-11 rounded-xl bg-[#061224] px-4 py-3 text-sm font-semibold text-white"
          >
            Create offering
          </button>
        )}
      </div>
      <div
        className="flex gap-2 border-b border-slate-200"
        aria-label="Customization workspace"
      >
        {[
          ["offerings", "Offerings"],
          ["requests", "Guest requests"],
        ].map(([id, label]) => (
          <button
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            key={id}
            className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${tab === id ? "border-[#b58a32] text-[#061224]" : "border-transparent text-slate-500"}`}
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
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap gap-2">
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
                  className={`min-h-11 rounded-xl px-4 text-sm ${status === id ? "bg-[#061224] text-white" : "bg-slate-50 text-slate-600"}`}
                >
                  {label}{" "}
                  <span className="ml-1 opacity-75">
                    {query.data
                      ? rows.filter((o) => id === "all" || o.status === id)
                          .length
                      : "—"}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
              <label className="text-xs font-medium text-slate-500">
                Search offerings
                <input
                  type="search"
                  aria-label="Search offerings"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or description…"
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-[#061224]"
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Category
                <select
                  aria-label="Offering category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#061224]"
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
                Sort by
                <select
                  aria-label="Sort offerings"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#061224]"
                >
                  <option value="name">Name A–Z</option>
                  <option value="price_low">Price: low to high</option>
                  <option value="price_high">Price: high to low</option>
                </select>
              </label>
              {(search ||
                status !== "all" ||
                category !== "all" ||
                sort !== "name") && (
                <button
                  type="button"
                  className={button}
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
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Included amenities belong in Rooms or Property Listing. Changes here
            apply to future selections; existing booking commitments stay
            unchanged.
            {query.data && !canManage
              ? " Only the property owner can edit this catalog."
              : ""}
          </p>
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
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">
                {rows.length ? "No matching offerings" : "No offerings yet"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {rows.length
                  ? "Adjust your search or reset the filters."
                  : "Start with a template or create an extra your hotel can provide."}
              </p>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map((o) => (
              <article
                key={o.id}
                className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start gap-3">
                  {o.imageId && (
                    <img
                      src={`/api/stay-images/${encodeURIComponent(propertyId)}/${o.imageId}`}
                      alt="Illustrative offering"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">
                      {offeringCategoryLabels[offeringCategory(o)]}
                    </p>
                    <h2 className="mt-1 break-words font-bold">{o.name}</h2>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs ${o.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {o.status === "active" ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 break-words text-sm leading-6 text-slate-600">
                  {o.description}
                </p>
                <p className="mt-3 font-semibold">
                  {offeringPriceLabel(o, currency)}
                  {o.unitPricePaise > 0 ||
                  o.variants.some((v) => (v.unitPricePaise ?? 0) > 0)
                    ? ` / ${o.pricingUnit ?? "item"}`
                    : ""}
                </p>
                <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
                  <p>
                    {o.confirmation === "approval"
                      ? "Hotel approval required"
                      : "Instant confirmation"}{" "}
                    · Up to {o.maxQuantity} per booking
                  </p>
                  <p>{noticeLabel(o.advanceNoticeMinutes)}</p>
                  <p>
                    {o.roomTypeIds.length
                      ? o.roomTypeIds
                          .map(
                            (id) =>
                              query.data?.rooms.find((r) => r.id === id)
                                ?.name ?? "Unavailable room type",
                          )
                          .join(", ")
                      : "All room types"}{" "}
                    ·{" "}
                    {o.bookingModes
                      .map((m) => (m === "overnight" ? "Overnight" : "Hourly"))
                      .join(" & ")}
                  </p>
                </div>
                {canManage && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
                      onClick={() => {
                        setError("");
                        setConflict(false);
                        setDuplicate(undefined);
                        setEditing(o);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
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
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
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
                      {o.status === "active" ? "Pause" : "Activate"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
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
  const [reviewed, setReviewed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [discard, setDiscard] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (discard || error || serverError)
      feedbackRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
  }, [discard, error, serverError]);
  const base = draft ?? (offering ? oInput(offering) : initial);
  const dirty = JSON.stringify(value) !== JSON.stringify(base);
  const requestClose = () => {
    if (busy || uploading) return;
    if (dirty) setDiscard(true);
    else close();
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
    "mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm";
  const issueFor = (path: string) =>
    issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
  function patch(v: Partial<OfferingInput>) {
    setValue((previous) => {
      const next = { ...previous, ...v };
      const config = resolveResponse(next);
      if (next.responseConfig && !config.quantityEnabled && config.responseType === "multiple" && v.variants && previous.maxQuantity === previous.variants.length) next.maxQuantity = Math.max(1, v.variants.length);
      return next;
    });

    setReviewed(false);
    setIssues([]);
  }
  return (
    <Drawer
      open
      title={offering ? "Edit offering" : "Create offering"}
      description="Configure what guests can request from your hotel."
      onClose={requestClose}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="submit"
            form={formId}
            disabled={busy || uploading || !started}
            className="rounded-xl bg-[#061224] px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save offering"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={requestClose}
            className="min-h-11 text-sm underline"
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
          if (!reviewed) {
            setError(
              "Review prices, eligibility and confirmation settings before saving.",
            );
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
        className="space-y-4"
      >
        {!started && (
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
        )}
        {started && (
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            {!offering && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm(
                      "Choose another template? Your current draft will be replaced.",
                    )
                  ) {
                    setReviewed(false);
                    setStarted(false);
                  }
                }}
                className="text-left text-sm underline sm:col-span-2"
              >
                Choose another template
              </button>
            )}
            <h3 className="border-b border-slate-100 pb-2 font-semibold sm:col-span-2">
              Details
            </h3>

            <label className="text-sm">
              Name
              <input
                required
                minLength={2}
                maxLength={120}
                aria-invalid={Boolean(issueFor("name"))}
                aria-describedby={
                  issueFor("name") ? "offering-error-name" : undefined
                }
                value={value.name}
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
            </label>
            <label className="text-sm">
              Type
              <select
                aria-label="Type"
                value={value.kind}
                onChange={(e) =>
                  patch({ kind: e.target.value as OfferingInput["kind"] })
                }
                className={field}
              >
                <option value="item">Hotel-provided item</option>
                <option value="service">Preparation service</option>
                <option value="preference">Room preference</option>
              </select>
            </label>
            <label className="text-sm">
              Guest browsing category
              <select
                aria-label="Guest browsing category"
                value={offeringCategory(value)}
                onChange={(e) =>
                  patch({
                    category: e.target.value as OfferingInput["category"],
                  })
                }
                className={field}
              >
                {offeringCategories.map((category) => (
                  <option key={category} value={category}>
                    {offeringCategoryLabels[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <textarea
                required
                minLength={3}
                maxLength={1500}
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
            </label>
            <h3 className="border-b border-slate-100 pb-2 pt-3 font-semibold sm:col-span-2">
              Pricing & guest options
            </h3>
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
                  patch({ unitPricePaise: 0, pricingUnit: "item", variants: value.variants.map(v => ({ ...v, unitPricePaise: null })) });
                } else {
                  patch({ unitPricePaise: savedPrices.current.unitPricePaise, pricingUnit: savedPrices.current.pricingUnit ?? "item", variants: value.variants.map(v => ({ ...v, unitPricePaise: savedPrices.current.variants.find(old => old.id === v.id)?.unitPricePaise ?? null })) });
                }
                setPaid(nextPaid);
              }}
            >
            {paid && value.formType !== "custom" && <label className="text-sm">
              Default price (₹, 0 = Free)
              <input
                type="number"
                min={0}
                step="0.01"
                aria-invalid={Boolean(issueFor("unitPricePaise"))}
                aria-describedby={
                  issueFor("unitPricePaise")
                    ? "offering-error-unitPricePaise"
                    : undefined
                }
                value={value.unitPricePaise / 100}
                onChange={(e) =>
                  patch({
                    unitPricePaise: Math.round(Number(e.target.value) * 100),
                  })
                }
                className={field}
              />
              {issueFor("unitPricePaise") && (
                <span
                  id="offering-error-unitPricePaise"
                  className="mt-1 block text-xs text-red-700"
                >
                  {issueFor("unitPricePaise")}
                </span>
              )}
            </label>}
            {(resolveResponse(value).quantityEnabled || resolveResponse(value).responseType === "multiple") && (
              <label className="text-sm">
                {resolveResponse(value).quantityEnabled ? "Maximum quantity per booking" : "Maximum choices per booking"}
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  aria-invalid={Boolean(issueFor("maxQuantity"))}
                  aria-describedby={
                    issueFor("maxQuantity")
                      ? "offering-error-maxQuantity"
                      : undefined
                  }
                  value={value.maxQuantity}
                  onChange={(e) =>
                    patch({ maxQuantity: Number(e.target.value) })
                  }
                  className={field}
                />
                {issueFor("maxQuantity") && (
                  <span
                    id="offering-error-maxQuantity"
                    className="mt-1 block text-xs text-red-700"
                  >
                    {issueFor("maxQuantity")}
                  </span>
                )}
              </label>
            )}
            {(["single", "multiple"].includes(resolveResponse(value).responseType)) && (
              <div className="sm:col-span-2">
                <p className="text-sm font-semibold">Options guests can choose from</p>
                {issueFor("variants") && <p role="alert" className="text-xs text-red-700">{issueFor("variants")}</p>}
                {value.variants.map((v, i) => (
                  <div
                    key={v.id}
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input
                      aria-label={`Variant ${i + 1}`}
                      value={v.name}
                      onChange={(e) =>
                        patch({
                          variants: value.variants.map((n) =>
                            n.id === v.id ? { ...n, name: e.target.value } : n,
                          ),
                        })
                      }
                      className={field}
                    />
                    {paid && value.formType !== "custom" && <label className="w-full text-sm sm:w-56">
                      Custom price (₹, 0 = Free)
                      <input
                        aria-label={`Variant ${i + 1} custom price`}
                        type="number"
                        min={0}
                        max={1000000}
                        step="0.01"
                                placeholder={`Default: ${formatMoney(value.unitPricePaise, currency)}`}
                        value={
                          v.unitPricePaise == null ? "" : v.unitPricePaise / 100
                        }
                        onChange={(e) =>
                          patch({
                            variants: value.variants.map((n) =>
                              n.id === v.id
                                ? {
                                    ...n,
                                    unitPricePaise:
                                      e.target.value === ""
                                        ? null
                                        : Math.round(
                                            Number(e.target.value) * 100,
                                          ),
                                  }
                                : n,
                            ),
                          })
                        }
                        className={field}
                      />
                      <span className="text-xs text-slate-500">
                        Blank uses the default price.
                      </span>
                    </label>}
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          variants: value.variants.filter((n) => n.id !== v.id),
                        })
                      }
                      className="text-sm underline"
                    >
                      Remove
                    </button>
                    {value.formType === "package" && (
                      <label className="w-full text-sm">
                        Package inclusions
                        <textarea
                          value={v.inclusions ?? ""}
                          maxLength={500}
                          required
                          onChange={(e) =>
                            patch({
                              variants: value.variants.map((n) =>
                                n.id === v.id
                                  ? { ...n, inclusions: e.target.value }
                                  : n,
                              ),
                            })
                          }
                          className={field}
                        />
                      </label>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  disabled={value.variants.length >= 20}
                  onClick={() =>
                    patch({
                      variants: [
                        ...value.variants,
                        { id: crypto.randomUUID(), name: "" },
                      ],
                    })
                  }
                  className="mt-3 text-sm underline"
                >
                  Add choice
                </button>
              </div>
            )}
            </OfferingFields>
            <label className="text-sm">
              Required advance notice (minutes)
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
                className={field}
              />
              {issueFor("advanceNoticeMinutes") && (
                <span
                  id="offering-error-advanceNoticeMinutes"
                  className="mt-1 block text-xs text-red-700"
                >
                  {issueFor("advanceNoticeMinutes")}
                </span>
              )}
            </label>
            <label className="text-sm">
              Confirmation
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
                <option value="immediate">Immediate confirmation</option>
                <option value="approval">Hotel approval</option>
              </select>
            </label>
            <h3 className="border-b border-slate-100 pb-2 pt-3 font-semibold sm:col-span-2">
              Eligibility & confirmation
            </h3>
            <div className="sm:col-span-2">
              <TravelerChips
                value={value.travelerCategories}
                onChange={(travelerCategories) => patch({ travelerCategories })}
                disabled={busy}
              />
            </div>
            <div className="text-sm">
              <p className="mb-2 font-semibold">Room types</p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={!value.roomTypeIds.length}
                  onChange={() => patch({ roomTypeIds: [] })}
                />
                All rooms
              </label>
              {rooms.map((r) => (
                <label
                  key={r.id}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={value.roomTypeIds.includes(r.id)}
                    onChange={(e) =>
                      patch({
                        roomTypeIds: e.target.checked
                          ? [...value.roomTypeIds, r.id]
                          : value.roomTypeIds.filter((id) => id !== r.id),
                      })
                    }
                  />
                  {r.name}
                </label>
              ))}
            </div>
            <div className="text-sm">
              <p className="mb-2 font-semibold">Stay types</p>
              {(["overnight", "hourly"] as const).map((m) => (
                <label
                  key={m}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={value.bookingModes.includes(m)}
                    onChange={(e) =>
                      patch({
                        bookingModes: e.target.checked
                          ? [...value.bookingModes, m]
                          : value.bookingModes.filter((v) => v !== m),
                      })
                    }
                  />
                  {m === "overnight" ? "Overnight" : "Hourly"}
                </label>
              ))}
            </div>
            <label className="text-sm">
              Status
              <select
                value={value.status}
                onChange={(e) =>
                  patch({ status: e.target.value as OfferingInput["status"] })
                }
                className={field}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <section
              className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/40 p-4 sm:col-span-2"
              aria-label="Guest preview"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Guest preview & review
              </h3>
              <p className="font-bold">{value.name || "Offering name"}</p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {value.description || "Your description appears here."}
              </p>
              <p className="text-sm font-semibold">
                {offeringPriceLabel({ ...value, variants: ["single", "multiple"].includes(resolveResponse(value).responseType) ? value.variants : [] }, currency)}
                {value.unitPricePaise > 0 ||
                value.variants.some((v) => (v.unitPricePaise ?? 0) > 0)
                  ? ` / ${value.pricingUnit ?? "item"}`
                  : ""}
              </p>
              <p className="text-xs text-slate-500">
                {noticeLabel(value.advanceNoticeMinutes)} ·{" "}
                {value.confirmation === "approval"
                  ? "Hotel approval required"
                  : "Instant confirmation"}{" "}
                ·{" "}
                {value.roomTypeIds.length
                  ? `${value.roomTypeIds.length} room types`
                  : "All room types"}{" "}
                · {value.bookingModes.join(" & ")} · Up to {value.maxQuantity}{" "}
                per booking
              </p>
              {value.variants.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {value.variants.map((v) => (
                    <li key={v.id}>
                      {v.name || "Unnamed option"} ·{" "}
                      {formatMoney(
                        v.unitPricePaise ?? value.unitPricePaise,
                        currency,
                      )}
                      {v.inclusions ? ` · ${v.inclusions}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {value.choiceGroups?.map((g) => (
                <p key={g.id} className="text-xs">
                  {g.name}: {g.options.join(", ")}
                  {g.required ? " (required)" : ""}
                </p>
              ))}
              {value.noteLabel && (
                <p className="text-xs">
                  {value.noteLabel}
                  {value.noteRequired ? " (required)" : " (optional)"}
                </p>
              )}
              <OfferingGuestPreview key={JSON.stringify(value)} value={value} currency={currency} />
            </section>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
                className="mt-1"
              />
              I reviewed prices, room and stay eligibility, advance notice and
              confirmation settings.
            </label>
          </fieldset>
        )}
        <p className="text-xs text-slate-500">
          Prices include all charges. Immediate paid extras follow the room’s
          cancellation policy. New approval requests are excluded from checkout
          payment; the guest accepts any final hotel quote before paying. The
          quantity limit is shared across variants.
        </p>
        <div ref={feedbackRef} className="space-y-3">
          {discard && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
            >
              <p>Discard your unsaved changes?</p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  className="min-h-11 rounded-lg border bg-white px-3"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  onClick={() => setDiscard(false)}
                  className="min-h-11 px-3 font-semibold"
                >
                  Keep editing
                </button>
              </div>
            </div>
          )}
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
