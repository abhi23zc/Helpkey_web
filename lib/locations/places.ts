import "server-only";
import { z } from "zod";
import { ApiException } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";

const sessionToken = z.string().uuid();
export const autocompleteInput = z.object({ q: z.string().trim().min(2).max(120), sessionToken });
export const placeInput = z.object({ placeId: z.string().regex(/^[A-Za-z0-9_-]{1,300}$/), sessionToken });
const text = z.object({ text: z.string().max(1000) });
const predictions = z.object({ suggestions: z.array(z.object({ placePrediction: z.object({
  placeId: z.string().min(1).max(300), text,
  structuredFormat: z.object({ mainText: text, secondaryText: text.optional() }).optional(),
}).optional() })).max(20).default([]) });
const details = z.object({
  id: z.string().min(1).max(300), displayName: text, formattedAddress: z.string().max(1000),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  addressComponents: z.array(z.object({ longText: z.string(), shortText: z.string().optional(), types: z.array(z.string()) })),
});

async function protect(request: Request, operation: "autocomplete" | "place") {
  await enforceRateLimit({ bucket: `places-${operation}-ip`, identifier: privateFingerprint(clientIp(request)),
    limit: operation === "autocomplete" ? 40 : 15, windowSeconds: 60, failClosed: process.env.NODE_ENV === "production" });
  // A shared budget also bounds spending from distributed clients.
  await enforceRateLimit({ bucket: "places-global", identifier: "all", limit: 1000, windowSeconds: 60,
    failClosed: process.env.NODE_ENV === "production" });
}

async function google(path: string, fields: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new ApiException("LOCATION_UNAVAILABLE", 503, "Location search is temporarily unavailable. Use a city or Helpkey stay.");
  try {
    const response = await fetch(`https://places.googleapis.com/v1/${path}`, {
      method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error("UPSTREAM_FAILURE");
    return await response.json();
  } catch {
    // Never log Google's response, URLs with session tokens, or credentials.
    throw new ApiException("LOCATION_UNAVAILABLE", 503, "Location search is temporarily unavailable. Please retry or search manually.");
  }
}

export async function autocomplete(request: Request) {
  const input = autocompleteInput.parse(Object.fromEntries(new URL(request.url).searchParams));
  await protect(request, "autocomplete");
  const result = predictions.safeParse(await google("places:autocomplete", "suggestions.placePrediction", request.signal, {
    input: input.q, sessionToken: input.sessionToken, includedRegionCodes: ["in"], languageCode: "en",
    includedPrimaryTypes: ["locality", "sublocality", "administrative_area_level_2", "lodging"],
  }));
  if (!result.success) throw new ApiException("LOCATION_UNAVAILABLE", 503, "Location search returned an invalid response. Please retry.");
  return Response.json({ suggestions: result.data.suggestions.flatMap(({ placePrediction: p }) => p ? [{
    placeId: p.placeId, label: (p.structuredFormat?.mainText.text ?? p.text.text).slice(0, 200),
    secondary: (p.structuredFormat?.secondaryText?.text ?? "").slice(0, 300),
  }] : []) });
}

export async function resolvePlace(request: Request) {
  const input = placeInput.parse(Object.fromEntries(new URL(request.url).searchParams));
  await protect(request, "place");
  const query = new URLSearchParams({ sessionToken: input.sessionToken, languageCode: "en", regionCode: "IN" });
  const result = details.safeParse(await google(`places/${encodeURIComponent(input.placeId)}?${query}`, "id,displayName,formattedAddress,addressComponents,location", request.signal));
  if (!result.success) throw new ApiException("LOCATION_UNAVAILABLE", 503, "This location could not be resolved. Please retry.");
  const p = result.data;
  const component = (type: string) => p.addressComponents.find(c => c.types.includes(type));
  if (component("country")?.shortText !== "IN" || p.id !== input.placeId) throw new ApiException("LOCATION_OUTSIDE_INDIA", 422, "Please choose a location in India.");
  return Response.json({ place: { placeId: p.id, name: p.displayName.text.slice(0, 200), address: p.formattedAddress.slice(0, 300),
    city: (component("locality")?.longText ?? component("administrative_area_level_2")?.longText ?? "").slice(0, 120),
    latitude: p.location.latitude, longitude: p.location.longitude } });
}
