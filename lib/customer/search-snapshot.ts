import type { CatalogSearch } from "./catalog-search-input";
import type { CatalogCandidate } from "./catalog-selection";

export type ClientSearchSnapshot = {
  version: 1; complete: true; baseKey: string; serverNow: number;
  expiresAt: number; evaluatedAt: number; candidates: CatalogCandidate[];
};

/** Only inputs that change the eligible offer set belong in this identity. */
export function searchBaseKey(input: CatalogSearch) {
  return JSON.stringify([input.destination.trim().toLowerCase(), input.bookingMode ?? "overnight",
    input.checkIn ?? "", input.bookingMode === "hourly" ? "" : input.checkOut ?? "",
    input.bookingMode === "hourly" ? input.arrivalTime ?? "" : "",
    input.bookingMode === "hourly" ? input.durationMinutes ?? 0 : 0,
    input.adults, input.children, input.infants]);
}
