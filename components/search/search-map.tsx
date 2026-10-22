"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CatalogProperty } from "@/lib/customer/catalog";
import { mapsLibrary, markerLibrary } from "@/lib/google/maps-loader";
import { formatMoney } from "@/lib/customer/offer";
import { hotelHref } from "./stay-card";

export default function SearchMap({ properties, total, query, savedIds, onSave, saving }: { properties: CatalogProperty[]; total: number; query: string; savedIds: Set<string>; onSave: (id: string) => void; saving: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const selected = properties.find(property => property.id === selectedId);
  const mapped = properties.filter(property => property.coordinates && Number.isFinite(property.coordinates.latitude) && Number.isFinite(property.coordinates.longitude));
  useEffect(() => {
    let disposed = false;
    let map: google.maps.Map | null = null;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    void (async () => {
      try {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([mapsLibrary(), markerLibrary()]);
        if (disposed || !container.current || !mapped.length) return;
        map = new Map(container.current, { mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID", center: { lat: mapped[0].coordinates!.latitude, lng: mapped[0].coordinates!.longitude }, zoom: 13, streetViewControl: false, mapTypeControl: false });
        const bounds = new google.maps.LatLngBounds();
        for (const property of mapped) {
          const position = { lat: property.coordinates!.latitude, lng: property.coordinates!.longitude };
          const label = document.createElement("button");
          label.type = "button";
          label.textContent = formatMoney(property.minimumPricePaise, property.currency);
          label.setAttribute("aria-label", `${property.name}, ${label.textContent}. Show hotel preview`);
          label.className = "rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-md focus:outline-2 focus:outline-blue-600";
          label.addEventListener("click", () => setSelectedId(property.id));
          markers.push(new AdvancedMarkerElement({ map, position, content: label, title: property.name }));
          bounds.extend(position);
        }
        if (mapped.length > 1) map.fitBounds(bounds, 48);
      } catch { if (!disposed) setError("The map could not load. You can still browse and book from the hotel list."); }
    })();
    return () => { disposed = true; markers.forEach(marker => { google.maps.event.clearInstanceListeners(marker); marker.map = null; }); if (map) google.maps.event.clearInstanceListeners(map); };
    // Properties are stable while the user interacts with the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, attempt]);
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Hotel map">
    <p className="p-3 text-xs text-slate-600">Showing {mapped.length} mapped hotels from {properties.length} loaded of {total} results. Load more below to add hotels.{mapped.length < properties.length ? ` ${properties.length - mapped.length} hotels have no map location.` : ""}</p>
    {error ? <div role="alert" className="p-4 text-sm">{error}<button type="button" className="ml-2 underline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry map</button></div> : mapped.length ? <div ref={container} className="h-[400px] w-full sm:h-[480px]" /> : <p className="p-6 text-sm">No map locations are available for these hotels.</p>}
    <div className="border-t border-slate-100 p-3"><label className="text-xs font-semibold">Preview a hotel <select className="ml-2 max-w-full rounded border border-slate-200 p-2" value={selected?.id ?? ""} onChange={event => setSelectedId(event.target.value)}><option value="">Choose hotel</option>{mapped.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      {selected && <div aria-live="polite" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><div><b>{selected.name}</b><p>{formatMoney(selected.minimumPricePaise, selected.currency)} · {selected.offer ? "total stay" : "starting price"}</p></div><div className="flex items-center gap-4"><button type="button" disabled={saving} aria-pressed={savedIds.has(selected.id)} onClick={() => onSave(selected.id)} className="underline">{savedIds.has(selected.id) ? "Unsave hotel" : "Save hotel"}</button><Link href={hotelHref(selected, query)} className="rounded-lg bg-[var(--hk-navy)] px-4 py-2 text-white">View details</Link></div></div>}
    </div>
  </section>;
}
