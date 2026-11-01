import type { OfferingInput } from "./contracts";
import { formatMoney } from "@/lib/customer/offer";

export function variantPrice(
  offering: OfferingInput,
  variantId: string | null,
) {
  return (
    offering.variants.find((v) => v.id === variantId)?.unitPricePaise ??
    offering.unitPricePaise
  );
}

export function offeringPriceLabel(offering: OfferingInput, currency = "INR") {
  const prices = offering.variants.length
    ? offering.variants.map((v) => variantPrice(offering, v.id))
    : [offering.unitPricePaise];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const label = (price: number) =>
    price === 0 ? "Free" : formatMoney(price, currency);
  return min === max ? label(min) : `${label(min)} – ${label(max)}`;
}

// Omitted prices from older clients retain overrides; null restores inheritance.
export function mergeVariantPrices(
  input: OfferingInput,
  previous?: OfferingInput,
): OfferingInput {
  return {
    ...input,
    variants: input.variants.map((v) => ({
      ...v,
      unitPricePaise:
        v.unitPricePaise === undefined
            ? (previous?.variants.find((old) => old.id === v.id)
                ?.unitPricePaise ?? null)
            : v.unitPricePaise,
    })),
  };
}

export type PricingContext = {
  startAt: string;
  endAt: string;
  nights: number;
  adults: number;
  children: number;
  petsAllowed?: boolean;
  includedCodes?: string[];
};
/** Legacy offerings remain per item per stay. People count adults + children, excluding infants. */
export function billableUnits(
  offering: Pick<OfferingInput, "pricingUnit">,
  quantity: number,
  inputs: import("./contracts").Selection["inputs"],
  context?: PricingContext,
) {
  const unit = offering.pricingUnit ?? "item";
  if (["item", "package", "stay"].includes(unit)) return quantity;
  if (!context)
    throw new Error("Refresh your stay dates to calculate this price.");
  if (unit === "night") {
    if (context.nights < 1)
      throw new Error("Per-night extras require an overnight stay.");
    return quantity * context.nights;
  }
  if (unit === "person") {
    const people = inputs?.people ?? context.adults + context.children;
    if (people > context.adults + context.children)
      throw new Error(
        "People cannot exceed booked adults and children. Infants are not charged.",
      );
    return quantity * people;
  }
  const remaining =
    Date.parse(context.endAt) -
    Date.parse(inputs?.serviceAt ?? context.startAt);
  const hours = inputs?.hours ?? Math.ceil(remaining / 3600000);
  if (inputs?.hours && inputs.hours * 3600000 > remaining)
    throw new Error("The service duration must fit within your stay.");
  return quantity * hours;
}
export function pricingUnitLabel(unit: OfferingInput["pricingUnit"]) {
  return `per ${unit ?? "item"}${!unit || unit === "item" ? " per stay" : ""}`;
}
export function requestPriceBreakdown(
  request: import("./contracts").StayRequest,
  currency = "INR",
) {
  return `${request.billableQuantity ?? request.quantity} × ${formatMoney(request.unitPricePaise, currency)} = ${formatMoney(request.totalPaise, currency)}`;
}
