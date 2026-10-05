import "server-only";

import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { resolvePublicImage } from "@/lib/media-resolver";
import { canonicalAmenityKey, resolveAmenityCodes } from "@/lib/customer/amenities";
import { apiContext } from "@/lib/api/context";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
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
  amenities: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  propertyType: z.string().trim().max(40).optional(),
  minPricePaise: z.coerce.number().int().nonnegative().optional(),
  maxPricePaise: z.coerce.number().int().nonnegative().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(catalogSorts).default("top_picks"),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(2048).optional(),
}).superRefine((value, ctx) => {
  if ((value.checkIn && !value.checkOut) || (!value.checkIn && value.checkOut)) {
    ctx.addIssue({ code: "custom", message: "CHECK_IN_AND_OUT_REQUIRED" });
  }
  if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) {
    ctx.addIssue({ code: "custom", message: "CHECK_OUT_MUST_FOLLOW_CHECK_IN" });
  }
  if (value.checkIn && value.checkOut && (new Date(`${value.checkOut}T00:00:00Z`).getTime() - new Date(`${value.checkIn}T00:00:00Z`).getTime()) / 86400000 > 30) {
    ctx.addIssue({ code: "custom", message: "MAXIMUM_STAY_IS_30_NIGHTS" });
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
  coverImageSrcSet: string;
  coverImageWidth: number;
  coverImageHeight: number;
  amenityCodes: string[];
  freeCancellation: boolean;
};
export type CatalogImage = { id: string; imageUrl: string; imageSrcSet: string; width: number; height: number; altText: string };
export type CatalogReviewSummary = { count: number; ratingSum: number; average: number; buckets: Record<"1" | "2" | "3" | "4" | "5", number> };
export type CatalogAddress = { line1: string | null; line2: string | null; landmark: string | null; city: string | null; state: string | null; postalCode: string | null };
export type CatalogDetailProperty = CatalogProperty & {
  images: CatalogImage[];
  reviewSummary: CatalogReviewSummary | null;
  description: string;
  address: CatalogAddress;
  coordinates: { latitude: number; longitude: number } | null;
  checkInTime: string;
  checkOutTime: string;
};
type CatalogSearchProperty = CatalogProperty & { coordinates: { latitude: number; longitude: number } | null };
export type CatalogPage = { properties: CatalogProperty[]; nextCursor: string | null; hasMore: boolean };

function stayDates(checkIn: string, checkOut: string) {
  const dates: string[] = [];
  for (let date = new Date(`${checkIn}T00:00:00Z`), end = new Date(`${checkOut}T00:00:00Z`); date < end; date = new Date(date.getTime() + 86400000)) dates.push(date.toISOString().slice(0, 10));
  return dates;
}

async function filterAvailability(cards: CatalogSearchProperty[], input: CatalogSearch) {
  if (!input.checkIn || !input.checkOut || !cards.length) return cards;
  const propertyIds = cards.map((card) => card.id);
  const roomDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const rateDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let index = 0; index < propertyIds.length; index += 30) {
    const ids = propertyIds.slice(index, index + 30);
    const [rooms, rates] = await Promise.all([
      adminDb.collection("roomTypes").where("propertyId", "in", ids).where("status", "==", "active").get(),
      adminDb.collection("ratePlans").where("propertyId", "in", ids).where("status", "==", "active").get(),
    ]);
    roomDocs.push(...rooms.docs); rateDocs.push(...rates.docs);
  }
  const nights = stayDates(input.checkIn, input.checkOut);
  const eligibleRooms = roomDocs.filter((room) => {
    const data = room.data();
    const maxAdults = Number(data.maxAdults ?? 1), maxChildren = Number(data.maxChildren ?? 0), maxInfants = Number(data.maxInfants ?? 0);
    if (input.adults > maxAdults || input.children > maxChildren || input.infants > maxInfants || input.adults + input.children > Number(data.maxOccupancy ?? maxAdults + maxChildren) || Number(data.totalInventory ?? 0) <= 0) return false;
    return rateDocs.some((rate) => { const value = rate.data(); const rules = value.stayRules ?? {}; return value.propertyId === data.propertyId && value.roomTypeId === room.id && nights.length >= Number(rules.minimumNights ?? 1) && (!Number(rules.maximumNights) || nights.length <= Number(rules.maximumNights)); });
  });
  const refs = eligibleRooms.flatMap((room) => nights.map((day) => adminDb.collection("roomNightInventory").doc(`${room.data().propertyId}_${room.id}_${day}`)));
  const inventory: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let index = 0; index < refs.length; index += 300) inventory.push(...await adminDb.getAll(...refs.slice(index, index + 300)));
  const byId = new Map(inventory.map((doc) => [doc.id, doc]));
  const available = new Set(eligibleRooms.filter((room) => nights.every((day) => Number(byId.get(`${room.data().propertyId}_${room.id}_${day}`)?.data()?.reserved ?? 0) < Number(room.data().totalInventory))).map((room) => String(room.data().propertyId)));
  return cards.filter((card) => available.has(card.id));
}

