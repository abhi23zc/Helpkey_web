"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, CircleAlert, RefreshCw } from "lucide-react";
import { lifecycleActions } from "@/lib/admin/lifecycle";
import { adminApi } from "./api";
import { label, textValue, type AdminRecord, type PropertyDetail } from "./types";
import { Button, buttonClass, Card, CountPill, EmptyState, inputClass, Notice, StatusChip, type ButtonVariant } from "./ui";
import { formatDate, groupReadiness, isAwaitingReview } from "./property-review-format";
import { DocumentsTab, HistoryTab, OverviewTab, PhotosTab, RoomsTab, type Mutate } from "./property-review-sections";

const tabs = [
  { id: "overview", name: "Overview" },
  { id: "photos", name: "Photos" },
  { id: "kyc", name: "Documents" },
  { id: "rooms-rates", name: "Rooms & rates" },
  { id: "history", name: "History" },
] as const;
type TabId = (typeof tabs)[number]["id"];

/** Older deep links (#rates, #location, …) still land on the right tab. */
const hashAliases: Record<string, TabId> = {
  location: "overview", "partner-business": "overview", "property-details": "overview", facilities: "overview", "review-actions": "overview",
  documents: "kyc", rooms: "rooms-rates", rates: "rooms-rates", "review-history": "history",
};
const tabFromHash = (hash: string): TabId | null => tabs.find(tab => tab.id === hash)?.id ?? hashAliases[hash] ?? null;

const lifecycleCopy: Record<string, { title: string; text: string; confirm: string; variant: ButtonVariant }> = {
  pause: { title: "Pause this listing?", text: "Guests won’t be able to book it until you resume it.", confirm: "Pause listing", variant: "gold" },
  resume: { title: "Resume this listing?", text: "Guests will be able to book it again.", confirm: "Resume listing", variant: "secondary" },
  archive: { title: "Archive this listing?", text: "Guests won’t be able to book it. You can restore it later.", confirm: "Archive listing", variant: "danger" },
  restore: { title: "Restore this listing?", text: "It returns to the state its review status allows.", confirm: "Restore listing", variant: "secondary" },
};

function statusSummary(property: AdminRecord) {
  switch (property.approvalStatus) {
    case "approved":
      if (property.status === "active") return { heading: "Live", text: "Guests can find and book this listing." };
      if (property.status === "paused") return { heading: "Paused", text: "Guests can’t book this listing right now." };
      if (property.status === "archived") return { heading: "Archived", text: "This listing is hidden from booking." };
      return { heading: "Approved", text: "This listing has been approved." };
    case "changes_requested": return { heading: "Waiting for the partner", text: "Changes were requested. The listing returns for review once the partner resubmits." };
    case "rejected": return { heading: "Rejected", text: "This listing was rejected and is not visible to guests." };
    default: return { heading: "Not submitted", text: "The partner hasn’t submitted this listing for review yet." };
  }
}

