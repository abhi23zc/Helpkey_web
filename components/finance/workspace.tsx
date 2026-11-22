"use client";
import { AccountWorkspace } from "./account-workspace";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import {
  profileSchema,
  policySchema,
  overrideSchema,
  type FinancePolicy,
  type FinanceProfile,
  type FinanceOverrides,
} from "@/lib/finance/domain";
import { buttonClass, fieldClass, PolicyEditor } from "./policy-editor";
type Snapshot = {
  global: { policy: FinancePolicy; revision: number };
  agreement: { revision: number; title: string; documentUrl: string } | null;
  overrides: FinanceOverrides;
  overrideRevision: number;
  effective: FinancePolicy;
  sources: Record<string, string>;
  profile: FinanceProfile;
  profileRevision: number;
  contentRevision: number;
  profileState: string;
  review: {
    notes: string;
    reviewedProfileRevision: number;
    reviewer: string;
    reviewedAt: string;
  } | null;
  acceptance: { agreementVersion: number; acceptedAt: string } | null;
  readiness: {
    businessDetails: boolean;
    documents: boolean;
    agreementAcceptance: boolean;
    manualReview: boolean;
    providerVerification: string;
    payoutsEnabled: boolean;
  };
  documents: { id: string; label: string }[];
  invoicePrefill: {
    legalName: string;
    address: string;
    contact: string;
    registration: FinanceProfile["gstStatus"];
    gstin: string;
  } | null;
};
export function FinanceWorkspace({
  admin = false,
  propertyId,
}: {
  admin?: boolean;
  propertyId?: string;
}) {
  const base = admin
    ? `/api/admin/finance${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`
    : `/api/partner/properties/${encodeURIComponent(propertyId || "")}/finance`;
  const query = useQuery({
    queryKey: ["private", "finance", admin, propertyId],
    queryFn: () => apiFetch<Snapshot>(base, { cache: "no-store" }),
    retry: false,
  });
  const [draft, setDraft] = useState<FinanceOverrides | null>(null);
  const [profile, setProfile] = useState<FinanceProfile | null>(null);
  const [basis, setBasis] = useState<{
    global: number;
    override: number;
    profile: number;
    agreement: number;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<{
    fingerprint: string;
    id: string;
  } | null>(null);
  const data = query.data;
  function captureBasis() {
    if (!basis && data) setBasis(revisions());
  }
  const revisions = () => ({
    global: data!.global.revision,
    override: data!.overrideRevision,
    profile: data!.profileRevision,
    agreement: data!.agreement?.revision ?? 0,
  });
  function editPolicy(v: FinanceOverrides) {
    if (!basis) setBasis(revisions());
    setDraft(v);
  }
  function editProfile(v: FinanceProfile) {
    if (!basis) setBasis(revisions());
    setProfile(v);
  }
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const payload = { ...body, reason };
      const fingerprint = JSON.stringify(payload);
      const id =
        pending?.fingerprint === fingerprint ? pending.id : crypto.randomUUID();
      setPending({ fingerprint, id });
      const result = await apiFetch<{ revision: number }>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, mutationId: id }),
      });
      setPending(null);
      // A save belongs to one section. Retain other drafts and their original
      // revisions, so a separate successful save cannot hide a stale edit.
      if (body.action === "global" || body.action === "overrides")
        setDraft(null);
      if (body.action === "profile") setProfile(null);
      if (body.action === "review") setNotes("");
      if (body.action === "publish") {
        setTitle("");
        setDocumentUrl("");
      }
      const section = body.action === "global"
        ? "global"
        : body.action === "overrides"
          ? "override"
          : body.action === "publish" ? "agreement" : "profile";
      setBasis((current) =>
        current ? { ...current, [section]: result.revision } : null,
      );
      setConflict(false);
      setMessage("Saved.");
      await query.refetch();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
      if (e instanceof ApiClientError && e.status === 409) {
        setConflict(true);
        await query.refetch();
      }
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p role="status">Loading finance…</p>;
  if (query.isError || !data)
    return (
      <div role="alert">
        {query.error?.message || "Could not load finance"}{" "}
        <button onClick={() => void query.refetch()}>Retry</button>
      </div>
    );
  const p = profile ?? data.profile;
  const b = basis ?? revisions();
  const profileField = (
    k: keyof FinanceProfile,
    label: string,
    type = "text",
  ) => (
    <label className="block text-sm" key={k}>
      {label}
      <input
        className={fieldClass}
        type={type}
        value={String(p[k])}
        onChange={(e) => editProfile({ ...p, [k]: e.target.value })}
      />
    </label>
  );
  const selectField = (
    k: keyof FinanceProfile,
    label: string,
    options: string[],
  ) => (
    <label className="block text-sm">
      {label}
      <select
        className={fieldClass}
        value={String(p[k])}
        onChange={(e) => editProfile({ ...p, [k]: e.target.value })}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
        Phase 1 saves finance configuration only. Booking calculations, dues
        enforcement, schedules and transfers connect in later phases.
        Bank-account entry and provider onboarding arrive in Phase 7.
      </div>
      {message && (
        <p role="status" className="rounded-xl border bg-white p-3">
          {message}
        </p>
      )}
      {conflict && (
        <section className="rounded-xl border border-amber-300 p-4">
          <p>
            Your draft is retained. Current revisions: global{" "}
            {data.global.revision}, hotel {data.overrideRevision ?? 0}, profile{" "}
            {data.profileRevision ?? 0}. Review current values below before
            applying your draft.
          </p>
          <details>
            <summary>Current saved values</summary>
            <pre className="overflow-auto text-xs">
              {JSON.stringify(
                {
                  policy: propertyId ? data.effective : data.global.policy,
                  profile: data.profile,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <button
            className={buttonClass}
            onClick={() => {
              setBasis(revisions());
              setPending(null);
              setConflict(false);
              setMessage(
                "Current revisions loaded. Review your retained draft and save when ready.",
              );
            }}
          >
            Use current revisions for retained draft
          </button>
        </section>
      )}
      {admin && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">
            {propertyId ? "Hotel policy overrides" : "Global finance settings"}
          </h2>
          <p className="text-sm text-slate-500">
            Global revision {data.global.revision}
            {propertyId ? ` · Override revision ${data.overrideRevision}` : ""}
          </p>
          <PolicyEditor
            global={data.global.policy}
            overrides={
              draft ?? (propertyId ? data.overrides : data.global.policy)
            }
            onChange={editPolicy}
            hotel={!!propertyId}
          />
          <label className="block text-sm">
            Reason for change
            <input
              className={fieldClass}
              value={reason}
              onChange={(e) => {
                captureBasis();
                setReason(e.target.value);
              }}
            />
          </label>
          <button
            className={buttonClass}
            disabled={busy || conflict || reason.trim().length < 3}
            onClick={() => {
              const candidate =
                draft ?? (propertyId ? data.overrides : data.global.policy);
              const parsed = (
                propertyId ? overrideSchema : policySchema
              ).safeParse(candidate);
              if (!parsed.success) {
                setMessage(
                  parsed.error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; "),
                );
                return;
              }
              void save(
                propertyId
                  ? {
                      action: "overrides",
                      expectedRevision: b.override,
                      globalRevision: b.global,
                      overrides: parsed.data,
                    }
                  : {
                      action: "global",
                      expectedRevision: b.global,
                      policy: parsed.data,
                    },
              );
            }}
          >
            Save {propertyId ? "hotel overrides" : "global settings"}
          </button>
        </section>
      )}
      {!admin && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">
            Effective finance settings
          </h2>
          <PolicyEditor
            global={data.global.policy}
            overrides={data.overrides}
            onChange={() => {}}
            hotel
            readOnly
          />
        </section>
      )}
      {propertyId && (
        <section className="space-y-4 rounded-2xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Hotel finance profile</h2>
          <p>
            Status: {data.profileState.replaceAll("_", " ")} · Revision{" "}
            {data.profileRevision}
          </p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>
              Business details:{" "}
              {data.readiness.businessDetails ? "Complete" : "Required"}
            </li>
            <li>
              Documents: {data.readiness.documents ? "Complete" : "Required"}
            </li>
            <li>
              Manual review:{" "}
              {data.readiness.manualReview ? "Reviewed" : "Required"}
            </li>
            <li>
              Agreement:{" "}
              {data.readiness.agreementAcceptance
                ? "Accepted"
                : "Acceptance required"}
            </li>
            <li>Provider verification: Not started</li>
            <li>Payouts: Not enabled · Phase 7 dependency</li>
          </ul>
          {!data.readiness.documents && data.profile.documentIds.length > 0 && (
            <p role="alert" className="text-sm text-amber-800">
              Supporting documents are missing or unavailable. The hotel owner
              must select current documents and resubmit the profile before it
              can be marked reviewed.
            </p>
          )}
          {data.review && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p>Review feedback: {data.review.notes}</p>
              <p className="text-xs">
                Profile revision {data.review.reviewedProfileRevision} ·{" "}
                {data.review.reviewer} · {data.review.reviewedAt}
              </p>
            </div>
          )}
          {admin ? (
            <>
              <a
                className="text-sm underline"
                href={`/admin/properties/${encodeURIComponent(propertyId)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open hotel supporting documents
              </a>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {Object.entries(data.profile)
                  .filter(([k]) => k !== "documentIds")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-slate-500">
                        {k.replace(/([A-Z])/g, " $1")}
                      </dt>
                      <dd>{String(v) || "—"}</dd>
                    </div>
                  ))}
              </dl>
              <p>
                Supporting documents:{" "}
                {data.profile.documentIds
                  .map(
                    (id) =>
                      data.documents.find((d) => d.id === id)?.label || id,
                  )
                  .join(", ") || "None"}
              </p>
              <label className="block text-sm">
                Review notes
                <textarea
                  className={fieldClass}
                  value={notes}
                  onChange={(e) => {
                    captureBasis();
                    setNotes(e.target.value);
                  }}
                />
              </label>
              <div className="flex gap-3">
                {(["changes_requested", "manually_reviewed"] as const).map(
                  (decision) => (
                    <button
                      key={decision}
                      className={buttonClass}
                      disabled={
                        busy ||
                        conflict ||
                        data.profileState !== "submitted" ||
                        (decision === "manually_reviewed" &&
                          (!data.readiness.businessDetails ||
                            !data.readiness.documents)) ||
                        notes.trim().length < 3 ||
                        reason.trim().length < 3
                      }
                      onClick={() =>
                        void save({
                          action: "review",
                          expectedRevision: b.profile,
                          decision,
                          notes,
                        })
                      }
                    >
                      {decision === "changes_requested"
                        ? "Request changes"
                        : "Mark manually reviewed"}
                    </button>
                  ),
                )}
              </div>
            </>
          ) : (
            <>
              {data.invoicePrefill && (
                <button
                  className="text-sm underline"
                  onClick={() => {
                    const i = data.invoicePrefill!;
                    editProfile({
                      ...p,
                      legalPayeeName: i.legalName,
                      businessAddress: i.address,
                      gstStatus: i.registration,
                      gstin: i.gstin,
                      pan: i.gstin ? i.gstin.slice(2, 12) : p.pan,
                    });
                  }}
                >
                  Prefill draft from invoice settings
                </button>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {profileField("legalPayeeName", "Legal payee name")}
                {selectField("entityType", "Entity type", [
                  "individual",
                  "proprietorship",
                  "partnership",
                  "company",
                  "trust",
                  "other",
                ])}
                {profileField("businessAddress", "Business address")}
                {profileField("businessEmail", "Business email", "email")}
                {profileField("businessPhone", "Business phone", "tel")}
                {profileField("pan", "PAN")}
                {selectField("gstStatus", "GST registration status", [
                  "unregistered",
                  "registered",
                  "composition",
                  "exempt",
                ])}
                {profileField("gstin", "GSTIN")}
                {selectField(
                  "operatingRelationship",
                  "Property ownership / operating relationship",
                  ["owner", "lessee", "operator", "franchise"],
                )}
              </div>
              <fieldset>
                <legend className="font-semibold">Supporting documents</legend>
                {data.documents.length === 0 && (
                  <p className="text-sm">
                    Upload supporting documents through Property Listing → KYC,
                    then return here.
                  </p>
                )}
                {data.documents.map((d) => (
                  <label key={d.id} className="block text-sm">
                    <input
                      type="checkbox"
                      checked={p.documentIds.includes(d.id)}
                      onChange={(e) =>
                        editProfile({
                          ...p,
                          documentIds: e.target.checked
                            ? [...p.documentIds, d.id]
                            : p.documentIds.filter((id) => id !== d.id),
                        })
                      }
                    />{" "}
                    {d.label}
                  </label>
                ))}
                {p.documentIds
                  .filter((id) => !data.documents.some((d) => d.id === id))
                  .map((id) => (
                    <label key={id} className="block text-sm text-amber-800">
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          editProfile({
                            ...p,
                            documentIds: p.documentIds.filter(
                              (selected) => selected !== id,
                            ),
                          })
                        }
                      />{" "}
                      Unavailable document ({id}) — uncheck to remove
                    </label>
                  ))}
              </fieldset>
              <label className="block text-sm">
                Reason for change
                <input
                  className={fieldClass}
                  value={reason}
                  onChange={(e) => {
                    captureBasis();
                    setReason(e.target.value);
                  }}
                />
              </label>
              <div className="flex gap-3">
                {[false, true].map((submit) => (
                  <button
                    key={String(submit)}
                    className={buttonClass}
                    disabled={busy || conflict || reason.trim().length < 3}
                    onClick={() => {
                      const parsed = profileSchema.safeParse(p);
                      if (!parsed.success) {
                        setMessage(
                          parsed.error.issues
                            .map((i) => `${i.path.join(".")}: ${i.message}`)
                            .join("; "),
                        );
                        return;
                      }
                      void save({
                        action: "profile",
                        expectedRevision: b.profile,
                        profile: parsed.data,
                        submit,
                      });
                    }}
                  >
                    {submit ? "Submit profile" : "Save draft"}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Finance agreement</h2>
        {data.agreement ? (
          <p>
            <a
              href={data.agreement.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {data.agreement.title}
            </a>{" "}
            · Version {data.agreement.revision}
          </p>
        ) : (
          <p>No agreement has been published.</p>
        )}
        {admin && !propertyId && (
          <>
            <label className="block text-sm">
              Agreement title
              <input
                className={fieldClass}
                value={title}
                onChange={(e) => {
                  captureBasis();
                  setTitle(e.target.value);
                }}
              />
            </label>
            <label className="block text-sm">
              HTTPS document link
              <input
                className={fieldClass}
                type="url"
                value={documentUrl}
                onChange={(e) => {
                  captureBasis();
                  setDocumentUrl(e.target.value);
                }}
              />
            </label>
            <button
              className={buttonClass}
              disabled={
                busy ||
                conflict ||
                !title ||
                !documentUrl ||
                reason.trim().length < 3
              }
              onClick={() =>
                void save({
                  action: "publish",
                  expectedRevision: b.agreement,
                  title,
                  documentUrl,
                })
              }
            >
              Publish agreement version
            </button>
          </>
        )}
        {!admin && data.agreement && (
          <>
            <p className="text-sm">
              Acceptance applies to this published version and your saved
              profile. Replacement terms require renewed acceptance.
            </p>
            {data.acceptance && (
              <p className="text-xs">
                Last accepted version {data.acceptance.agreementVersion} on{" "}
                {data.acceptance.acceptedAt}
              </p>
            )}
            <button
              className={buttonClass}
              disabled={
                busy ||
                conflict ||
                !!profile ||
                data.readiness.agreementAcceptance ||
                reason.trim().length < 3
              }
              onClick={() =>
                void save({
                  action: "accept",
                  expectedRevision: b.profile,
                  agreementVersion: data.agreement!.revision,
                })
              }
            >
              Accept published agreement
            </button>
            <p className="text-xs">
              Enter a reason above and save profile edits before accepting.
            </p>
          </>
        )}
      </section>
    </fieldset>
  );
}
export function AdminFinancePage() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [hotelCursor, setHotelCursor] = useState("");
  const [pastHotels, setPastHotels] = useState<{ id: string; name: string }[]>(
    [],
  );
  const hotels = useQuery({
    queryKey: ["private", "finance-hotels", term, hotelCursor],
    queryFn: () =>
      apiFetch<{
        properties: { id: string; name: string }[];
        hasMore: boolean;
        nextCursor: string | null;
      }>(
        `/api/admin/properties?search=${encodeURIComponent(term)}&cursor=${encodeURIComponent(hotelCursor)}`,
      ),
  });
  const [cursor, setCursor] = useState("");
  const [past, setPast] = useState<unknown[]>([]);
  const history = useQuery({
    queryKey: ["private", "finance-history", cursor],
    queryFn: () =>
      apiFetch<{ events: unknown[]; nextCursor: string | null }>(
        `/api/admin/finance?history=1&cursor=${cursor}`,
      ),
  });
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Finance</h1>
      <section className="rounded-2xl border bg-white p-4">
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(search);
            setHotelCursor("");
            setPastHotels([]);
            setPropertyId("");
          }}
        >
          <label className="flex-1 text-sm">
            Find hotel
            <input
              className={fieldClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className={buttonClass}>Search</button>
        </form>
        {hotels.isError && <p role="alert">{hotels.error.message}</p>}
        <label className="block text-sm">
          Finance scope
          <select
            className={fieldClass}
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">Global settings and agreements</option>
            {[...pastHotels, ...(hotels.data?.properties ?? [])].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {hotels.data?.nextCursor && (
          <button
            type="button"
            className="mt-3 text-sm underline"
            onClick={() => {
              setPastHotels([...pastHotels, ...hotels.data.properties]);
              setHotelCursor(hotels.data.nextCursor!);
            }}
          >
            Load more hotels
          </button>
        )}
      </section>
      <FinanceWorkspace
        key={propertyId}
        admin
        propertyId={propertyId || undefined}
      />
      {propertyId && <AccountWorkspace key={`account-${propertyId}`} admin propertyId={propertyId} />}
      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Change history</h2>
        <button
          className="text-sm underline"
          onClick={() => {
            setPast([]);
            setCursor("");
            void history.refetch();
          }}
        >
          Refresh history
        </button>
        {history.isError && <p role="alert">{history.error.message}</p>}
        {[...past, ...(history.data?.events ?? [])].map((e, i) => (
          <details key={i}>
            <summary className="cursor-pointer text-sm">
              {String((e as { action: string }).action)} ·{" "}
              {String((e as { createdAt: string }).createdAt)}
            </summary>
            <pre className="overflow-auto text-xs">
              {JSON.stringify(e, null, 2)}
            </pre>
          </details>
        ))}
        {history.data?.nextCursor && (
          <button
            className={buttonClass}
            onClick={() => {
              setPast([...past, ...history.data.events]);
              setCursor(history.data.nextCursor!);
            }}
          >
            Load more changes
          </button>
        )}
      </section>
    </div>
  );
}
