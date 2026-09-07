import "server-only";

import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { createR2ReadUrl } from "@/lib/r2";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const amenityCodes = ["business_ready", "city_center", "luxury", "work_desk", "airport_access", "fast_wifi"] as const;
export const catalogSorts = [
  "top_picks",
  "homes_and_apartments",
  "price_low_to_high",
  "price_high_to_low",
  "best_reviewed_lowest_price",
  "rating_high_to_low",
  "rating_low_to_high",
  "rating_and_price",
  "distance_from_downtown",
  "top_reviewed",
  "business_traveler_picks",
] as const;
export type CatalogSort = (typeof catalogSorts)[number];

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
  sort: z.enum(catalogSorts).default("top_picks"),
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
  if (value.sort === "distance_from_downtown" && (value.placeLat === undefined || value.placeLng === undefined)) {
    ctx.addIssue({ code: "custom", message: "DISTANCE_SORT_REQUIRES_DESTINATION_COORDINATES" });
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
export type CatalogImage = { id: string; imageUrl: string; altText: string };
export type CatalogReviewSummary = { count: number; ratingSum: number; average: number; buckets: Record<"1" | "2" | "3" | "4" | "5", number> };
export type CatalogDetailProperty = CatalogProperty & { images: CatalogImage[]; reviewSummary: CatalogReviewSummary | null };
type CatalogSearchProperty = CatalogProperty & { coordinates: { latitude: number; longitude: number } | null };

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

async function propertyCard(doc: FirebaseFirestore.QueryDocumentSnapshot, codesById: Map<string, string>): Promise<CatalogSearchProperty> {
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
    ratingAverage: typeof data.reviewSummary?.count === "number" && data.reviewSummary.count > 0 && typeof data.reviewSummary.average === "number" ? data.reviewSummary.average : typeof data.ratingAverage === "number" ? data.ratingAverage : 0,
    ratingCount: typeof data.reviewSummary?.count === "number" && data.reviewSummary.count > 0 ? data.reviewSummary.count : typeof data.ratingCount === "number" ? data.ratingCount : 0,
    minimumPricePaise: activePrices.length ? Math.min(...activePrices) : storedPrice,
    currency: typeof data.currency === "string" ? data.currency : "INR",
    coverImageUrl: coverData?.moderationStatus === "approved" ? signedUrl(coverData.r2ObjectKey) : null,
    amenityCodes: cardAmenityCodes,
    freeCancellation: Array.isArray(data.cancellationPolicyIds) && data.cancellationPolicyIds.length > 0,
    coordinates:
      typeof data.geoPoint?.latitude === "number" && typeof data.geoPoint?.longitude === "number"
        ? { latitude: data.geoPoint.latitude, longitude: data.geoPoint.longitude }
        : null,
  };
}

const compareText = (a: CatalogProperty, b: CatalogProperty) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const comparePriceAscending = (a: CatalogProperty, b: CatalogProperty) => {
  if (a.minimumPricePaise === null) return b.minimumPricePaise === null ? 0 : 1;
  if (b.minimumPricePaise === null) return -1;
  return a.minimumPricePaise - b.minimumPricePaise;
};
const comparePriceDescending = (a: CatalogProperty, b: CatalogProperty) => {
  if (a.minimumPricePaise === null) return b.minimumPricePaise === null ? 0 : 1;
  if (b.minimumPricePaise === null) return -1;
  return b.minimumPricePaise - a.minimumPricePaise;
};
const compareTopPicks = (a: CatalogProperty, b: CatalogProperty) =>
  b.ratingAverage - a.ratingAverage ||
  b.ratingCount - a.ratingCount ||
  Number(b.freeCancellation) - Number(a.freeCancellation) ||
  comparePriceAscending(a, b) ||
  compareText(a, b);
