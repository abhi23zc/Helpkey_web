import { datePriceId } from "@/lib/booking/date-prices";
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { cachedSearch, searchDigest } from "@/lib/customer/search-cache";
import { configuredHourlyPrices, HOURLY_ARRIVAL_STEP_MINUTES } from "@/lib/customer/hourly-options";
import { readDocuments } from "@/lib/booking/search-availability";

/** Bounded public catalog scan; no guest records or payment queries. */
export async function publicHourlyOptions(destination: string, checkIn?: string) {
  const city = destination.trim().toLowerCase();
  const result = await cachedSearch<number>(searchDigest(["hourly-options-v2", city, checkIn]), async () => {
    let query: FirebaseFirestore.Query = adminDb.collection("properties").where("status", "==", "active").where("approvalStatus", "==", "approved").where("isBookable", "==", true);
    if (city) query = query.where("normalizedCity", "==", city);
    const properties = (await query.orderBy("__name__").limit(1001).get()).docs;
    if (properties.length > 1000) throw new ApiException("NARROW_SEARCH_FILTERS", 422, "Please choose a city to narrow your search.");
    const eligible = properties.filter(p => p.get("inventoryEngine") === "interval_v1" && Array.isArray(p.get("bookingModes")) && p.get("bookingModes").includes("hourly"));
    const durations = new Set<number>();
    for (let offset = 0; offset < eligible.length; offset += 30) {
      const chunk = eligible.slice(offset, offset + 30);
      const rates = (await adminDb.collection("ratePlans").where("propertyId", "in", chunk.map(p => p.id)).where("status", "==", "active").limit(3001).get()).docs;
      if (rates.length > 3000) throw new ApiException("NARROW_SEARCH_FILTERS", 422, "Please choose a city to narrow your search.");
      const rooms = await readDocuments(adminDb, rates.flatMap(rate => typeof rate.get("roomTypeId") === "string" && rate.get("roomTypeId") && !rate.get("roomTypeId").includes("/") ? [adminDb.collection("roomTypes").doc(rate.get("roomTypeId"))] : []));
      const overrides = checkIn ? await readDocuments(adminDb, rates.filter(rate => rate.get("datePricingEnabled") && rate.get("bookingMode") === "hourly").map(rate => adminDb.collection("rateDatePrices").doc(datePriceId(rate.get("propertyId"), rate.id, checkIn)))) : new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const rate of rates) {
        const property = chunk.find(p => p.id === rate.get("propertyId"));
        const room = rooms.get(`roomTypes/${rate.get("roomTypeId")}`)?.data();
        if (!property || room?.propertyId !== property.id) continue;
        const override = checkIn ? overrides.get(`rateDatePrices/${datePriceId(property.id, rate.id, checkIn)}`)?.data() : undefined;
        const effectiveRate = override?.durationPrices ? { ...rate.data(), durationPrices: override.durationPrices } : rate.data();
        for (const row of configuredHourlyPrices(property.data(), room, effectiveRate)) durations.add(row.hours * 60);
      }
    }
    const now = Date.now();
    return { items: [...durations].sort((a, b) => a - b), fingerprint: "hourly-options-v2", evaluatedAt: now, expiresAt: now + 30_000, amenities: [] };
  });
  return { durationMinutes: result.items, arrivalStepMinutes: HOURLY_ARRIVAL_STEP_MINUTES, evaluatedAt: result.evaluatedAt, expiresAt: result.expiresAt, serverNow: Date.now() };
}
