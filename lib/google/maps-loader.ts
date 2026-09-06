"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
type MapsWithImportLibrary = { importLibrary: (library: string) => Promise<unknown> };
declare global { interface Window { google?: any; } }
let mapsPromise: Promise<MapsWithImportLibrary> | null = null;

/** Loads the current Maps JavaScript library once. Places is imported with importLibrary. */
export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps is only available in the browser."));
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("Location suggestions are unavailable because Google Maps is not configured."));
  if (window.google?.maps) return Promise.resolve(window.google.maps as unknown as MapsWithImportLibrary);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps as unknown as MapsWithImportLibrary) : reject(new Error("Google Maps did not load."));
    script.onerror = () => reject(new Error("Unable to load Google Maps."));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export async function placesLibrary() {
  const maps = await loadGoogleMaps();
  return maps.importLibrary("places");
}
