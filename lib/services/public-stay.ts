import { datePriceId } from "@/lib/booking/date-prices";
import { configuredHourlyPrices, HOURLY_ARRIVAL_STEP_MINUTES } from "@/lib/customer/hourly-options";
import { eligiblePricing, startingPrice } from "@/lib/booking/duration-pricing";
import "server-only";
import type { Availability } from "@/lib/customer/hotel-availability";

import { cancellationTerms } from "@/lib/customer/offer";
import { availableOffers } from "@/lib/booking/search-availability";
import { cachedSearch, searchDigest } from "@/lib/customer/search-cache";
import { normalizedStay } from "@/lib/customer/stay-search";
import { publicPropertySource, publicRoomSources, publicRateSources } from "@/lib/services/public-property-source";
import { adminDb } from "@/lib/firebase/admin";
import { resolvePublicImage } from "@/lib/media-resolver";
import { amenityCodeMap } from "@/lib/customer/catalog";
import { accommodationAmenityCodes, resolveAmenityCodes } from "@/lib/customer/amenities";
import type { z } from "zod";
import type { staySearchSchema } from "@/lib/customer/stay-search";

type Stay = z.infer<typeof staySearchSchema>;

async function getAllBounded(refs: FirebaseFirestore.DocumentReference[], batchSize = 300) {
  const documents: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let offset = 0; offset < refs.length; offset += batchSize) documents.push(...await adminDb.getAll(...refs.slice(offset, offset + batchSize)));
  return documents;
}

