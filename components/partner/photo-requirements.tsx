"use client";
import { useState } from "react";
import { isRoomPhoto, photoRequirements, propertyPhotoCategories, type PhotoRequirementAsset, type PhotoRequirementRoom, type PropertyPhotoCategory } from "@/lib/partner/photo-requirements";
import { requestJson } from "@/lib/partner/upload-client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";

export function PhotoChecklist({ photos, rooms, coverMediaId }: { photos: PhotoRequirementAsset[]; rooms: PhotoRequirementRoom[]; coverMediaId?: string | null }) {
  const requirements = photoRequirements(photos, rooms, coverMediaId);
  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden text-xs" aria-label="Photo requirements">
      {requirements.checks.map((check) => (
        <li
          key={check.key}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
            check.complete ? "bg-emerald-50/40 text-emerald-800 font-medium" : "text-slate-600 hover:bg-slate-50/50"
          }`}
        >
          {check.complete ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Circle className="h-3.5 w-3.5 shrink-0 text-slate-400 stroke-[1.75]" />
          )}
          <span className="leading-snug">{check.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Existing images can be classified without uploading them again. */
export function PhotoDetailsEditor({ propertyId, photo, rooms, onSaved }: { propertyId: string; photo: PhotoRequirementAsset; rooms: PhotoRequirementRoom[]; onSaved: () => Promise<unknown> }) {
  const [category, setCategory] = useState(photo.category ?? "additional");
  const [roomTypeId, setRoomTypeId] = useState(photo.roomTypeId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const roomPhoto = isRoomPhoto(category);
  const dirty = category !== (photo.category ?? "additional") || (roomPhoto ? roomTypeId : "") !== (photo.roomTypeId ?? "");

  return (
    <div className="mt-2.5 space-y-2 text-xs">
      <label className="block font-medium text-slate-700">
        <span className="mb-1 block text-[11px] text-slate-500">Category</span>
        <select
          aria-label="Saved photo category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          disabled={saving}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-800 shadow-sm transition focus:border-[#092442] focus:outline-none focus:ring-1 focus:ring-[#092442]"
        >
          {propertyPhotoCategories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {roomPhoto && (
        <label className="block font-medium text-slate-700">
          <span className="mb-1 block text-[11px] text-slate-500">Room type</span>
          <select
            aria-label="Saved photo room type"
            value={roomTypeId}
            onChange={(event) => setRoomTypeId(event.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-800 shadow-sm transition focus:border-[#092442] focus:outline-none focus:ring-1 focus:ring-[#092442]"
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
      {dirty && (
        <button
          type="button"
          disabled={saving || (roomPhoto && !roomTypeId)}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#092442] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#061633] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await requestJson(
                `/api/partner/properties/${propertyId}/media/${photo.id}`,
                { category: category as PropertyPhotoCategory, roomTypeId: roomPhoto ? roomTypeId : null },
                "PATCH"
              );
              await onSaved();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Unable to update photo.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
      )}
      {error && <p role="alert" className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}