const distanceKm = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) => {
  const radians = Math.PI / 180;
  const deltaLatitude = (to.latitude - from.latitude) * radians;
  const deltaLongitude = (to.longitude - from.longitude) * radians;
  const originLatitude = from.latitude * radians;
  const destinationLatitude = to.latitude * radians;
  const haversine = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

function sortCatalog(properties: CatalogSearchProperty[], input: CatalogSearch) {
  const topPicks = (a: CatalogSearchProperty, b: CatalogSearchProperty) => compareTopPicks(a, b);
  return [...properties].sort((a, b) => {
    switch (input.sort) {
      case "homes_and_apartments":
        return Number(!["apartment", "villa", "homestay"].includes(a.propertyType)) - Number(!["apartment", "villa", "homestay"].includes(b.propertyType)) || topPicks(a, b);
      case "price_low_to_high":
        return comparePriceAscending(a, b) || topPicks(a, b);
      case "price_high_to_low":
        return comparePriceDescending(a, b) || topPicks(a, b);
      case "best_reviewed_lowest_price":
      case "rating_and_price":
        return b.ratingAverage - a.ratingAverage || comparePriceAscending(a, b) || topPicks(a, b);
      case "rating_high_to_low":
        return b.ratingAverage - a.ratingAverage || topPicks(a, b);
      case "rating_low_to_high":
        return a.ratingAverage - b.ratingAverage || comparePriceAscending(a, b) || compareText(a, b);
      case "distance_from_downtown": {
        const origin = { latitude: input.placeLat!, longitude: input.placeLng! };
        const aDistance = a.coordinates ? distanceKm(origin, a.coordinates) : Number.POSITIVE_INFINITY;
        const bDistance = b.coordinates ? distanceKm(origin, b.coordinates) : Number.POSITIVE_INFINITY;
        return aDistance - bDistance || topPicks(a, b);
      }
      case "top_reviewed":
        return b.ratingCount - a.ratingCount || b.ratingAverage - a.ratingAverage || comparePriceAscending(a, b) || compareText(a, b);
      case "business_traveler_picks":
        return Number(!a.amenityCodes.includes("business_ready")) - Number(!b.amenityCodes.includes("business_ready")) || topPicks(a, b);
      case "top_picks":
        return topPicks(a, b);
    }
  });
}

function publicCatalogProperty(property: CatalogSearchProperty): CatalogProperty {
  return {
    id: property.id,
    slug: property.slug,
    name: property.name,
    propertyType: property.propertyType,
    city: property.city,
    state: property.state,
    ratingAverage: property.ratingAverage,
    ratingCount: property.ratingCount,
    minimumPricePaise: property.minimumPricePaise,
    currency: property.currency,
    coverImageUrl: property.coverImageUrl,
    amenityCodes: property.amenityCodes,
    freeCancellation: property.freeCancellation,
  };
}

async function propertyImages(propertyId: string, property: FirebaseFirestore.DocumentData): Promise<CatalogImage[]> {
  const snapshot = await adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).limit(50).get();
  const images = snapshot.docs.flatMap((doc) => {
    const media = doc.data();
    const imageUrl = media.kind === "property_image" && media.moderationStatus === "approved" ? signedUrl(media.r2ObjectKey) : null;
    return imageUrl ? [{ id: doc.id, imageUrl, altText: typeof media.altText === "string" ? media.altText : "" }] : [];
  });
  const imagesById = new Map(images.map((image) => [image.id, image]));
  const configuredIds = [property.coverMediaId, ...(Array.isArray(property.mediaIds) ? property.mediaIds : [])]
    .filter((id): id is string => typeof id === "string");
  const ordered = configuredIds.flatMap((id) => {
    const image = imagesById.get(id);
    if (!image) return [];
    imagesById.delete(id);
    return [image];
  });
  return [...ordered, ...imagesById.values()];
}

export async function searchCatalog(input: CatalogSearch) {
  const [properties, codesById] = await Promise.all([
    adminDb.collection("properties").where("status", "==", "active").where("isBookable", "==", true).limit(200).get(),
    amenityCodeMap(),
  ]);
  const cards = await Promise.all(properties.docs.filter((doc) => doc.data().approvalStatus === "approved").map((doc) => propertyCard(doc, codesById)));
  const destination = input.destination.toLocaleLowerCase();
  const matchingCards = cards.filter((property) => {
    const location = `${property.city} ${property.state ?? ""} ${property.name}`.toLocaleLowerCase();
    return (!destination || location.includes(destination))
      && (!input.propertyType || property.propertyType === input.propertyType)
      && (input.minRating === undefined || property.ratingAverage >= input.minRating)
      && (input.minPricePaise === undefined || (property.minimumPricePaise !== null && property.minimumPricePaise >= input.minPricePaise))
      && (input.maxPricePaise === undefined || (property.minimumPricePaise !== null && property.minimumPricePaise <= input.maxPricePaise))
      && input.amenities.every((code) => property.amenityCodes.includes(code));
  });
  return sortCatalog(matchingCards, input).slice(0, input.limit).map(publicCatalogProperty);
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
  const properties = await searchCatalog({ destination: "", adults: 2, children: 0, infants: 0, amenities: [], sort: "top_picks", limit: 50 });
  const cities = [...properties.reduce((counts, property) => {
    if (property.city) counts.set(property.city, (counts.get(property.city) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([city, propertyCount]) => ({ city, propertyCount }));
  return { recommendations: properties.slice(0, 4), cities };
}

export async function catalogPropertyBySlug(slug: string): Promise<CatalogDetailProperty | null> {
  const snapshot = await adminDb.collection("properties").where("slug", "==", slug).limit(1).get();
  const doc = snapshot.docs[0];
  if (!doc || doc.data().status !== "active" || doc.data().approvalStatus !== "approved" || doc.data().isBookable !== true) return null;
  const data = doc.data();
  const [codesById, images] = await Promise.all([amenityCodeMap(), propertyImages(doc.id, data)]);
  const rawSummary = data.reviewSummary;
  const reviewSummary = rawSummary && typeof rawSummary.count === "number" && rawSummary.count > 0 && typeof rawSummary.ratingSum === "number" && rawSummary.buckets && typeof rawSummary.buckets === "object"
    ? { count: rawSummary.count, ratingSum: rawSummary.ratingSum, average: typeof rawSummary.average === "number" ? rawSummary.average : Math.round((rawSummary.ratingSum / rawSummary.count) * 10) / 10, buckets: { "1": Number(rawSummary.buckets["1"]) || 0, "2": Number(rawSummary.buckets["2"]) || 0, "3": Number(rawSummary.buckets["3"]) || 0, "4": Number(rawSummary.buckets["4"]) || 0, "5": Number(rawSummary.buckets["5"]) || 0 } }
    : null;
  return { ...publicCatalogProperty(await propertyCard(doc, codesById)), images, reviewSummary };
}
