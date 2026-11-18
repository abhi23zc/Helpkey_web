"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatPaise } from "@/lib/currency";
import { DashboardCard } from "./shared";
import { Drawer } from "./drawer";
import {
  AmenitiesEditor,
  BasicDetailsEditor,
  LocationEditor,
  PhotosEditor,
  PoliciesEditor,
  RoomsEditor,
  SafetyEditor,
} from "./listing-editors";
import { type ChecklistItem, type ListingMutations, type ListingResponse, usePropertyListing } from "./use-property-listing";

type SectionKey = "basicInfo" | "location" | "photos" | "rooms" | "amenities" | "policies" | "safety";

type SectionConfig = {
  key: SectionKey;
  title: string;
  shortTitle: string;
  description: string;
  checklistId: ChecklistItem["id"];
  icon: LucideIcon;
};

const SECTIONS: SectionConfig[] = [
  {
    key: "basicInfo",
    title: "Basic Details",
    shortTitle: "Basic",
    description: "Name, description, contact details and guest timings.",
    checklistId: "basicInfo",
    icon: FileText,
  },
  {
    key: "location",
    title: "Location",
    shortTitle: "Location",
    description: "Address, map location and timezone.",
    checklistId: "location",
    icon: MapPin,
  },
  {
    key: "photos",
    title: "Photos",
    shortTitle: "Photos",
    description: "Upload an exterior photo plus bedroom and bathroom photos for every room type.",
    checklistId: "photos",
    icon: ImageIcon,
  },
  {
    key: "rooms",
    title: "Rooms & Rates",
    shortTitle: "Rooms",
    description: "Review room types, inventory, and rates configured in your Rooms workspace.",
    checklistId: "policies",
    icon: BedDouble,
  },
  {
    key: "amenities",
    title: "Amenities",
    shortTitle: "Amenities",
    description: "Facilities and house rules guests should know.",
    checklistId: "amenities",
    icon: CheckCircle2,
  },
  {
    key: "policies",
    title: "Policies",
    shortTitle: "Policies",
    description: "Cancellation policy and booking terms.",
    checklistId: "policies",
    icon: ShieldCheck,
  },
  {
    key: "safety",
    title: "Safety Documents",
    shortTitle: "Safety",
    description: "Private partner verification documents.",
    checklistId: "safetyDocs",
    icon: ShieldCheck,
  },
];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  hotel: "Hotel",
  apartment: "Apartment",
  villa: "Villa",
  resort: "Resort",
  hostel: "Hostel",
  guest_house: "Guest House",
  homestay: "Homestay",
  other: "Property",
};

const COUNTRY_LABELS: Record<string, string> = { IN: "India" };

