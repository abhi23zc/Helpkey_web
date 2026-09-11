"use client";
declare global {
  interface Window {
    __helpkeyGoogleMapsReady?: () => void;
  }
}
let mapsPromise: Promise<typeof google.maps> | null = null;

function loadedMaps(): typeof google.maps | undefined {
  return (window as unknown as { google?: typeof google }).google?.maps;
}

/** Load Google Maps once, then import individual libraries on demand. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps is only available in the browser."));
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("Google Maps is not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild the app."));
  const loaded = loadedMaps();
  if (loaded?.importLibrary) return Promise.resolve(loaded);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = "__helpkeyGoogleMapsReady";
    const script = document.createElement("script");
    const fail = (message: string) => {
      delete window[callbackName];
      script.remove();
      mapsPromise = null;
      reject(new Error(message));
    };
    window[callbackName] = () => {
      const maps = loadedMaps();
      delete window[callbackName];
      script.remove();
      if (maps?.importLibrary) resolve(maps);
      else fail("Google Maps did not initialize.");
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => fail("Unable to load Google Maps. Check your network and API key referrer restrictions.");
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export async function mapsLibrary(): Promise<google.maps.MapsLibrary> {
  return (await loadGoogleMaps()).importLibrary("maps") as Promise<google.maps.MapsLibrary>;
}

export async function markerLibrary(): Promise<google.maps.MarkerLibrary> {
  return (await loadGoogleMaps()).importLibrary("marker") as Promise<google.maps.MarkerLibrary>;
}

export async function placesLibrary(): Promise<google.maps.PlacesLibrary> {
  return (await loadGoogleMaps()).importLibrary("places") as Promise<google.maps.PlacesLibrary>;
}