async function evaluateBookableProperty(slug: string, stay: Stay, configurationDate?: string) {
  const evaluatedAt = Date.now();
  const property = await publicPropertySource(slug);
  if (!property || property.data()?.status !== "active" || property.data()?.approvalStatus !== "approved" || property.data()?.isBookable !== true) return null;

  const [roomsSnapshot, ratesSnapshot, policiesSnapshot, amenityCodesById] = await Promise.all([
    publicRoomSources(property.id),
    publicRateSources(property.id),
    adminDb.collection("cancellationPolicies").where("propertyId", "==", property.id).where("status", "==", "active").limit(50).get(),
    amenityCodeMap(),
  ]);
  const rooms = roomsSnapshot.docs.filter((room) => {
    const data = room.data();
    if (property.get("childrenPolicy")?.allowed === false && (stay.children || stay.infants)) return false;
    return stay.adults <= Number(data.maxAdults ?? 1)
      && stay.children <= Number(data.maxChildren ?? 0)
      && stay.infants <= Number(data.maxInfants ?? 10)
      && stay.adults + stay.children <= Number(data.maxOccupancy ?? Number(data.maxAdults ?? 1) + Number(data.maxChildren ?? 0));
  });
  const coverIds = [...new Set(rooms.map((room) => room.data().coverMediaId).filter((id): id is string => typeof id === "string" && Boolean(id)))];
  const coversPromise = getAllBounded(coverIds.map((id) => adminDb.collection("mediaAssets").doc(id)));
  const policies = new Map(policiesSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  let inventoryDocumentsRead = 0;
  const [coverDocuments, offers] = await Promise.all([coversPromise, stay.checkIn ? availableOffers(adminDb, property, { ...stay, checkIn: stay.checkIn }, {
    codesById: amenityCodesById,
    onInventoryRead: count => { inventoryDocumentsRead = count; },
    preloaded: { rates: ratesSnapshot.docs, rooms: new Map(roomsSnapshot.docs.map(doc => [doc.ref.path, doc])), policies: new Map(policiesSnapshot.docs.map(doc => [doc.ref.path, doc])) },
  }) : Promise.resolve([])]);
  const coverById = new Map(coverDocuments.filter((doc) => doc.exists).map((doc) => [doc.id, doc]));
  const byRate = new Map(offers.map(offer => [offer.ratePlanId, offer]));
  const expiresAt = Math.min(evaluatedAt + 30_000, ...offers.map(offer => offer.validUntil));

  const output = await Promise.all(rooms.map(async (room) => {
    const data = room.data();
    if (Number(data.totalInventory ?? 0) <= 0) return null;
    const cover = typeof data.coverMediaId === "string" ? coverById.get(data.coverMediaId) : null;
    const coverData = cover?.data();
    const image = cover && coverData?.propertyId === property.id && coverData.roomTypeId === room.id ? await resolvePublicImage(cover.id, coverData, typeof coverData.altText === "string" ? coverData.altText : "") : null;
    const rates = (await Promise.all(ratesSnapshot.docs.map(async (rate) => {
      const item = rate.data();
      if (!eligiblePricing(item) || item.roomTypeId !== room.id || (item.bookingMode ?? "overnight") !== (stay.bookingMode ?? "overnight")) return [];
      if (!stay.checkIn && startingPrice(item) === null) return [];
      const evaluated = byRate.get(rate.id);
      if (stay.checkIn && !evaluated) return [];
      const cancellation = policies.get(item.cancellationPolicyId);
      const terms = cancellationTerms(cancellation, evaluated?.startAt ?? "");
      return [{ breakfastIncluded: item.breakfastIncluded === true, cancellationTerms: terms, id: rate.id, name: item.name ?? "Standard rate", code: item.code ?? null, bookingMode: item.bookingMode ?? "overnight", pricingModel: item.pricingModel ?? "nightly", subtotalPaise: evaluated?.subtotalPaise ?? null, taxPaise: evaluated?.taxPaise ?? null, payableNowPaise: evaluated?.payableNowPaise ?? null, balanceDuePaise: evaluated?.balanceDuePaise ?? null, nights: evaluated?.nights ?? null, validUntil: evaluated?.validUntil ?? null, durationMinutes: evaluated?.durationMinutes ?? item.durationMinutes ?? null, totalPaise: evaluated?.totalPaise ?? null, startAt: evaluated?.startAt ?? null, endAt: evaluated?.endAt ?? null, durationPrices: item.durationPrices ?? [], basePricePaise: item.basePricePaise ?? 0, paymentMode: item.paymentMode ?? "full", taxBasisPoints: item.taxBasisPoints ?? 0, customerFeePaise: item.customerFeePaise ?? 0, cancellation: cancellation ? { name: cancellation.name ?? "Cancellation policy", description: cancellation.description ?? "" } : null }];
    }))).flat();
    if (!rates.length) return null;
    return { id: room.id, name: data.name ?? "Room", description: data.description ?? "", totalInventory: data.totalInventory ?? 0, maxAdults: data.maxAdults ?? 1, maxChildren: data.maxChildren ?? 0, maxInfants: data.maxInfants ?? 10, maxOccupancy: data.maxOccupancy ?? Number(data.maxAdults ?? 1) + Number(data.maxChildren ?? 0), roomSizeSqFt: data.roomSizeSqFt ?? null, bedConfigurations: data.bedConfigurations ?? [], amenityCodes: accommodationAmenityCodes(resolveAmenityCodes(data.amenityIds, amenityCodesById)), imageUrl: image?.imageUrl ?? null, imageSrcSet: image?.imageSrcSet ?? "", imageWidth: image?.width ?? 1, imageHeight: image?.height ?? 1, rates };
  }));
  // Keep configured choices available even when the requested duration has no matching offer.
  const pricingDate = stay.checkIn ?? configurationDate;
  const overrides = pricingDate ? await getAllBounded(ratesSnapshot.docs.filter(rate => rate.get("bookingMode") === "hourly" && rate.get("datePricingEnabled")).map(rate => adminDb.collection("rateDatePrices").doc(datePriceId(property.id, rate.id, pricingDate)))) : [];
  const byDateId = new Map(overrides.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
  const hourlyDurations = ratesSnapshot.docs.flatMap(rate => {
    const data = rate.data();
    const room = rooms.find(room => room.id === data.roomTypeId);
    const override = pricingDate ? byDateId.get(datePriceId(property.id, rate.id, pricingDate)) : undefined;
    const prices = configuredHourlyPrices(property.data(), room?.data(), override?.durationPrices ? { ...data, durationPrices: override.durationPrices } : data);
    return prices.length ? [{ roomTypeId: data.roomTypeId as string, ratePlanId: rate.id, prices }] : [];
  });
  console.info(JSON.stringify({ event: "hotel.availability", durationMs: Date.now() - evaluatedAt, sourceReadCalls: 4 + Math.ceil(coverDocuments.length / 300) + Math.ceil(inventoryDocumentsRead / 300) + Math.ceil(overrides.length / 300), sourceDocuments: 1 + roomsSnapshot.size + ratesSnapshot.size + policiesSnapshot.size + coverDocuments.length + inventoryDocumentsRead + overrides.length, inventoryDocumentsRead, evaluatedRates: ratesSnapshot.size, availableRates: offers.length }));
  // Public rate identity only: lets old links distinguish a different stay
  // type from an offer that genuinely disappeared within the current type.
  const ratePlanModes = Object.fromEntries(ratesSnapshot.docs.filter(rate => eligiblePricing(rate.data())).map(rate => [rate.id, rate.get("bookingMode") ?? "overnight"]));
  return { evaluatedAt, expiresAt, arrivalStepMinutes: HOURLY_ARRIVAL_STEP_MINUTES, ratePlanModes, hourlyDurations, rooms: output.filter((room): room is NonNullable<typeof room> => Boolean(room)) } satisfies Availability & { evaluatedAt: number };
}

/** Shares search generation invalidation, single-flight and hard snapshot expiry. */
export async function loadBookableProperty(slug: string, stay: Stay, configurationDate?: string) {
  const snapshot = await cachedSearch(searchDigest(["hotel-detail-v4", slug, normalizedStay(stay), configurationDate]), async () => {
    const result = await evaluateBookableProperty(slug, stay, configurationDate);
    const now = Date.now();
    return { items: result ? [result] : [], fingerprint: "hotel-detail-v4", evaluatedAt: result?.evaluatedAt ?? now, expiresAt: result?.expiresAt ?? now + 30_000, amenities: [] };
  });
  return snapshot.items[0] ?? null;
}