const STATUS_LABELS: Record<string, string> = {
  active: "Live",
  pending: "In review",
  not_submitted: "Draft",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

/** Approval states where the partner may (re)submit the listing for review. */
const RESUBMITTABLE = new Set(["not_submitted", "changes_requested", "rejected"]);

function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const diffMinutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function PartnerPropertyListingView({
  propertyId,
  propertyName = "The Balmoral Hotel",
}: {
  propertyId?: string;
  propertyName?: string;
}) {
  const listing = usePropertyListing(propertyId);
  const { property, photos, checklist, roomsWithPricing, startingPricePaise } = listing;

  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SectionKey>(searchParams.get("section") === "policies" ? "policies" : "basicInfo");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [guestPreviewOpen, setGuestPreviewOpen] = useState(false);
  const [sectionMessage, setSectionMessage] = useState("");
  // One-shot request to advance to the next section once the locally-merged
  // snapshot marks the saved section complete.
  const [advanceFrom, setAdvanceFrom] = useState<SectionKey | null>(null);
  // True while the active editor has a save/upload in flight.
  const [editorBusy, setEditorBusy] = useState(false);

  const checklistById = useMemo(
    () => Object.fromEntries(checklist.map((item) => [item.id, item])) as Partial<Record<ChecklistItem["id"], ChecklistItem>>,
    [checklist],
  );

  const completeCount = checklist.filter((item) => item.complete).length;
  const readinessPct = checklist.length ? Math.round((completeCount / checklist.length) * 100) : 0;
  const incompleteItems = checklist.filter((item) => !item.complete);
  const readyToSubmit = checklist.length > 0 && incompleteItems.length === 0;
  const activeIndex = SECTIONS.findIndex((section) => section.key === activeSection);
  const activeConfig = SECTIONS[activeIndex] ?? SECTIONS[0];

  // Fired after an editor merges its save into local state. Requests an advance
  // to the next section; the effect below performs it once the checklist
  // reflects the change (no network refetch needed).
  const handleEditorSaved = () => setAdvanceFrom(activeSection);

  // Switch sections and clear the busy flag; the freshly mounted editor
  // re-reports its own save/upload state.
  const selectSection = (key: SectionKey) => {
    setEditorBusy(false);
    setActiveSection(key);
  };

  useEffect(() => {
    if (!advanceFrom) return;
    const savedSection = SECTIONS.find((section) => section.key === advanceFrom);
    const savedItem = savedSection ? checklistById[savedSection.checklistId] : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdvanceFrom(null);

    const savedIndex = SECTIONS.findIndex((section) => section.key === advanceFrom);
    const nextSection = SECTIONS[savedIndex + 1];
    if (!nextSection) return;
    setActiveSection(nextSection.key);
    if (savedItem?.complete) {
      setSectionMessage(`${savedSection?.shortTitle ?? "Section"} complete. Moving to ${nextSection.shortTitle}.`);
    } else {
      setSectionMessage(`Saved. Moving to ${nextSection.shortTitle}.`);
    }
    window.setTimeout(() => setSectionMessage(""), 3200);
  }, [advanceFrom, checklistById]);

  const coverPhoto = useMemo(() => photos.find((photo) => photo.isCover) ?? photos[0] ?? null, [photos]);
  const statusLabel = STATUS_LABELS[property?.approvalStatus ?? "not_submitted"] ?? "Draft";
  const canResubmit = RESUBMITTABLE.has(property?.approvalStatus ?? "not_submitted");
  const isResubmission = property?.approvalStatus === "changes_requested" || property?.approvalStatus === "rejected";
  const lastUpdated = formatRelativeTime(property?.updatedAt);
  const propertyTypeLabel = PROPERTY_TYPE_LABELS[property?.propertyType ?? "hotel"] ?? "Property";
  const locationLabel = property?.address?.city
    ? `${property.address.city}, ${COUNTRY_LABELS[property.address.countryCode ?? "IN"] ?? "India"}`
    : "Location not set";
  const startingPriceLabel = startingPricePaise !== null ? formatPaise(startingPricePaise) : "Not set";

  const handleSubmitForReview = async () => {
    if (!propertyId) return;

    const startedAt = Date.now();
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const response = await fetch(`/api/partner/properties/${propertyId}/submit`, { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Unable to submit.");
      setSubmitMessage({ text: "Submitted for review. Helpkey will check the listing before it goes live.", ok: true });
      listing.reload();
    } catch (cause) {
      setSubmitMessage({ text: cause instanceof Error ? cause.message : "Unable to submit.", ok: false });
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 450) await new Promise((resolve) => setTimeout(resolve, 450 - elapsed));
      setSubmitting(false);
    }
  };

  const goToPrevious = () => {
    const previous = SECTIONS[Math.max(0, activeIndex - 1)];
    if (previous) selectSection(previous.key);
  };

  const goToNext = () => {
    const next = SECTIONS[Math.min(SECTIONS.length - 1, activeIndex + 1)];
    if (next) selectSection(next.key);
  };

  const hasForm = ["basic", "location", "amenities", "policies"].includes(activeSection);

  const handleNextClick = () => {
    if (hasForm) {
      const form = document.getElementById("listing-editor-form") as HTMLFormElement | null;
      if (form) {
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          form.submit();
        }
        return;
      }
    }
    goToNext();
  };

  const openGuestPreview = () => setGuestPreviewOpen(true);

  if (listing.loading && !property) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-[#c89b3c]" />
          <p className="text-sm font-semibold">{propertyId ? "Loading listing…" : "Loading your property…"}</p>
        </div>
      </div>
    );
  }

  // A background refresh (e.g. after submit) while the previous snapshot is
  // still on screen. Shown as a thin top bar rather than blanking the page.
  const backgroundRefreshing = listing.loading && Boolean(property);
  const busy = editorBusy || backgroundRefreshing;

  return (
    <div className="space-y-6 pb-16 text-[#061224]">
      {busy && (
        <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-[#c89b3c]/15" role="status" aria-label="Working">
          <div className="hk-loading-bar h-full w-1/4 rounded-full bg-[#c89b3c]" />
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a6b18]">Listing editor</p>
            {lastUpdated && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved {lastUpdated}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">Property Listing</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            Complete one section at a time. Draft changes stay private until Helpkey reviews them.
          </p>
          <p className="mt-2 text-sm font-semibold">
            <span className="text-[#9a6b18]">{statusLabel}</span>
            <span className="text-slate-300"> · </span>
            <span className={readyToSubmit ? "text-emerald-700" : "text-slate-500"}>
              {readyToSubmit ? "Ready to submit" : `${incompleteItems.length} required item${incompleteItems.length === 1 ? "" : "s"} left`}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={openGuestPreview}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#06142B] shadow-2xs transition-colors hover:bg-slate-50 hover:border-slate-300"
          >
            <Eye className="h-4 w-4 text-slate-500" />
            Preview Guest View
          </button>
          <button
            type="button"
            onClick={handleSubmitForReview}
            disabled={submitting || !propertyId || !readyToSubmit || !canResubmit}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#06142B] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(6,20,43,0.16)] transition-colors hover:bg-[#0A1F3C] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {property?.approvalStatus === "pending"
              ? "Awaiting Review"
              : isResubmission
                ? "Resubmit for Review"
                : "Submit for Review"}
          </button>
        </div>
      </div>

      {submitMessage && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            submitMessage.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {submitMessage.text}
        </div>
      )}

      {sectionMessage && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {sectionMessage}
        </div>
      )}

      {(property?.approvalStatus === "rejected" || property?.approvalStatus === "changes_requested") && property.rejectionReason && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <span className="font-bold">
            {property.approvalStatus === "rejected" ? "Listing rejected:" : "Changes requested:"}
          </span>{" "}
          {property.rejectionReason}
        </div>
      )}

      {listing.error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{listing.error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Listing Progress</h2>
                <p className="mt-1 text-xs sm:text-sm font-semibold text-[#06142B]">{completeCount} of {checklist.length || 6} checks complete</p>
              </div>
              <ReadinessRing pct={readinessPct} />
            </div>

            <nav className="mt-3.5 space-y-2" aria-label="Listing sections">
              {SECTIONS.map((section, index) => {
                const Icon = section.icon;
                const checklistItem = checklistById[section.checklistId];
                const complete = checklistItem?.complete ?? false;
                const active = activeSection === section.key;

                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => selectSection(section.key)}
                    className={`flex w-full items-center gap-3.5 rounded-2xl border px-3.5 py-3 text-left transition-all ${
                      active
                        ? "border-[#D8B46A] bg-[#FBF3DF] text-[#06142B] font-bold shadow-2xs"
                        : "border-transparent text-slate-700 hover:border-[#E6E2DA] hover:bg-slate-50/70"
                    }`}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors ${
                        complete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : active
                            ? "border-[#ead59f] bg-white text-[#9a6b18]"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      {complete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#06142B]">{index + 1}. {section.shortTitle}</span>
                      <span className={`mt-0.5 block truncate text-xs font-semibold ${complete ? "text-emerald-700" : "text-[#9a6b18]"}`}>
                        {complete ? "Complete" : checklistItem?.hint ?? "Needs attention"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </DashboardCard>
        </aside>

        <main className="min-w-0 space-y-4">
          <DashboardCard className="overflow-hidden">
            <div className="border-b border-[#E6E2DA] bg-white px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9a6b18]">Step {activeIndex + 1} of {SECTIONS.length}</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">{activeConfig.title}</h2>
                  <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">{activeConfig.description}</p>
                </div>
                <div className="flex flex-col items-start lg:items-end gap-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    {editorBusy && (
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#ead59f] bg-[#FBF3DF] px-3 text-xs font-bold text-[#9a6b18]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                      </span>
                    )}
                    <SectionStatus item={checklistById[activeConfig.checklistId]} />
                  </div>
                  {activeSection === "rooms" && (
                    <Link
                      href="/partner/rooms?section=types"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#06142B] shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition"
                    >
                      <span>Open Rooms Workspace</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="relative p-5 sm:p-6">
              {backgroundRefreshing && (
                <div className="absolute inset-0 z-10 grid place-items-center rounded-b-2xl bg-white/60 backdrop-blur-[1px]" role="status" aria-label="Refreshing">
                  <Loader2 className="h-5 w-5 animate-spin text-[#c89b3c]" />
                </div>
              )}
              {propertyId && listing.data ? (
                <ActiveEditor section={activeSection} propertyId={propertyId} listing={listing.data} onSaved={handleEditorSaved} mutations={listing} onBusyChange={setEditorBusy} />
              ) : (
                <EmptyState icon={AlertCircle} title="No property selected" text="Select a property from the top bar to edit its listing." />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#E6E2DA] bg-[#FCFBF8] px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={goToPrevious}
                disabled={activeIndex <= 0 || busy}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs sm:text-sm font-bold text-[#06142B] shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous section
              </button>

              {activeIndex < SECTIONS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNextClick}
                  disabled={busy}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#06142B] px-5 text-xs sm:text-sm font-bold text-white shadow-xs transition hover:bg-[#0c1f3b] disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>{busy ? "Saving…" : hasForm ? "Save & Next" : "Next section"}</span>
                  {!busy && <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={submitting || !propertyId || !readyToSubmit || !canResubmit}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#06142B] px-5 text-xs sm:text-sm font-bold text-white shadow-[0_12px_28px_rgba(6,20,43,0.16)] transition hover:bg-[#0A1F3C] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span>
                    {property?.approvalStatus === "pending"
                      ? "Awaiting Review"
                      : isResubmission
                        ? "Resubmit for Review"
                        : "Submit for Review"}
                  </span>
                </button>
              )}
            </div>
          </DashboardCard>
        </main>
      </div>

      <Drawer
        open={guestPreviewOpen}
        onClose={() => setGuestPreviewOpen(false)}
        title="Guest View Preview"
        description="Live preview of how travelers see your listing and rates on Helpkey."
        badge={<span className="rounded-full bg-[#fbf5e8] px-2.5 py-0.5 text-xs font-bold text-[#9a6b18]">{propertyTypeLabel}</span>}
        spacious
        footer={
          propertyId ? (
            <a
              href={`/hotels/${propertyId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#06142B] px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition"
            >
              Open Live Public Page <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : null
        }
      >
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative aspect-video w-full bg-slate-100">
              {coverPhoto?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPhoto.imageUrl} alt={coverPhoto.altText || propertyName} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-xs font-medium text-slate-400">No cover image set</div>
              )}
              <div className="absolute top-3 right-3 rounded-full bg-black/60 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-white">
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-[#06142B] truncate">{property?.name ?? propertyName}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {locationLabel}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[#ead59f] bg-[#FBF3DF] px-2.5 py-1 text-xs font-bold text-[#9a6b18]">
                  {propertyTypeLabel}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="font-semibold text-slate-600">
                  {property && property.ratingCount > 0 ? `★ ${property.ratingAverage.toFixed(1)} (${property.ratingCount.toLocaleString("en-IN")} reviews)` : "No reviews yet"}
                </span>
                <span className="font-semibold text-slate-600">
                  From <strong className="text-sm font-bold text-[#9a6b18]">{startingPriceLabel}</strong> / night
                </span>
              </div>
            </div>
          </div>

          {property?.description && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5 shadow-2xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">About Property</h4>
              <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-line">{property.description}</p>
            </div>
          )}

          {roomsWithPricing.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-2xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Room Types</h4>
              <div className="space-y-2">
                {roomsWithPricing.map((room) => (
                  <div key={room.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-[#06142B] truncate">{room.name}</p>
                      <p className="text-[11px] text-slate-500">{room.inventory} inventory room{room.inventory === 1 ? "" : "s"}</p>
                    </div>
                    <span className="font-bold text-[#9a6b18] shrink-0">
                      {room.fromPaise !== null ? formatPaise(room.fromPaise) : "No rate set"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#ead59f] bg-[#FBF3DF] p-3.5 text-xs">
            <div className="flex gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#9a6b18] mt-0.5" />
              <div>
                <p className="font-bold text-[#06142B]">Helpkey Verification Policy</p>
                <p className="mt-0.5 text-slate-600 leading-normal">
                  New listings and major updates are manually checked by our partner support team before appearing live to guests.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Drawer>

    </div>
  );
}

function ActiveEditor({
  section,
  propertyId,
  listing,
  onSaved,
  mutations,
  onBusyChange,
}: {
  section: SectionKey;
  propertyId: string;
  listing: ListingResponse;
  onSaved: () => void;
  mutations: ListingMutations;
  onBusyChange: (busy: boolean) => void;
}) {
  if (section === "basicInfo") return <BasicDetailsEditor propertyId={propertyId} listing={listing} onSaved={onSaved} mutations={mutations} onBusyChange={onBusyChange} />;
  if (section === "location") return <LocationEditor propertyId={propertyId} listing={listing} onSaved={onSaved} mutations={mutations} onBusyChange={onBusyChange} />;
  if (section === "photos") return <PhotosEditor propertyId={propertyId} listing={listing} onSaved={onSaved} mutations={mutations} onBusyChange={onBusyChange} />;
  if (section === "rooms") return <RoomsEditor propertyId={propertyId} listing={listing} onSaved={onSaved} mutations={mutations} onBusyChange={onBusyChange} />;
  if (section === "amenities") return <AmenitiesEditor propertyId={propertyId} listing={listing} onSaved={onSaved} mutations={mutations} onBusyChange={onBusyChange} />;
  if (section === "policies") return <PoliciesEditor propertyId={propertyId} listing={listing} onSaved={onSaved} mutations={mutations} onBusyChange={onBusyChange} />;
  return <SafetyEditor propertyId={propertyId} listing={listing} onSaved={onSaved} mutations={mutations} onBusyChange={onBusyChange} />;
}

function SectionStatus({ item }: { item?: ChecklistItem }) {
  if (!item) {
    return (
      <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500">
        Loading
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${
        item.complete
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-[#ead59f] bg-[#FBF3DF] text-[#9a6b18]"
      }`}
    >
      {item.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {item.complete ? "Complete" : item.hint}
    </span>
  );
}

function ReadinessRing({ pct, small = false }: { pct: number; small?: boolean }) {
  const size = small ? "h-11 w-11" : "h-16 w-16";

  return (
    <div className={`relative grid ${size} shrink-0 place-items-center`}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
        <path className="text-slate-100" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        <path className="text-[#C6973E]" strokeDasharray={`${pct}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
      </svg>
      <div className="absolute text-center leading-none">
        <span className={`font-bold text-[#06142B] ${small ? "text-xs" : "text-base"}`}>{pct}</span>
        <span className="block text-[8px] font-semibold text-slate-400 mt-0.5">%</span>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-[#E6E2DA] bg-[#FCFBF8] p-8 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-base font-bold">{title}</h3>
        <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">{text}</p>
      </div>
    </div>
  );
}
