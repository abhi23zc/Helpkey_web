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

/** Legacy spellings that must collapse to one filterable code ("Wi-Fi" and "wifi" are the same amenity). */
const AMENITY_ALIASES: Record<string, string> = {
  wi_fi: "wifi",
  fast_wi_fi: "fast_wifi",
  ac: "air_conditioning",
  air_conditioner: "air_conditioning",
  pool: "swimming_pool",
};

/** Stable, filterable identity for an amenity across catalog codes and legacy labels. */
export function canonicalAmenityKey(value: string) {
  const key = amenityKey(value);
  return AMENITY_ALIASES[key] ?? key;
}

/**
 * Builds the `amenityCodes` stored on a property's search projection. Ids that are not in the
 * amenities catalog (legacy labels such as "Wi-Fi") are kept and canonicalised instead of dropped,
 * otherwise search and amenity filters silently match nothing.
 */
export function projectAmenityCodes(ids: readonly unknown[], codeById: ReadonlyMap<string, string>) {
  const codes = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !id.trim()) continue;
    const key = canonicalAmenityKey(codeById.get(id) ?? id);
    if (key) codes.add(key);
  }
  return [...codes];
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
