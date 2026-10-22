import "server-only";
import type { Firestore, QueryDocumentSnapshot, DocumentReference } from "firebase-admin/firestore";
import { allocateIntervals, evaluateStay, type StayRequest } from "./domain";
import { eligiblePricing } from "./duration-pricing";
import { hasCapacity } from "./inventory";
import { cancellationTerms, type SearchOffer } from "@/lib/customer/offer";
import { resolveAmenityCodes, canonicalAmenityKey } from "@/lib/customer/amenities";

type Documents = Map<string, FirebaseFirestore.DocumentSnapshot>;
export type OfferOptions = {
  onInventoryRead?: (documents: number) => void;
  freeCancellation?: boolean; amenities?: string[]; propertyAmenityCodes?: string[]; codesById?: Map<string, string>;
  preloaded?: { rates: FirebaseFirestore.QueryDocumentSnapshot[]; rooms: Documents; policies: Documents };
};

const unavailable = new Set(["CHILDREN_NOT_ALLOWED", "STAY_LENGTH_NOT_ALLOWED", "ROOM_CAPACITY_EXCEEDED", "RATE_NOT_AVAILABLE", "BOOKING_MODE_NOT_AVAILABLE", "CHECK_IN_IN_PAST", "ARRIVAL_TOO_FAR_AHEAD", "ARRIVAL_WEEKDAY_NOT_ALLOWED", "OUTSIDE_ARRIVAL_WINDOW", "OUTSIDE_OPERATING_WINDOW", "MIDNIGHT_CROSSING_NOT_ALLOWED", "RATE_DURATION_MISMATCH", "DURATION_NOT_PRICED", "WHOLE_HOUR_DURATION_REQUIRED", "INVALID_DURATION_PRICES", "INVALID_RATE_CONFIGURATION", "INVALID_MONEY", "INVALID_LOCAL_TIME", "AMBIGUOUS_LOCAL_TIME", "NONEXISTENT_LOCAL_TIME"]);

export function isUnavailableOfferError(error: unknown) {
  return error instanceof Error && (unavailable.has(error.message) || ["SOLD_OUT_FOR_DATES", "PROPERTY_NOT_AVAILABLE", "ROOM_NOT_AVAILABLE", "INVENTORY_CUTOVER_REQUIRED"].includes(error.message));
}

export async function readDocuments(db: Firestore, refs: DocumentReference[]) {
  const unique = [...new Map(refs.map(ref => [ref.path, ref])).values()];
  const documents = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  for (let offset = 0; offset < unique.length; offset += 300) {
    for (const doc of await db.getAll(...unique.slice(offset, offset + 300))) documents.set(doc.ref.path, doc);
    console.info(JSON.stringify({ event: "search.source_read", queryCalls: 1, documentsRead: unique.slice(offset, offset + 300).length }));
  }
  return documents;
}

/** Search uses the same stay rules and current inventory as quote(), without checkout-only media/policies.
 * Inventory snapshots are request-scoped; the catalog may briefly reuse the resulting public offers.
 */
