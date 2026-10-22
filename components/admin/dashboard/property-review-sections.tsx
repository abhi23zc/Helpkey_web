"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, FileText, ImageOff } from "lucide-react";
import { propertyPhotoCategories } from "@/lib/partner/photo-requirements";
import { label, textValue, type AdminRecord, type PropertyDetail } from "./types";
import { Button, buttonClass, Card, Chips, EmptyState, Fact, Facts, inputClass, StatusChip } from "./ui";
import {
  addressLine,
  bookingModesLabel,
  cancellationSummary,
  formatDate,
  formatTime,
  policySummary,
  ratePrice,
} from "./property-review-format";

export type Mutate = (path: string, body: unknown, options?: { method?: string; success?: string }) => Promise<boolean>;

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const categoryLabel = (category: unknown) => propertyPhotoCategories.find(item => item.value === category)?.label ?? label(String(category ?? "photo"));

/* ============================== Overview ============================== */

const editableFields = [
  { key: "name", label: "Property name" },
  { key: "publicPhone", label: "Public phone (with country code)" },
  { key: "publicEmail", label: "Public email" },
  { key: "checkInTime", label: "Check-in time" },
  { key: "checkOutTime", label: "Check-out time" },
  { key: "floors", label: "Floors" },
  { key: "totalPhysicalRooms", label: "Total rooms" },
  { key: "description", label: "Description" },
] as const;
const numericFields: string[] = ["floors", "totalPhysicalRooms"];