export type CatalogSuggestion = { label: string; city: string; slug: string | null; type: "property" | "city"; imageUrl: string | null };

export async function amenityCodeMap() {
  const snapshot = await adminDb.collection("amenities").limit(500).get();
  return new Map(snapshot.docs.filter((doc) => doc.data().status !== "archived").map((doc) => [doc.id, doc.data().code as unknown] as const)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

async function propertyCard(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  codesById: Map<string, string>,
  roomAmenityIds: string[],
  preloaded?: { rates: FirebaseFirestore.QueryDocumentSnapshot[]; cover: FirebaseFirestore.DocumentSnapshot | null },
): Promise<CatalogSearchProperty> {
  const data = doc.data();
  const loaded = preloaded ?? await (async () => {
    const [rates, cover] = await Promise.all([
      adminDb.collection("ratePlans").where("propertyId", "==", doc.id).limit(50).get(),
      typeof data.coverMediaId === "string" && data.coverMediaId ? adminDb.collection("mediaAssets").doc(data.coverMediaId).get() : Promise.resolve(null),
    ]);
    return { rates: rates.docs, cover };
  })();
  const activePrices = loaded.rates.map((rate) => rate.data()).filter((rate) => rate.status === "active" && Number.isSafeInteger(rate.basePricePaise) && rate.basePricePaise >= 0).map((rate) => rate.basePricePaise as number);
  const storedPrice = Number.isSafeInteger(data.minimumDisplayPricePaise) && data.minimumDisplayPricePaise >= 0 ? data.minimumDisplayPricePaise as number : null;
  const cardAmenityCodes = resolveAmenityCodes(
    [...(Array.isArray(data.amenityIds) ? data.amenityIds : []), ...(Array.isArray(data.roomAmenityIds) ? data.roomAmenityIds : []), ...roomAmenityIds],
    codesById
  );
  const coverData = loaded.cover?.data();
  const coverImage = loaded.cover && coverData ? await resolvePublicImage(loaded.cover.id, coverData, typeof coverData.altText === "string" ? coverData.altText : "") : null;
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
    coverImageUrl: coverImage?.imageUrl ?? null,
    coverImageSrcSet: coverImage?.imageSrcSet ?? "",
    coverImageWidth: coverImage?.width ?? 1,
    coverImageHeight: coverImage?.height ?? 1,
    amenityCodes: cardAmenityCodes,
    freeCancellation: Array.isArray(data.cancellationPolicyIds) && data.cancellationPolicyIds.length > 0,
    coordinates:
      typeof data.geoPoint?.latitude === "number" && typeof data.geoPoint?.longitude === "number"
        ? { latitude: data.geoPoint.latitude, longitude: data.geoPoint.longitude }
        : null,
  };
}

function projectedProperty(doc: FirebaseFirestore.QueryDocumentSnapshot): CatalogSearchProperty | null {
  const data = doc.data();
  const cover = data.publicCover;
  if (typeof data.normalizedName !== "string" || typeof data.normalizedCity !== "string" || !Array.isArray(data.amenityCodes)) return null;
  return {
    id: doc.id,
    slug: typeof data.slug === "string" && data.slug ? data.slug : doc.id,
    name: typeof data.name === "string" && data.name ? data.name : "Untitled property",
    propertyType: typeof data.propertyType === "string" ? data.propertyType : "hotel",
    city: typeof data.address?.city === "string" ? data.address.city : "",
    state: typeof data.address?.state === "string" ? data.address.state : null,
    ratingAverage: Number(data.ratingAverage) || 0,
    ratingCount: Number(data.ratingCount) || 0,
    minimumPricePaise: Number.isSafeInteger(data.minimumPricePaise) ? data.minimumPricePaise : null,
    currency: typeof data.currency === "string" ? data.currency : "INR",
    coverImageUrl: typeof cover?.imageUrl === "string" ? cover.imageUrl : null,
    coverImageSrcSet: typeof cover?.srcSet === "string" ? cover.srcSet : "",
    coverImageWidth: Number(cover?.width) || 1,
    coverImageHeight: Number(cover?.height) || 1,
    amenityCodes: data.amenityCodes.filter((code: unknown): code is string => typeof code === "string"),
    freeCancellation: data.freeCancellation === true,
    coordinates: typeof data.geoPoint?.latitude === "number" && typeof data.geoPoint?.longitude === "number"
      ? { latitude: data.geoPoint.latitude, longitude: data.geoPoint.longitude }
      : null,
  };
}

/** Reads room amenities in batches, avoiding one query per search-result card. */
async function roomAmenitiesByProperty(propertyIds: string[]) {
  const amenities = new Map<string, string[]>();
  const uniquePropertyIds = [...new Set(propertyIds)];
  for (let index = 0; index < uniquePropertyIds.length; index += 30) {
    const propertyIdsChunk = uniquePropertyIds.slice(index, index + 30);
    const snapshot = await adminDb.collection("roomTypes").where("propertyId", "in", propertyIdsChunk).get();
    for (const room of snapshot.docs) {
      const data = room.data();
      if (data.status !== "active" || !Array.isArray(data.amenityIds)) continue;
      const current = amenities.get(data.propertyId) ?? [];
      current.push(...data.amenityIds.filter((id): id is string => typeof id === "string"));
      amenities.set(data.propertyId, current);
    }
  }
  return amenities;
}

async function legacyCards(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  if (!docs.length) return [];
  const propertyIds = docs.map((doc) => doc.id);
  const [codesById, roomAmenities] = await Promise.all([amenityCodeMap(), roomAmenitiesByProperty(propertyIds)]);
  const rateDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let index = 0; index < propertyIds.length; index += 30) {
    const rates = await adminDb.collection("ratePlans").where("propertyId", "in", propertyIds.slice(index, index + 30)).limit(50).get();
    rateDocs.push(...rates.docs);
  }
  const coverIds = [...new Set(docs.map((doc) => doc.data().coverMediaId).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const coverDocs = coverIds.length ? await adminDb.getAll(...coverIds.map((id) => adminDb.collection("mediaAssets").doc(id))) : [];
  const coverById = new Map(coverDocs.map((doc) => [doc.id, doc]));
  const ratesByProperty = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const rate of rateDocs) { const propertyId = String(rate.data().propertyId ?? ""); ratesByProperty.set(propertyId, [...(ratesByProperty.get(propertyId) ?? []), rate]); }
  return Promise.all(docs.map((doc) => propertyCard(doc, codesById, roomAmenities.get(doc.id) ?? [], { rates: ratesByProperty.get(doc.id) ?? [], cover: coverById.get(doc.data().coverMediaId) ?? null })));
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
    coverImageSrcSet: property.coverImageSrcSet,
    coverImageWidth: property.coverImageWidth,
    coverImageHeight: property.coverImageHeight,
    amenityCodes: property.amenityCodes,
    freeCancellation: property.freeCancellation,
  };
}

