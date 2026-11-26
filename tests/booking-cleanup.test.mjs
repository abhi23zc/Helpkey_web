import { test } from "node:test";
import assert from "node:assert/strict";
import { makePlan } from "../scripts/booking-cleanup/plan.mjs";
const id = "a".repeat(64),
  other = "b".repeat(64);
const fixture = () => [
  { path: "bookings/" + id, data: { propertyId: "hotel" } },
  { path: "bookings/" + id + "/events/e", data: {} },
  { path: "properties/hotel", data: { name: "Preserved" } },
  {
    path: "physicalUnits/room",
    data: { propertyId: "hotel", housekeepingStatus: "dirty" },
  },
  {
    path: "propertyPayments/pay",
    data: { bookingId: id, cashierShiftId: "shift" },
  },
  { path: "cashierShifts/shift", data: { propertyId: "hotel" } },
  { path: "cashierShiftRequests/request", data: { result: { id: "shift" } } },
  {
    path: "inventoryCalendars/day",
    data: {
      propertyId: "hotel",
      reserved: { x: 1 },
      blocked: { x: 1 },
      stopSell: true,
    },
  },
  {
    path: "physicalUnitCalendars/day",
    data: { propertyId: "hotel", slots: { x: id, y: other } },
  },
  { path: "hotelPrivateBanksV1/hotel", data: { ownerId: "owner" } },
  { path: "notifications/unrelated", data: { userId: "owner" } },
  {
    path: "hotelAccountingRequestsV1/unproven",
    data: { result: { accepted: true } },
  },
];
test("includes only linked records, shifts and nested records; preserves shared entities", () => {
  const p = makePlan(fixture(), [id]);
  assert(p.deletes.includes("bookings/" + id + "/events/e"));
  assert(p.deletes.includes("cashierShifts/shift"));
  assert(p.deletes.includes("cashierShiftRequests/request"));
  for (const x of [
    "properties/hotel",
    "physicalUnits/room",
    "hotelPrivateBanksV1/hotel",
    "notifications/unrelated",
    "hotelAccountingRequestsV1/unproven",
  ])
    assert(!p.deletes.includes(x));
  assert.deepEqual(
    p.repairs.find((v) => v.path === "inventoryCalendars/day").patch,
    { reserved: {} },
  );
  assert.deepEqual(
    p.repairs.find((v) => v.path === "physicalUnitCalendars/day").patch,
    { slots: { y: other } },
  );
});
test("rejects unexpected bookings and mixed shifts", () => {
  assert.throws(
    () =>
      makePlan(
        [
          ...fixture(),
          { path: "bookings/" + other, data: { propertyId: "hotel" } },
        ],
        [id],
      ),
    /Unexpected booking/,
  );
  assert.throws(
    () =>
      makePlan(
        [
          ...fixture(),
          {
            path: "propertyPayments/unrelated",
            data: { bookingId: other, cashierShiftId: "shift" },
          },
        ],
        [id],
      ),
    /mixes/,
  );
});
test("rerun against cleaned state is empty", () => {
  const d = fixture(),
    p = makePlan(d, [id]);
  const after = d
    .filter((v) => !p.deletes.includes(v.path))
    .map((v) => ({
      ...v,
      data: { ...v.data, ...p.repairs.find((r) => r.path === v.path)?.patch },
    }));
  const again = makePlan(after, [id]);
  assert.equal(again.deletes.length, 0);
  assert.equal(again.repairs.length, 0);
});
