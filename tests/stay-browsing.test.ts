import { describe, expect, it } from "vitest";
import {
  offeringSchema,
  offeringCategory,
  type Offering,
} from "@/lib/stay/contracts";
import { matchesExtras, matchesExtrasPrice } from "@/lib/stay/browsing";
import { readOffering } from "@/lib/stay/catalog";

const input = {
  name: "Room aroma",
  description: "Choose a scent for your stay",
  kind: "service" as const,
  travelerCategories: [],
  roomTypeIds: [],
  bookingModes: ["overnight" as const],
  unitPricePaise: 20000,
  maxQuantity: 3,
  advanceNoticeMinutes: 0,
  confirmation: "approval" as const,
  variants: [
    { id: "rose", name: "Rose", unitPricePaise: 0 },
    { id: "lavender", name: "Lavender", unitPricePaise: 15000 },
  ],
  status: "active" as const,
};
const offering: Offering = {
  ...input,
  id: "aroma",
  propertyId: "hotel",
  version: 1,
};
describe("checkout extras browsing", () => {
  it("accepts categories, keeps legacy offerings readable and uses explicit categories before fallback", () => {
    expect(offeringSchema.safeParse(input).success).toBe(true);
    expect(offeringCategory(input)).toBe("other");
    expect(offeringCategory({ kind: "preference" })).toBe("room_preferences");
    expect(
      offeringCategory({ kind: "preference", category: "room_essentials" }),
    ).toBe("room_essentials");
    expect(
      offeringSchema.safeParse({ ...input, category: "invented" }).success,
    ).toBe(false);
    expect(
      readOffering("aroma", { ...offering, category: "celebrations" })
        ?.category,
    ).toBe("celebrations");
    expect(readOffering("aroma", offering)?.name).toBe("Room aroma");
  });
  it("finds names, descriptions and variants without changing catalog order", () => {
    const before = JSON.stringify(offering);
    for (const search of ["aroma", "SCENT", " lavender "])
      expect(matchesExtras(offering, search, "all", "all", new Set())).toBe(
        true,
      );
    expect(matchesExtras(offering, "charger", "all", "all", new Set())).toBe(
      false,
    );
    expect(JSON.stringify(offering)).toBe(before);
  });
  it("includes mixed-price offerings in both price filters and filters individual choices", () => {
    expect(matchesExtras(offering, "", "all", "free", new Set())).toBe(true);
    expect(matchesExtras(offering, "", "all", "paid", new Set())).toBe(true);
    expect(matchesExtrasPrice(0, "paid")).toBe(false);
    expect(matchesExtrasPrice(15000, "free")).toBe(false);
    expect(
      matchesExtras(
        {
          ...offering,
          unitPricePaise: 0,
          variants: [{ id: "paid", name: "Premium", unitPricePaise: 15000 }],
        },
        "",
        "all",
        "free",
        new Set(),
      ),
    ).toBe(false);
  });
  it("combines category, search and selected filters", () => {
    expect(
      matchesExtras(offering, "", "other", "selected", new Set([offering.id])),
    ).toBe(true);
    expect(matchesExtras(offering, "", "devices", "all", new Set())).toBe(
      false,
    );
    expect(matchesExtras(offering, "", "all", "selected", new Set())).toBe(
      false,
    );
  });
});

describe("unavailable extras remain discoverable", () => {
  const now = Date.parse("2026-10-25T10:00:00+05:30");
  const startAt = "2026-10-25T11:00:00+05:30";
  it("explains expired notice without hiding a search match", async () => {
    const { unavailableExtraMessage } = await import("@/lib/stay/browsing");
    const mouse = {
      ...offering,
      name: "External Mouse",
      advanceNoticeMinutes: 120,
    };
    expect(matchesExtras(mouse, "mouse", "all", "all", new Set())).toBe(true);
    const message = unavailableExtraMessage(
      mouse,
      "room",
      "overnight",
      startAt,
      "Asia/Kolkata",
      now,
    );
    expect(message).toContain("Needs 2 hours’ notice");
    expect(message).toContain("9:00");
    expect(
      unavailableExtraMessage(
        mouse,
        "room",
        "overnight",
        startAt,
        "Asia/Kolkata",
        now - 7200000,
      ),
    ).toBeNull();
  });
  it("distinguishes room, stay-mode and deadline restrictions", async () => {
    const { unavailableExtraMessage } = await import("@/lib/stay/browsing");
    expect(
      unavailableExtraMessage(
        offering,
        "room",
        "hourly",
        startAt,
        "Asia/Kolkata",
        now,
      ),
    ).toBe("Available for overnight stays only.");
    expect(
      unavailableExtraMessage(
        { ...offering, roomTypeIds: ["suite"] },
        "room",
        "overnight",
        startAt,
        "Asia/Kolkata",
        now,
      ),
    ).toBe("Not offered for your selected room.");
    expect(
      unavailableExtraMessage(
        offering,
        "room",
        "overnight",
        startAt,
        "Asia/Kolkata",
        Date.parse(startAt),
      ),
    ).toContain("deadline");
  });
});
