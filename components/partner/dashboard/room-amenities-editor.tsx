"use client";

import { useMemo, useState } from "react";
import {
  ROOM_AMENITY_CATEGORIES, normalizeRoomAmenities, roomAmenityOption, roomAmenitySelections,
  type RoomAmenityOption,
} from "@/lib/partner/room-amenities";
import type { ListingRoomType } from "./use-property-listing";

export function RoomAmenitiesEditor({ room, rooms, options, value, onChange }: {
  room: ListingRoomType;
  rooms: ListingRoomType[];
  options: RoomAmenityOption[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const selected = normalizeRoomAmenities(value, options);
  const choices = useMemo(() => {
    const all = new Map(options.map(option => [option.id, option]));
    // Unknown saved selections remain removable after they are unchecked.
    for (const option of roomAmenitySelections(room.amenityIds, options)) if (!all.has(option.id)) all.set(option.id, option);
    return [...all.values()];
  }, [options, room.amenityIds]);
  const filtered = choices.filter(option => `${option.label} ${option.code}`.toLowerCase().includes(search.trim().toLowerCase()));
  const sources = rooms.filter(source => source.id !== room.id);

  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-medium text-slate-500">Available in every {room.name} room.</p>
      <span aria-live="polite" className="shrink-0 text-xs font-bold text-[#b78929]">{selected.length} selected</span>
    </div>
    <label className="block text-xs font-semibold text-slate-700">Search amenities
      <input type="search" value={search} onChange={event => setSearch(event.target.value)}
        placeholder="Search by amenity name" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
    </label>
    {sources.length > 0 && <label className="block text-xs font-semibold text-slate-700">Copy from room type
      <select value="" onChange={event => {
        const source = sources.find(item => item.id === event.target.value);
        if (!source) return;
        const supported = source.amenityIds.filter(id => roomAmenityOption(id, options));
        const next = normalizeRoomAmenities([...selected, ...supported], options);
        if (next.length > 50) { setCopyMessage("Copy would exceed 50 amenities. Remove some selections first."); return; }
        onChange(next);
        setCopyMessage(`Added amenities from ${source.name}. Review and save to apply.${supported.length < source.amenityIds.length ? " Unrecognized amenities were skipped." : ""}`);
      }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
        <option value="">Choose a room type to merge its amenities</option>
        {sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
      </select>
    </label>}
    {copyMessage && <p role="status" className="text-xs text-slate-600">{copyMessage}</p>}
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">Select up to 50 amenities.</span>
      <button type="button" disabled={selected.length === 0} onClick={() => onChange([])} className="text-xs font-semibold text-slate-600 underline disabled:opacity-40">Clear all</button>
    </div>
    {ROOM_AMENITY_CATEGORIES.map(category => {
      const items = filtered.filter(option => option.category === category);
      if (!items.length) return null;
      return <fieldset key={category} className="space-y-2">
        <legend className="mb-2 text-xs font-bold text-slate-700">{category}</legend>
        <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
          {items.map(option => {
            const checked = selected.includes(option.id);
            return <label key={option.id} className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${checked ? "border-[#061224] bg-[#edf3f8] text-[#061224]" : "border-slate-200 bg-white text-slate-700"}`}>
              <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 50}
                onChange={() => onChange(checked ? selected.filter(id => id !== option.id) : [...selected, option.id])}
                className="h-4 w-4 shrink-0 accent-[#061224]" />
              <span className="break-words">{option.label}</span>
            </label>;
          })}
        </div>
      </fieldset>;
    })}
    {filtered.length === 0 && <p role="status" className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No amenities match “{search}”. Try another name.</p>}
  </div>;
}
