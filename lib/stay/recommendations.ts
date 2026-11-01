import {
  offeringCategory,
  type Offering,
  type TravelerCategory,
} from "./contracts";
/** Deterministic, diverse shortlist. Eligibility must be applied before ranking. */
export function recommendedOfferings(
  eligible: Offering[],
  preferences: TravelerCategory[],
  limit = 8,
) {
  const ranked = [...eligible].sort(
    (a, b) =>
      Number(b.travelerCategories.some((t) => preferences.includes(t))) -
        Number(a.travelerCategories.some((t) => preferences.includes(t))) ||
      Number(a.unitPricePaise > 0) - Number(b.unitPricePaise > 0) ||
      a.name.localeCompare(b.name),
  );
  const selected: Offering[] = [];
  const categories = new Set<string>();
  for (const o of ranked) {
    if (
      !categories.has(offeringCategory(o)) ||
      o.travelerCategories.some((t) => preferences.includes(t))
    ) {
      selected.push(o);
      categories.add(offeringCategory(o));
    }
    if (selected.length >= Math.min(10, limit)) return selected;
  }
  return [...selected, ...ranked.filter((o) => !selected.includes(o))].slice(
    0,
    Math.min(10, limit),
  );
}
/** A pet offering is never offered on the strength of a name or amenity alone. */
export function propertyAllowsPets(property: Record<string, unknown>) {
  const rules = property.rules as Record<string, unknown> | undefined;
  const policies = property.policies as Record<string, unknown> | undefined;
  const explicit = (property.petPolicy as { allowed?: unknown } | undefined)
    ?.allowed;
  if (typeof explicit === "boolean") return explicit;
  return (
    property.petsAllowed === true ||
    rules?.petsAllowed === true ||
    policies?.petsAllowed === true
  );
}
