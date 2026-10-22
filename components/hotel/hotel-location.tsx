"use client";
import { useRef, useState } from "react";
import { MapPin, Navigation, Copy, Check, Map as MapIcon, Landmark } from "lucide-react";
import type { CatalogDetailProperty } from "@/lib/customer/catalog";

export function HotelLocation({ property }: { property: CatalogDetailProperty }) {
  const map = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const address = [
    property.address.line1,
    property.address.line2,
    property.address.city,
    property.address.state,
    property.address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const destination = property.coordinates
    ? `${property.coordinates.latitude},${property.coordinates.longitude}`
    : address;

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const showMap = async () => {
    setStatus("loading");
    try {
      const { mapsLibrary } = await import("@/lib/google/maps-loader");
      const { Map, InfoWindow } = await mapsLibrary();
      if (!map.current || !property.coordinates) throw new Error("MAP_UNAVAILABLE");
      const center = { lat: property.coordinates.latitude, lng: property.coordinates.longitude };
      const instance = new Map(map.current, {
        center,
        zoom: 16,
        mapTypeControl: false,
        streetViewControl: false,
      });
      new InfoWindow({
        content: Object.assign(document.createElement("span"), {
          textContent: property.name,
          style: "font-weight: bold; font-family: sans-serif; padding: 4px;",
        }),
        position: center,
      }).open(instance);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section id="location" className="scroll-mt-24 space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--hk-navy)]">
            Location & Neighborhood
          </h2>
          <p className="mt-1 text-sm text-[var(--hk-muted)]">
            Explore the surrounding area and key connectivity points
          </p>
        </div>
      </div>

      {/* Address & Quick Actions Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hk-surface-soft)] text-[var(--hk-navy)]">
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm sm:text-base">
                {address || "Address information is unavailable."}
              </p>
              {property.address.landmark && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <Landmark className="h-3.5 w-3.5 text-slate-400" />
                  Landmark: {property.address.landmark}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {address && (
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-500" />
                    <span>Copy address</span>
                  </>
                )}
              </button>
            )}

            {destination && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--hk-navy)] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition"
              >
                <Navigation className="h-3.5 w-3.5 text-[var(--hk-gold-light)]" />
                <span>Get directions</span>
              </a>
            )}
          </div>
        </div>

      </div>

      {/* Map Display & Interactive Trigger */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-xs">
        {property.coordinates && status !== "ready" && (
          <div className="flex flex-col items-center justify-center bg-radial from-slate-50 to-slate-100 px-6 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md text-[var(--hk-navy)]">
              <MapIcon className="h-7 w-7 text-[var(--hk-navy)]" />
            </div>
            <h3 className="text-base font-bold text-[var(--hk-navy)]">
              Interactive Google Map
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              View exact street location, surrounding landmarks, and driving directions
            </p>
            <button
              disabled={status === "loading"}
              onClick={() => void showMap()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--hk-navy)] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {status === "loading" ? "Loading map…" : status === "error" ? "Retry map" : "Show map"}
            </button>
          </div>
        )}

        <div
          ref={map}
          className={status === "idle" ? "hidden" : "h-80 w-full"}
          aria-label="Property map"
        />

        {status === "error" && (
          <div className="p-4 bg-amber-50 border-t border-amber-200">
            <p role="status" className="text-xs text-amber-800">
              The map could not load. You can still use the address and directions above.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

