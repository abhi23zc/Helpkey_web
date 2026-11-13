import { describe, expect, it } from "vitest";
import {
  buildRoomAmenityOptions, normalizeRoomAmenities, roomAmenitySelections, validateRoomAmenities,
} from "@/lib/partner/room-amenities";
import { accommodationAmenityCodes, resolveAmenityCodes } from "@/lib/customer/amenities";

const options = buildRoomAmenityOptions([
  { id: "catalog-wifi", code: "wifi", name: "Wi-Fi" },
  { id: "duplicate-wifi", code: "wi_fi", name: "Wireless internet" },
  { id: "coffee", code: "coffee_machine", name: "Coffee machine", category: "Comfort", scope: "room" },
]);

describe("room amenity identities and compatibility", () => {
  it("merges catalog IDs, aliases and labels, preferring a catalog ID", () => {
    expect(normalizeRoomAmenities(["Wi-Fi", "wifi", "catalog-wifi", "duplicate-wifi", "Wireless internet", "AC", "Air conditioning"], options))
      .toEqual(["catalog-wifi", "air_conditioning"]);
    expect(options.filter(option => option.code === "wifi")).toHaveLength(1);
  });
  it("keeps room selections independent and preserves unknown legacy values", () => {
    const normal = ["Wi-Fi", "Legacy lamp"];
    const deluxe = ["bathtub", "balcony"];
    expect(validateRoomAmenities(normal, normal, options)).toEqual(["catalog-wifi", "Legacy lamp"]);
    expect(validateRoomAmenities(deluxe, [], options)).toEqual(deluxe);
    expect(normal).toEqual(["Wi-Fi", "Legacy lamp"]);
    expect(roomAmenitySelections(normal, options)[1]).toMatchObject({ id: "Legacy lamp", category: "Other", label: "Legacy Lamp" });
  });
  it("rejects new unknown values while allowing removal or clearing", () => {
    expect(() => validateRoomAmenities(["Legacy lamp"], [], options)).toThrow("no longer available");
    expect(validateRoomAmenities([], ["Legacy lamp", "wifi"], options)).toEqual([]);
    for (const value of ["", " ", "unsafe/path"]) expect(() => validateRoomAmenities([value], [], options)).toThrow();
    expect(() => validateRoomAmenities(Array(51).fill("wifi"), [], options)).toThrow("50");
  });
  it("categorizes catalog additions and excludes property-only, archived and meal options", () => {
    expect(options.find(option => option.id === "coffee")).toMatchObject({ category: "Comfort" });
    const excluded = buildRoomAmenityOptions([
      { id: "pool", code: "pool", scope: "property" },
      { id: "old", code: "old_facility", status: "archived" },
      { id: "breakfast", code: "free_breakfast" },
      { id: "malformed" },
    ]);
    expect(excluded).toHaveLength(12);
  });
  it("resolves guest codes consistently and removes meal assurances from room features", () => {
    const codes = resolveAmenityCodes(["catalog-wifi", "Wi-Fi", "AC", "breakfast included", "bathtub"], new Map([["catalog-wifi", "wifi"]]));
    expect(codes).toEqual(["wifi", "air_conditioning", "breakfast_included", "bathtub"]);
    expect(accommodationAmenityCodes(codes)).toEqual(["wifi", "air_conditioning", "bathtub"]);
  });
});