function inputType(key: string) {
  if (key.endsWith("Time")) return "time";
  if (numericFields.includes(key)) return "number";
  return key === "publicEmail" ? "email" : "text";
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <p className="mt-4 text-sm text-slate-400">Description not provided.</p>;
  return (
    <div className="mt-4">
      <p className={`whitespace-pre-wrap text-sm leading-relaxed text-slate-700 ${open ? "" : "line-clamp-4"}`}>{text}</p>
      {text.length > 240 && (
        <button type="button" className="mt-1 text-xs font-semibold text-gold-700 underline underline-offset-2" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function EditListingForm({ property, busy, mutate, onDone }: { property: AdminRecord; busy: boolean; mutate: Mutate; onDone: () => void }) {
  return (
    <form
      className="mt-5 grid gap-3 rounded-xl border border-line bg-ivory-50 p-4 sm:grid-cols-2"
      onSubmit={async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = Object.fromEntries(editableFields.map(({ key }) => [key, numericFields.includes(key) ? Number(form.get(key)) : form.get(key)]));
        if (await mutate("", body, { method: "PATCH", success: "Listing details saved." })) onDone();
      }}
    >
      {editableFields.map(({ key, label: text }) => (
        <label key={key} className={`text-xs font-semibold text-slate-700 ${key === "description" ? "sm:col-span-2" : ""}`}>
          {text}
          {key === "description" ? (
            <textarea name={key} rows={4} className={inputClass} required minLength={20} maxLength={6000} defaultValue={String(property[key] ?? "")} />
          ) : (
            <input
              name={key}
              className={inputClass}
              required
              type={inputType(key)}
              min={key === "floors" ? 0 : numericFields.includes(key) ? 1 : undefined}
              pattern={key === "publicPhone" ? "\\+\\d{6,15}" : undefined}
              title={key === "publicPhone" ? "Use international format, e.g. +919876543210" : undefined}
              defaultValue={String(property[key] ?? "")}
            />
          )}
        </label>
      ))}
      <div className="flex gap-2 sm:col-span-2">
        <Button variant="primary" type="submit" disabled={busy}>Save changes</Button>
        <Button disabled={busy} onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

export function OverviewTab({ data, busy, mutate }: { data: PropertyDetail; busy: boolean; mutate: Mutate }) {
  const [editing, setEditing] = useState(false);
  const { property, owner, partner } = data;
  const address = asRecord(property.address);
  const amenityNames = Object.fromEntries(data.amenities.map(item => [item.id, textValue(item.name)]));
  const namesFor = (ids: unknown) => (Array.isArray(ids) ? ids.map(id => amenityNames[String(id)]).filter((name): name is string => Boolean(name)) : []);
  const times = [formatTime(property.checkInTime) && `Check-in ${formatTime(property.checkInTime)}`, formatTime(property.checkOutTime) && `Check-out ${formatTime(property.checkOutTime)}`].filter(Boolean).join(" · ");
  const hasMap = typeof property.latitude === "number" && typeof property.longitude === "number";
  const businessContact = [textValue(partner?.businessPhone), textValue(partner?.businessEmail)].filter(Boolean).join(" · ");
  const setRules = ([["Children", property.childrenPolicy], ["Pets", property.petPolicy], ["Smoking", property.smokingPolicy], ["ID at check-in", property.identityRequirements]] as [string, unknown][])
    .map(([name, value]): [string, string | null] => [name, policySummary(value)])
    .filter((rule): rule is [string, string] => rule[1] !== null);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card title="Property" action={!editing && <Button onClick={() => setEditing(true)}>Edit details</Button>}>
        <Facts>
          <Fact label="Type">{label(String(property.propertyType ?? ""))}</Fact>
          <Fact label="Total rooms">{property.totalPhysicalRooms}</Fact>
          <Fact label="Check-in and check-out">{times}</Fact>
          <Fact label="Booking type">{bookingModesLabel(property.bookingModes)}</Fact>
          <Fact label="Public phone">{textValue(property.publicPhone)}</Fact>
          <Fact label="Public email">{textValue(property.publicEmail)}</Fact>
        </Facts>
        <Description text={String(property.description ?? "")} />
        {editing && <EditListingForm key={String(property.updatedAt)} property={property} busy={busy} mutate={mutate} onDone={() => setEditing(false)} />}
      </Card>

      <Card title="Partner & business">
        <Facts>
          <Fact label="Owner name">{textValue(owner?.fullName)}</Fact>
          <Fact label="Owner phone">{textValue(owner?.phoneNumber)}</Fact>
          <Fact label="Owner email">{textValue(owner?.email)}</Fact>
          <Fact label="Business name">{textValue(partner?.businessName)}</Fact>
          <Fact label="GSTIN">{textValue(partner?.gstin)}</Fact>
          {businessContact && <Fact label="Business contact">{businessContact}</Fact>}
        </Facts>
        {!owner && <p className="mt-4 rounded-lg bg-warning-bg px-3 py-2 text-xs font-medium text-warning-ink">Owner account could not be found. Check this before approving.</p>}
        {owner && owner.accountStatus !== "active" && (
          <p className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger-ink">Owner account is {label(owner.accountStatus).toLowerCase()}.</p>
        )}
      </Card>

      <Card
        title="Location"
        action={hasMap && (
          <a className={buttonClass("secondary")} href={`https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`} target="_blank" rel="noreferrer">
            Open map <ExternalLink size={12} aria-hidden />
          </a>
        )}
      >
        <Facts columns={1}>
          <Fact label="Address">{addressLine(address)}</Fact>
          {!hasMap && <Fact label="Map pin">{null}</Fact>}
        </Facts>
      </Card>

      <Card title="Guest rules & amenities">
        {setRules.length ? (
          <Facts>{setRules.map(([name, text]) => <Fact key={name} label={name}>{text}</Fact>)}</Facts>
        ) : <p className="text-sm text-slate-400">The partner hasn’t set any guest rules.</p>}
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <div><p className="mb-1.5 text-xs font-medium text-muted">Property amenities</p><Chips items={namesFor(property.amenityIds)} empty="None selected" /></div>
          <div><p className="mb-1.5 text-xs font-medium text-muted">Room amenities</p><Chips items={namesFor(property.roomAmenityIds)} empty="None selected" /></div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Cancellation policies</p>
            {data.policies.length ? (
              <ul className="space-y-2">
                {data.policies.map(policy => (
                  <li key={policy.id} className="text-sm"><span className="font-semibold text-ink">{textValue(policy.name) ?? "Policy"}</span><span className="text-muted"> — {cancellationSummary(policy)}</span></li>
                ))}
              </ul>
            ) : <span className="text-sm text-slate-400">None added</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ============================ Asset review ============================ */

function ReviewControls({ asset, type, busy, mutate }: { asset: AdminRecord; type: "media" | "documents"; busy: boolean; mutate: Mutate }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const status = asset.moderationStatus ?? asset.status;
  const publishing = ["queued", "processing", "unpublishing"].includes(asset.publicationStatus ?? "");
  const retry = type === "media" && asset.publicationStatus === "failed";
  const noun = type === "media" ? "Photo" : "Document";
  const path = `/assets/${type}/${asset.id}/review`;
  const reasonId = `reject-reason-${asset.id}`;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(status !== "approved" || retry) && (
          <Button variant="success" disabled={busy || publishing} onClick={() => void mutate(path, { decision: "approve" }, { success: retry ? "Publishing retried." : `${noun} approved.` })}>
            {publishing ? "Processing…" : retry ? "Retry publishing" : "Approve"}
          </Button>
        )}
        {status !== "rejected" && !rejecting && (
          <Button variant="danger" disabled={busy || publishing} onClick={() => setRejecting(true)}>Reject</Button>
        )}
      </div>
      {rejecting && (
        <form
          className="mt-3"
          onSubmit={async event => {
            event.preventDefault();
            if (reason.trim().length < 2) return;
            if (await mutate(path, { decision: "reject", reason: reason.trim() }, { success: `${noun} rejected.` })) { setRejecting(false); setReason(""); }
          }}
        >
          <label htmlFor={reasonId} className="text-xs font-semibold text-slate-700">Why is this being rejected? (the partner will need to fix it)</label>
          <input id={reasonId} className={inputClass} required minLength={2} maxLength={1000} autoFocus value={reason} onChange={event => setReason(event.target.value)} />
          <div className="mt-2 flex gap-2">
            <Button variant="danger" type="submit" disabled={busy || reason.trim().length < 2}>Confirm rejection</Button>
            <Button disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Only surfaces publishing state when it needs attention. */
function PublishingNote({ asset }: { asset: AdminRecord }) {
  if (asset.publicationStatus === "failed") return <p className="mt-2 rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs font-medium text-danger-ink">Publishing failed{asset.publicationErrorCode ? ` (${asset.publicationErrorCode})` : ""}. Retry below.</p>;
  if (["queued", "processing", "unpublishing"].includes(asset.publicationStatus ?? "")) return <p className="mt-2 text-xs text-info-ink">Publishing in progress…</p>;
  return null;
}

function RejectionNote({ asset }: { asset: AdminRecord }) {
  return asset.reviewReason ? <p className="mt-2 rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs text-danger-ink">Rejected: {String(asset.reviewReason)}</p> : null;
}

function PhotoCard({ asset, url, roomName, isCover, busy, mutate }: { asset: AdminRecord; url?: string; roomName?: string; isCover: boolean; busy: boolean; mutate: Mutate }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const usable = url && failedUrl !== url;
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white">
      <div className="relative flex aspect-[16/10] items-center justify-center bg-slate-100">
        {usable ? (
          <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full" aria-label={`Open full-size photo: ${categoryLabel(asset.category)}${roomName ? `, ${roomName}` : ""}`}>
            {/* Private signed originals bypass image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={String(asset.altText || categoryLabel(asset.category))} className="h-full w-full object-contain" onError={() => setFailedUrl(url)} />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-1 px-4 text-center text-xs text-muted"><ImageOff size={20} aria-hidden />Preview unavailable. Use “Refresh preview links”.</div>
        )}
        {isCover && <span className="absolute left-2 top-2 rounded-full bg-navy-950 px-2.5 py-1 text-[11px] font-semibold text-white">Cover photo</span>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{categoryLabel(asset.category)}</h3>
            <p className="mt-0.5 truncate text-xs text-muted">{roomName ?? "Whole property"}</p>
          </div>
          <StatusChip value={asset.moderationStatus ?? asset.status} />
        </div>
        <RejectionNote asset={asset} />
        <PublishingNote asset={asset} />
        <div className="mt-3"><ReviewControls asset={asset} type="media" busy={busy} mutate={mutate} /></div>
      </div>
    </article>
  );
}

/* ================================ Photos ================================ */

const photoFilters = ["pending", "approved", "rejected", "all"] as const;
const filterLabels: Record<(typeof photoFilters)[number], string> = { pending: "Needs review", approved: "Approved", rejected: "Rejected", all: "All" };

export function PhotosTab({ data, urls, busy, mutate, filter, onFilter }: { data: PropertyDetail; urls: Record<string, string>; busy: boolean; mutate: Mutate; filter: string; onFilter: (value: string) => void }) {
  const roomNames = Object.fromEntries(data.roomTypes.map(room => [room.id, textValue(room.name) ?? "Room"]));
  const statusOf = (asset: AdminRecord) => asset.moderationStatus ?? asset.status;
  const counts: Record<string, number> = { all: data.media.length, pending: 0, approved: 0, rejected: 0 };
  data.media.forEach(asset => { const key = String(statusOf(asset)); if (key in counts) counts[key] += 1; });
  const shown = data.media.filter(asset => filter === "all" || statusOf(asset) === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter photos">
        {photoFilters.map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 ${filter === key ? "border-navy-950 bg-navy-950 text-white" : "border-line bg-white text-muted hover:text-ink"}`}
          >
            {filterLabels[key]}<span className={filter === key ? "text-white/70" : "text-slate-400"}>{counts[key]}</span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(asset => <PhotoCard key={asset.id} asset={asset} url={urls[asset.id]} roomName={asset.roomTypeId ? roomNames[asset.roomTypeId] : undefined} isCover={data.property.coverMediaId === asset.id} busy={busy} mutate={mutate} />)}
        </div>
      ) : (
        <EmptyState title={data.media.length ? "No photos in this view" : "No photos uploaded yet"}>
          {data.media.length ? "Pick another filter to see the rest." : "The partner hasn’t uploaded any photos. Request changes if the listing is waiting on review."}
        </EmptyState>
      )}
    </div>
  );
}

/* ============================== Documents ============================== */

const documentKinds = [
  { kind: "pan", name: "PAN card", required: true },
  { kind: "government_id_front", name: "Government ID (front)", required: true },
  { kind: "government_id_back", name: "Government ID (back)", required: true },
  { kind: "gst", name: "GST certificate", required: false },
] as const;

function DocumentRow({ name, required, asset, url, busy, mutate }: { name: string; required: boolean; asset?: AdminRecord; url?: string; busy: boolean; mutate: Mutate }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{name}{!required && <span className="ml-2 text-xs font-normal text-muted">Optional</span>}</h3>
          {asset ? <p className="mt-0.5 text-xs text-muted">Uploaded {formatDate(asset.createdAt)}</p> : <p className="mt-0.5 text-xs text-muted">{required ? "Not uploaded yet" : "Not provided"}</p>}
        </div>
        {asset ? <StatusChip value={asset.status} /> : <StatusChip tone={required ? "warning" : "neutral"}>{required ? "Missing" : "Not provided"}</StatusChip>}
      </div>
      {asset && (
        <div className="mt-3">
          <RejectionNote asset={asset} />
          <div className="mt-2 flex flex-wrap items-start gap-2">
            {url ? (
              <a className={buttonClass("secondary")} href={url} target="_blank" rel="noreferrer"><FileText size={13} aria-hidden />Open document<ExternalLink size={12} aria-hidden /></a>
            ) : <span className="self-center text-xs text-muted">Preview unavailable. Use “Refresh preview links”.</span>}
            <ReviewControls asset={asset} type="documents" busy={busy} mutate={mutate} />
          </div>
        </div>
      )}
    </li>
  );
}

export function DocumentsTab({ data, urls, busy, mutate }: { data: PropertyDetail; urls: Record<string, string>; busy: boolean; mutate: Mutate }) {
  const known = documentKinds.map(item => item.kind as string);
  const extras = data.documents.filter(document => !known.includes(String(document.documentType)));
  return (
    <Card title="Identity & business documents" subtitle="PAN and both sides of a government ID must be approved. GST is optional.">
      <ul className="divide-y divide-line">
        {documentKinds.flatMap(({ kind, name, required }) => {
          const matches = data.documents.filter(document => document.documentType === kind);
          return matches.length
            ? matches.map(asset => <DocumentRow key={asset.id} name={name} required={required} asset={asset} url={urls[asset.id]} busy={busy} mutate={mutate} />)
            : [<DocumentRow key={kind} name={name} required={required} busy={busy} mutate={mutate} />];
        })}
        {extras.map(asset => <DocumentRow key={asset.id} name={label(asset.documentType)} required={false} asset={asset} url={urls[asset.id]} busy={busy} mutate={mutate} />)}
      </ul>
    </Card>
  );
}

/* ============================ Rooms & rates ============================ */

function bedSummary(room: AdminRecord) {
  const beds = Array.isArray(room.bedConfigurations) ? room.bedConfigurations : [];
  return beds.map(bed => `${asRecord(bed).count ?? 1} × ${label(String(asRecord(bed).bedType ?? "bed"))}`).join(", ");
}

export function RoomsTab({ data }: { data: PropertyDetail }) {
  const policyNames = Object.fromEntries(data.policies.map(policy => [policy.id, textValue(policy.name)]));
  const roomIds = new Set(data.roomTypes.map(room => room.id));
  const orphanRates = data.ratePlans.filter(rate => !roomIds.has(String(rate.roomTypeId)));

  const RateRow = ({ rate }: { rate: AdminRecord }) => (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{textValue(rate.name) ?? "Rate plan"}</p>
        <p className="text-xs text-muted">
          {label(String(rate.bookingMode ?? "overnight"))} · {policyNames[String(rate.cancellationPolicyId)] ?? "No cancellation policy"}
          {rate.status && rate.status !== "active" ? ` · ${label(String(rate.status))}` : ""}
        </p>
      </div>
      <p className="text-sm font-bold text-ink">{ratePrice(rate)}</p>
    </li>
  );

  if (!data.roomTypes.length) return <EmptyState title="No room types added">The partner hasn’t set up any rooms yet.</EmptyState>;
  return (
    <div className="space-y-4">
      {data.roomTypes.map(room => {
        const rates = data.ratePlans.filter(rate => rate.roomTypeId === room.id);
        const details = [
          typeof room.totalInventory === "number" && `${room.totalInventory} ${room.totalInventory === 1 ? "room" : "rooms"}`,
          typeof room.maxAdults === "number" && `up to ${room.maxAdults} ${room.maxAdults === 1 ? "adult" : "adults"}${typeof room.maxChildren === "number" && room.maxChildren > 0 ? `, ${room.maxChildren} ${room.maxChildren === 1 ? "child" : "children"}` : ""}`,
          bedSummary(room),
          room.bathroomType && `${label(String(room.bathroomType))} bathroom`,
        ].filter(Boolean).join(" · ");
        return (
          <Card key={room.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-ink">{textValue(room.name) ?? "Room"}</h2>
                <p className="mt-0.5 text-[13px] text-muted">{details || "No details provided"}</p>
              </div>
              {room.status && room.status !== "active" && <StatusChip value={room.status} />}
            </div>
            <div className="mt-3 border-t border-line pt-1">
              {rates.length ? <ul className="divide-y divide-line">{rates.map(rate => <RateRow key={rate.id} rate={rate} />)}</ul> : <p className="py-3 text-sm text-warning-ink">No rate plan for this room — guests can’t book it.</p>}
            </div>
          </Card>
        );
      })}
      {orphanRates.length > 0 && (
        <Card title="Rate plans without a matching room">
          <ul className="divide-y divide-line">{orphanRates.map(rate => <RateRow key={rate.id} rate={rate} />)}</ul>
        </Card>
      )}
    </div>
  );
}

/* ================================ History ================================ */

export function HistoryTab({ events, loading, error, onRetry }: { events?: AdminRecord[]; loading: boolean; error?: string; onRetry: () => void }) {
  let body: ReactNode;
  if (loading) body = <p role="status" className="text-sm text-muted">Loading history…</p>;
  else if (error) body = <div role="alert"><p className="text-sm text-danger-ink">{error}</p><Button className="mt-2" onClick={onRetry}>Try again</Button></div>;
  else if (!events?.length) body = <EmptyState title="No review activity yet">Approvals, change requests and status changes will appear here.</EmptyState>;
  else body = (
    <ol className="divide-y divide-line">
      {events.map(event => {
        const from = textValue(event.fromApprovalStatus);
        const to = textValue(event.toApprovalStatus);
        return (
          <li key={event.id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{label(String(event.action))}</p>
              <time className="text-xs text-muted">{formatDate(event.createdAt)}</time>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              By {label(String(event.actorRole ?? "unknown")).toLowerCase()}
              {from && to && from !== to ? ` · ${label(from)} → ${label(to)}` : ""}
            </p>
            {Boolean(event.reason) && <p className="mt-2 rounded-lg bg-ivory-50 px-3 py-2 text-sm text-slate-700">{String(event.reason)}</p>}
          </li>
        );
      })}
    </ol>
  );
  return <Card title="Review history" subtitle={events?.length ? "Most recent 50 review events." : undefined}>{body}</Card>;
}
