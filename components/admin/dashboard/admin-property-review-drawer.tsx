"use client";

import { AlertTriangle, FileCheck, Image as ImageIcon, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { label, textValue, type AdminRecord, type PropertyDetail } from "./types";

type ReviewEvent = {
  id: string;
  action: string;
  actorRole: string;
  reason: string | null;
  submissionAttempt?: number;
  createdAt: string | null;
};

export function AdminPropertyReviewDrawer({
  propertyId,
  onClose,
  onChanged,
}: {
  propertyId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const load = () => {
    void adminApi<PropertyDetail>(`/api/admin/properties/${propertyId}`)
      .then(setDetail)
      .catch((cause) => setError(cause.message));
    void adminApi<{ urls: Array<{ id: string; url: string }> }>(`/api/admin/properties/${propertyId}/preview-urls`)
      .then((data) =>
        setUrls(
          Object.fromEntries(
            data.urls.map((item: { id: string; url: string }) => [
              item.id,
              item.url,
            ])
          )
        )
      )
      .catch(() => {});
    void adminApi<{ events: ReviewEvent[] }>(`/api/admin/properties/${propertyId}/events`)
      .then((data) => setEvents(data.events ?? []))
      .catch(() => {});
  };

  useEffect(load, [propertyId]);

  const act = async (url: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      await adminApi<unknown>(url, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (form: FormData) => {
    setBusy(true);
    setError("");
    try {
      await adminApi<unknown>(`/api/admin/properties/${propertyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          publicPhone: form.get("phone"),
          publicEmail: form.get("email"),
          checkInTime: form.get("checkIn"),
          checkOutTime: form.get("checkOut"),
          floors: Number(form.get("floors")),
          totalPhysicalRooms: Number(form.get("rooms")),
        }),
      });
      load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  };

  if (!detail)
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs p-4 flex justify-end">
        <div className="h-full w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-[#0b1f3a]" />
            <p className="text-slate-600 font-bold text-sm">Loading property workspace...</p>
          </div>
        </div>
      </div>
    );

  const property = detail.property;

  // P4: approval requires ≥6 approved photos + the 3 approved KYC docs. Compute
  // readiness client-side to gate the Approve action; the server stays the
  // authority via REQUIRED_ASSETS_NOT_APPROVED.
  const approvedMediaCount = detail.media.filter(
    (m) => m.moderationStatus === "approved" && m.kind === "property_image",
  ).length;
  const approvedDocKinds = new Set(
    detail.documents.filter((d) => d.status === "approved").map((d) => d.documentType),
  );
  const REQUIRED_DOCS: Array<{ kind: string; label: string }> = [
    { kind: "pan", label: "PAN" },
    { kind: "government_id_front", label: "ID front" },
    { kind: "government_id_back", label: "ID back" },
  ];
  const missingDocs = REQUIRED_DOCS.filter((d) => !approvedDocKinds.has(d.kind));
  const photosReady = approvedMediaCount >= 6;
  const isPending = property.approvalStatus === "pending";
  const canApprove = isPending && photosReady && missingDocs.length === 0;

  const reviewAsset = (
    type: "media" | "documents",
    id: string,
    decision: "approve" | "reject"
  ) =>
    void act(
      `/api/admin/properties/${propertyId}/assets/${type}/${id}/review`,
      { decision, ...(decision === "reject" ? { reason } : {}) }
    );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4 flex justify-end animate-in fade-in duration-200">
      <section className="h-full w-full max-w-4xl overflow-y-auto bg-slate-50 p-5 sm:p-6 lg:p-8 shadow-2xl sm:rounded-2xl animate-in slide-in-from-right-8 duration-300">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#755a1a]">
              Property Workspace
            </p>
            <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
              {property.name}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-800">
                Status: {label(textValue(property.status))} · Approval:{" "}
                {label(textValue(property.approvalStatus))}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
          >
            Close Workspace
          </button>
        </header>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <p>{error}</p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs mb-6">
          <h3 className="font-bold text-slate-900 text-sm mb-3">Moderation Actions</h3>
          {isPending && !canApprove && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <p className="mb-1 font-bold">Approve required assets first:</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li className={photosReady ? "text-emerald-700" : ""}>
                  {approvedMediaCount} of 6 photos approved
                </li>
                {missingDocs.length > 0 ? (
                  <li>Approve documents: {missingDocs.map((d) => d.label).join(", ")}</li>
                ) : (
                  <li className="text-emerald-700">All required documents approved</li>
                )}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={busy || !canApprove}
              title={canApprove ? undefined : "Approve required photos and documents first."}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/review`, {
                  decision: "approve",
                })
              }
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            >
              Approve &amp; List Property
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/review`, {
                  decision: "request_changes",
                  reason,
                })
              }
              className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-amber-950 hover:bg-amber-500 transition-colors disabled:opacity-50 shadow-2xs"
            >
              Request Changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/review`, {
                  decision: "reject",
                  reason,
                })
              }
              className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50 shadow-2xs"
            >
              Reject Listing
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/properties/${propertyId}/lifecycle`, {
                  action:
                    property.status === "active"
                      ? "pause"
                      : property.status === "paused"
                      ? "resume"
                      : property.status === "archived"
                      ? "restore"
                      : "archive",
                })
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-2xs"
            >
              {property.status === "active"
                ? "Pause"
                : property.status === "paused"
                ? "Resume"
                : property.status === "archived"
                ? "Restore"
                : "Archive"}
            </button>
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-700">
            Notes / Reason for changes or rejection:
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-[#755a1a] shadow-2xs"
              placeholder="Provide clear notes for the partner on what must be resolved..."
              rows={2}
            />
          </label>
        </div>

        {events.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs mb-6">
            <h3 className="font-bold text-slate-900 text-base mb-4">Review Timeline</h3>
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#755a1a]" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">
                      {label(event.action)}
                      {event.submissionAttempt ? ` · attempt ${event.submissionAttempt}` : ""}
                      <span className="ml-2 font-semibold text-slate-400">{label(event.actorRole)}</span>
                    </p>
                    {event.reason && <p className="mt-0.5 text-xs font-medium text-slate-600">{event.reason}</p>}
                    {event.createdAt && (
                      <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                        {new Date(event.createdAt).toLocaleString("en-IN")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs mb-6">
          <h3 className="font-bold text-slate-900 text-base mb-4">Listing Details</h3>
          <form
            action={(form) => void save(form)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <AdminField
              label="Property Name"
              name="name"
              value={property.name}
            />
            <AdminField
              label="Public Phone"
              name="phone"
              value={property.publicPhone}
            />
            <AdminField
              label="Public Email"
              name="email"
              value={property.publicEmail}
              type="email"
            />
            <AdminField
              label="Floors"
              name="floors"
              value={property.floors}
              type="number"
            />
            <AdminField
              label="Total Physical Rooms"
              name="rooms"
              value={property.totalPhysicalRooms}
              type="number"
            />
            <AdminField
              label="Check-In Time"
              name="checkIn"
              value={property.checkInTime}
              type="time"
            />
            <AdminField
              label="Check-Out Time"
              name="checkOut"
              value={property.checkOutTime}
              type="time"
            />
            <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
              Property Description
              <textarea
                name="description"
                defaultValue={textValue(property.description)}
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-[#755a1a]"
              />
            </label>
            <div className="sm:col-span-2 pt-2">
              <button
                disabled={busy}
                className="rounded-xl bg-[#0b1f3a] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#07172b] transition-colors"
              >
                Save Listing Edits
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs mb-6">
          <h3 className="font-bold text-slate-900 text-base mb-4">
            Rooms, Rates & Policies
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <InfoList
              title="Room Types"
              items={detail.roomTypes.map(
                (item) =>
                  `${item.name} · ${item.totalInventory ?? item.inventory ?? 0} rooms`
              )}
            />
            <InfoList
              title="Rate Plans"
              items={detail.ratePlans.map(
                (item) =>
                  `${item.name} · ₹${((item.basePricePaise ?? 0) / 100).toLocaleString("en-IN")}`
              )}
            />
            <InfoList
              title="Policies"
              items={detail.policies.map(
                (item) => textValue(item.name) ?? "Untitled policy"
              )}
            />
          </div>
        </section>

        <AssetSection
          title="Property Photos"
          assets={detail.media}
          urls={urls}
          type="media"
          onReview={reviewAsset}
        />
        <div className="h-6" />
        <AssetSection
          title="Private KYC Documents"
          assets={detail.documents}
          urls={urls}
          type="documents"
          onReview={reviewAsset}
        />
        <div className="h-10" />
      </section>
    </div>
  );
}

function AdminField({
  label: fieldLabel,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: unknown;
  type?: string;
}) {
  return (
    <label className="block text-xs font-bold text-slate-700">
      {fieldLabel}
      <input
        required
        name={name}
        type={type}
        defaultValue={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-[#755a1a] shadow-2xs"
      />
    </label>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        {title}
      </p>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="text-xs text-slate-700 font-medium">
              • {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">None added</p>
      )}
    </div>
  );
}

function AssetSection({
  title,
  assets,
  urls,
  type,
  onReview,
}: {
  title: string;
  assets: AdminRecord[];
  urls: Record<string, string>;
  type: "media" | "documents";
  onReview: (
    type: "media" | "documents",
    id: string,
    decision: "approve" | "reject"
  ) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
      <h3 className="font-bold text-slate-900 text-base mb-4">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => {
          const status =
            type === "media"
              ? (asset.moderationStatus ?? asset.status)
              : asset.status;
          return (
            <article
              key={asset.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col group"
            >
              <div className="aspect-video bg-slate-100 relative overflow-hidden">
                {urls[asset.id] && asset.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[asset.id]}
                    alt={asset.fileName ?? title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <a
                    href={urls[asset.id]}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <FileCheck className="h-8 w-8 mb-1.5 text-[#755a1a]" />
                    <span className="text-xs font-bold">Open Document</span>
                  </a>
                )}
                <div className="absolute top-2 right-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold backdrop-blur-md shadow-xs border ${
                      status === "approved"
                        ? "bg-emerald-100/90 text-emerald-800 border-emerald-200"
                        : status === "pending"
                        ? "bg-amber-100/90 text-amber-900 border-amber-200"
                        : "bg-red-100/90 text-red-900 border-red-200"
                    }`}
                  >
                    {label(status)}
                  </span>
                </div>
              </div>
              <div className="p-3.5 flex-1 flex flex-col">
                <p
                  className="truncate text-xs font-bold text-slate-900"
                  title={asset.fileName ?? asset.documentType}
                >
                  {asset.fileName ?? asset.documentType}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {label(asset.category ?? asset.documentType)}
                </p>
                <div className="mt-auto pt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onReview(type, asset.id, "approve")}
                    className="flex-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors px-3 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-200"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onReview(type, asset.id, "reject")}
                    className="flex-1 rounded-xl bg-red-50 hover:bg-red-100 transition-colors px-3 py-1.5 text-xs font-bold text-red-800 border border-red-200"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!assets.length && (
          <div className="sm:col-span-2 lg:col-span-3 py-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
            <ImageIcon className="h-7 w-7 mb-1.5 text-slate-300" />
            <p className="text-xs font-medium">No {type} uploaded yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}
