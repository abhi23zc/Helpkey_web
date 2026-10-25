import { cache } from "react";
import { publicPropertySource, publicRoomSources, publicRateSources } from "@/lib/services/public-property-source";
import { publicGuestPolicies, type GuestPolicies } from "@/lib/partner/guest-policies";
import { eligiblePricing, startingPrice } from "@/lib/booking/duration-pricing";
import "server-only";
import type { CatalogSearch } from "./catalog-search-input";
export { catalogSearchFromParams, catalogSearchSchema, catalogSorts, type CatalogSearch, type CatalogSort } from "./catalog-search-input";
import { deriveCatalogResults } from "./catalog-selection";
import { searchBaseKey, type ClientSearchSnapshot } from "./search-snapshot";

import { availableOffers, readDocuments } from "@/lib/booking/search-availability";
import { adminDb } from "@/lib/firebase/admin";
import { resolvePublicImage } from "@/lib/media-resolver";
import { canonicalAmenityKey, resolveAmenityCodes } from "@/lib/customer/amenities";
import { apiContext } from "@/lib/api/context";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

import type { SearchOffer } from "@/lib/customer/offer";
import { cachedSearch, searchDigest } from "@/lib/customer/search-cache";
import { ApiException } from "@/lib/api/errors";

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
  offer?: SearchOffer | null;
  locality?: string | null;
  propertyAmenityCodes?: string[];
  coordinates?: { latitude: number; longitude: number } | null;
};
export type CatalogImage = { id: string; imageUrl: string; imageSrcSet: string; width: number; height: number; altText: string };
export type CatalogReviewSummary = { count: number; ratingSum: number; average: number; buckets: Record<"1" | "2" | "3" | "4" | "5", number> };
export type CatalogAddress = { line1: string | null; line2: string | null; landmark: string | null; city: string | null; state: string | null; postalCode: string | null };
export type CatalogDetailProperty = CatalogProperty & GuestPolicies & {
  bookingModes: ("overnight" | "hourly")[];
  timezone: string;
  images: CatalogImage[];
  reviewSummary: CatalogReviewSummary | null;
  description: string;
  address: CatalogAddress;
  coordinates: { latitude: number; longitude: number } | null;
  checkInTime: string;
  checkOutTime: string;
};
type CatalogSearchProperty = CatalogProperty & { coordinates: { latitude: number; longitude: number } | null; offers?: SearchOffer[] };
export type CatalogPage = { properties: CatalogProperty[]; nextCursor: string | null; hasMore: boolean; total: number; evaluatedAt: number; expiresAt: number; availableAmenities: string[]; clientSnapshot?: ClientSearchSnapshot };

async function filterAvailability(cards: CatalogSearchProperty[], input: CatalogSearch, documents: FirebaseFirestore.QueryDocumentSnapshot[]) {
  if (!input.checkIn || !cards.length) return cards;
  const properties = new Map(documents.map(doc => [doc.id, doc]));
  const codesById = await amenityCodeMap();
  const output: (CatalogSearchProperty | null)[] = new Array(cards.length).fill(null);
  // Batch source reads across hotels, and deduplicate shared rooms/policies.
  for (let offset = 0; offset < cards.length; offset += 30) {
    const chunk = cards.slice(offset, offset + 30);
    const rates = (await adminDb.collection("ratePlans").where("propertyId", "in", chunk.map(card => card.id)).where("status", "==", "active").get()).docs;
    console.info(JSON.stringify({ event: "search.source_read", queryCalls: 1, documentsRead: rates.length }));
    const validId = (value: unknown): value is string => typeof value === "string" && !!value && !value.includes("/");
    const [rooms, policies] = await Promise.all([
      readDocuments(adminDb, rates.flatMap(rate => validId(rate.get("roomTypeId")) ? [adminDb.collection("roomTypes").doc(rate.get("roomTypeId"))] : [])),
      readDocuments(adminDb, rates.flatMap(rate => validId(rate.get("cancellationPolicyId")) ? [adminDb.collection("cancellationPolicies").doc(rate.get("cancellationPolicyId"))] : [])),
    ]);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, chunk.length) }, async () => {
      while (next < chunk.length) {
        const localIndex = next++, card = chunk[localIndex], property = properties.get(card.id);
        if (!property) continue;
        const propertyAmenityCodes = card.propertyAmenityCodes ?? resolveAmenityCodes(property.get("amenityIds") ?? [], codesById);
        const offers = await availableOffers(adminDb, property, { ...input, checkIn: input.checkIn! }, {
          propertyAmenityCodes, codesById,
          preloaded: { rates: rates.filter(rate => rate.get("propertyId") === card.id), rooms, policies },
        });
        if (offers.length) {
          const offer = offers[0];
          output[offset + localIndex] = { ...card, offers, offer, amenityCodes: offer.amenityCodes, freeCancellation: offer.cancellation.freeCancellation, minimumPricePaise: offer.totalPaise };
        }
      }
    }));
  }
  return output.filter((card): card is CatalogSearchProperty => card !== null);
}

