import "server-only";

import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { createR2ReadUrl } from "@/lib/r2";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const amenityCodes = ["business_ready", "city_center", "luxury", "work_desk", "airport_access", "fast_wifi"] as const;

export const catalogSearchSchema = z.object({
  destination: z.string().trim().max(120).optional().default(""),
  checkIn: z.string().regex(datePattern).optional(),
  checkOut: z.string().regex(datePattern).optional(),
  adults: z.coerce.number().int().min(1).max(12).default(2),
  children: z.coerce.number().int().min(0).max(10).default(0),
  infants: z.coerce.number().int().min(0).max(10).default(0),
  placeId: z.string().trim().max(300).optional(),
  placeName: z.string().trim().max(200).optional(),
  placeAddress: z.string().trim().max(300).optional(),
  placeLat: z.coerce.number().gte(-90).lte(90).optional(),
  placeLng: z.coerce.number().gte(-180).lte(180).optional(),
  amenities: z.array(z.enum(amenityCodes)).max(amenityCodes.length).default([]),
  propertyType: z.string().trim().max(40).optional(),
  minPricePaise: z.coerce.number().int().nonnegative().optional(),
  maxPricePaise: z.coerce.number().int().nonnegative().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
}).superRefine((value, ctx) => {
  if ((value.checkIn && !value.checkOut) || (!value.checkIn && value.checkOut)) {
    ctx.addIssue({ code: "custom", message: "CHECK_IN_AND_OUT_REQUIRED" });
  }
  if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) {
    ctx.addIssue({ code: "custom", message: "CHECK_OUT_MUST_FOLLOW_CHECK_IN" });
  }
  if (value.minPricePaise !== undefined && value.maxPricePaise !== undefined && value.minPricePaise > value.maxPricePaise) {
    ctx.addIssue({ code: "custom", message: "INVALID_PRICE_RANGE" });
  }
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;
export type CatalogProperty = {
  id: string;
  slug: string;
  name: string;
  propertyType: string;
  city: string;
  state: string | null;
  ratingAverage: number;
  ratingCount: number;
  minimumPricePaise: number | null;
  currency: string;
  coverImageUrl: string | null;
  amenityCodes: string[];
  freeCancellation: boolean;
};

export type CatalogSuggestion = { label: string; city: string; slug: string | null; type: "property" | "city" };

function signedUrl(objectKey: unknown) {
  if (typeof objectKey !== "string" || !objectKey) return null;
  try { return createR2ReadUrl(objectKey).url; } catch { return null; }
}

async function amenityCodeMap() {
  const snapshot = await adminDb.collection("amenities").limit(500).get();
  return new Map(snapshot.docs.filter((doc) => doc.data().status !== "archived").map((doc) => [doc.id, doc.data().code as unknown] as const)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

async function propertyCard(doc: FirebaseFirestore.QueryDocumentSnapshot, codesById: Map<string, string>): Promise<CatalogProperty> {
  const data = doc.data();
  const [rates, cover] = await Promise.all([
    adminDb.collection("ratePlans").where("propertyId", "==", doc.id).limit(100).get(),
    typeof data.coverMediaId === "string" && data.coverMediaId ? adminDb.collection("mediaAssets").doc(data.coverMediaId).get() : Promise.resolve(null),
  ]);
  const activePrices = rates.docs.map((rate) => rate.data()).filter((rate) => rate.status === "active" && Number.isSafeInteger(rate.basePricePaise) && rate.basePricePaise >= 0).map((rate) => rate.basePricePaise as number);
  const storedPrice = Number.isSafeInteger(data.minimumDisplayPricePaise) && data.minimumDisplayPricePaise >= 0 ? data.minimumDisplayPricePaise as number : null;
  const amenityIds = Array.isArray(data.amenityIds) ? data.amenityIds : [];
  const cardAmenityCodes = amenityIds.map((id) => codesById.get(id)).filter((code): code is string => Boolean(code));
  const coverData = cover?.data();
  return {
    id: doc.id,
    slug: typeof data.slug === "string" && data.slug ? data.slug : doc.id,
    name: typeof data.name === "string" && data.name ? data.name : "Untitled property",
    propertyType: typeof data.propertyType === "string" ? data.propertyType : "hotel",
    city: typeof data.address?.city === "string" ? data.address.city : "",
    state: typeof data.address?.state === "string" ? data.address.state : null,
    ratingAverage: typeof data.ratingAverage === "number" ? data.ratingAverage : 0,
    ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : 0,
    minimumPricePaise: activePrices.length ? Math.min(...activePrices) : storedPrice,
    currency: typeof data.currency === "string" ? data.currency : "INR",
    coverImageUrl: coverData?.moderationStatus === "approved" ? signedUrl(coverData.r2ObjectKey) : null,
    amenityCodes: cardAmenityCodes,
    freeCancellation: Array.isArray(data.cancellationPolicyIds) && data.cancellationPolicyIds.length > 0,
  };
}

export async function searchCatalog(input: CatalogSearch) {
  const [properties, codesById] = await Promise.all([
    adminDb.collection("properties").where("status", "==", "active").where("isBookable", "==", true).limit(200).get(),
    amenityCodeMap(),
  ]);
  const cards = await Promise.all(properties.docs.filter((doc) => doc.data().approvalStatus === "approved").map((doc) => propertyCard(doc, codesById)));
  const destination = input.destination.toLocaleLowerCase();
  return cards.filter((property) => {
    const location = `${property.city} ${property.state ?? ""} ${property.name}`.toLocaleLowerCase();
    return (!destination || location.includes(destination))
      && (!input.propertyType || property.propertyType === input.propertyType)
      && (input.minRating === undefined || property.ratingAverage >= input.minRating)
      && (input.minPricePaise === undefined || (property.minimumPricePaise !== null && property.minimumPricePaise >= input.minPricePaise))
      && (input.maxPricePaise === undefined || (property.minimumPricePaise !== null && property.minimumPricePaise <= input.maxPricePaise))
      && input.amenities.every((code) => property.amenityCodes.includes(code));
  }).sort((a, b) => b.ratingAverage - a.ratingAverage || (a.minimumPricePaise ?? Number.MAX_SAFE_INTEGER) - (b.minimumPricePaise ?? Number.MAX_SAFE_INTEGER)).slice(0, input.limit);
}

export async function searchSuggestions(query: string): Promise<CatalogSuggestion[]> {
  const term = query.trim().toLocaleLowerCase();
  if (term.length < 2) return [];
  const snapshot = await adminDb.collection("properties").where("status", "==", "active").where("isBookable", "==", true).limit(200).get();
  const matches = snapshot.docs.filter((doc) => doc.data().approvalStatus === "approved").map((doc) => {
    const data = doc.data(); const name = typeof data.name === "string" ? data.name : "";
    const city = typeof data.address?.city === "string" ? data.address.city : "";
    return { label: name, city, slug: typeof data.slug === "string" ? data.slug : doc.id, type: "property" as const };
  }).filter((item) => `${item.label} ${item.city}`.toLocaleLowerCase().includes(term))
    .sort((a, b) => Number(b.label.toLocaleLowerCase().startsWith(term)) - Number(a.label.toLocaleLowerCase().startsWith(term)) || a.label.localeCompare(b.label));
  const cities = [...new Set(matches.map((item) => item.city).filter(Boolean))].map((city) => ({ label: city, city, slug: null, type: "city" as const }));
  return [...matches, ...cities].slice(0, 5);
}

export async function homeCatalog() {
  const properties = await searchCatalog({ destination: "", adults: 2, children: 0, infants: 0, amenities: [], limit: 50 });
  const cities = [...properties.reduce((counts, property) => {
    if (property.city) counts.set(property.city, (counts.get(property.city) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([city, propertyCount]) => ({ city, propertyCount }));
  return { recommendations: properties.slice(0, 4), cities };
}

export async function catalogPropertyBySlug(slug: string) {
  const snapshot = await adminDb.collection("properties").where("slug", "==", slug).limit(1).get();
  const doc = snapshot.docs[0];
  if (!doc || doc.data().status !== "active" || doc.data().approvalStatus !== "approved" || doc.data().isBookable !== true) return null;
  const codesById = await amenityCodeMap();
  return propertyCard(doc, codesById);
}
