import { captureAgreement, type CheckoutProof, type Sources } from "@/lib/booking-finance/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
export function accountingFixture(online: number, hotel: number, completed = true, commissionBasisPoints = 1000, bookingId = "booking", propertyId = "hotel") {
  const date = "2026-11-24T00:00:00.000Z";
  const b: RecordData = { propertyId, currency: "INR", roomType: { id: "room" }, ratePlan: { id: "rate" }, subtotalPaise: 200000, taxPaise: 10000, customerFeePaise: 0, extrasTotalPaise: 0, totalPaise: 210000, payableNowPaise: online, paidPaise: online + hotel, bookingStatus: completed ? "checked_out" : "confirmed", customizations: [], startAt: "2026-12-01", endAt: "2026-12-02", createdAt: date, updatedAt: date };
  const agreement = captureAgreement(bookingId, b, "owner", [], { marketplaceCommission: true, commissionBasis: "rooms", commissionBasisPoints }, {}, 3, 4, date);
  const proof: CheckoutProof & { createdAt: string } = { bookingId, propertyId, actorId: "owner", agreementVersion: 1, calculationVersion: 1, validated: true, originalChargeState: agreement.originalChargeState, checkoutChargeState: agreement.originalChargeState, createdAt: date };
  const common = { bookingId, propertyId, createdAt: date };
  const sources: Sources = { entries: [], property: hotel ? [{ ...common, id: `${bookingId}-cash`, type: "collection", amountPaise: hotel }] : [], online: online ? [{ ...common, id: `${bookingId}-pay`, paymentId: `${bookingId}-pay`, orderId: "order", currency: "INR", status: "captured", amountPaise: online }] : [], refunds: [], events: [], changes: [] };
  return { b, agreement, proof: completed ? proof : null, sources };
}