export type CatalogSuggestion = { label: string; city: string; slug: string | null; type: "property" | "city"; imageUrl: string | null };

export const amenityCodeMap = cache(async function amenityCodeMap() {
  const snapshot = await adminDb.collection("amenities").limit(500).get();
  return new Map(snapshot.docs.filter((doc) => doc.data().status !== "archived").map((doc) => [doc.id, doc.data().code as unknown] as const)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
});

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
  const activePrices = loaded.rates.map((rate) => rate.data()).filter((rate) => rate.status === "active" && eligiblePricing(rate)).map(startingPrice).filter((price): price is number => price !== null);
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
    freeCancellation: false,
    propertyAmenityCodes: resolveAmenityCodes(Array.isArray(data.amenityIds) ? data.amenityIds : [], codesById),
    locality: typeof data.address?.line2 === "string" ? data.address.line2 : null,
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
    freeCancellation: false,
    propertyAmenityCodes: Array.isArray(data.propertyAmenityCodes) ? data.propertyAmenityCodes.filter((code: unknown): code is string => typeof code === "string") : undefined,
    locality: typeof data.address?.line2 === "string" ? data.address.line2 : null,
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

function publicCatalogProperty(property: CatalogProperty): CatalogProperty {
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
    offer: property.offer ?? null,
    locality: property.locality ?? null,
    propertyAmenityCodes: property.propertyAmenityCodes,
    coordinates: property.coordinates ?? null,
  };
}

