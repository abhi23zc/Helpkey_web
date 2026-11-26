"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  History as HistoryIcon,
  Info,
  Loader2,
  Pencil,
  Percent,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import {
  canonical,
  fieldNames,
  fields,
  policyErrors,
  resolvePolicy,
  type Field,
  type Policy,
  type Workspace,
} from "@/lib/finance-settings/domain";
import {
  activeField,
  displayValue,
  FieldEditor,
  initialValue,
  labels,
} from "./fields";

const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-[#0b2038] !bg-[#0b2038] !text-white hover:!bg-[#173550]`;
const disclosure =
  "flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-600 [&::-webkit-details-marker]:hidden";
const sections = [
  {
    id: "commission",
    title: "Commission",
    description: "What Helpkey earns and which bookings it applies to.",
    icon: Percent,
    fields: [
      "commissionBasisPoints",
      "commissionBasis",
      "eligibleExtraCategories",
      "marketplaceCommission",
      "directCommission",
      "walkInCommission",
    ],
  },
  {
    id: "payments",
    title: "Guest payments",
    description: "Payment options and the advance required from guests.",
    icon: CreditCard,
    fields: ["guestPaymentOptions", "advance"],
  },
  {
    id: "payouts",
    title: "Payouts & hotel dues",
    description:
      "When hotel payments become eligible and how dues are tracked.",
    icon: Wallet,
    fields: [
      "payoutDelayDays",
      "payoutCycle",
      "payoutWeekday",
      "minimumPayoutPaise",
      "duesLimit",
      "duesWarningPaise",
      "duesGraceDays",
    ],
  },
] satisfies {
  id: string;
  title: string;
  description: string;
  icon: typeof Wallet;
  fields: Field[];
}[];
const hints: Partial<Record<Field, string>> = {
  commissionBasisPoints:
    "A percentage of eligible charges before guest taxes. Zero is allowed.",
  commissionBasis: "Guest taxes are excluded from the commission calculation.",
  eligibleExtraCategories:
    "Only these extra categories are included alongside room charges.",
  directCommission:
    "Reservations created by the hotel, separate from Helpkey marketplace bookings.",
  walkInCommission: "Guests who book directly at the property.",
  guestPaymentOptions:
    "Choose at least one option. Existing rate-plan terms still determine checkout payments.",
  advance:
    "Required when partial advance is allowed. A fixed advance is capped at the amount owed.",
  payoutDelayDays:
    "Whole days after actual checkout, using the booking’s saved agreement.",
  payoutCycle:
    "A suggested schedule for admin-managed payouts; no automatic transfer.",
  minimumPayoutPaise:
    "The combined final payout must reach this amount. Smaller balances can wait for the next payout.",
  duesLimit:
    "A tracking policy. Saving does not automatically restrict bookings.",
  duesWarningPaise: "Cannot exceed a configured rupee dues limit.",
  duesGraceDays:
    "Whole days allowed by the dues policy. No automatic collection is triggered.",
};
type HistoryEvent = {
  revision: number;
  actorId: string;
  actorName: string;
  createdAt: string;
  reason: string;
  scope: string;
  propertyId: string | null;
  before: Policy;
  after: Policy;
  globalRevision: number;
};
type History = { events: HistoryEvent[]; nextCursor: string | null };
export function FinanceWorkspace({
  propertyId = null,
  owner = false,
}: {
  propertyId?: string | null;
  owner?: boolean;
}) {
  return (
    <FinanceWorkspaceContent
      key={`${owner}:${propertyId}`}
      propertyId={propertyId}
      owner={owner}
    />
  );
}
function FinanceWorkspaceContent({
  propertyId,
  owner,
}: {
  propertyId: string | null;
  owner: boolean;
}) {
  const url = owner
    ? `/api/partner/properties/${propertyId}/finance-settings`
    : propertyId
      ? `/api/admin/properties/${propertyId}/finance-settings`
      : "/api/admin/finance-settings";
  const [data, setData] = useState<Workspace>();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<History>();
  const [editing, setEditing] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyLock = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<Field, string>>
  >({});
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const pending = useRef<{ body: string; id: string } | null>(null);
  const saveLock = useRef(false);
  const dirty = !owner && !!data && canonical(draft) !== canonical(data.stored);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const load = useCallback(
    async (afterSave = false) => {
      setLoading(true);
      setError("");
      try {
        const result = await apiFetch<Workspace>(url, { cache: "no-store" });
        setData(result);
        setDraft(result.stored);
        setReason("");
        setFieldErrors({});
        pending.current = null;
      } catch (e) {
        setError(
          afterSave
            ? "Your settings were saved, but the latest settings could not be refreshed. The last confirmed saved values are shown. Use Refresh saved settings to try again."
            : e instanceof Error
              ? e.message
              : "Unable to load finance settings.",
        );
      } finally {
        setLoading(false);
      }
    },
    [url],
  );
  useEffect(() => {
    let active = true;
    void apiFetch<Workspace>(url, { cache: "no-store" })
      .then((result) => {
        if (active) {
          setData(result);
          setDraft(result.stored);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Unable to load finance settings.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [url]);
  useEffect(() => {
    const message = "Discard unsaved finance settings?";
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !a ||
        !dirtyRef.current ||
        a.href === window.location.href ||
        a.target === "_blank" ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      // Stop before Next's link handler can replace its route tree. Cancelling
      // a later Navigation API event only cancels history, not that React update.
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm(message)) {
        dirtyRef.current = false;
        window.location.assign(a.href);
      }
    };
    const savedUrl = window.location.href,
      savedState: unknown = window.history.state;
    const popstate = (e: PopStateEvent) => {
      if (!dirtyRef.current) return;
      if (window.confirm(message)) {
        dirtyRef.current = false;
        return;
      }
      e.stopImmediatePropagation();
      window.history.pushState(savedState, "", savedUrl);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", popstate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", popstate, true);
    };
  }, []);
  async function readHistory(cursor?: string) {
    if (historyLock.current) return;
    historyLock.current = true;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const next = await apiFetch<History>(
        `${url}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store" },
      );
      setHistory((previous) =>
        cursor && previous
          ? { ...next, events: [...previous.events, ...next.events] }
          : next,
      );
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "Unable to load history.",
      );
    } finally {
      historyLock.current = false;
      setHistoryLoading(false);
    }
  }
  async function save() {
    if (!data || saveLock.current) return;
    setError("");
    setNotice("");
    const errors: Partial<Record<Field, string>> = {};
    for (const key of fieldNames)
      if (key in draft) {
        const parsed = fields[key].safeParse(draft[key]);
        if (!parsed.success)
          errors[key] =
            `${labels[key]}: ${parsed.error.issues.map((i) => i.message).join(" ")}`;
      }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setEditing(
        sections.find((section) => section.fields.some((key) => errors[key]))
          ?.id ?? null,
      );
      setError("Review the highlighted settings.");
      return;
    }
    const combined = { ...(propertyId ? data.global : {}), ...draft } as Policy;
    const invalid = policyErrors(combined);
    if (invalid.length) {
      const dependent: Partial<Record<Field, string>> = {};
      if (
        combined.guestPaymentOptions?.includes("partial_advance") &&
        !combined.advance
      )
        dependent.advance =
          "Set a percentage or fixed amount for partial advance.";
      if (combined.payoutCycle === "weekly" && !combined.payoutWeekday)
        dependent.payoutWeekday = "Choose a day for weekly payouts.";
      if (
        combined.commissionBasis === "rooms_and_extras" &&
        !combined.eligibleExtraCategories?.length
      )
        dependent.eligibleExtraCategories =
          "Choose at least one extra category.";
      if (
        combined.duesLimit?.type === "limited" &&
        combined.duesWarningPaise !== undefined &&
        combined.duesWarningPaise > combined.duesLimit.amountPaise
      )
        dependent.duesWarningPaise =
          "The warning threshold cannot exceed the dues limit.";
      setFieldErrors(dependent);
      setEditing(
        sections.find((section) => section.fields.some((key) => dependent[key]))
          ?.id ?? null,
      );
      setError(invalid.join(" "));
      return;
    }
    if (reason.trim().length < 3 || reason.trim().length > 500) {
      setError("Enter a reason between 3 and 500 characters.");
      return;
    }
    const body = JSON.stringify({
      changes: draft,
      remove: fieldNames.filter((k) => k in data.stored && !(k in draft)),
      expectedRevision: data.revision,
      expectedGlobalRevision: data.globalRevision,
      reason: reason.trim(),
    });
    if (pending.current?.body !== body)
      pending.current = { body, id: crypto.randomUUID() };
    saveLock.current = true;
    setSaving(true);
    try {
      const result = await apiFetch<{ revision: number; changed: boolean }>(
        url,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...JSON.parse(body),
            requestId: pending.current.id,
          }),
        },
      );
      // Preserve the exact acknowledged policy even if the subsequent refresh fails.
      const stored = draft as Policy;
      const global = propertyId ? data.global : stored;
      setData({
        ...data,
        ...resolvePolicy(global, propertyId ? stored : {}),
        stored,
        global,
        revision: result.revision,
        globalRevision: propertyId ? data.globalRevision : result.revision,
      });
      dirtyRef.current = false;
      setNotice(
        result.changed
          ? "Finance settings saved. Existing booking agreements remain unchanged."
          : "No policy changes were needed.",
      );
      setReason("");
      pending.current = null;
      await load(true);
      if (history) await readHistory();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Save failed. Your draft is retained; retry safely.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  const values = data
    ? owner
      ? data.values
      : resolvePolicy(propertyId ? data.global : {}, draft as Policy).values
    : {};
  function update(key: Field, value: unknown) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setNotice("");
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }
  function toggle(key: Field) {
    setDraft((previous) => {
      const next = { ...previous };
      if (key in next) delete next[key];
      else next[key] = key in values ? values[key] : initialValue(key);
      return next;
    });
    setNotice("");
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }
  const changedFields = data
    ? fieldNames.filter(
        (key) =>
          key in draft !== key in data.stored ||
          canonical(draft[key]) !== canonical(data.stored[key]),
      )
    : [];
  const inactiveStored = data
    ? fieldNames.filter(
        (key) =>
          key in
            (owner
              ? data.values
              : { ...(propertyId ? data.global : {}), ...draft }) &&
          !activeField(key, values as Policy),
      )
    : [];
  return (
    <section
      aria-label="Finance Settings"
      className={`mx-auto min-w-0 max-w-7xl space-y-6 text-slate-900 ${propertyId ? "" : "p-4 sm:p-6 lg:p-8"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Commercial terms
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">
            {owner ? "Effective agreement" : "Finance Settings"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {owner
              ? "Your hotel’s effective commercial agreement. Only HelpKey administrators can change these terms."
              : propertyId
                ? "Set this hotel’s terms. Settings without an override follow the global defaults."
                : "Set the default terms hotels inherit, unless they have their own agreement."}
          </p>
        </div>
        {!owner && data && (
          <button
            className={button}
            disabled={saving || loading}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Discard your draft and load the latest saved finance settings?",
                )
              )
                void load();
            }}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh saved settings
          </button>
        )}
      </header>
      <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm leading-6 text-amber-900">
        <ShieldCheck className="mt-1 size-4 shrink-0" />
        <p>
          {owner
            ? "These terms describe your agreement. Payout availability is shown in Payouts."
            : "Changes are saved only when you choose Save finance settings. Saving does not transfer money or automatically restrict bookings."}
        </p>
      </div>
      {loading && (
        <p
          role="status"
          className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500"
        >
          <Loader2 className="size-5 animate-spin" />
          Loading finance settings…
        </p>
      )}
      {error && (
        <div
          role="alert"
          ref={errorRef}
          tabIndex={-1}
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {notice}
        </div>
      )}
      {!loading && !data && (
        <button className={button} onClick={() => void load()}>
          Retry
        </button>
      )}
      {data && (
        <>
          {propertyId && (
            <p className="text-xs leading-5 text-slate-500">
              Inherited values follow future global updates. Hotel overrides
              stay fixed until removed. Existing bookings keep their saved
              agreements.
            </p>
          )}
          <div className="space-y-5">
            {sections.map((section) => {
              const open = editing === section.id,
                Icon = section.icon;
              const edited = section.fields.filter((key) =>
                changedFields.includes(key),
              );
              const visible = section.fields.filter(
                (key) =>
                  activeField(key, values as Policy) || !!fieldErrors[key],
              );
              return (
                <article
                  className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${open ? "border-amber-300 ring-1 ring-amber-100" : "border-slate-200"}`}
                  key={section.id}
                  aria-labelledby={`finance-section-${section.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
                    <div className="flex items-start gap-3">
                      <span
                        className={`rounded-xl p-3 ${open ? "bg-[#0b2038] text-amber-300" : "bg-amber-50 text-amber-700"}`}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <h3
                          id={`finance-section-${section.id}`}
                          className="font-semibold"
                        >
                          {section.title}
                        </h3>
                        <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
                          {section.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!!edited.length && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                          {edited.length} unsaved
                        </span>
                      )}
                      {!owner && (
                        <button
                          className={
                            open
                              ? button
                              : `${button} !border-transparent !text-slate-600`
                          }
                          aria-label={`${open ? "Close" : "Edit"} ${section.title.toLowerCase()}`}
                          aria-expanded={open}
                          aria-controls={`finance-fields-${section.id}`}
                          disabled={saving || loading}
                          onClick={() => setEditing(open ? null : section.id)}
                        >
                          {open ? (
                            <X className="size-3.5" />
                          ) : (
                            <Pencil className="size-3.5" />
                          )}
                          {open ? "Close editor" : "Edit"}
                        </button>
                      )}
                    </div>
                  </div>
                  <fieldset
                    id={`finance-fields-${section.id}`}
                    disabled={saving || loading}
                    className={`grid min-w-0 gap-x-8 ${open ? "gap-y-4 bg-slate-50/50 p-5 sm:p-6 lg:grid-cols-2" : "px-5 sm:px-6 sm:grid-cols-2"}`}
                  >
                    {visible.map((key) => {
                      const configured = key in draft;
                      const source = propertyId
                        ? data.provenance[key]
                        : key in data.stored
                          ? "global"
                          : "unconfigured";
                      const edited = changedFields.includes(key);
                      return (
                        <Fragment key={key}>
                          {section.id === "payouts" &&
                            (key === "payoutDelayDays" ||
                              key === "duesLimit") && (
                              <p className="col-span-full mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                {key === "duesLimit"
                                  ? "Hotel dues"
                                  : "Payout rules"}
                              </p>
                            )}
                          <div
                            data-finance-field={key}
                            key={key}
                            className={`min-w-0 ${open ? "space-y-3 rounded-xl border border-slate-200 bg-white p-4" : "space-y-1 border-b border-slate-100 py-4 last:border-0"}`}
                          >
                            <div>
                              <h3
                                className={`text-sm ${open ? "font-semibold text-slate-900" : "font-normal text-slate-500"}`}
                              >
                                {labels[key]}
                              </h3>
                              {propertyId && (
                                <p
                                  className={`mt-1 text-xs ${source === "overridden" ? "text-amber-800" : "text-slate-500"}`}
                                >
                                  {source === "overridden"
                                    ? "Overridden for this hotel"
                                    : source === "inherited"
                                      ? "Inherited from global defaults"
                                      : "Not configured"}
                                </p>
                              )}
                            </div>
                            <p
                              className={`break-words text-sm ${open ? "text-slate-500" : "font-medium text-slate-900"}`}
                            >
                              {open ? (
                                <span>
                                  Saved effective:{" "}
                                  {displayValue(key, data.values[key])}
                                </span>
                              ) : (
                                displayValue(key, values[key])
                              )}
                            </p>
                            {!activeField(key, values as Policy) && (
                              <p className="text-xs text-amber-800">
                                Inactive — complete or remove this draft setting
                                before saving.
                              </p>
                            )}
                            {edited && (
                              <p className="text-xs leading-5 text-amber-800">
                                Unsaved:{" "}
                                {configured
                                  ? displayValue(key, draft[key])
                                  : propertyId
                                    ? `Use global default · ${displayValue(key, data.global[key])}`
                                    : "Remove configuration"}
                              </p>
                            )}
                            {open && !owner && (
                              <>
                                {hints[key] && (
                                  <p className="text-xs leading-5 text-slate-500">
                                    {hints[key]}
                                  </p>
                                )}
                                {configured ? (
                                  <FieldEditor
                                    name={key}
                                    value={draft[key]}
                                    onChange={(v) => update(key, v)}
                                  />
                                ) : (
                                  <p className="text-xs leading-5 text-slate-500">
                                    {propertyId
                                      ? `Global default: ${displayValue(key, data.global[key])}`
                                      : "Not configured yet. Choose Configure to enter a value."}
                                  </p>
                                )}
                                {fieldErrors[key] && (
                                  <p
                                    role="alert"
                                    className="text-xs leading-5 text-rose-800"
                                  >
                                    {fieldErrors[key]}
                                  </p>
                                )}
                                <button
                                  type="button"
                                  className={
                                    configured
                                      ? "min-h-9 text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 disabled:opacity-50"
                                      : `${button} !min-h-9 !px-3 !text-xs`
                                  }
                                  onClick={() => toggle(key)}
                                >
                                  {configured
                                    ? propertyId
                                      ? "Return to global default"
                                      : "Remove configuration"
                                    : propertyId
                                      ? "Override this setting"
                                      : "Configure"}
                                </button>
                              </>
                            )}
                          </div>
                        </Fragment>
                      );
                    })}
                  </fieldset>
                  {open && (
                    <p className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500 sm:px-6">
                      {section.id === "commission"
                        ? "Guest taxes are excluded. Direct reservations and walk-ins can use separate applicability settings."
                        : section.id === "payments"
                          ? "Existing room rate-plan terms still control the actual checkout split. These options do not rewrite existing bookings."
                          : "Payout schedules guide the admin. Eligibility and final deductions are checked in Payouts; dues settings do not automatically collect money or block bookings."}{" "}
                      Changes in this editor remain a draft until saved.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {!owner && (
            <div
              className={`rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${dirty ? "sticky bottom-3 z-10 border-amber-200 shadow-lg" : "border-slate-200"}`}
            >
              {dirty && (
                <label className="mb-4 block text-sm font-medium">
                  Reason for this save
                  <textarea
                    className="mt-2 block min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                    maxLength={500}
                    value={reason}
                    disabled={saving || loading}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Briefly explain the agreement or change (3–500 characters)"
                  />
                </label>
              )}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p
                    className={`flex items-center gap-2 text-sm font-semibold ${dirty ? "text-amber-900" : "text-slate-700"}`}
                  >
                    {dirty ? (
                      <Pencil className="size-4" />
                    ) : (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    )}
                    {dirty ? "Unsaved edits" : "No unsaved changes"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {dirty
                      ? `${changedFields.length} ${changedFields.length === 1 ? "setting" : "settings"} changed. All edited sections will be saved together.`
                      : "Open a section to edit its terms. Existing hotel overrides are preserved."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dirty && (
                    <button
                      className={button}
                      disabled={saving || loading}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Discard all unsaved finance settings?",
                          )
                        ) {
                          setDraft(data.stored);
                          setReason("");
                          setError("");
                          setFieldErrors({});
                          pending.current = null;
                        }
                      }}
                    >
                      Discard edits
                    </button>
                  )}
                  <button
                    className={primary}
                    disabled={!dirty || saving || loading}
                    onClick={() => void save()}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {saving ? "Saving…" : "Save finance settings"}
                  </button>
                </div>
              </div>
            </div>
          )}
          <details className="rounded-xl border border-slate-200 bg-white px-5 py-4">
            <summary className={disclosure}>
              <span className="flex items-center gap-2">
                <Info className="size-4" />
                How these settings work
              </span>
              <ChevronDown className="size-4" />
            </summary>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>
                Commission applies to eligible charges before guest taxes.
                Commission tax, statutory deductions and payment fees are
                reviewed separately in the payout workflow.
              </p>
              <p>
                Guest payment options describe when the guest pays; payout
                settings describe when the hotel may receive money. Existing
                room rate-plan payment terms still determine actual checkout
                payments.
              </p>
              <p>
                Settings stay unconfigured unless explicitly saved. Inactive
                dependent values are retained and have no effect until their
                controlling option is enabled.
              </p>
              {inactiveStored.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold">
                    Stored inactive settings · {inactiveStored.length}
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    {inactiveStored.map((key) => (
                      <p key={key}>
                        {labels[key]}: {displayValue(key, values[key])} ·
                        Inactive
                      </p>
                    ))}
                  </div>
                </details>
              )}
              <p className="text-xs">
                Limits: money ₹0–₹1 crore; whole days 0–365; commission 0–100%;
                percentage advance 1–100%; fixed advance at least ₹0.01. Money
                and percentages support two decimal places.
              </p>
              <p className="text-xs text-slate-500">
                Saved revision {data.revision} · Global revision{" "}
                {data.globalRevision}
              </p>
            </div>
          </details>
          {!owner && (
            <details
              className="rounded-xl border border-slate-200 bg-white px-5 py-4"
              onToggle={(e) => {
                if (e.currentTarget.open && !history && !historyLoading)
                  void readHistory();
              }}
            >
              <summary className={disclosure}>
                <span className="flex items-center gap-2">
                  <HistoryIcon className="size-4" />
                  Change history
                </span>
                <ChevronDown className="size-4" />
              </summary>
              <div className="mt-4 space-y-3">
                {historyLoading && (
                  <p className="text-sm text-slate-500">
                    Loading change history…
                  </p>
                )}
                {historyError && (
                  <p role="alert" className="text-sm text-rose-800">
                    {historyError}
                  </p>
                )}
                {historyError && (
                  <button
                    className={button}
                    disabled={historyLoading}
                    onClick={() => void readHistory()}
                  >
                    Retry history
                  </button>
                )}
                {history && !history.events.length && (
                  <p className="text-sm text-slate-500">
                    No saved changes yet.
                  </p>
                )}
                {history?.events.map((event) => (
                  <details
                    className="rounded-xl border border-slate-200 p-4"
                    key={event.revision}
                  >
                    <summary className={disclosure}>
                      <span className="min-w-0 break-words">
                        Revision {event.revision} · {event.actorName}
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          {event.createdAt
                            ? new Date(event.createdAt).toLocaleString(
                                "en-IN",
                                { timeZone: "Asia/Kolkata" },
                              )
                            : "Time pending"}
                        </span>
                      </span>
                      <ChevronDown className="size-4 shrink-0" />
                    </summary>
                    <p className="my-3 break-words text-sm text-slate-700">
                      {event.reason}
                    </p>
                    <ul className="space-y-2 text-sm text-slate-600">
                      {fieldNames
                        .filter(
                          (k) =>
                            canonical(event.before[k] ?? null) !==
                            canonical(event.after[k] ?? null),
                        )
                        .map((k) => (
                          <li key={k}>
                            <strong className="font-medium">
                              {labels[k]}:
                            </strong>{" "}
                            {displayValue(k, event.before[k])}{" "}
                            <ArrowRight className="mx-1 inline size-3" />{" "}
                            {displayValue(k, event.after[k])}
                            {propertyId && !(k in event.after)
                              ? " (override removed; inherits global)"
                              : ""}
                          </li>
                        ))}
                    </ul>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-slate-500">
                        Audit details
                      </summary>
                      <p className="mt-2 break-all text-xs text-slate-500">
                        {event.scope === "global"
                          ? "Global defaults"
                          : `Hotel ${event.propertyId}`}{" "}
                        · Actor {event.actorId} · Global revision{" "}
                        {event.globalRevision}
                      </p>
                    </details>
                  </details>
                ))}
                {history?.nextCursor && (
                  <button
                    className={button}
                    disabled={historyLoading}
                    onClick={() => void readHistory(history.nextCursor!)}
                  >
                    Load older changes
                  </button>
                )}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