async function propertyImages(propertyId: string, property: FirebaseFirestore.DocumentData): Promise<CatalogImage[]> {
  const snapshot = await adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).limit(50).get();
  const images = (await Promise.all(snapshot.docs.map(async (doc) => {
    const media = doc.data();
    return media.kind === "property_image" ? resolvePublicImage(doc.id, media, typeof media.altText === "string" ? media.altText : "") : null;
  }))).filter((image): image is CatalogImage => Boolean(image));
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

export async function searchCatalogPage(input: CatalogSearch): Promise<CatalogPage> {
  let query: FirebaseFirestore.Query = adminDb.collection("properties")
    .where("status", "==", "active")
    .where("approvalStatus", "==", "approved")
    .where("isBookable", "==", true);
  const destination = input.destination.trim().toLocaleLowerCase();
  if (destination) query = query.where("normalizedCity", "==", destination);
  if (input.propertyType) query = query.where("propertyType", "==", input.propertyType);
  // Firestore permits a range/inequality filter on only one field, and the
  // first orderBy must match that field. We therefore pick a single inequality
  // field (price when a price range is requested, otherwise rating) and enforce
  // any secondary numeric bound in memory (see the post-fetch rating filter).
  const priceOrdered = input.sort === "price_low_to_high" || input.sort === "price_high_to_low" || input.minPricePaise !== undefined || input.maxPricePaise !== undefined;
  if (input.minPricePaise !== undefined) query = query.where("minimumPricePaise", ">=", input.minPricePaise);
  if (input.maxPricePaise !== undefined) query = query.where("minimumPricePaise", "<=", input.maxPricePaise);
  const ratingOrdered = !destination && !priceOrdered && (input.minRating !== undefined || ["rating_high_to_low", "rating_low_to_high", "top_reviewed", "rating_and_price", "best_reviewed_lowest_price"].includes(input.sort));
  // Only push the rating inequality to Firestore when rating is also the sole
  // ordering field; otherwise it would conflict with the price/name ordering.
  if (input.minRating !== undefined && ratingOrdered) query = query.where("ratingAverage", ">=", input.minRating);
  const wantedAmenities = input.amenities.map(canonicalAmenityKey).filter(Boolean);
  if (wantedAmenities.length === 1) query = query.where("amenityCodes", "array-contains", wantedAmenities[0]);
  const orderField = priceOrdered ? "minimumPricePaise" : "ratingAverage";
  const orderDirection: FirebaseFirestore.OrderByDirection = input.sort === "price_high_to_low" || input.sort === "rating_high_to_low" || input.sort === "top_reviewed" || input.sort === "top_picks" ? "desc" : "asc";
  query = query.orderBy(orderField, orderDirection).orderBy("__name__", orderDirection);
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    query = query.startAfter(...cursor.values, cursor.id);
  }
  const snapshot = await query.limit(input.limit + 1).get();
  const hasMore = snapshot.size > input.limit;
  const pageDocs = snapshot.docs.slice(0, input.limit);
  const projected = pageDocs.map((doc) => ({ doc, card: projectedProperty(doc) }));
  let cards = projected.flatMap(({ card }) => card ? [card] : []);
  const missing = projected.filter(({ card }) => !card).map(({ doc }) => doc);
  if (missing.length) {
    apiContext.projectionFallback();
    cards = [...cards, ...await legacyCards(missing)];
  }
  cards = cards.filter((property) => wantedAmenities.every((code) => property.amenityCodes.some((amenity) => canonicalAmenityKey(amenity) === code)));
  if (input.minRating !== undefined) cards = cards.filter((property) => property.ratingAverage >= input.minRating!);
  if (input.checkIn && input.checkOut) cards = await filterAvailability(cards, input);
  const last = pageDocs.at(-1);
  return {
    properties: sortCatalog(cards, input).map(publicCatalogProperty),
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ values: [typeof last.get(orderField) === "number" ? Number(last.get(orderField)) : String(last.get(orderField) ?? "")], id: last.id }) : null,
  };
}

