import { describe, expect, it } from "vitest";
import {
  compareRoomLabels,
  expandUnitLabels,
  planUnitLabels,
} from "@/lib/partner/reservations/bulk-unit-domain";

describe("bulk room-number input and preview", () => {
  it("expands ranges with leading zeros and a 100-entry limit", () => {
    expect(
      expandUnitLabels({ mode: "range", start: "001", end: "050" }),
    ).toHaveLength(50);
    expect(
      expandUnitLabels({ mode: "range", start: "001", end: "003" }),
    ).toEqual(["001", "002", "003"]);
    expect(
      expandUnitLabels({ mode: "range", start: "101", end: "150" }),
    ).toHaveLength(50);
    expect(
      expandUnitLabels({ mode: "range", start: "1", end: "100" }),
    ).toHaveLength(100);
    for (const [start, end] of [
      ["1", "101"],
      ["9", "1"],
      ["A1", "A9"],
    ])
      expect(() => expandUnitLabels({ mode: "range", start, end })).toThrow();
  });
  it("accepts comma/newline labels and rejects empty, excessive and long lists", () => {
    expect(
      expandUnitLabels({ mode: "list", text: " A101, A102\r\nB7\n\n009," }),
    ).toEqual(["A101", "A102", "B7", "009"]);
    for (const text of [" ,\n", "a".repeat(41), Array(101).fill("1").join(",")])
      expect(() => expandUnitLabels({ mode: "list", text })).toThrow();
  });
  it("skips hotel-wide inactive and case-insensitive matches and counts repeated input", () => {
    const units = [
      { id: "1", label: "A101", status: "inactive", roomTypeId: "other" },
    ];
    const plan = planUnitLabels(
      ["a101", "B2", "b2", "B3"],
      units,
      "selected",
      2,
    );
    expect(plan.existing).toEqual(units);
    expect(plan.newLabels).toEqual(["B2", "B3"]);
    expect(plan.duplicates).toEqual(["b2"]);
    expect(plan.canSave).toBe(true);
    expect(plan.capacityAfter).toBe(0);
    expect(planUnitLabels(["1", "2", "3"], [], "selected", 2).canSave).toBe(
      false,
    );
  });
  it("sorts room labels naturally", () =>
    expect(["103", "11", "102", "101", "2"].sort(compareRoomLabels)).toEqual([
      "2",
      "11",
      "101",
      "102",
      "103",
    ]));
});
