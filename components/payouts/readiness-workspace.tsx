"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { offeringCategoryLabels } from "@/lib/stay/contracts";
import { bankSchema, businessAddressText } from "@/lib/payout-readiness/domain";
import type { readReadiness } from "@/lib/payout-readiness/service";
type View = Awaited<ReturnType<typeof readReadiness>>;
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const button =
  "inline-flex max-w-full min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";
const card =
  "min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7";
const emptyBank = {
  holderName: "",
  accountNumber: "",
  confirmation: "",
  ifsc: "",
  bankName: "",
};
const termLabels: Record<string, string> = {
  commissionBasisPoints: "Commission",
  commissionBasis: "Commission applies to",
  eligibleExtraCategories: "Applicable extras",
  marketplaceCommission: "Marketplace bookings",
  directCommission: "Direct bookings",
  walkInCommission: "Walk-in bookings",
  payoutDelayDays: "Waiting period (days)",
  minimumPayoutPaise: "Minimum payout",
  payoutCycle: "Payout cycle",
  payoutWeekday: "Weekly payout day",
};
const businessLabels: Record<string, string> = {
  businessName: "Business name",
  businessEmail: "Business email",
  businessPhone: "Business phone",
  legalName: "Legal business name",
  address: "Business address",
  contact: "Business contact",
  state: "State",
  stateCode: "State code",
  registration: "Registration",
  gstin: "GSTIN",
  line1: "Address line 1",
  line2: "Address line 2",
  city: "City",
  postalCode: "Postal code",
  countryCode: "Country code",
};
function reviewDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return "Date not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
function termValue(key: string, value: unknown) {
  if (key === "commissionBasisPoints" && typeof value === "number")
    return `${value / 100}%`;
  if (key === "minimumPayoutPaise" && typeof value === "number")
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(value / 100);
  if (key === "commissionBasis")
    return value === "rooms"
      ? "Room charges only, before guest taxes"
      : "Room charges and eligible extras, before guest taxes";
  if (key === "payoutCycle") return value === "daily" ? "Daily" : "Weekly";
  if (key === "payoutWeekday")
    return String(value).replace(/^./, (c) => c.toUpperCase());
  if (typeof value === "boolean")
    return value ? "Applicable" : "Not applicable";
  if (Array.isArray(value))
    return value
      .map(
        (v) =>
          offeringCategoryLabels[String(v)] ?? String(v).replaceAll("_", " "),
      )
      .join(", ");
  return String(value).replaceAll("_", " ");
}
export function ReadinessWorkspace({
  propertyId,
  owner = false,
}: {
  propertyId: string;
  owner?: boolean;
}) {
  const endpoint = `/api/${owner ? "partner" : "admin"}/properties/${encodeURIComponent(propertyId)}/${owner ? "bank-details" : "payout-readiness"}`;
  const [data, setData] = useState<View | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [bank, setBank] = useState(emptyBank),
    [editingBank, setEditingBank] = useState(false),
    [revealed, setRevealed] = useState("");
  const [note, setNote] = useState({ business: "", bank: "", commercial: "" });
  const [businessDraft, setBusinessDraft] = useState<Record<
    string,
    unknown
  > | null>(null);
  const retry = useRef<{ payload: string; requestId: string } | null>(null);
  const operationLock = useRef(false);
  const revealEpoch = useRef(0);
  const loadEpoch = useRef(0);
  const mounted = useRef(true);
  const [bankErrors, setBankErrors] = useState<Record<string, string>>({});
  const hideAccount = useCallback(() => {
    revealEpoch.current += 1;
    setRevealed("");
  }, []);
  async function refresh() {
    hideAccount();
    const epoch = ++loadEpoch.current;
    try {
      const value = await apiFetch<View>(endpoint, { cache: "no-store" });
      if (mounted.current && epoch === loadEpoch.current) {
        setData(value);
        setError("");
      }
    } catch (e) {
      if (mounted.current && epoch === loadEpoch.current)
        setError(e instanceof Error ? e.message : "Unable to load details.");
    }
  }
  useEffect(() => {
    mounted.current = true;
    const epoch = ++loadEpoch.current;
    const controller = new AbortController();
    apiFetch<View>(endpoint, { cache: "no-store", signal: controller.signal })
      .then((v) => {
        if (mounted.current && epoch === loadEpoch.current) setData(v);
      })
      .catch((e) => {
        if (
          !controller.signal.aborted &&
          mounted.current &&
          epoch === loadEpoch.current
        )
          setError(e.message);
      });
    // Invalidate pending reveals even when the number has not arrived yet.
    window.addEventListener("blur", hideAccount);
    document.addEventListener("visibilitychange", hideAccount);
    return () => {
      mounted.current = false;
      revealEpoch.current += 1;
      loadEpoch.current += 1;
      controller.abort();
      window.removeEventListener("blur", hideAccount);
      document.removeEventListener("visibilitychange", hideAccount);
    };
  }, [endpoint, hideAccount]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(hideAccount, 30_000);
    return () => clearTimeout(timer);
  }, [revealed, hideAccount]);
  async function command(body: Record<string, unknown>) {
    if (!data || operationLock.current) return;
    if (body.action === "bank") {
      const parsed = bankSchema.safeParse(body.bank);
      if (!parsed.success) {
        setBankErrors(
          Object.fromEntries(
            parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
          ),
        );
        setError("Check the highlighted bank details.");
        return;
      }
    }
    operationLock.current = true;
    setBankErrors({});
    const payload = JSON.stringify({ ...body, expectedVersion: data.version });
    if (retry.current?.payload !== payload)
      retry.current = { payload, requestId: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    hideAccount();
    try {
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          ...JSON.parse(payload),
          requestId: retry.current.requestId,
        }),
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      retry.current = null;
      setNotice("Saved. Reviews reflect the current information.");
      if (body.action === "bank") {
        setBank(emptyBank);
        setEditingBank(false);
      }
      if (body.action === "profile" || body.action === "invoice")
        setBusinessDraft(null);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Save failed. Your draft is retained.",
      );
    } finally {
      operationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function reveal() {
    if (!data || operationLock.current) return;
    operationLock.current = true;
    const epoch = ++revealEpoch.current;
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ accountNumber: string }>(
        `${endpoint}/reveal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedBankVersion: data.bankVersion }),
          cache: "no-store",
        },
      );
      if (
        mounted.current &&
        epoch === revealEpoch.current &&
        document.visibilityState === "visible"
      )
        setRevealed(r.accountNumber);
    } catch (e) {
      if (mounted.current && epoch === revealEpoch.current)
        setError(e instanceof Error ? e.message : "Reveal failed.");
    } finally {
      operationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function review(section: "business" | "bank" | "commercial") {
    return (
      <div className="space-y-3 border-t border-slate-100 pt-4">
        <p className="text-sm">
          {data?.reviewed?.[section] ? "Reviewed" : "Needs admin review"}
          {data?.reviews?.[section] && (
            <>
              {" "}
              · Last checked {reviewDate(data.reviews[section]?.at)}
              <br />
              {data.reviews[section]?.note}
            </>
          )}
        </p>
        <label className="block text-sm">
          {section === "bank"
            ? "Describe the external admin check (format checks are not bank verification)"
            : "Review note"}
          <input
            className={inputClass}
            disabled={busy}
            value={note[section]}
            maxLength={500}
            onChange={(e) => setNote({ ...note, [section]: e.target.value })}
          />
        </label>
        <button
          className={button}
          disabled={
            busy ||
            !data?.complete?.[section] ||
            note[section].trim().length < 3
          }
          onClick={() =>
            void command({ action: "review", section, note: note[section] })
          }
        >
          Mark{" "}
          {section === "commercial" ? "commercial terms" : `${section} details`}{" "}
          Reviewed
        </button>
      </div>
    );
  }
  return (
    <main className="mx-auto min-w-0 w-full max-w-5xl space-y-6 [overflow-wrap:anywhere] p-4 text-slate-900 sm:p-8">
      <Link
        className="text-sm underline"
        href={
          owner
            ? `/partner/payouts?propertyId=${propertyId}`
            : `/admin/payouts?propertyId=${propertyId}`
        }
      >
        Back to Hotel Payouts
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">
          {owner ? "Bank details" : "Hotel business and payout readiness"}
        </h1>
        <p>{data?.hotelName}</p>
        <p className="text-sm text-slate-600">
          Setup and reviews are advisory. Existing hotels and prepared payouts
          can continue.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-900">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4">
          {notice}
        </p>
      )}
      <button className={button} disabled={busy} onClick={() => void refresh()}>
        Refresh latest information
      </button>
      {!data ? (
        error ? (
          <p className="text-sm text-slate-600">
            Unable to load details. Use Refresh latest information to try again.
          </p>
        ) : (
          <p role="status">Loading private details…</p>
        )
      ) : (
        <>
          {!owner && (
            <section className={card}>
              <h2 className="text-lg font-semibold">{data.status}</h2>
              {data.next && (
                <a
                  className={`${button} bg-slate-900 text-white`}
                  href={`#${data.next}`}
                >
                  {data.complete?.[data.next] ? "Review" : "Complete"}{" "}
                  {data.next === "commercial"
                    ? "commercial terms"
                    : `${data.next} details`}
                </a>
              )}
              {!data.next && (
                <Link
                  className={`${button} bg-slate-900 text-white`}
                  href={`/admin/payouts?propertyId=${encodeURIComponent(propertyId)}`}
                >
                  View hotel payouts
                </Link>
              )}
            </section>
          )}
          {!owner && data.business && (
            <section id="business" className={card}>
              <h2 className="text-lg font-semibold">Business details</h2>
              <p className="text-sm">Hotel display name: {data.hotelName}</p>
              <p className="text-sm text-slate-600">
                {data.business.source === "invoice"
                  ? "Configured invoice legal identity. Issued registration identity remains locked; unrelated invoice settings are preserved."
                  : "Existing partner business profile. No invoice or tax setup is required. Editing this shared profile affects every hotel belonging to this owner."}
              </p>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt>Business name</dt>
                  <dd>{data.business.businessName || "Missing"}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>
                    {businessAddressText(data.business.address) || "Missing"}
                  </dd>
                </div>
                <div>
                  <dt>Business contact</dt>
                  <dd>{data.business.contact || "Missing"}</dd>
                </div>
                <div>
                  <dt>Registration / GSTIN</dt>
                  <dd>
                    {data.business.registration ?? "Not configured"} ·{" "}
                    {data.business.gstin || "Not supplied"}
                  </dd>
                </div>
              </dl>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  setBusinessDraft(
                    structuredClone(
                      (data.business?.source === "invoice"
                        ? data.invoiceIdentity
                        : data.profile) ?? {},
                    ),
                  )
                }
              >
                Edit business details
              </button>
              {businessDraft && (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void command(
                      data.business?.source === "invoice"
                        ? { action: "invoice", identity: businessDraft }
                        : { action: "profile", profile: businessDraft },
                    );
                  }}
                >
                  {Object.entries(businessDraft).map(([key, value]) =>
                    key === "businessAddress" ? (
                      <fieldset className="space-y-2" key={key}>
                        <legend>Business address</legend>
                        {[
                          "line1",
                          "line2",
                          "city",
                          "state",
                          "postalCode",
                          "countryCode",
                        ].map((k) => (
                          <label className="block text-sm" key={k}>
                            {businessLabels[k] ?? k}
                            <input
                              className={inputClass}
                              disabled={busy}
                              value={String(
                                (value as Record<string, unknown>)?.[k] ??
                                  (k === "countryCode" ? "IN" : ""),
                              )}
                              onChange={(e) =>
                                setBusinessDraft({
                                  ...businessDraft,
                                  businessAddress: {
                                    ...(value as object),
                                    [k]: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <label className="block text-sm" key={key}>
                        {businessLabels[key] ?? key}
                        <input
                          className={inputClass}
                          disabled={
                            busy ||
                            (data.invoiceUsed &&
                              ["gstin", "registration"].includes(key))
                          }
                          value={String(value ?? "")}
                          onChange={(e) =>
                            setBusinessDraft({
                              ...businessDraft,
                              [key]: e.target.value,
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                  <button className={button} disabled={busy}>
                    Save business details
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => setBusinessDraft(null)}
                  >
                    Cancel edit
                  </button>
                </form>
              )}
              {review("business")}
            </section>
          )}
          <section id="bank" className={card}>
            <h2 className="text-lg font-semibold">Bank details</h2>
            <p className="text-sm text-slate-600">
              Account and IFSC format checks are not bank verification. Only the
              current owner and active admins can access these details.
            </p>
            {!data.storageAvailable && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm">
                Bank details cannot be saved or revealed right now. Contact
                Helpkey support. Existing payouts can continue.
              </p>
            )}
            {data.bank ? (
              <div className="space-y-2 text-sm">
                <p>
                  {data.bank.holderName} · {data.bank.bankName}
                </p>
                <p>
                  {revealed || data.bank.maskedAccount} · {data.bank.ifsc}
                </p>
                <button
                  className={button}
                  disabled={busy || !data.storageAvailable}
                  onClick={() => (revealed ? hideAccount() : void reveal())}
                >
                  {revealed
                    ? "Hide account number"
                    : "Reveal account number for 30 seconds"}
                </button>
              </div>
            ) : (
              <p className="text-sm">
                No bank details saved for the current owner.
              </p>
            )}
            <button
              className={button}
              disabled={busy || !data.storageAvailable}
              onClick={() => {
                hideAccount();
                setBankErrors({});
                setEditingBank(true);
              }}
            >
              Update bank details
            </button>
            {editingBank && (
              <form
                autoComplete="off"
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void command({ action: "bank", bank });
                }}
              >
                {(Object.keys(emptyBank) as (keyof typeof emptyBank)[]).map(
                  (k) => (
                    <div key={k} className="text-sm">
                      <label htmlFor={`bank-${k}`}>
                        {
                          {
                            holderName: "Account holder name",
                            accountNumber: "Account number",
                            confirmation: "Confirm account number",
                            ifsc: "IFSC",
                            bankName: "Bank name",
                          }[k]
                        }
                      </label>
                      <input
                        id={`bank-${k}`}
                        autoComplete="off"
                        disabled={busy}
                        type={
                          k === "accountNumber" || k === "confirmation"
                            ? "password"
                            : "text"
                        }
                        inputMode={
                          k === "accountNumber" || k === "confirmation"
                            ? "numeric"
                            : "text"
                        }
                        required
                        maxLength={
                          k === "accountNumber" || k === "confirmation"
                            ? 24
                            : k === "ifsc"
                              ? 11
                              : 160
                        }
                        aria-invalid={!!bankErrors[k]}
                        aria-describedby={
                          bankErrors[k] ? `bank-${k}-error` : undefined
                        }
                        className={inputClass}
                        value={bank[k]}
                        onChange={(e) => {
                          setBank({ ...bank, [k]: e.target.value });
                          setBankErrors((old) => ({ ...old, [k]: "" }));
                        }}
                      />
                      {bankErrors[k] && (
                        <span
                          id={`bank-${k}-error`}
                          className="mt-1 block text-xs text-rose-700"
                        >
                          {bankErrors[k]}
                        </span>
                      )}
                    </div>
                  ),
                )}
                <button className={button} disabled={busy}>
                  Save bank details
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    setBank(emptyBank);
                    setEditingBank(false);
                  }}
                >
                  Cancel edit
                </button>
              </form>
            )}
            {!owner && review("bank")}
          </section>
          {!owner && (
            <section id="commercial" className={card}>
              <h2 className="text-lg font-semibold">Commercial terms</h2>
              <dl className="space-y-3 text-sm">
                {Object.entries(termLabels)
                  .filter(
                    ([k]) =>
                      data.commercial?.[k] ||
                      !["eligibleExtraCategories", "payoutWeekday"].includes(k),
                  )
                  .map(([k, label]) => {
                    const term = data.commercial?.[k];
                    return (
                      <div
                        key={businessLabels[k] ?? k}
                        className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2"
                      >
                        <dt>{label}</dt>
                        <dd>
                          {term ? termValue(k, term.value) : "Not configured"}
                          <span className="ml-3 text-slate-500">
                            {term
                              ? term.source === "overridden"
                                ? "Custom for this hotel"
                                : "Using Helpkey’s default"
                              : ""}
                          </span>
                        </dd>
                      </div>
                    );
                  })}
              </dl>
              <Link
                className={button}
                href={`/admin/finance-settings?propertyId=${encodeURIComponent(propertyId)}`}
              >
                Edit finance settings
              </Link>
              <p className="text-sm text-slate-600">
                Confirm the displayed effective terms. Saved booking and service
                agreements keep their original terms.
              </p>
              {review("commercial")}
            </section>
          )}
        </>
      )}
    </main>
  );
}
