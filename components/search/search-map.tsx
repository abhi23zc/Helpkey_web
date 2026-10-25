"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Heart,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import type { CatalogProperty } from "@/lib/customer/catalog";
import { mapsLibrary, markerLibrary } from "@/lib/google/maps-loader";
import { cancellationLabel, formatMoney, guestScoreLabel } from "@/lib/customer/offer";
import { amenityLabel, canonicalAmenityKey } from "@/lib/customer/amenities";
import { PublicMediaImage } from "@/components/shared/public-media-image";
import { hotelHref } from "./stay-card";

type Props = {
  properties: CatalogProperty[];
  total: number;
  query: string;
  savedIds: Set<string>;
  onSave: (id: string) => void;
  saving: boolean;
  destination?: string;
};

const MARKER_DEFAULT_CLASS =
  "group relative flex items-center justify-center rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-[#0b1f3a] shadow-md transition-all duration-200 hover:scale-105 hover:bg-slate-50 hover:shadow-lg hover:border-slate-300 cursor-pointer select-none";

const MARKER_ACTIVE_CLASS =
  "group relative flex items-center justify-center rounded-full border border-[#0b1f3a] bg-[#0b1f3a] px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xl scale-110 ring-2 ring-white/90 transition-all duration-200 cursor-pointer select-none z-50";

