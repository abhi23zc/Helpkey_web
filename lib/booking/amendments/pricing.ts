import "server-only";
import { evaluateStay, type StayRequest } from "../domain";
import { withDatePrices } from "../date-prices";
import type { RecordData } from "@/lib/partner/dashboard/domain";
/** Shared staff/customer rate validation; caller-specific permissions and publication checks stay outside. */
export function amendmentRateAvailable(
  b: RecordData,
  property: RecordData,
  room: RecordData,
  rate: RecordData,
  roomTypeId: string,
) {
  return (
    property.inventoryEngine === "interval_v1" &&
    room.propertyId === b.propertyId &&
    room.status === "active" &&
    rate.propertyId === b.propertyId &&
    rate.roomTypeId === roomTypeId &&
    rate.status === "active" &&
    (property.currency ?? "INR") === b.currency
  );
}
export async function priceAmendment(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  ratePlanId: string,
  input: StayRequest,
  property: RecordData,
  room: RecordData,
  rate: RecordData,
) {
  return evaluateStay(
    input,
    property,
    room,
    await withDatePrices(propertyId, ratePlanId, rate, input, tx),
  );
}
