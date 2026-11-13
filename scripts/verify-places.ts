/** Run from the deployment environment with its server-only key before releasing mobile. */
import { randomUUID } from "node:crypto";

async function main() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Set server-only GOOGLE_PLACES_API_KEY before running this probe.");
  const sessionToken = randomUUID();
  const headers = { "Content-Type": "application/json", "X-Goog-Api-Key": key };
  const autocomplete = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST", headers: { ...headers, "X-Goog-FieldMask": "suggestions.placePrediction.placeId" },
    body: JSON.stringify({ input: "Delhi", sessionToken, includedRegionCodes: ["in"],
      includedPrimaryTypes: ["locality", "sublocality", "administrative_area_level_2", "lodging"] }),
    cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!autocomplete.ok) throw new Error(`Autocomplete verification failed (HTTP ${autocomplete.status}). Check API enablement, billing and server key restrictions.`);
  const prediction = (await autocomplete.json()).suggestions?.[0]?.placePrediction;
  if (!prediction?.placeId) throw new Error("Autocomplete verification returned no selectable place.");
  const query = new URLSearchParams({ sessionToken, languageCode: "en", regionCode: "IN" });
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(prediction.placeId)}?${query}`, {
    headers: { ...headers, "X-Goog-FieldMask": "id,displayName,formattedAddress,addressComponents,location" },
    cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Place details verification failed (HTTP ${response.status}). Check server key restrictions.`);
  const place = await response.json();
  if (place.id !== prediction.placeId || !place.displayName?.text || typeof place.formattedAddress !== "string" ||
    !Number.isFinite(place.location?.latitude) || Math.abs(place.location.latitude) > 90 ||
    !Number.isFinite(place.location?.longitude) || Math.abs(place.location.longitude) > 180 ||
    !place.addressComponents?.some((c: { types?: string[]; shortText?: string }) => c.types?.includes("country") && c.shortText === "IN")) {
    throw new Error("Place details verification returned invalid India place data.");
  }
  // Do not print credentials, tokens, place IDs, predictions, or provider content.
  console.log("Places autocomplete and details verification passed in this environment.");
}
main().catch(error => {
  console.error(error instanceof Error && !/fetch|abort|timeout/i.test(error.message) ? error.message : "Places verification failed. Check connectivity and server key restrictions.");
  process.exitCode = 1;
});
