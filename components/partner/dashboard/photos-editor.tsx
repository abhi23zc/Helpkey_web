"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bath,
  BedDouble,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { requestJson, uploadErrorMessage, uploadPropertyPhoto } from "@/lib/partner/upload-client";
import {
  isRoomPhoto,
  photoRequirements,
  propertyPhotoCategories as PHOTO_CATEGORIES,
  type PropertyPhotoCategory,
} from "@/lib/partner/photo-requirements";
import type { ListingMutations, ListingResponse } from "./use-property-listing";

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_CATEGORY_LABELS = Object.fromEntries(
  PHOTO_CATEGORIES.map((item) => [item.value, item.label])
) as Record<(typeof PHOTO_CATEGORIES)[number]["value"], string>;

type LocalPhotoStatus = "queued" | "uploading" | "processing" | "uploaded" | "failed";
type LocalPhoto = {
  id: string;
  file: File;
  category: PropertyPhotoCategory;
  roomTypeId?: string | null;
  previewUrl: string;
  status: LocalPhotoStatus;
  progress: number;
  error?: string;
};

type PhotosEditorProps = {
  propertyId: string;
  listing: ListingResponse;
  onSaved: () => void;
  mutations: ListingMutations;
  onBusyChange?: (busy: boolean) => void;
};

type PhotoItem = ListingResponse["media"][number];