function MissingList({ items }: { items: string[] }) {
  if (!items.length) return null;
  const chip = "rounded-full border border-warning/40 bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning-ink";
  return (
    <div className="mt-2">
      <ul className="flex flex-wrap gap-1.5">{items.slice(0, 4).map(item => <li key={item} className={chip}>{item}</li>)}</ul>
      {items.length > 4 && (
        <details className="mt-1.5">
          <summary className="w-fit cursor-pointer text-xs font-semibold text-muted hover:text-ink">+{items.length - 4} more</summary>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">{items.slice(4).map(item => <li key={item} className={chip}>{item}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function Requirement({ title, missing, pending, nothingToReview, action }: { title: string; missing: string[]; pending: number; nothingToReview: string; action?: ReactNode }) {
  const done = missing.length === 0;
  return (
    <li className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-success-bg text-success-ink" : "bg-warning-bg text-warning-ink"}`}>
        {done ? <Check size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />}
        <span className="sr-only">{done ? "Complete" : "Needs attention"}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">{title}{done && <span className="ml-2 text-xs font-normal text-success-ink">All approved</span>}</p>
          {action}
        </div>
        {!done && (
          <>
            <p className="mt-0.5 text-[13px] text-muted">{pending > 0 ? `${pending} waiting for your review. Still needed:` : nothingToReview}</p>
            <MissingList items={missing} />
          </>
        )}
      </div>
    </li>
  );
}

export function AdminPropertyReviewPage({ propertyId }: { propertyId: string }) {
  const client = useQueryClient();
  const base = `/api/admin/properties/${encodeURIComponent(propertyId)}`;
  const [active, setActive] = useState<TabId>("overview");
  const [decision, setDecision] = useState<"request_changes" | "reject" | null>(null);
  const [lifecycle, setLifecycle] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [photoFilter, setPhotoFilter] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ["admin", "property", propertyId], queryFn: ({ signal }) => adminApi<PropertyDetail>(base, { signal }) });
  const previews = useQuery({
    queryKey: ["admin", "previews", propertyId],
    queryFn: ({ signal }) => adminApi<{ urls: { id: string; url: string }[] }>(`${base}/preview-urls`, { signal }),
    enabled: active === "photos" || active === "kyc",
    retry: false,
  });
  const history = useQuery({
    queryKey: ["admin", "history", propertyId],
    queryFn: ({ signal }) => adminApi<{ events: AdminRecord[] }>(`${base}/events`, { signal }),
    enabled: active === "history",
  });

  useEffect(() => {
    const sync = () => {
      const match = tabFromHash(window.location.hash.slice(1));
      if (match) setActive(match);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function navigate(tab: TabId) {
    setActive(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }

  const mutate: Mutate = async (path, body, options = {}) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await adminApi(`${base}${path}`, { method: options.method ?? "POST", body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["admin"] });
      setNotice(options.success ?? "Saved.");
      setDecision(null); setLifecycle(null); setReason("");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save. Please retry.");
      return false;
    } finally { locked.current = false; setBusy(false); }
  };

  if (!detail.data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/properties" className={buttonClass("secondary")}><ArrowLeft size={14} aria-hidden />Back to properties</Link>
        {detail.isPending
          ? <p role="status" className="text-sm text-muted">Loading property…</p>
          : <Notice tone="danger" action={<Button onClick={() => void detail.refetch()}>Try again</Button>}>{detail.error?.message}</Notice>}
      </div>
    );
  }

  const data = detail.data;
  const property = data.property;
  const address = typeof property.address === "object" && property.address !== null ? (property.address as Record<string, unknown>) : {};
  const urls = Object.fromEntries((previews.data?.urls ?? []).map(item => [item.id, item.url]));
  const pendingPhotos = data.media.filter(isAwaitingReview).length;
  const pendingDocs = data.documents.filter(isAwaitingReview).length;
  const isPending = property.approvalStatus === "pending";
  const readiness = groupReadiness(data.approvalReadiness.checks);
  const totalChecks = data.approvalReadiness.checks.length;
  const checksDone = totalChecks - readiness.total;
  const summary = statusSummary(property);
  const actions = lifecycleActions(property);
  const photoView = photoFilter ?? (pendingPhotos > 0 ? "pending" : "all");
  const location = [address.city, address.state].filter(Boolean).join(", ");
  const owner = textValue(data.owner?.fullName);
  const shownStatus = property.approvalStatus === "approved" ? property.status : property.approvalStatus;
  const reasonText = String(property.rejectionReason ?? "");

  const previewRefresh = (
    <Button disabled={previews.isFetching} onClick={() => void previews.refetch()}>
      <RefreshCw size={13} aria-hidden />{previews.isFetching ? "Refreshing…" : "Refresh preview links"}
    </Button>
  );

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/properties" className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-ink"><ArrowLeft size={14} aria-hidden />Back to properties</Link>
        <Button disabled={detail.isFetching || busy} onClick={() => void client.invalidateQueries({ queryKey: ["admin"] })}>
          <RefreshCw size={13} aria-hidden className={detail.isFetching ? "animate-spin" : ""} />Refresh
        </Button>
      </div>

      <header className="rounded-[18px] border border-line bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label(String(property.propertyType ?? "Property"))}</span>
          <StatusChip value={shownStatus}>{shownStatus === "active" ? "Live" : shownStatus === "pending" ? "Pending review" : undefined}</StatusChip>
        </div>
        <h1 className="mt-1 break-words text-[28px] font-bold leading-tight text-ink">{property.name ?? "Untitled property"}</h1>
        <p className="mt-1 text-sm text-muted">
          {[location || "Location not provided", property.submittedAt ? `Submitted ${formatDate(property.submittedAt)}` : null, owner ? `Owner: ${owner}` : null].filter(Boolean).join(" · ")}
        </p>
      </header>

      {(error || detail.error) && (
        <Notice tone="danger" action={<Button onClick={() => void detail.refetch()}>Reload</Button>}>{error || detail.error?.message}</Notice>
      )}
      {notice && <Notice tone="success">{notice}</Notice>}

      <Card>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {isPending ? (
              <>
                <h2 className="text-lg font-bold text-ink">{data.approvalReadiness.ready ? "Ready to approve" : `${readiness.total} ${readiness.total === 1 ? "requirement" : "requirements"} left before approval`}</h2>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={totalChecks} aria-valuenow={checksDone} aria-label="Approval requirements met">
                    <div className="h-full rounded-full bg-gold-600" style={{ width: `${totalChecks ? (checksDone / totalChecks) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs text-muted">{checksDone} of {totalChecks} met</span>
                </div>
                <ul className="mt-5 divide-y divide-line">
                  <Requirement
                    title="Photos"
                    missing={readiness.photos}
                    pending={pendingPhotos}
                    nothingToReview="Nothing left to review. The partner needs to upload or fix:"
                    action={pendingPhotos > 0 && <Button onClick={() => navigate("photos")}>Review photos<CountPill tone="warning">{pendingPhotos}</CountPill></Button>}
                  />
                  <Requirement
                    title="Identity documents"
                    missing={readiness.documents}
                    pending={pendingDocs}
                    nothingToReview="Nothing left to review. The partner needs to upload or fix:"
                    action={pendingDocs > 0 && <Button onClick={() => navigate("kyc")}>Review documents<CountPill tone="warning">{pendingDocs}</CountPill></Button>}
                  />
                  {readiness.other.length > 0 && <Requirement title="Other" missing={readiness.other} pending={0} nothingToReview="Needs attention:" />}
                </ul>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-ink">{summary.heading}</h2>
                <p className="mt-1 text-sm text-muted">{summary.text}</p>
                {reasonText && <p className="mt-4 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-ink"><strong>Review note: </strong>{reasonText}</p>}
              </>
            )}
          </div>

          <aside aria-label="Listing decision" className="border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            {isPending && (
              <div className="space-y-2">
                <Button variant="success" className="w-full" disabled={busy || !data.approvalReadiness.ready} aria-describedby="approve-help" onClick={() => void mutate("/review", { decision: "approve" }, { success: "Listing approved and live." })}>
                  <Check size={14} aria-hidden />Approve and list
                </Button>
                <p id="approve-help" className="text-xs text-muted">{data.approvalReadiness.ready ? "Makes the listing bookable by guests." : "Unlocks once every requirement is met."}</p>
                <Button variant="gold" className="w-full" disabled={busy} onClick={() => { setLifecycle(null); setDecision("request_changes"); }}>Request changes</Button>
                <p className="text-xs text-muted">Send the partner back to fix specific issues.</p>
                <div className="!mt-5 rounded-xl border border-danger/20 bg-danger-bg/40 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-danger-ink">Requires confirmation</p>
                  <Button variant="danger" className="mt-2 w-full" disabled={busy} onClick={() => { setLifecycle(null); setDecision("reject"); }}>Reject listing</Button>
                  <p className="mt-2 text-xs text-muted">A reason is required and is saved to the review history.</p>
                </div>
              </div>
            )}

            {!isPending && actions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted">Listing status</p>
                <div className="mt-2 flex flex-col gap-2">
                  {actions.map(action => (
                    <Button key={action} variant={action === "archive" ? "danger" : "secondary"} disabled={busy} onClick={() => { setDecision(null); setLifecycle(action); }}>{label(action)} listing</Button>
                  ))}
                </div>
                {lifecycle && lifecycleCopy[lifecycle] && (
                  <div role="group" aria-label={lifecycleCopy[lifecycle].title} className="mt-3 rounded-xl border border-line bg-ivory-50 p-3">
                    <p className="text-sm font-semibold text-ink">{lifecycleCopy[lifecycle].title}</p>
                    <p className="mt-1 text-xs text-muted">{lifecycleCopy[lifecycle].text} This action is logged.</p>
                    <div className="mt-3 flex gap-2">
                      <Button variant={lifecycleCopy[lifecycle].variant} disabled={busy} onClick={() => void mutate("/lifecycle", { action: lifecycle }, { success: `Listing ${lifecycle === "pause" ? "paused" : lifecycle === "resume" ? "resumed" : lifecycle === "archive" ? "archived" : "restored"}.` })}>{busy ? "Saving…" : lifecycleCopy[lifecycle].confirm}</Button>
                      <Button disabled={busy} onClick={() => setLifecycle(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isPending && actions.length === 0 && <p className="text-sm text-muted">No actions available for this listing right now.</p>}
          </aside>
        </div>

        {decision && (
          <form
            className="mt-6 rounded-xl border border-line bg-ivory-50 p-4"
            onSubmit={event => { event.preventDefault(); if (reason.trim()) void mutate("/review", { decision, reason: reason.trim() }, { success: decision === "reject" ? "Listing rejected." : "Change request sent to the partner." }); }}
          >
            <label htmlFor="listing-reason" className="text-sm font-semibold text-ink">{decision === "reject" ? "Why is this listing being rejected?" : "What does the partner need to fix?"}</label>
            <textarea id="listing-reason" className={inputClass} rows={3} maxLength={1000} required autoFocus value={reason} onChange={event => setReason(event.target.value)} />
            <p className="mt-1 text-xs text-muted">Saved to the review history. {reason.length}/1000</p>
            <div className="mt-3 flex gap-2">
              <Button type="submit" variant={decision === "reject" ? "danger" : "primary"} disabled={busy || !reason.trim()}>{busy ? "Saving…" : decision === "reject" ? "Confirm rejection" : "Send change request"}</Button>
              <Button disabled={busy} onClick={() => { setDecision(null); setReason(""); }}>Cancel</Button>
            </div>
          </form>
        )}
      </Card>

      <nav aria-label="Review sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(tab => {
          const pill =
            tab.id === "photos" ? (pendingPhotos > 0 ? <CountPill tone="warning">{pendingPhotos}</CountPill> : <CountPill>{data.media.length}</CountPill>)
            : tab.id === "kyc" ? (pendingDocs > 0 ? <CountPill tone="warning">{pendingDocs}</CountPill> : <CountPill>{data.documents.length}</CountPill>)
            : tab.id === "rooms-rates" ? <CountPill>{data.roomTypes.length}</CountPill> : null;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active === tab.id ? "page" : undefined}
              aria-controls={`panel-${tab.id}`}
              onClick={() => navigate(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-semibold outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-500 ${active === tab.id ? "border-gold-600 text-navy-950" : "border-transparent text-muted hover:text-ink"}`}
            >
              {tab.name}{pill}
            </button>
          );
        })}
      </nav>

      <div id={`panel-${active}`} className="min-w-0 space-y-4 pt-1">
        {active === "overview" && <OverviewTab data={data} busy={busy} mutate={mutate} />}
        {(active === "photos" || active === "kyc") && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted">{active === "photos" ? "Open a photo to see it full size. Check the cover photo and that each room has bedroom and bathroom shots." : "Open each document in a new tab to verify it."}</p>
              {previewRefresh}
            </div>
            {previews.error && <Notice tone="warning">Previews unavailable: {previews.error.message}. Use “Refresh preview links” to retry.</Notice>}
          </>
        )}
        {active === "photos" && <PhotosTab data={data} urls={urls} busy={busy} mutate={mutate} filter={photoView} onFilter={setPhotoFilter} />}
        {active === "kyc" && <DocumentsTab data={data} urls={urls} busy={busy} mutate={mutate} />}
        {active === "rooms-rates" && <RoomsTab data={data} />}
        {active === "history" && <HistoryTab events={history.data?.events} loading={history.isPending} error={history.error?.message} onRetry={() => void history.refetch()} />}
      </div>
      {!data.media.length && !data.documents.length && !data.roomTypes.length && active === "overview" && isPending && (
        <EmptyState title="This submission is empty">The partner submitted without photos, documents or rooms. Request changes so they can complete it.</EmptyState>
      )}
    </div>
  );
}
