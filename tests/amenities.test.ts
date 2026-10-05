import { describe, expect, it } from "vitest";
import { amenityLabel, canonicalAmenityKey, projectAmenityCodes } from "@/lib/customer/amenities";

describe("canonicalAmenityKey", () => {
  it("collapses legacy spellings onto one filterable code", () => {
    expect(canonicalAmenityKey("Wi-Fi")).toBe("wifi");
    expect(canonicalAmenityKey("wifi")).toBe("wifi");
    expect(canonicalAmenityKey("Air conditioning")).toBe("air_conditioning");
    expect(canonicalAmenityKey("AC")).toBe("air_conditioning");
    expect(canonicalAmenityKey("Swimming pool")).toBe("swimming_pool");
    expect(canonicalAmenityKey("pool")).toBe("swimming_pool");
  });
  it("keeps distinct amenities distinct", () => {
    expect(canonicalAmenityKey("Fast Wi-Fi")).toBe("fast_wifi");
    expect(canonicalAmenityKey("Room service")).toBe("room_service");
  });
});

describe("projectAmenityCodes", () => {
  it("keeps legacy labels that are not in the amenities catalog (regression: search returned [])", () => {
    expect(projectAmenityCodes(["Wi-Fi", "Parking", "Air conditioning"], new Map())).toEqual(["wifi", "parking", "air_conditioning"]);
  });
  it("prefers the catalog code when the id is known", () => {
    expect(projectAmenityCodes(["abc123"], new Map([["abc123", "fast_wifi"]]))).toEqual(["fast_wifi"]);
  });
  it("dedupes across property and room amenities and ignores junk", () => {
    expect(projectAmenityCodes(["Wi-Fi", "wifi", "", "  ", 42, null, "Gym"], new Map())).toEqual(["wifi", "gym"]);
  });
});

describe("amenityLabel", () => {
  it("renders canonical codes for display", () => {
    expect(amenityLabel("wifi")).toBe("Wi-Fi");
    expect(amenityLabel("swimming_pool")).toBe("Swimming Pool");
  });
});