export async function searchCatalog(input: CatalogSearch) {
  return (await searchCatalogPage(input)).properties;
}

export async function searchSuggestions(query: string): Promise<CatalogSuggestion[]> {
  const term = query.trim().toLocaleLowerCase();
  if (term.length < 2) return [];
  const base = adminDb.collection("properties").where("status", "==", "active").where("approvalStatus", "==", "approved").where("isBookable", "==", true);
  // The first whitespace token drives the token-contains scan; searchTokens holds
  // whole normalized words (name/city/state/type), so this surfaces mid-string
  // word matches (e.g. "taj" → "Hotel Taj Palace") that prefix scans miss.
  const firstToken = term.split(/\s+/)[0];
  const [byName, byCity, byToken] = await Promise.all([
    base.where("normalizedName", ">=", term).where("normalizedName", "<=", `${term}\uf8ff`).orderBy("normalizedName").limit(8).get(),
    base.where("normalizedCity", ">=", term).where("normalizedCity", "<=", `${term}\uf8ff`).orderBy("normalizedCity").limit(8).get(),
    base.where("searchTokens", "array-contains", firstToken).limit(12).get(),
  ]);
  const documents = [...new Map([...byName.docs, ...byCity.docs, ...byToken.docs].map((doc) => [doc.id, doc])).values()];
  // Rank: name starts-with term > city starts-with term > any token starts-with
  // the term > plain substring, then alphabetical. Higher score sorts first.
  const score = (name: string, city: string, tokens: string[]) => {
    const n = name.toLocaleLowerCase(), c = city.toLocaleLowerCase();
    if (n.startsWith(term)) return 4;
    if (c.startsWith(term)) return 3;
    if (tokens.some((token) => token.startsWith(term) || token.startsWith(firstToken))) return 2;
    if (`${n} ${c}`.includes(term)) return 1;
    return 0;
  };
  const ranked = documents.map((doc) => {
    const data = doc.data(); const name = typeof data.name === "string" ? data.name : "";
    const city = typeof data.address?.city === "string" ? data.address.city : "";
    const tokens = Array.isArray(data.searchTokens) ? data.searchTokens.filter((token: unknown): token is string => typeof token === "string") : [];
    // publicCover is written by the search projection worker once a cover
    // image has been processed; reuse it here rather than issuing another read.
    const imageUrl = typeof data.publicCover?.imageUrl === "string" ? data.publicCover.imageUrl : null;
    return { label: name, city, slug: typeof data.slug === "string" ? data.slug : doc.id, type: "property" as const, imageUrl, rank: score(name, city, tokens) };
  }).filter((item) => item.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label));
  const matches: CatalogSuggestion[] = ranked.map(({ label, city, slug, type, imageUrl }) => ({ label, city, slug, type, imageUrl }));
  const cities = [...new Set(matches.map((item) => item.city).filter(Boolean))]
    .sort((a, b) => Number(b.toLocaleLowerCase().startsWith(term)) - Number(a.toLocaleLowerCase().startsWith(term)) || a.localeCompare(b))
    .map((city) => ({ label: city, city, slug: null, type: "city" as const, imageUrl: null }));
  // Keep both useful property matches and city shortcuts visible; a city with many
  // hotels should not make its city suggestion disappear behind the first five cards.
  return [...matches.slice(0, 5), ...cities.slice(0, 3)];
}