async function propertyImages(propertyId: string, property: FirebaseFirestore.DocumentData): Promise<CatalogImage[]> {
  const snapshot = await adminDb.collection("mediaAssets").where("propertyId", "==", propertyId).where("kind", "==", "property_image").get();
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

export async function searchCatalogPage(input: CatalogSearch, options: { includeClientSnapshot?: boolean } = {}): Promise<CatalogPage> {
  const normalized = {
    ...input, destination: input.destination.trim().toLocaleLowerCase(), freeCancellation: input.freeCancellation === true,
    amenities: [...new Set(input.amenities.map(canonicalAmenityKey))].sort(),
    propertyTypes: [...new Set([...(input.propertyTypes ?? []), ...(input.propertyType ? [input.propertyType] : [])].map(value => value.toLowerCase()))].sort(),
    propertyType: undefined, cursor: undefined, limit: undefined,
  };
  // Expensive availability is independent of presentation filters. Cache the
  // full eligible offer set for this stay, then derive amenity/cancellation,
  // price, rating and sort variants from that short-lived snapshot.
  const queryHash = searchDigest(normalized);
  const availabilityHash = searchDigest({
    destination: normalized.destination, bookingMode: normalized.bookingMode, checkIn: normalized.checkIn, checkOut: normalized.checkOut,
    arrivalTime: normalized.arrivalTime, durationMinutes: normalized.durationMinutes, adults: normalized.adults, children: normalized.children, infants: normalized.infants,
  });
  const snapshot = await cachedSearch<CatalogSearchProperty>(availabilityHash, async () => {
    const evaluatedAt = Date.now();
    let query: FirebaseFirestore.Query = adminDb.collection("properties")
      .where("status", "==", "active").where("approvalStatus", "==", "approved").where("isBookable", "==", true);
    if (normalized.destination) query = query.where("normalizedCity", "==", normalized.destination);
    const snapshot = await query.orderBy("__name__").limit(1001).get();
    if (snapshot.size > 1000) throw new ApiException("NARROW_SEARCH_FILTERS", 422, "Please choose a city or a more specific property type to narrow your search.");
    const projected = snapshot.docs.map(doc => ({ doc, card: projectedProperty(doc) }));
    let cards = projected.flatMap(({ card }) => card ? [card] : []);
    const missing = projected.filter(({ card }) => !card).map(({ doc }) => doc);
    if (missing.length) { apiContext.projectionFallback(); cards.push(...await legacyCards(missing)); }
    if (input.checkIn) cards = await filterAvailability(cards, input, snapshot.docs);
    const amenities = [...new Set(cards.flatMap(card => card.amenityCodes).map(canonicalAmenityKey))].sort();
    const expiresAt = Math.min(evaluatedAt + 30_000, ...cards.flatMap(card => {
      if (card.offers?.length) return card.offers.map(offer => offer.validUntil);
      return card.offer ? [card.offer.validUntil] : [];
    }));
    console.info(JSON.stringify({ event: "search.evaluate", candidatesExamined: snapshot.size, results: cards.length, projectionFallbacks: missing.length, durationMs: Date.now() - evaluatedAt }));
    return { items: cards, fingerprint: searchDigest(cards.map(card => ({ id: card.id, offers: card.offers?.map(offer => ({ ...offer, validUntil: undefined })) ?? null }))), evaluatedAt, expiresAt, amenities };
  });
  const derived = deriveCatalogResults(snapshot.items, input);
  const amenities = derived.availableAmenities;
  const items = derived.properties.map(publicCatalogProperty);
  const fingerprint = searchDigest(items.map(card => ({ ...card, offer: card.offer ? { ...card.offer, validUntil: undefined } : null })));
  let cursor: ReturnType<typeof decodeCursor> | null = null;
  try { cursor = input.cursor ? decodeCursor(input.cursor) : null; }
  catch { throw new ApiException("INVALID_CURSOR", 422, "Invalid search page. Refresh your results."); }
  if (cursor && (cursor.values[0] !== queryHash || cursor.values[1] !== fingerprint || typeof cursor.values[2] !== "number" || cursor.values[2] <= Date.now())) throw new ApiException("SEARCH_CURSOR_EXPIRED", 409, "Results changed. Refresh your search to continue.");
  const offset = cursor ? items.findIndex(card => card.id === cursor.id) + 1 : 0;
  if (cursor && offset === 0) throw new ApiException("SEARCH_CURSOR_EXPIRED", 409, "Results changed. Refresh your search to continue.");
  const properties = items.slice(offset, offset + input.limit);
  const hasMore = offset + properties.length < items.length;
  const last = properties.at(-1);
  let clientSnapshot: ClientSearchSnapshot | undefined;
  if (options.includeClientSnapshot && snapshot.items.length <= 100) {
    const candidate: ClientSearchSnapshot = {
      version: 1, complete: true, baseKey: searchBaseKey(input), serverNow: Date.now(),
      expiresAt: snapshot.expiresAt, evaluatedAt: snapshot.evaluatedAt,
      candidates: snapshot.items.map(card => ({ ...publicCatalogProperty(card), offers: card.offers ?? [] })),
    };
    if (Buffer.byteLength(JSON.stringify(candidate)) <= 256 * 1024) clientSnapshot = candidate;
  }
  return { properties, total: items.length, hasMore, nextCursor: hasMore && last ? encodeCursor({ id: last.id, values: [queryHash, fingerprint, cursor?.values[2] ?? snapshot.expiresAt] }) : null, evaluatedAt: snapshot.evaluatedAt, expiresAt: snapshot.expiresAt, availableAmenities: amenities, ...(clientSnapshot ? { clientSnapshot } : {}) };
}

/** Current public summaries for saved hotels; never return private source fields. */
export async function publicPropertiesByIds(ids: string[]) {
  const documents = await readDocuments(adminDb, ids.map(id => adminDb.collection("properties").doc(id)));
  const available = [...documents.values()].filter(doc => doc.exists && doc.get("status") === "active" && doc.get("approvalStatus") === "approved" && doc.get("isBookable") === true);
  const projected = available.map(doc => ({ doc, card: projectedProperty(doc as FirebaseFirestore.QueryDocumentSnapshot) }));
  const legacy = await legacyCards(projected.filter(value => !value.card).map(value => value.doc as FirebaseFirestore.QueryDocumentSnapshot));
  return [...projected.flatMap(value => value.card ? [publicCatalogProperty(value.card)] : []), ...legacy.map(publicCatalogProperty)];
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
  const doc = await publicPropertySource(slug);
  if (!doc || doc.data().status !== "active" || doc.data().approvalStatus !== "approved" || doc.data().isBookable !== true) return null;
  const data = doc.data();
  const [codesById, images, rooms, rates, cover] = await Promise.all([
    amenityCodeMap(),
    propertyImages(doc.id, data),
    publicRoomSources(doc.id),
    publicRateSources(doc.id),
    typeof data.coverMediaId === "string" && data.coverMediaId ? adminDb.collection("mediaAssets").doc(data.coverMediaId).get() : Promise.resolve(null),
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
    ...publicCatalogProperty(await propertyCard(doc, codesById, roomAmenityIds, { rates: rates.docs, cover })),
    images,
    reviewSummary,
    timezone: data.timezone ?? "Asia/Kolkata",
    bookingModes: (["overnight", "hourly"] as const).filter((mode) => (data.bookingModes ?? ["overnight"]).includes(mode) && (mode !== "hourly" || data.inventoryEngine === "interval_v1")),
    ...publicGuestPolicies(data),
    propertyAmenityCodes: resolveAmenityCodes(data.amenityIds, codesById),
    description: text(data.description, 6000) ?? "",
    address: { line1: text(data.address?.line1), line2: text(data.address?.line2), landmark: text(data.address?.landmark), city: text(data.address?.city, 120), state: text(data.address?.state, 120), postalCode: text(data.address?.postalCode, 12) },
    coordinates: typeof geo?.latitude === "number" && typeof geo?.longitude === "number" ? { latitude: geo.latitude, longitude: geo.longitude } : null,
    checkInTime: time(data.checkInTime, "14:00"),
    checkOutTime: time(data.checkOutTime, "11:00"),
  };
}
