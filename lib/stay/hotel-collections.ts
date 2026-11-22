import { sumMoney } from "@/lib/finance/calculation";

type HotelCollectionRequest = {
  settlement?: string;
  status?: string;
  quote?: { status?: string; amountPaise?: number } | null;
};

/** These charges are collected through hotel receipts, never supplemental gateway receipts. */
export function hotelCollectionRequests<T extends HotelCollectionRequest>(requests: T[] = []) {
  return (Array.isArray(requests) ? requests : []).filter((r) =>
    r && typeof r === "object" &&
    r.settlement === "hotel_collection" && r.quote?.status === "accepted" &&
    !["cancelled", "declined"].includes(r.status ?? ""),
  );
}

export function hotelCollectionTotal(requests: HotelCollectionRequest[] = []) {
  return sumMoney(hotelCollectionRequests(requests).map((r) => r.quote!.amountPaise!));
}
