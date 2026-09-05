"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { formatPaise } from "@/lib/currency";
import { DashboardCard } from "./shared";
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
    description: "Upload at least six guest-ready property photos.",
    checklistId: "photos",
    icon: ImageIcon,
  },
  {
    key: "rooms",
    title: "Rooms & Rates",
    shortTitle: "Rooms",
    description: "Room types, inventory, nightly rates and sellable plans.",
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

const CHECKLIST_SECTION: Record<ChecklistItem["id"], SectionKey> = {
  basicInfo: "basicInfo",
  location: "location",
  photos: "photos",
  amenities: "amenities",
  policies: "rooms",
  safetyDocs: "safety",
};

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

  const [activeSection, setActiveSection] = useState<SectionKey>("basicInfo");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewHighlighted, setPreviewHighlighted] = useState(false);
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
    if (!savedItem?.complete) return;

    const savedIndex = SECTIONS.findIndex((section) => section.key === advanceFrom);
    const nextSection = SECTIONS[savedIndex + 1];
    if (!nextSection) return;
    setActiveSection(nextSection.key);
    setSectionMessage(`${savedSection?.shortTitle ?? "Section"} complete. Moving to ${nextSection.shortTitle}.`);
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

  const focusGuestPreview = () => {
    document.getElementById("partner-listing-guest-preview")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setPreviewHighlighted(true);
    window.setTimeout(() => setPreviewHighlighted(false), 1400);
  };

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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={focusGuestPreview}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-4 text-sm font-bold text-[#06142B] shadow-[0_6px_18px_rgba(6,20,43,0.05)] transition-colors hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" />
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

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <DashboardCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Listing Progress</h2>
                <p className="mt-1 text-[11px] font-medium text-slate-500">{completeCount} of {checklist.length || 5} checks complete</p>
              </div>
              <ReadinessRing pct={readinessPct} />
            </div>

            <nav className="mt-4 space-y-1.5" aria-label="Listing sections">
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
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                      active
                        ? "border-[#D8B46A] bg-[#FBF3DF] text-[#06142B]"
                        : "border-transparent text-slate-700 hover:border-[#E6E2DA] hover:bg-white"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
                        complete
                          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                          : active
                            ? "border-[#ead59f] bg-white text-[#9a6b18]"
                            : "border-[#E6E2DA] bg-white text-slate-500"
                      }`}
                    >
                      {complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{index + 1}. {section.shortTitle}</span>
                      <span className={`mt-0.5 block truncate text-[11px] font-semibold ${complete ? "text-emerald-700" : "text-[#9a6b18]"}`}>
                        {complete ? "Complete" : checklistItem?.hint ?? "Needs attention"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </DashboardCard>

          <DashboardCard className="hidden p-4 md:block">
            <h3 className="text-sm font-bold">Submission status</h3>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
              {readyToSubmit
                ? "All required details are complete. You can submit the listing for Helpkey review."
                : "Complete the required sections before sending this listing for review."}
            </p>
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
                <div className="flex items-center gap-2">
                  {editorBusy && (
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#ead59f] bg-[#FBF3DF] px-3 text-xs font-bold text-[#9a6b18]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                    </span>
                  )}
                  <SectionStatus item={checklistById[activeConfig.checklistId]} />
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

            <div className="flex flex-col gap-3 border-t border-[#E6E2DA] bg-[#FCFBF8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <button
                type="button"
                onClick={goToPrevious}
                disabled={activeIndex <= 0 || busy}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#c8cdd6] bg-white px-4 text-sm font-bold text-[#06142B] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={goToNext}
                disabled={activeIndex >= SECTIONS.length - 1 || busy}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#06142B] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next section
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </DashboardCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryCard title="Rooms" actionLabel="Edit rooms" onAction={() => selectSection("rooms")}>
              {roomsWithPricing.length ? (
                <div className="space-y-2">
                  {roomsWithPricing.slice(0, 3).map((room) => (
                    <div key={room.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E6E2DA] bg-white px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{room.name}</p>
                        <p className="text-xs font-medium text-slate-500">{room.inventory} room{room.inventory === 1 ? "" : "s"}</p>
                      </div>
                      <p className="shrink-0 text-right text-sm font-bold text-[#9a6b18]">
                        {room.fromPaise !== null ? formatPaise(room.fromPaise) : "No rate"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine icon={BedDouble} text="No rooms added yet." />
              )}
            </SummaryCard>

            <SummaryCard title="Photos" actionLabel="Manage photos" onAction={() => selectSection("photos")}>
              {photos.length ? (
                <div className="grid grid-cols-4 gap-2">
                  {photos.slice(0, 4).map((photo) => (
                    <div key={photo.id} className="aspect-square overflow-hidden rounded-xl border border-[#E6E2DA] bg-slate-100">
                      {photo.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.imageUrl} alt={photo.altText || "Property photo"} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine icon={ImageIcon} text="No photos uploaded yet." />
              )}
            </SummaryCard>
          </div>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">What to finish next</h2>
              <ReadinessRing pct={readinessPct} small />
            </div>

            {readyToSubmit ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Ready for review
                </p>
                <p className="mt-1 text-xs font-medium leading-5 text-emerald-700">Submit this listing and Helpkey will verify it before it appears to guests.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {incompleteItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSection(CHECKLIST_SECTION[item.id])}
                    className="flex w-full items-start gap-3 rounded-2xl border border-[#E6E2DA] bg-white p-3 text-left transition-colors hover:border-[#D8B46A] hover:bg-[#FBF3DF]"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C6973E]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[#06142B]">Finish {item.label}</span>
                      <span className="mt-0.5 block text-xs font-medium leading-5 text-slate-500">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            className={`overflow-hidden transition-all ${
              previewHighlighted ? "border-[#D8B46A] shadow-[0_0_0_4px_rgba(216,180,106,0.18),0_18px_45px_rgba(6,20,43,0.12)]" : ""
            }`}
          >
            <div className="flex items-center justify-between border-b border-[#E6E2DA] px-5 py-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Guest Preview</h2>
              <button type="button" onClick={focusGuestPreview} className="inline-flex items-center gap-1 text-xs font-bold text-[#9a6b18]">
                View preview <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="p-5">
              <div id="partner-listing-guest-preview" className="overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white">
                <div className="h-40 bg-slate-100">
                  {coverPhoto?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPhoto.imageUrl} alt={coverPhoto.altText || propertyName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs font-medium text-slate-400">No cover image</div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold">{property?.name ?? propertyName}</h3>
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        {locationLabel}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#ead59f] bg-[#FBF3DF] px-2.5 py-1 text-[11px] font-bold text-[#9a6b18]">
                      {propertyTypeLabel}
                    </span>
                  </div>
                  <div className="flex items-end justify-between border-t border-[#E6E2DA] pt-3">
                    <p className="text-xs font-medium text-slate-500">
                      {property && property.ratingCount > 0 ? `★ ${property.ratingAverage.toFixed(1)} (${property.ratingCount.toLocaleString("en-IN")} reviews)` : "No reviews yet"}
                    </p>
                    <p className="text-right text-xs font-semibold text-slate-500">
                      From <span className="text-base font-bold text-[#9a6b18]">{startingPriceLabel}</span>
                      <span className="block">/ night</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </DashboardCard>

          <div className="rounded-2xl border border-[#ead59f] bg-[#FBF3DF] p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9a6b18]" />
              <div>
                <p className="text-sm font-bold text-[#06142B]">Review before live</p>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-600">Major listing changes are checked by Helpkey before guests can book.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

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
  const size = small ? "h-11 w-11" : "h-14 w-14";

  return (
    <div className={`relative grid ${size} shrink-0 place-items-center`}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
        <path className="text-slate-100" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        <path className="text-[#C6973E]" strokeDasharray={`${pct}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
      </svg>
      <div className="absolute text-center leading-none">
        <span className={`font-bold text-[#06142B] ${small ? "text-[11px]" : "text-sm"}`}>{pct}</span>
        <span className="block text-[7px] font-semibold text-slate-400">%</span>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <DashboardCard className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">{title}</h3>
        <button type="button" onClick={onAction} className="inline-flex items-center gap-1 text-xs font-bold text-[#9a6b18]">
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </DashboardCard>
  );
}

function EmptyLine({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#E6E2DA] bg-[#FCFBF8] px-3 py-4 text-sm font-medium text-slate-500">
      <Icon className="h-4 w-4 text-slate-400" />
      {text}
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