export function PhotosEditor({ propertyId, listing, onSaved, mutations, onBusyChange }: PhotosEditorProps) {
  const [globalCategory, setGlobalCategory] = useState<PropertyPhotoCategory>("exterior");
  const [globalRoomTypeId, setGlobalRoomTypeId] = useState("");
  const [queue, setQueue] = useState<LocalPhoto[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [activeUploads, setActiveUploads] = useState(0);
  const [coverPendingId, setCoverPendingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<PhotoItem | null>(null);
  const [showChecklistDetails, setShowChecklistDetails] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // Hidden file input for targeted slot uploads
  const targetedFileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ category: PropertyPhotoCategory; roomTypeId: string | null }>({
    category: "exterior",
    roomTypeId: null,
  });

  useEffect(() => {
    onBusyChange?.(activeUploads > 0 || coverPendingId !== null || removingId !== null);
  }, [activeUploads, coverPendingId, removingId, onBusyChange]);

  const photos = useMemo(
    () => listing.media.filter((m) => m.kind === "property_image"),
    [listing.media]
  );

  const coverMediaId = listing.property.coverMediaId;
  const photoCheck = useMemo(
    () => photoRequirements(listing.media, listing.roomTypes, coverMediaId),
    [listing.media, listing.roomTypes, coverMediaId]
  );

  // Identify room-assigned photos vs general property photos
  const { propertyPhotos, roomGroupedPhotos } = useMemo(() => {
    const activeRooms = listing.roomTypes.filter((r) => !["paused", "archived"].includes(r.status ?? "active"));
    const roomMap = new Map<string, { bedroom: PhotoItem[]; bathroom: PhotoItem[]; other: PhotoItem[] }>();

    for (const room of activeRooms) {
      roomMap.set(room.id, { bedroom: [], bathroom: [], other: [] });
    }

    const unassignedProperty: PhotoItem[] = [];

    for (const photo of photos) {
      const assignedRoomId = photo.roomTypeId;
      if (assignedRoomId && roomMap.has(assignedRoomId)) {
        const roomBucket = roomMap.get(assignedRoomId)!;
        if (photo.category === "room") {
          roomBucket.bedroom.push(photo);
        } else if (photo.category === "bathroom") {
          roomBucket.bathroom.push(photo);
        } else {
          roomBucket.other.push(photo);
        }
      } else if (photo.category === "room" || photo.category === "bathroom") {
        // Fallback for legacy room photos linked via room.mediaIds
        const linkedRoom = activeRooms.find((r) => r.mediaIds?.includes(photo.id));
        if (linkedRoom && roomMap.has(linkedRoom.id)) {
          const roomBucket = roomMap.get(linkedRoom.id)!;
          if (photo.category === "room") roomBucket.bedroom.push(photo);
          else roomBucket.bathroom.push(photo);
        } else {
          unassignedProperty.push(photo);
        }
      } else {
        unassignedProperty.push(photo);
      }
    }

    const roomGroups = activeRooms.map((room) => ({
      room,
      ...roomMap.get(room.id)!,
      totalCount:
        (roomMap.get(room.id)?.bedroom.length ?? 0) +
        (roomMap.get(room.id)?.bathroom.length ?? 0) +
        (roomMap.get(room.id)?.other.length ?? 0),
    }));

    return { propertyPhotos: unassignedProperty, roomGroupedPhotos: roomGroups };
  }, [photos, listing.roomTypes]);

  const updateQueueItem = (id: string, patch: Partial<LocalPhoto>) => {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const uploadOne = async (item: LocalPhoto): Promise<boolean> => {
    updateQueueItem(item.id, { status: "uploading", progress: 1, error: undefined });
    setActiveUploads((count) => count + 1);
    try {
      const finalized = await uploadPropertyPhoto(
        propertyId,
        item.file,
        item.category,
        (progress) => updateQueueItem(item.id, { progress }),
        item.roomTypeId
      );
      updateQueueItem(item.id, { status: "processing", progress: 100 });
      if (finalized.media) {
        mutations.addMedia(
          finalized.media as ListingResponse["media"][number],
          finalized.coverMediaId ?? undefined
        );
      }
      updateQueueItem(item.id, { status: "uploaded", progress: 100 });
      window.setTimeout(() => {
        URL.revokeObjectURL(item.previewUrl);
        setQueue((current) => current.filter((queued) => queued.id !== item.id));
      }, 700);
      return true;
    } catch (cause) {
      updateQueueItem(item.id, { status: "failed", error: uploadErrorMessage(cause), progress: 0 });
      return false;
    } finally {
      setActiveUploads((count) => Math.max(0, count - 1));
    }
  };

  const runQueue = async (items: LocalPhoto[]) => {
    let cursor = 0;
    const results: boolean[] = [];
    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        results.push(await uploadOne(item));
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
    const uploaded = results.filter(Boolean).length;
    const failed = results.length - uploaded;
    if (uploaded > 0) onSaved();
    if (failed > 0) {
      setNotice({
        type: "error",
        text: `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded, ${failed} failed. Retry the failed files.`,
      });
    } else if (uploaded > 0) {
      setNotice({
        type: "success",
        text: `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded successfully.`,
      });
    }
  };

  const handleFiles = (
    files: File[],
    targetCategory: PropertyPhotoCategory = globalCategory,
    targetRoomTypeId: string | null = isRoomPhoto(targetCategory) ? globalRoomTypeId : null
  ) => {
    if (!files.length) return;
    if (isRoomPhoto(targetCategory) && !targetRoomTypeId) {
      setNotice({
        type: "error",
        text: "Please select a room type before uploading bedroom or bathroom photos.",
      });
      return;
    }

    const nextItems: LocalPhoto[] = files.map((file, index) => {
      const valid = ACCEPTED_PHOTO_TYPES.has(file.type) && file.size <= MAX_PHOTO_BYTES;
      return {
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        category: targetCategory,
        roomTypeId: isRoomPhoto(targetCategory) ? targetRoomTypeId : null,
        previewUrl: URL.createObjectURL(file),
        status: valid ? "queued" : "failed",
        progress: 0,
        error: valid ? undefined : "Use JPG, PNG, or WebP images up to 12 MB.",
      };
    });

    setQueue((current) => [...current, ...nextItems]);
    const validItems = nextItems.filter((item) => item.status === "queued");
    if (validItems.length) void runQueue(validItems);
  };

  const triggerTargetedUpload = (
    category: PropertyPhotoCategory,
    roomTypeId: string | null = null
  ) => {
    uploadTargetRef.current = { category, roomTypeId };
    if (targetedFileInputRef.current) {
      targetedFileInputRef.current.value = "";
      targetedFileInputRef.current.click();
    }
  };

  const onTargetedFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length) {
      handleFiles(files, uploadTargetRef.current.category, uploadTargetRef.current.roomTypeId);
    }
  };

  const retryQueueItem = (item: LocalPhoto) => {
    updateQueueItem(item.id, { status: "queued", progress: 0, error: undefined });
    void runQueue([{ ...item, status: "queued", progress: 0, error: undefined }]);
  };

  const removeQueueItem = (item: LocalPhoto) => {
    URL.revokeObjectURL(item.previewUrl);
    setQueue((current) => current.filter((queued) => queued.id !== item.id));
  };

  const setCover = async (mediaId: string) => {
    if (coverPendingId) return;
    setCoverPendingId(mediaId);
    mutations.setCoverMedia(mediaId);
    try {
      await requestJson(`/api/partner/properties/${propertyId}/media/${mediaId}`, { makeCover: true }, "PATCH");
      setNotice({ type: "success", text: "Cover photo updated successfully." });
    } catch {
      mutations.reload();
      setNotice({ type: "error", text: "Unable to update cover photo. Reloading..." });
    } finally {
      setCoverPendingId(null);
    }
  };

  const removeSavedPhoto = async (mediaId: string) => {
    if (!window.confirm("Remove this photo permanently? This action cannot be undone.")) return;
    setRemovingId(mediaId);
    try {
      const result = await requestJson<{ coverMediaId: string | null }>(
        `/api/partner/properties/${propertyId}/media/${mediaId}`,
        undefined,
        "DELETE"
      );
      mutations.removeMedia(mediaId, result.coverMediaId);
      setNotice({ type: "info", text: "Photo removed." });
    } catch (cause) {
      setNotice({ type: "error", text: uploadErrorMessage(cause) });
    } finally {
      setRemovingId(null);
    }
  };

  // Find missing requirements that can be fixed with 1 click
  const actionableMissing = useMemo(() => {
    return photoCheck.checks
      .filter((check) => !check.complete)
      .map((check) => {
        if (check.key === "exterior") {
          return {
            key: check.key,
            label: "Exterior / Entrance photo",
            actionLabel: "+ Add Exterior Photo",
            onClick: () => triggerTargetedUpload("exterior", null),
          };
        }
        for (const room of listing.roomTypes) {
          if (check.key === `${room.id}_room`) {
            return {
              key: check.key,
              label: `${room.name} · Bedroom photo`,
              actionLabel: `+ Add ${room.name} Bedroom Photo`,
              onClick: () => triggerTargetedUpload("room", room.id),
            };
          }
          if (check.key === `${room.id}_bathroom`) {
            return {
              key: check.key,
              label: `${room.name} · Bathroom photo`,
              actionLabel: `+ Add ${room.name} Bathroom Photo`,
              onClick: () => triggerTargetedUpload("bathroom", room.id),
            };
          }
        }
        if (check.key === "cover") {
          return {
            key: check.key,
            label: "Cover photo",
            actionLabel: "Choose any photo below as cover",
            onClick: null,
          };
        }
        return {
          key: check.key,
          label: check.label,
          actionLabel: "+ Upload Photos",
          onClick: () => triggerTargetedUpload("exterior", null),
        };
      });
  }, [photoCheck.checks, listing.roomTypes]);

  return (
    <div className="space-y-6">
      {/* Hidden file input for targeted slot uploads */}
      <input
        ref={targetedFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={onTargetedFileInputChange}
      />

      {/* Notice Banner */}
      {notice && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-semibold shadow-xs transition-all ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : notice.type === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-800"
              : "border border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Progress & Requirements Hub */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#061224]">Listing Photos Progress</h3>
              {photoCheck.complete ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> All requirements met
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                  <AlertTriangle className="h-3 w-3" /> {photoCheck.missing.length} required slot
                  {photoCheck.missing.length === 1 ? "" : "s"} missing
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {photoCheck.photos.length} of {photoCheck.minimum} minimum photos uploaded
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowChecklistDetails((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <span>{showChecklistDetails ? "Hide full checklist" : "View checklist details"}</span>
            {showChecklistDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Missing Requirements Quick-Action Bar */}
        {!photoCheck.complete && actionableMissing.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs font-bold text-amber-900">
                Action needed to submit listing:
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {actionableMissing.map((item) =>
                item.onClick ? (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onClick}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-all active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{item.actionLabel}</span>
                  </button>
                ) : (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800"
                  >
                    ★ {item.actionLabel}
                  </span>
                )
              )}
            </div>
          </div>
        )}

        {/* Collapsible Detailed Checklist */}
        {showChecklistDetails && (
          <div className="pt-2 border-t border-slate-100">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Requirements Checklist ({photoCheck.checks.filter((c) => c.complete).length} /{" "}
              {photoCheck.checks.length} complete)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {photoCheck.checks.map((check) => (
                <div
                  key={check.key}
                  className={`flex items-center gap-2 rounded-lg p-2 transition-colors ${
                    check.complete ? "bg-emerald-50/60 text-emerald-800" : "bg-slate-50 text-slate-600"
                  }`}
                >
                  {check.complete ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="truncate font-medium">{check.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upload Queue Progress Card */}
      {queue.length > 0 && (
        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#c89b3c]" />
              <p className="text-xs font-bold text-[#061224]">Uploading {queue.length} photo(s)</p>
            </div>
            {activeUploads > 0 && (
              <span className="text-[11px] font-semibold text-slate-500">
                {activeUploads} active stream{activeUploads === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {queue.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-11 w-11 shrink-0 rounded-lg object-cover border border-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-[#061224]">{item.file.name}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9a6b18]">
                    {PHOTO_CATEGORY_LABELS[item.category]}
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        item.status === "failed"
                          ? "bg-rose-500"
                          : item.status === "uploaded"
                          ? "bg-emerald-500"
                          : "bg-[#c89b3c]"
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <p
                    className={`mt-0.5 text-[10px] font-semibold ${
                      item.status === "failed"
                        ? "text-rose-600"
                        : item.status === "uploaded"
                        ? "text-emerald-600"
                        : "text-slate-500"
                    }`}
                  >
                    {item.status === "queued"
                      ? "Queued..."
                      : item.status === "uploading"
                      ? `Uploading ${item.progress}%`
                      : item.status === "processing"
                      ? "Verifying & saving..."
                      : item.status === "uploaded"
                      ? "✓ Uploaded"
                      : item.error}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => retryQueueItem(item)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-[#061224] hover:bg-slate-50"
                    >
                      Retry
                    </button>
                  )}
                  {(item.status === "failed" || item.status === "queued") && (
                    <button
                      type="button"
                      onClick={() => removeQueueItem(item)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 1: Room-by-Room Galleries (The Core Booking Unit) */}
      <section className="space-y-4" aria-label="Room Photo Galleries">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#061224] flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-[#c89b3c]" /> Room Photo Galleries
            </h2>
            <p className="text-xs text-slate-500">
              Each room requires at least 1 bedroom photo and 1 bathroom photo.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {roomGroupedPhotos.map(({ room, bedroom, bathroom, other, totalCount }) => {
            const hasBedroom = bedroom.length > 0;
            const hasBathroom = bathroom.length > 0;
            const isRoomComplete = hasBedroom && hasBathroom;

            return (
              <div
                key={room.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4"
              >
                {/* Room Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-[#061224]">
                      <BedDouble className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#061224]">{room.name}</h3>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500">{totalCount} photo{totalCount === 1 ? "" : "s"}</span>
                        <span>•</span>
                        {isRoomComplete ? (
                          <span className="font-semibold text-emerald-600 flex items-center gap-0.5">
                            <CheckCircle2 className="h-3 w-3" /> Requirements met
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-600 flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" /> Missing {!hasBedroom && !hasBathroom ? "bedroom & bathroom" : !hasBedroom ? "bedroom photo" : "bathroom photo"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => triggerTargetedUpload("room", room.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#061224] hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#c89b3c]" />
                    <span>Add Room Photo</span>
                  </button>
                </div>

                {/* Room Photo Slots Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {/* Slot 1: Bedroom Photo(s) */}
                  {hasBedroom ? (
                    bedroom.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        categoryLabel="Bedroom"
                        isCover={photo.id === coverMediaId || photo.isCover}
                        isCoverPending={coverPendingId === photo.id}
                        isRemoving={removingId === photo.id}
                        onSetCover={() => void setCover(photo.id)}
                        onRemove={() => void removeSavedPhoto(photo.id)}
                        onEdit={() => setEditingPhoto(photo)}
                      />
                    ))
                  ) : (
                    <EmptySlotCard
                      title="Add Bedroom Photo"
                      subtitle="Required"
                      icon={<BedDouble className="h-5 w-5" />}
                      highlight
                      isDragOver={dragOverTarget === `${room.id}_room`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverTarget(`${room.id}_room`);
                      }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverTarget(null);
                        const files = Array.from(e.dataTransfer.files);
                        handleFiles(files, "room", room.id);
                      }}
                      onClick={() => triggerTargetedUpload("room", room.id)}
                    />
                  )}

                  {/* Slot 2: Bathroom Photo(s) */}
                  {hasBathroom ? (
                    bathroom.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        categoryLabel="Bathroom"
                        isCover={photo.id === coverMediaId || photo.isCover}
                        isCoverPending={coverPendingId === photo.id}
                        isRemoving={removingId === photo.id}
                        onSetCover={() => void setCover(photo.id)}
                        onRemove={() => void removeSavedPhoto(photo.id)}
                        onEdit={() => setEditingPhoto(photo)}
                      />
                    ))
                  ) : (
                    <EmptySlotCard
                      title="Add Bathroom Photo"
                      subtitle="Required"
                      icon={<Bath className="h-5 w-5" />}
                      highlight
                      isDragOver={dragOverTarget === `${room.id}_bathroom`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverTarget(`${room.id}_bathroom`);
                      }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverTarget(null);
                        const files = Array.from(e.dataTransfer.files);
                        handleFiles(files, "bathroom", room.id);
                      }}
                      onClick={() => triggerTargetedUpload("bathroom", room.id)}
                    />
                  )}

                  {/* Any extra room photos */}
                  {other.map((photo) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      categoryLabel={PHOTO_CATEGORY_LABELS[photo.category as PropertyPhotoCategory] || "Room"}
                      isCover={photo.id === coverMediaId || photo.isCover}
                      isCoverPending={coverPendingId === photo.id}
                      isRemoving={removingId === photo.id}
                      onSetCover={() => void setCover(photo.id)}
                      onRemove={() => void removeSavedPhoto(photo.id)}
                      onEdit={() => setEditingPhoto(photo)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: Property & Exterior Spaces */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4" aria-label="Property & Exterior Spaces">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-[#061224] flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#c89b3c]" /> Property & Exterior Spaces
            </h2>
            <p className="text-xs text-slate-500">
              Exterior facade, entrance, reception, amenities, and common areas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerTargetedUpload("exterior", null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#061224] hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#c89b3c]" />
              <span>Add Exterior Photo</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Missing Exterior Slot indicator if no exterior photos exist */}
          {!photos.some((p) => p.category === "exterior") && (
            <EmptySlotCard
              title="Add Exterior Photo"
              subtitle="Required"
              icon={<Building2 className="h-5 w-5" />}
              highlight
              isDragOver={dragOverTarget === "exterior"}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTarget("exterior");
              }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTarget(null);
                const files = Array.from(e.dataTransfer.files);
                handleFiles(files, "exterior", null);
              }}
              onClick={() => triggerTargetedUpload("exterior", null)}
            />
          )}

          {propertyPhotos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              categoryLabel={PHOTO_CATEGORY_LABELS[photo.category as PropertyPhotoCategory] || "Property"}
              isCover={photo.id === coverMediaId || photo.isCover}
              isCoverPending={coverPendingId === photo.id}
              isRemoving={removingId === photo.id}
              onSetCover={() => void setCover(photo.id)}
              onRemove={() => void removeSavedPhoto(photo.id)}
              onEdit={() => setEditingPhoto(photo)}
            />
          ))}

          {propertyPhotos.length === 0 && photos.some((p) => p.category === "exterior") && (
            <div className="col-span-full py-6 text-center text-xs text-slate-400">
              No general property photos yet. Click below to add reception, dining, or amenities photos.
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: General Upload Dropzone */}
      <section className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-5 text-center transition-colors hover:border-[#c89b3c]">
        <div className="max-w-md mx-auto space-y-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white border border-slate-200 shadow-xs mx-auto text-slate-500">
            <Upload className="h-5 w-5 text-[#c89b3c]" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#061224]">Upload additional property photos</p>
            <p className="text-[11px] text-slate-500">
              JPG, PNG or WebP up to 12 MB each · Multiple files supported
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <span>Category:</span>
              <select
                value={globalCategory}
                onChange={(e) => setGlobalCategory(e.target.value as PropertyPhotoCategory)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-xs outline-none focus:border-[#c89b3c]"
              >
                {PHOTO_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            {isRoomPhoto(globalCategory) && (
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Room:</span>
                <select
                  value={globalRoomTypeId}
                  onChange={(e) => setGlobalRoomTypeId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-xs outline-none focus:border-[#c89b3c]"
                >
                  <option value="">Select room</option>
                  {listing.roomTypes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all">
            <Plus className="h-4 w-4" />
            <span>Select Photos from Computer</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              disabled={activeUploads > 0}
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? []);
                e.currentTarget.value = "";
                handleFiles(files, globalCategory, isRoomPhoto(globalCategory) ? globalRoomTypeId : null);
              }}
            />
          </label>
        </div>
      </section>

      {/* Edit Photo Category / Room Modal */}
      {editingPhoto && (
        <EditPhotoModal
          propertyId={propertyId}
          photo={editingPhoto}
          rooms={listing.roomTypes}
          onClose={() => setEditingPhoto(null)}
          onSaved={async () => {
            setEditingPhoto(null);
            mutations.reload();
            setNotice({ type: "success", text: "Photo category updated." });
          }}
        />
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function PhotoCard({
  photo,
  categoryLabel,
  isCover,
  isCoverPending,
  isRemoving,
  onSetCover,
  onRemove,
  onEdit,
}: {
  photo: PhotoItem;
  categoryLabel: string;
  isCover: boolean;
  isCoverPending: boolean;
  isRemoving: boolean;
  onSetCover: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200/90 bg-slate-100 shadow-xs hover:shadow-md transition-all">
      {photo.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.imageUrl}
          alt={photo.altText || `${categoryLabel} photo`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="h-6 w-6 text-slate-300" />
        </div>
      )}

      {/* Gradient Vignette for badges visibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/40 opacity-70 group-hover:opacity-90 transition-opacity pointer-events-none" />

      {/* Top Badges */}
      <div className="absolute left-1.5 top-1.5 flex flex-wrap items-center gap-1">
        {isCover ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#c89b3c] px-2 py-0.5 text-[9px] font-bold text-[#061224] shadow-xs">
            <Star className="h-2.5 w-2.5 fill-current" /> Cover
          </span>
        ) : null}
        <span className="inline-flex items-center rounded-md bg-slate-900/80 backdrop-blur-xs px-2 py-0.5 text-[9px] font-semibold text-white">
          {categoryLabel}
        </span>
      </div>

      {/* Top Right Action: Delete */}
      <button
        type="button"
        onClick={onRemove}
        disabled={isRemoving}
        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600 disabled:opacity-100"
        aria-label={`Remove photo ${photo.fileName ?? ""}`}
      >
        {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
      </button>

      {/* Bottom Actions Overlay (Hover) */}
      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isCover && (
          <button
            type="button"
            onClick={onSetCover}
            disabled={isCoverPending}
            className="inline-flex items-center gap-1 rounded-md bg-slate-900/85 backdrop-blur-xs px-2 py-1 text-[9px] font-bold text-white hover:bg-[#c89b3c] hover:text-[#061224] transition-colors disabled:opacity-50"
          >
            {isCoverPending ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Star className="h-2.5 w-2.5" />
            )}
            <span>Set Cover</span>
          </button>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-900/85 backdrop-blur-xs px-2 py-1 text-[9px] font-bold text-white hover:bg-white hover:text-slate-900 transition-colors"
          title="Change category or room"
        >
          <Pencil className="h-2.5 w-2.5" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  );
}

function EmptySlotCard({
  title,
  subtitle,
  icon,
  highlight = false,
  isDragOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  highlight?: boolean;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-all cursor-pointer ${
        isDragOver
          ? "border-[#c89b3c] bg-amber-100/70 scale-102"
          : highlight
          ? "border-amber-300 bg-amber-50/50 hover:border-amber-500 hover:bg-amber-50"
          : "border-slate-200 bg-slate-50/60 hover:border-[#c89b3c] hover:bg-slate-50"
      }`}
    >
      <div
        className={`grid h-8 w-8 place-items-center rounded-lg transition-transform group-hover:scale-110 ${
          highlight ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {icon}
      </div>
      <p
        className={`mt-1.5 text-xs font-bold leading-tight ${
          highlight ? "text-amber-900" : "text-slate-700"
        }`}
      >
        {title}
      </p>
      <span
        className={`mt-0.5 text-[10px] font-semibold ${
          highlight ? "text-amber-700" : "text-slate-400"
        }`}
      >
        {subtitle}
      </span>
      <div className="mt-1 flex items-center gap-0.5 text-[9px] font-bold text-[#c89b3c]">
        <Plus className="h-3 w-3" /> Click to upload
      </div>
    </button>
  );
}

function EditPhotoModal({
  propertyId,
  photo,
  rooms,
  onClose,
  onSaved,
}: {
  propertyId: string;
  photo: PhotoItem;
  rooms: ListingResponse["roomTypes"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [category, setCategory] = useState<PropertyPhotoCategory>(
    (photo.category as PropertyPhotoCategory) || "additional"
  );
  const [roomTypeId, setRoomTypeId] = useState(photo.roomTypeId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const roomPhoto = isRoomPhoto(category);

  const handleSave = async () => {
    if (roomPhoto && !roomTypeId) {
      setError("Please choose a room type.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await requestJson(
        `/api/partner/properties/${propertyId}/media/${photo.id}`,
        { category, roomTypeId: roomPhoto ? roomTypeId : null },
        "PATCH"
      );
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update photo.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-[#061224]">Edit Photo Classification</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thumbnail Preview */}
        {photo.imageUrl && (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.imageUrl} alt="Photo preview" className="h-full w-full object-cover" />
          </div>
        )}

        {/* Category Selector */}
        <div className="space-y-3 text-xs">
          <label className="block font-semibold text-slate-700">
            <span className="mb-1 block text-slate-500">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PropertyPhotoCategory)}
              disabled={saving}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#c89b3c]"
            >
              {PHOTO_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {roomPhoto && (
            <label className="block font-semibold text-slate-700">
              <span className="mb-1 block text-slate-500">Assigned Room Type</span>
              <select
                value={roomTypeId}
                onChange={(e) => setRoomTypeId(e.target.value)}
                disabled={saving}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#c89b3c]"
              >
                <option value="">Choose room type</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (roomPhoto && !roomTypeId)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>{saving ? "Saving..." : "Save Changes"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
