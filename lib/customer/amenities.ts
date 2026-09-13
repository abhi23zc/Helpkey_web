/**
 * Converts both catalog codes ("fast_wifi") and legacy labels ("Wi-Fi") into
 * a stable key that can be safely merged, filtered, and rendered.
 */
export function amenityKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Formats an amenity code or legacy label for customer-facing UI. */
export function amenityLabel(value: string) {
  const key = amenityKey(value);
  const specialLabels: Record<string, string> = {
    ac: "Air conditioning",
    wifi: "Wi-Fi",
    wi_fi: "Wi-Fi",
    fast_wifi: "Fast Wi-Fi",
  };
  if (specialLabels[key]) return specialLabels[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Resolves IDs through the amenities catalog while retaining legacy labels. */
export function resolveAmenityCodes(
  amenityIds: unknown,
  codesById: ReadonlyMap<string, string>
) {
  if (!Array.isArray(amenityIds)) return [];
  const unique = new Map<string, string>();
  for (const id of amenityIds) {
    if (typeof id !== "string" || !id.trim()) continue;
    const code = codesById.get(id) ?? id;
    const key = amenityKey(code);
    if (key) unique.set(key, code);
  }
  return [...unique.values()];
}
