import type { OfferingInput } from "./contracts";
import { formatMoney } from "@/lib/customer/offer";

export function variantPrice(offering: OfferingInput, variantId: string | null) {
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
        input.kind === "preference"
          ? null
          : v.unitPricePaise === undefined
            ? previous?.variants.find((old) => old.id === v.id)?.unitPricePaise ?? null
            : v.unitPricePaise,
    })),
  };
}