export async function availableOffers(db: Firestore, property: QueryDocumentSnapshot, input: StayRequest, options: OfferOptions = {}): Promise<SearchOffer[]> {
  const started = Date.now();
  const settings = property.data();
  if (settings.status !== "active" || settings.approvalStatus !== "approved" || settings.isBookable !== true) return [];
  if (input.bookingMode === "hourly" && settings.inventoryEngine !== "interval_v1") return [];
  const rates = options.preloaded?.rates ?? (await db.collection("ratePlans").where("propertyId", "==", property.id).where("status", "==", "active").limit(101).get()).docs;
  if (rates.length > 100) throw new Error("TOO_MANY_RATE_PLANS");
  const eligible = rates.filter(rate => eligiblePricing(rate.data()) && (rate.get("bookingMode") ?? "overnight") === (input.bookingMode ?? "overnight") && typeof rate.get("roomTypeId") === "string" && rate.get("roomTypeId") && !rate.get("roomTypeId").includes("/"));
  const rooms = options.preloaded?.rooms ?? await readDocuments(db, eligible.map(rate => db.collection("roomTypes").doc(rate.get("roomTypeId"))));
  const policyRefs = eligible.flatMap(rate => typeof rate.get("cancellationPolicyId") === "string" && rate.get("cancellationPolicyId") && !rate.get("cancellationPolicyId").includes("/") ? [db.collection("cancellationPolicies").doc(rate.get("cancellationPolicyId"))] : []);
  const policies = options.preloaded?.policies ?? await readDocuments(db, policyRefs);
  const now = Date.now();
  const candidates = eligible.flatMap(rate => {
    const room = rooms.get(db.collection("roomTypes").doc(rate.get("roomTypeId")).path);
    const roomData = room?.data();
    if (!room?.exists || !roomData || roomData.propertyId !== property.id || roomData.status !== "active") return [];
    try {
      const stay = evaluateStay(input, settings, roomData, rate.data(), now);
      const policy = policies.get(`cancellationPolicies/${rate.get("cancellationPolicyId")}`)?.data();
      if (rate.get("cancellationPolicyId") && (!policy || policy.status !== "active" || policy.propertyId !== property.id)) return [];
      const terms = cancellationTerms(policy?.status === "active" && policy.propertyId === property.id ? policy : null, stay.startAt, now);
      if (options.freeCancellation && !terms.freeCancellation) return [];
      const amenityCodes = [...new Set([...(options.propertyAmenityCodes ?? []), ...resolveAmenityCodes(Array.isArray(roomData.amenityIds) ? roomData.amenityIds : [], options.codesById ?? new Map())])];
      if (!(options.amenities ?? []).every(code => amenityCodes.some(value => canonicalAmenityKey(value) === canonicalAmenityKey(code)))) return [];
      const cutoff = Date.parse(stay.startAt) - Number(rate.get("stayRules")?.minimumAdvanceMinutes ?? (stay.bookingMode === "hourly" ? 15 : 0)) * 60_000;
      const validUntil = Math.min(now + 30_000, cutoff, terms.freeCancellation && terms.deadline ? Date.parse(terms.deadline) : Infinity);
      const offer: SearchOffer = {
        roomTypeId: room.id, ratePlanId: rate.id, roomName: typeof roomData.name === "string" ? roomData.name : null,
        beds: Array.isArray(roomData.bedConfigurations) ? roomData.bedConfigurations.filter((bed: { bedType?: unknown; count?: unknown }) => typeof bed.bedType === "string" && Number.isInteger(bed.count) && Number(bed.count) > 0).map((bed: { bedType: string; count: number }) => ({ bedType: bed.bedType, count: bed.count })) : [],
        amenityCodes, payableNowPaise: stay.payableNowPaise, balanceDuePaise: stay.balanceDuePaise, totalPaise: stay.totalPaise, subtotalPaise: stay.subtotalPaise, taxPaise: stay.taxPaise, customerFeePaise: stay.customerFeePaise,
        breakfastIncluded: rate.get("breakfastIncluded") === true, cancellation: terms,
        startAt: stay.startAt, endAt: stay.endAt, timezone: stay.timezone, nights: stay.nights, durationMinutes: stay.durationMinutes, bookingMode: stay.bookingMode, validUntil,
      };
      const capacity = typeof roomData.totalInventory === "number" && Number.isFinite(roomData.totalInventory) ? roomData.totalInventory : 0;
      if (capacity <= 0) return [];
      const allocations = settings.inventoryEngine === "interval_v1" ? allocateIntervals(stay.startAt, stay.inventoryEndAt, stay.timezone) : [];
      const dates: string[] = [];
      for (let date = Date.parse(`${stay.checkIn}T00:00Z`), end = Date.parse(`${stay.checkOut}T00:00Z`); date < end; date += 86400_000) dates.push(new Date(date).toISOString().slice(0, 10));
      const refs = (settings.inventoryEngine === "interval_v1" ? allocations.map(item => item.date) : dates)
        .map(date => db.collection(settings.inventoryEngine === "interval_v1" ? "inventoryCalendars" : "roomNightInventory").doc(`${property.id}_${room.id}_${date}`));
      return [{ stay, capacity, allocations, refs, offer }];
    } catch (error) {
      if (error instanceof Error && unavailable.has(error.message)) return [];
      throw error;
    }
  });
  const inventory = await readDocuments(db, candidates.flatMap(candidate => candidate.refs));
  options.onInventoryRead?.(inventory.size);
  const offers: SearchOffer[] = [];
  for (const candidate of candidates) {
    const calendars = candidate.refs.map(ref => inventory.get(ref.path)?.data() ?? {});
    const available = settings.inventoryEngine === "interval_v1"
      ? hasCapacity(candidate.allocations, calendars, candidate.capacity)
      : calendars.every(calendar => (typeof calendar.reserved === "number" && Number.isFinite(calendar.reserved) ? calendar.reserved : 0) < candidate.capacity);
    if (available && candidate.offer.validUntil > Date.now()) offers.push(candidate.offer);
  }
  console.info(JSON.stringify({ event: "offers.evaluate", durationMs: Date.now() - started, candidateRates: candidates.length, availableRates: offers.length, inventoryDocumentsRead: inventory.size }));
  return offers.sort((a, b) => a.totalPaise - b.totalPaise || `${a.roomTypeId}:${a.ratePlanId}`.localeCompare(`${b.roomTypeId}:${b.ratePlanId}`));
}

export async function minimumAvailableOffer(db: Firestore, property: QueryDocumentSnapshot, input: StayRequest, options: OfferOptions = {}): Promise<SearchOffer | null> {
  return (await availableOffers(db, property, input, options))[0] ?? null;
}

/** Compatibility for existing price-only consumers. */
export async function minimumAvailablePrice(db: Firestore, property: QueryDocumentSnapshot, input: StayRequest) {
  return (await minimumAvailableOffer(db, property, input))?.totalPaise ?? null;
}
