export const stayQuery = "checkIn=2027-01-15&checkOut=2027-01-17&adults=2&children=0&infants=1";
export const property = {
  id: "hotel", slug: "garden", name: "Garden Hotel", city: "Kanpur", state: "Uttar Pradesh", propertyType: "hotel", timezone: "Asia/Kolkata", bookingModes: ["overnight", "hourly"],
  ratingAverage: 4.5, ratingCount: 8, minimumPricePaise: 12345, currency: "INR", coverImageUrl: null, amenityCodes: ["wifi", "parking"], propertyAmenityCodes: ["wifi"],
  description: "A quiet family property with a courtyard and individually furnished rooms.", address: { line1: "12 Garden Road", line2: "Civil Lines", landmark: "Near the library", city: "Kanpur", state: "Uttar Pradesh", postalCode: "208001" }, coordinates: { latitude: 26.46, longitude: 80.32 }, checkInTime: "14:00", checkOutTime: "11:00", minimumCheckInAge: 21, identityRequirements: { governmentIdRequired: true }, smokingPolicy: { allowed: false },
  reviewSummary: null, images: Array.from({ length: 8 }, (_, index) => ({ id: String(index), imageUrl: `/broken-${index}.jpg`, altText: `Hotel photo ${index + 1}` })),
};
export function offer(totalPaise = 27752) {
  return { id: "flex", name: "Flexible", basePricePaise: 12345, totalPaise, subtotalPaise: 24690, taxPaise: 2963, customerFeePaise: 99, payableNowPaise: 6938, balanceDuePaise: totalPaise - 6938, nights: 2, durationMinutes: 2700, startAt: "2027-01-15T08:30:00Z", endAt: "2027-01-17T05:30:00Z", validUntil: Date.now() + 30_000, paymentMode: "deposit", breakfastIncluded: true, cancellationTerms: { freeCancellation: true, deadline: "2027-01-14T08:30:00Z", feePercent: 0, name: "Flexible" }, cancellation: { name: "Flexible", description: "Cancel free until 24 hours before arrival." } };
}
export function availability(totalPaise?: number) {
  return { serverNow: Date.now(), expiresAt: Date.now() + 30_000, hourlyDurations: [{ roomTypeId: "family", ratePlanId: "hourly", prices: [{ hours: 2, pricePaise: 20000 }, { hours: 3, pricePaise: 30000 }] }], rooms: [{ id: "family", name: "Family room", description: "A spacious room with a desk.", totalInventory: 2, maxAdults: 4, maxChildren: 3, maxInfants: 2, maxOccupancy: 5, roomSizeSqFt: 220, amenityCodes: ["parking"], imageUrl: null, rates: [offer(totalPaise), { ...offer(30000), id: "standard", name: "Standard", breakfastIncluded: false, paymentMode: "full" }] }] };
}
