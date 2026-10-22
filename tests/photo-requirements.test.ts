import { describe, expect, it } from "vitest";
import { photoRequirements, type PhotoRequirementAsset } from "@/lib/partner/photo-requirements";
const rooms = [{ id: "double", name: "Double", status: "active" }];
const photo = (id: string, category = "additional", roomTypeId?: string): PhotoRequirementAsset => ({ id, category, roomTypeId, kind: "property_image", moderationStatus: "pending" });
const complete = [photo("outside", "exterior"), photo("bed", "room", "double"), photo("bath", "bathroom", "double"), photo("1"), photo("2"), photo("3")];
describe("property photo requirements", () => {
  it("accepts pending photos for submission with a separate valid cover", () => {
    expect(photoRequirements(complete, rooms, "bed").complete).toBe(true);
    expect(photoRequirements(complete, rooms, "missing").complete).toBe(false);
  });
  it("does not accept six exterior photos instead of room coverage", () => {
    const check = photoRequirements(Array.from({ length: 6 }, (_, i) => photo(String(i), "exterior")), rooms, "0");
    expect(check.missing).toEqual(["Double · Bedroom photo", "Double · Bathroom photo"]);
  });
  it("requires both categories for every active room and increases the minimum", () => {
    const check = photoRequirements(complete, [...rooms, { id: "suite", name: "Suite" }, { id: "single", name: "Single" }], "bed");
    expect(check.minimum).toBe(7);
    expect(check.missing).toContain("Suite · Bathroom photo");
    expect(photoRequirements(complete, [...rooms, { id: "paused", name: "Paused", status: "paused" }], "bed").complete).toBe(true);
  });
  it("excludes rejected images and non-image documents from totals and coverage", () => {
    const rejected = complete.map(p => p.id === "bath" ? { ...p, moderationStatus: "rejected" } : p);
    const check = photoRequirements([...rejected, { ...photo("doc", "bathroom", "double"), kind: "verification_document" }], rooms, "bath");
    expect(check.photos).toHaveLength(5);
    expect(check.missing).toContain("Double · Bathroom photo");
    expect(check.missing).toContain("Choose a cover photo");
  });
  it("preserves legacy room gallery links but gives explicit assignment precedence", () => {
    const legacy = complete.map(p => ({ ...p, roomTypeId: undefined }));
    const linkedRooms = [{ ...rooms[0], mediaIds: ["bed", "bath"] }];
    expect(photoRequirements(legacy, linkedRooms, "outside").complete).toBe(true);
    expect(photoRequirements(legacy.map(p => p.id === "bed" ? { ...p, roomTypeId: "other" } : p), linkedRooms, "outside").complete).toBe(false);
  });
});