export default function SearchMap({
  properties,
  total,
  query,
  savedIds,
  onSave,
  saving,
  destination: destinationProp,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);
  const markersRef = useRef<Map<string, { marker: google.maps.marker.AdvancedMarkerElement; element: HTMLButtonElement; position: { lat: number; lng: number } }>>(new Map());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  const destination = destinationProp || new URLSearchParams(query).get("destination") || "this area";
  const mapped = properties.filter(
    (property) =>
      property.coordinates &&
      Number.isFinite(property.coordinates.latitude) &&
      Number.isFinite(property.coordinates.longitude),
  );

  const selected = mapped.find((property) => property.id === selectedId) || null;
  const selectedIndex = mapped.findIndex((property) => property.id === selectedId);

  // Initialize Google Maps and markers
  useEffect(() => {
    let disposed = false;
    markersRef.current.clear();
    setIsMapReady(false);

    void (async () => {
      try {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          mapsLibrary(),
          markerLibrary(),
        ]);
        if (disposed || !containerRef.current || !mapped.length) return;

        const initialCenter = {
          lat: mapped[0].coordinates!.latitude,
          lng: mapped[0].coordinates!.longitude,
        };

        const map = new Map(containerRef.current, {
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
          center: initialCenter,
          zoom: 13,
          disableDefaultUI: true,
          clickableIcons: false,
        });
        mapInstanceRef.current = map;

        const bounds = new google.maps.LatLngBounds();
        boundsRef.current = bounds;

        for (const property of mapped) {
          const position = {
            lat: property.coordinates!.latitude,
            lng: property.coordinates!.longitude,
          };

          const button = document.createElement("button");
          button.type = "button";
          button.textContent = formatMoney(property.minimumPricePaise, property.currency);
          button.setAttribute(
            "aria-label",
            `${property.name}, ${button.textContent}. Show hotel preview`,
          );
          button.className = MARKER_DEFAULT_CLASS;

          const selectProperty = () => {
            setSelectedId(property.id);
            map.panTo(position);
          };

          button.addEventListener("click", (event) => {
            event.stopPropagation();
            selectProperty();
          });

          const marker = new AdvancedMarkerElement({
            map,
            position,
            content: button,
            title: property.name,
            zIndex: 1,
          });

          marker.addListener("click", () => {
            selectProperty();
          });

          markersRef.current.set(property.id, { marker, element: button, position });
          bounds.extend(position);
        }

        // Close preview when clicking on the map surface
        map.addListener("click", () => {
          setSelectedId(null);
        });

        if (mapped.length > 1) {
          map.fitBounds(bounds, 56);
        }

        setIsMapReady(true);
      } catch {
        if (!disposed) {
          setError("The map could not load. You can still browse and book from the hotel list.");
        }
      }
    })();

    return () => {
      disposed = true;
      markersRef.current.forEach(({ marker }) => {
        google.maps.event.clearInstanceListeners(marker);
        marker.map = null;
      });
      markersRef.current.clear();
      if (mapInstanceRef.current) {
        google.maps.event.clearInstanceListeners(mapInstanceRef.current);
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, attempt]);

  // Dynamically update marker styling based on selectedId without rebuilding the map
  useEffect(() => {
    for (const [id, item] of markersRef.current.entries()) {
      const isSelected = id === selectedId;
      if (isSelected) {
        item.element.className = MARKER_ACTIVE_CLASS;
        item.marker.zIndex = 1000;
      } else {
        item.element.className = MARKER_DEFAULT_CLASS;
        item.marker.zIndex = 1;
      }
    }
  }, [selectedId]);

  // Adjust map viewport when toggling fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        google.maps.event.trigger(mapInstanceRef.current, "resize");
        if (selected?.coordinates) {
          mapInstanceRef.current.panTo({
            lat: selected.coordinates.latitude,
            lng: selected.coordinates.longitude,
          });
        } else if (boundsRef.current && mapped.length > 1) {
          mapInstanceRef.current.fitBounds(boundsRef.current, 56);
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullscreen, mapped.length, selected]);

  // Keyboard navigation: Escape closes fullscreen or preview card
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (selectedId) {
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, selectedId]);

  const handleZoomIn = useCallback(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() ?? 13) + 1);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() ?? 13) - 1);
    }
  }, []);

  const handleResetView = useCallback(() => {
    if (mapInstanceRef.current && boundsRef.current && mapped.length > 1) {
      mapInstanceRef.current.fitBounds(boundsRef.current, 56);
      setSelectedId(null);
    } else if (mapInstanceRef.current && mapped[0]?.coordinates) {
      mapInstanceRef.current.panTo({
        lat: mapped[0].coordinates.latitude,
        lng: mapped[0].coordinates.longitude,
      });
      mapInstanceRef.current.setZoom(13);
    }
  }, [mapped]);

  const selectNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!mapped.length) return;
      const nextIndex = selectedIndex < 0 ? 0 : (selectedIndex + 1) % mapped.length;
      const nextProp = mapped[nextIndex];
      setSelectedId(nextProp.id);
      if (mapInstanceRef.current && nextProp.coordinates) {
        mapInstanceRef.current.panTo({
          lat: nextProp.coordinates.latitude,
          lng: nextProp.coordinates.longitude,
        });
      }
    },
    [mapped, selectedIndex],
  );

  const selectPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!mapped.length) return;
      const prevIndex = selectedIndex <= 0 ? mapped.length - 1 : selectedIndex - 1;
      const prevProp = mapped[prevIndex];
      setSelectedId(prevProp.id);
      if (mapInstanceRef.current && prevProp.coordinates) {
        mapInstanceRef.current.panTo({
          lat: prevProp.coordinates.latitude,
          lng: prevProp.coordinates.longitude,
        });
      }
    },
    [mapped, selectedIndex],
  );

  if (error) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div role="alert" className="flex flex-col items-center justify-center text-center">
          <p className="text-sm text-slate-700">{error}</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-[var(--hk-navy)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--hk-navy-strong)]"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Retry map
          </button>
        </div>
      </section>
    );
  }

  if (!mapped.length) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-600">No map locations are available for these hotels.</p>
      </section>
    );
  }

  const selectedOffer = selected?.offer;
  const selectedCancellation = selectedOffer
    ? cancellationLabel(selectedOffer.cancellation, selectedOffer.timezone)
    : null;

  const mapContent = (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      {/* Map Canvas */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Top Left Status Pill */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-[var(--hk-ink)] shadow-md backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-[var(--hk-success)] animate-pulse" />
          <span>
            {mapped.length} {mapped.length === 1 ? "stay" : "stays"} in {destination}
          </span>
          {mapped.length < properties.length && (
            <span className="text-[10px] text-slate-500 font-normal">
              ({properties.length - mapped.length} unmapped)
            </span>
          )}
        </div>
      </div>

      {/* Top Right Controls (Fullscreen toggle) */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsFullscreen((v) => !v)}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen map"}
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen map"}
          className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/95 px-3 py-2 text-xs font-bold text-[var(--hk-ink)] shadow-md backdrop-blur-md transition hover:bg-white hover:shadow-lg focus:outline-none"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Close</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Expand</span>
            </>
          )}
        </button>
      </div>

      {/* Right Side Zoom & Re-center Controls (Airbnb style) */}
      <div className="absolute right-4 top-16 z-20 flex flex-col items-center gap-2">
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-md backdrop-blur-md">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition hover:bg-slate-100 hover:text-black focus:outline-none active:bg-slate-200"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-[1px] w-full bg-slate-200" />
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition hover:bg-slate-100 hover:text-black focus:outline-none active:bg-slate-200"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetView}
          aria-label="Reset map view"
          title="Reset map view to all stays"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/95 text-slate-700 shadow-md backdrop-blur-md transition hover:bg-white hover:text-black hover:shadow-lg focus:outline-none active:bg-slate-100"
        >
          <Compass className="h-4 w-4" />
        </button>
      </div>

      {/* Airbnb-style Floating Stay Preview Card */}
      {selected && (
        <div
          role="dialog"
          aria-label={`Preview of ${selected.name}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-4 left-4 right-4 z-30 sm:bottom-5 sm:left-auto sm:right-5 sm:w-[340px] md:w-[360px]"
        >
          <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Image & Overlay Badges */}
            <div className="group relative h-44 w-full bg-slate-100 overflow-hidden">
              {selected.coverImageUrl ? (
                <PublicMediaImage
                  src={selected.coverImageUrl}
                  srcSet={selected.coverImageSrcSet}
                  alt={selected.name}
                  sizes="360px"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                  <Building2 className="h-10 w-10" />
                </div>
              )}

              {/* Top Left Badges */}
              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 z-10 pointer-events-none">
                {selected.ratingAverage >= 4.5 && (
                  <span className="rounded-full bg-[var(--hk-navy)] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                    Guest Favourite
                  </span>
                )}
                {selected.freeCancellation && (
                  <span className="flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[var(--hk-success)] shadow-sm backdrop-blur-xs">
                    <Check className="h-3 w-3" /> Free cancellation
                  </span>
                )}
              </div>

              {/* Top Right Action Buttons (Save + Close) */}
              <div className="absolute right-3 top-3 flex items-center gap-1.5 z-10">
                <button
                  type="button"
                  aria-label={`${savedIds.has(selected.id) ? "Unsave" : "Save"} ${selected.name}`}
                  disabled={saving}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSave(selected.id);
                  }}
                  className="rounded-full bg-white/90 p-2 text-[var(--hk-navy)] shadow-md backdrop-blur-sm transition hover:scale-110 disabled:opacity-50"
                >
                  <Heart
                    className={`h-4 w-4 ${savedIds.has(selected.id) ? "fill-red-500 text-red-500" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  aria-label="Close preview"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(null);
                  }}
                  className="rounded-full bg-white/90 p-2 text-slate-700 shadow-md backdrop-blur-sm transition hover:bg-white hover:text-black hover:scale-105"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Prev / Next navigation arrows over image */}
              {mapped.length > 1 && (
                <div className="absolute inset-y-0 inset-x-2 flex items-center justify-between pointer-events-none z-10">
                  <button
                    type="button"
                    onClick={selectPrev}
                    aria-label="Previous stay"
                    className="pointer-events-auto rounded-full bg-white/85 p-1.5 text-slate-800 shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-110"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={selectNext}
                    aria-label="Next stay"
                    className="pointer-events-auto rounded-full bg-white/85 p-1.5 text-slate-800 shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-110"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Property Details */}
            <div className="p-4">
              {/* Category / Type & Rating Badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--hk-gold-strong)]">
                  {selected.propertyType || "Hotel"} · {selected.city || "Kanpur"}
                </span>

                {selected.ratingCount > 0 && selected.ratingAverage > 0 ? (
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--hk-surface-soft)] px-2 py-0.5 text-xs font-bold text-[var(--hk-navy)]"
                    aria-label={`Guest rating ${selected.ratingAverage.toFixed(1)} out of 5`}
                  >
                    <Star className="h-3 w-3 fill-[var(--hk-rating)] text-[var(--hk-rating)]" />
                    <span>{selected.ratingAverage.toFixed(1)}</span>
                    <span className="text-[10px] font-normal text-[var(--hk-muted)]">
                      ({selected.ratingCount})
                    </span>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--hk-surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--hk-navy)]">
                    <Sparkles className="h-2.5 w-2.5 text-[var(--hk-gold-strong)]" />
                    <span>Popular stay</span>
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="mt-1 text-base font-bold leading-tight tracking-tight text-[var(--hk-ink)]">
                <Link
                  href={hotelHref(selected, query)}
                  className="hover:text-[var(--hk-navy)] hover:underline line-clamp-1"
                >
                  {selected.name}
                </Link>
              </h3>

              {/* Location */}
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--hk-muted)]">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">
                  {[selected.locality, selected.city, selected.state].filter(Boolean).join(", ") ||
                    "Kanpur, Uttar Pradesh"}
                </span>
              </p>

              {/* Amenities / Feature Pills (fills the empty gap with useful info) */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {(() => {
                  const priority = ["wifi", "fast_wifi", "air_conditioning", "parking", "swimming_pool", "restaurant", "lift", "hot_water"];
                  const codes = selected.offer?.amenityCodes ?? selected.propertyAmenityCodes ?? selected.amenityCodes ?? [];
                  const resolved = [...new Set(codes.map(canonicalAmenityKey))]
                    .sort((a, b) => {
                      const ai = priority.indexOf(a), bi = priority.indexOf(b);
                      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b);
                    })
                    .slice(0, 3);
                  return (
                    <>
                      {resolved.map((code) => (
                        <span
                          key={code}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                        >
                          <Check className="h-2.5 w-2.5 text-[var(--hk-success)]" />
                          {amenityLabel(code)}
                        </span>
                      ))}
                      {selected.freeCancellation && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-[var(--hk-success)]">
                          Free cancellation
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Offer room or duration subtitle if available */}
              {selectedOffer && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                  {selectedOffer.roomName && (
                    <span className="font-semibold text-[var(--hk-ink)] truncate max-w-[200px]">
                      {selectedOffer.roomName}
                    </span>
                  )}
                  {selectedOffer.bookingMode === "hourly" ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      Hourly ({selectedOffer.durationMinutes / 60}h)
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">
                      {selectedOffer.nights} {selectedOffer.nights === 1 ? "night" : "nights"}
                    </span>
                  )}
                </div>
              )}

              {/* Pricing & CTA Row */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-extrabold text-[var(--hk-ink)]">
                      {formatMoney(selected.minimumPricePaise, selected.currency)}
                    </span>
                    <span className="text-xs text-[var(--hk-muted)]">
                      {selectedOffer
                        ? selectedOffer.bookingMode === "hourly"
                          ? `· ${selectedOffer.durationMinutes / 60}h`
                          : `· ${selectedOffer.nights} ${selectedOffer.nights === 1 ? "night" : "nights"}`
                        : "starting from"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {selectedOffer ? "Includes taxes & fees" : "Per night · Excl. taxes"}
                  </p>
                </div>

                <Link
                  href={hotelHref(selected, query)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--hk-navy)] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[var(--hk-navy-strong)] active:scale-95"
                >
                  View stay
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </article>
        </div>
      )}
    </div>
  );

  // When fullscreen mode is active, render fixed full-screen modal
  if (isFullscreen) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Expanded Hotel Map"
        className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-xs p-2 sm:p-5 md:p-8"
      >
        <div className="relative flex-1 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl">
          {mapContent}
        </div>
      </div>
    );
  }

  // Standard inline view
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      aria-label="Hotel map"
    >
      <div className="h-[460px] w-full sm:h-[520px] lg:h-[560px]">
        {mapContent}
      </div>
    </section>
  );
}

