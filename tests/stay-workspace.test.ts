import { describe, it, expect } from "vitest";
import {
  catalogRows,
  noticeLabel,
  matchesRequestGroup,
  requestGroup,
} from "@/lib/stay/workspace";
import type { Offering, StayRequest } from "@/lib/stay/contracts";
const offering: Offering = {
  id: "one",
  propertyId: "hotel",
  version: 1,
  name: "Cake",
  description: "Birthday cake",
  kind: "item",
  status: "active",
  travelerCategories: [],
  roomTypeIds: [],
  bookingModes: ["overnight"],
  unitPricePaise: 50000,
  maxQuantity: 1,
  advanceNoticeMinutes: 1440,
  confirmation: "approval",
  variants: [],
};
describe("partner stay workspace", () => {
  it("filters normalized legacy categories and searches without changing the catalog", () => {
    const rows = [
      offering,
      {
        ...offering,
        id: "two",
        name: "Adapter",
        category: "devices" as const,
        status: "paused" as const,
      },
    ];
    expect(
      catalogRows(rows, "adapter", "paused", "technology", "name").map(
        (o) => o.id,
      ),
    ).toEqual(["two"]);
    expect(catalogRows(rows, "birthday", "active", "all", "name")).toEqual([
      offering,
    ]);
    expect(rows.map((o) => o.id)).toEqual(["one", "two"]);
  });
  it("sorts effective variant prices including free and inherited prices", () => {
    const rows = [
      offering,
      {
        ...offering,
        id: "free",
        variants: [{ id: "v", name: "Small", unitPricePaise: 0 }],
      },
    ];
    expect(catalogRows(rows, "", "all", "all", "price_low")[0].id).toBe("free");
    expect(catalogRows(rows, "", "all", "all", "price_high")[0].id).toBe("one");
  });
  it("separates agreement/payment work from preparation and terminal requests", () => {
    const r = {
      status: "requested",
      settlement: "pending_hotel",
    } as StayRequest;
    expect(requestGroup(r)).toBe("approval");
    expect(requestGroup({ ...r, settlement: "awaiting_payment" })).toBe(
      "waiting",
    );
    expect(
      requestGroup({ ...r, status: "confirmed", settlement: "paid" }),
    ).toBe("todo");
    expect(
      requestGroup({ ...r, status: "preparing", settlement: "paid" }),
    ).toBe("preparing");
    expect(requestGroup({ ...r, status: "ready", settlement: "paid" })).toBe(
      "ready",
    );
    for (const status of ["fulfilled", "declined", "cancelled"] as const) {
      expect(matchesRequestGroup({ ...r, status }, "open")).toBe(false);
      expect(matchesRequestGroup({ ...r, status }, "completed")).toBe(true);
    }
  });
  it("expresses advance notice in understandable units", () => {
    expect(noticeLabel(0)).toBe("No advance notice");
    expect(noticeLabel(60)).toBe("1 hour advance notice");
    expect(noticeLabel(1440)).toBe("1 day advance notice");
    expect(noticeLabel(90)).toBe("90 minutes advance notice");
  });
});
