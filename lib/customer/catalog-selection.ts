import type { CatalogProperty, CatalogSearch } from "./catalog";
import type { SearchOffer } from "./offer";
import { canonicalAmenityKey } from "./amenities";

export type CatalogCandidate = CatalogProperty & { offers?: SearchOffer[] };
type CatalogSearchProperty = CatalogCandidate;

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

export function sortCatalog(properties: CatalogSearchProperty[], input: CatalogSearch) {
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

/** Select one actual sellable offer after the shared availability snapshot is loaded.
 * Applying amenities to the offer (rather than the property) is essential: a
 * higher-priced room may be the only room that has an amenity the guest chose. */
export function selectCatalogCards(cards: CatalogSearchProperty[], input: CatalogSearch) {
  const narrowed = cards.filter(card =>
    (!(input.propertyTypes?.length || input.propertyType) || [...(input.propertyTypes ?? []), ...(input.propertyType ? [input.propertyType] : [])].map(value => value.toLowerCase()).includes(card.propertyType.toLowerCase())) &&
    (input.minRating === undefined || card.ratingAverage >= input.minRating),
  );
  if (!input.checkIn) {
    return narrowed.filter(card => !input.freeCancellation && input.amenities.every(code => card.amenityCodes.some(value => canonicalAmenityKey(value) === canonicalAmenityKey(code))));
  }
  return narrowed.flatMap(card => {
    const offer = (card.offers ?? []).find(candidate =>
      (!input.freeCancellation || candidate.cancellation.freeCancellation) &&
      input.amenities.every(code => candidate.amenityCodes.some(value => canonicalAmenityKey(value) === canonicalAmenityKey(code))),
    );
    return offer ? [{ ...card, offer, amenityCodes: offer.amenityCodes, freeCancellation: offer.cancellation.freeCancellation, minimumPricePaise: offer.totalPaise }] : [];
  });
}

export function deriveCatalogResults(cards: CatalogCandidate[], input: CatalogSearch) {
  const types = [...(input.propertyTypes ?? []), ...(input.propertyType ? [input.propertyType] : [])].map(value => value.toLowerCase());
  const facets = cards.filter(card => (!types.length || types.includes(card.propertyType.toLowerCase())) && (input.minRating === undefined || card.ratingAverage >= input.minRating));
  const availableAmenities = [...new Set(facets.flatMap(card => [...card.amenityCodes, ...(card.offers ?? []).flatMap(offer => offer.amenityCodes)]).map(canonicalAmenityKey))].sort();
  const selected = selectCatalogCards(cards, input).filter(card =>
    (input.minPricePaise === undefined || (card.minimumPricePaise !== null && card.minimumPricePaise >= input.minPricePaise)) &&
    (input.maxPricePaise === undefined || (card.minimumPricePaise !== null && card.minimumPricePaise <= input.maxPricePaise)));
  return { properties: sortCatalog(selected, input), availableAmenities };
}
