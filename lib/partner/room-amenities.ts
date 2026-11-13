import { amenityLabel, canonicalAmenityKey } from "@/lib/customer/amenities";

export const ROOM_AMENITY_CATEGORIES = [
  "Comfort", "Bathroom", "Entertainment & connectivity", "Storage & workspace", "Other",
] as const;
export type RoomAmenityCategory = typeof ROOM_AMENITY_CATEGORIES[number];
export type RoomAmenityOption = {
  id: string;
  code: string;
  label: string;
  category: RoomAmenityCategory;
  /** All equivalent catalog IDs and labels, including older duplicate entries. */
  aliases: string[];
};

const definitions: [string, string, RoomAmenityCategory][] = [
  ["wifi", "Wi-Fi", "Entertainment & connectivity"],
  ["air_conditioning", "Air conditioning", "Comfort"],
  ["hot_water", "Hot water", "Bathroom"],
  ["room_service", "Room service", "Comfort"],
  ["tv", "TV", "Entertainment & connectivity"],
  ["mini_fridge", "Mini fridge", "Comfort"],
  ["balcony", "Balcony", "Comfort"],
  ["workspace", "Workspace", "Storage & workspace"],
  ["wardrobe", "Wardrobe", "Storage & workspace"],
  ["safe", "Safe", "Storage & workspace"],
  ["hair_dryer", "Hair dryer", "Bathroom"],
  ["bathtub", "Bathtub", "Bathroom"],
];

export const BUILTIN_ROOM_AMENITIES: RoomAmenityOption[] = definitions.map(([code, label, category]) => ({
  id: code, code, label, category, aliases: [code, label],
}));

type CatalogAmenity = { id: string; code?: unknown; name?: unknown; category?: unknown; scope?: unknown; status?: unknown };

/** Catalog entries win over built-ins; duplicate IDs remain resolvable aliases. */
export function buildRoomAmenityOptions(catalog: CatalogAmenity[]): RoomAmenityOption[] {
  const byCode = new Map(BUILTIN_ROOM_AMENITIES.map(option => [option.code, { ...option, aliases: [...option.aliases] }]));
  const catalogCodes = new Set<string>();
  for (const entry of [...catalog].sort((a, b) => a.id.localeCompare(b.id))) {
    if (entry.status === "archived" || entry.status === "inactive" || entry.scope === "property") continue;
    if (typeof entry.code !== "string" || !entry.code.trim() || !entry.id || entry.id.includes("/")) continue;
    const code = canonicalAmenityKey(entry.code);
    if (!code || ["breakfast", "breakfast_included", "free_breakfast"].includes(code)) continue;
    const existing = byCode.get(code);
    const label = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : existing?.label ?? amenityLabel(code);
    const category = ROOM_AMENITY_CATEGORIES.includes(entry.category as RoomAmenityCategory)
      ? entry.category as RoomAmenityCategory : existing?.category ?? "Other";
    const aliases = [...new Set([...(existing?.aliases ?? []), entry.id, entry.code, label, code])];
    if (!catalogCodes.has(code)) byCode.set(code, { id: entry.id, code, label, category, aliases });
    else if (existing) existing.aliases = aliases;
    catalogCodes.add(code);
  }
  return [...byCode.values()];
}

export function roomAmenityOption(value: string, options: readonly RoomAmenityOption[]) {
  // Resolve exact IDs before interpreting a string as a code or label.
  return options.find(option => option.id === value || option.aliases.includes(value))
    ?? options.find(option => option.code === canonicalAmenityKey(value)
      || option.aliases.some(alias => canonicalAmenityKey(alias) === canonicalAmenityKey(value)));
}

export function normalizeRoomAmenities(values: readonly string[], options: readonly RoomAmenityOption[]) {
  return [...new Set(values.map(value => roomAmenityOption(value, options)?.id ?? value))];
}

/** Unknown values can only survive on the room where they were already saved. */
export function validateRoomAmenities(values: readonly string[], existing: readonly string[], options: readonly RoomAmenityOption[]) {
  if (values.length > 50) throw new Error("Select no more than 50 room amenities.");
  for (const value of values) {
    if (!existing.includes(value) && (!value.trim() || value.length > 180 || value.includes("/") || !roomAmenityOption(value, options))) {
      throw new Error("An amenity is no longer available. Reload the room and try again.");
    }
  }
  return normalizeRoomAmenities(values, options);
}

export function roomAmenitySelections(values: readonly string[], options: readonly RoomAmenityOption[]): RoomAmenityOption[] {
  return normalizeRoomAmenities(values, options).map(id => roomAmenityOption(id, options) ?? {
    id, code: id, label: amenityLabel(id) || id, category: "Other", aliases: [id],
  });
}