export async function homeCatalog() {
  const properties = await searchCatalog({ destination: "", adults: 2, children: 0, infants: 0, amenities: [], sort: "top_picks", limit: 24 });
  // `properties` is already ranked by top_picks, so the first cover image seen for a
  // city is from its best-ranked property. `imageUrl` is additive; older clients ignore it.
  const cityStats = properties.reduce((stats, property) => {
    if (!property.city) return stats;
    const entry = stats.get(property.city) ?? { propertyCount: 0, imageUrl: null as string | null };
    entry.propertyCount += 1;
    entry.imageUrl ??= property.coverImageUrl;
    stats.set(property.city, entry);
    return stats;
  }, new Map<string, { propertyCount: number; imageUrl: string | null }>());
  const cities = [...cityStats.entries()]
    .sort((a, b) => b[1].propertyCount - a[1].propertyCount || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([city, { propertyCount, imageUrl }]) => ({ city, propertyCount, imageUrl }));
  return { recommendations: properties.slice(0, 4), cities };
}

export async function catalogPropertyBySlug(slug: string): Promise<CatalogDetailProperty | null> {
  const snapshot = await adminDb.collection("properties").where("slug", "==", slug).limit(1).get();
  const doc = snapshot.docs[0];
  if (!doc || doc.data().status !== "active" || doc.data().approvalStatus !== "approved" || doc.data().isBookable !== true) return null;
  const data = doc.data();
  const [codesById, images, rooms] = await Promise.all([
    amenityCodeMap(),
    propertyImages(doc.id, data),
    adminDb.collection("roomTypes").where("propertyId", "==", doc.id).where("status", "==", "active").get(),
  ]);
  const rawSummary = data.reviewSummary;
  const reviewSummary = rawSummary && typeof rawSummary.count === "number" && rawSummary.count > 0 && typeof rawSummary.ratingSum === "number" && rawSummary.buckets && typeof rawSummary.buckets === "object"
    ? { count: rawSummary.count, ratingSum: rawSummary.ratingSum, average: typeof rawSummary.average === "number" ? rawSummary.average : Math.round((rawSummary.ratingSum / rawSummary.count) * 10) / 10, buckets: { "1": Number(rawSummary.buckets["1"]) || 0, "2": Number(rawSummary.buckets["2"]) || 0, "3": Number(rawSummary.buckets["3"]) || 0, "4": Number(rawSummary.buckets["4"]) || 0, "5": Number(rawSummary.buckets["5"]) || 0 } }
    : null;
  const roomAmenityIds = rooms.docs.flatMap((room) => {
    const amenityIds = room.data().amenityIds;
    return Array.isArray(amenityIds) ? amenityIds.filter((id): id is string => typeof id === "string") : [];
  });
  // Explicit allow-list: the property document also holds owner, KYC and onboarding data that must never be public.
  const text = (value: unknown, max = 200) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const time = (value: unknown, fallback: string) => (typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : fallback);
  const geo = data.geoPoint;
  return {
    ...publicCatalogProperty(await propertyCard(doc, codesById, roomAmenityIds)),
    images,
    reviewSummary,
    description: text(data.description, 6000) ?? "",
    address: { line1: text(data.address?.line1), line2: text(data.address?.line2), landmark: text(data.address?.landmark), city: text(data.address?.city, 120), state: text(data.address?.state, 120), postalCode: text(data.address?.postalCode, 12) },
    coordinates: typeof geo?.latitude === "number" && typeof geo?.longitude === "number" ? { latitude: geo.latitude, longitude: geo.longitude } : null,
    checkInTime: time(data.checkInTime, "14:00"),
    checkOutTime: time(data.checkOutTime, "11:00"),
  };
}
