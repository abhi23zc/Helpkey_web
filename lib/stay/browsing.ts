import { offeringUnavailableReason } from "./domain";
import { offeringCategory, type Offering } from "./contracts";
import { variantPrice } from "./pricing";

export type ExtrasFilter = "all" | "free" | "paid" | "selected";
export function matchesExtrasPrice(price: number, filter: ExtrasFilter) {
  return (
    (filter !== "free" && filter !== "paid") ||
    (filter === "free" ? price === 0 : price > 0)
  );
}
export function matchesExtras(
  offering: Offering,
  search: string,
  category: string,
  filter: ExtrasFilter,
  selectedIds: Set<string>,
) {
  const haystack = [
    offering.name,
    offering.description,
    ...offering.variants.map((v) => v.name),
  ]
    .join(" ")
    .toLocaleLowerCase();
  const prices = offering.variants.length
    ? offering.variants.map((v) => variantPrice(offering, v.id))
    : [offering.unitPricePaise];
  return (
    (!search.trim() || haystack.includes(search.trim().toLocaleLowerCase())) &&
    (category === "all" || offeringCategory(offering) === category) &&
    (filter !== "selected" || selectedIds.has(offering.id)) &&
    prices.some((price) => matchesExtrasPrice(price, filter))
  );
}

export function unavailableExtraMessage(
  offering: Offering,
  roomTypeId: string,
  mode: string,
  startAt: string,
  timezone: string,
  now = Date.now(),
) {
  const reason = offeringUnavailableReason(
    offering,
    roomTypeId,
    mode,
    startAt,
    now,
  );
  if (reason === "paused") return "Currently unavailable.";
  if (reason === "room") return "Not offered for your selected room.";
  if (reason === "mode")
    return `Available for ${offering.bookingModes.includes("overnight") ? "overnight" : "hourly"} stays only.`;
  if (reason === "deadline") {
    if (!offering.advanceNoticeMinutes)
      return "The request deadline for this arrival has passed.";
    const minutes = offering.advanceNoticeMinutes;
    const notice =
      minutes % 60 === 0
        ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
        : `${minutes} minutes`;
    const deadline = new Date(
      Date.parse(startAt) - minutes * 60000,
    ).toLocaleString("en-IN", {
      timeZone: timezone,
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return `Needs ${notice}’ notice · Request by ${deadline} (${timezone}).`;
  }
  return null;
}
