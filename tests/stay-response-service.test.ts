import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), update: vi.fn(), set: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/partner/service", () => ({ propertyOwner: mock.owner, requireRole: vi.fn() }));
vi.mock("@/lib/stay/notifications", () => ({ enqueueStayNotification: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => {
  const snapshot = (path: string) => ({ id: path.split("/").at(-1)!, exists: mock.records.has(path), data: () => mock.records.get(path), get: (field: string) => mock.records.get(path)?.[field] });
  const collection = (path: string): { path: string; doc: (id?: string) => unknown } => ({ path, doc: (id = "new") => ({ id, path: `${path}/${id}`, collection: (name: string) => collection(`${path}/${id}/${name}`) }) });
  return { adminDb: { collection, runTransaction: async (fn: (tx: unknown) => unknown) => fn({ get: async (ref: { path: string }) => mock.records.has(ref.path) ? snapshot(ref.path) : { ...snapshot(ref.path), docs: [...mock.records.keys()].filter(path => path.startsWith(`${ref.path}/`) && path.split("/").length === ref.path.split("/").length + 1).map(snapshot) }, set: mock.set, update: mock.update, create: vi.fn() }) } };
});
import { saveOffering, savePreCheckin } from "@/lib/stay/service";
import { selectedRequests } from "@/lib/stay/domain";
import type { Offering } from "@/lib/stay/contracts";
const now = Date.parse("2027-01-01T00:00Z"), startAt = "2027-01-03T00:00:00Z", endAt = "2027-01-05T00:00:00Z";
const offering: Offering = { id: "notes", propertyId: "hotel", version: 1, name: "Room instructions", description: "Tell the hotel your preference", kind: "preference", travelerCategories: [], roomTypeIds: [], bookingModes: ["overnight"], unitPricePaise: 0, variants: [], maxQuantity: 1, advanceNoticeMinutes: 0, confirmation: "approval", formType: "text", responseConfig: { responseType: "text", quantityEnabled: false }, status: "active" };
const raw = { revision: 0, expectedArrivalLocal: null, notes: "", travelerPreferences: [], selections: [{ offeringId: "notes", variantId: null, quantity: 1, inputs: { note: "Please use lavender" } }], submit: false, guestsReviewed: false };
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now); mock.records.clear();
  const saved = selectedRequests([offering], [{ ...raw.selections[0], inputs: { note: "Please use rose" } }], "room", "overnight", startAt, null, now);
  mock.records.set("properties/hotel", { status: "active" });
  mock.records.set("propertyMemberships/hotel_owner", { status: "active", role: "owner" });
  mock.records.set("properties/hotel/stayCustomizations/notes", { ...offering, noteRequired: false });
  mock.records.set("bookings/booking", { guestId: "guest", propertyId: "hotel", bookingStatus: "confirmed", startAt, endAt, roomType: { id: "room" }, bookingMode: "overnight", nights: 2, adults: 1, customizations: saved, stayRevision: 0 });
});
afterEach(() => vi.restoreAllMocks());
it("persists changed inputs when quantity stays the same, using snapshotted rules", async () => {
  await savePreCheckin("guest", "booking", raw);
  expect(mock.update.mock.calls[0][1].customizations[0]).toMatchObject({ inputs: { note: "Please use lavender" }, quantity: 1, status: "requested", response: null });
});
it("keeps required text validation after the catalog changes", async () => {
  mock.records.set("properties/hotel/stayCustomizations/notes", { ...offering, responseConfig: { responseType: "yes_no", quantityEnabled: false } });
  await expect(savePreCheckin("guest", "booking", { ...raw, selections: [{ ...raw.selections[0], inputs: {} }] })).rejects.toThrow("Provide");
  expect(mock.update).not.toHaveBeenCalled();
});
it("does not permit edited inputs after preparation starts", async () => {
  const booking = mock.records.get("bookings/booking")!;
  (booking.customizations as Record<string, unknown>[])[0].preparationStarted = true;
  await expect(savePreCheckin("guest", "booking", raw)).rejects.toThrow("can no longer be changed");
});
it("saves independent paid preferences and checks ownership and version", async () => {
  const { id, version } = offering;
  const input = Object.fromEntries(Object.entries(offering).filter(([key]) => !["id", "propertyId", "version"].includes(key)));
  await saveOffering("owner", "hotel", { id, version, offering: { ...input, unitPricePaise: 70050 } });
  expect(mock.set.mock.calls[0][1]).toMatchObject({ unitPricePaise: 70050, responseConfig: input.responseConfig, version: 2 });
  await expect(saveOffering("owner", "hotel", { id, version: 0, offering: input })).rejects.toThrow("CONFLICT");
  mock.owner.mockRejectedValueOnce(new Error("FORBIDDEN"));
  await expect(saveOffering("owner", "hotel", { id, version, offering: input })).rejects.toThrow("FORBIDDEN");
});
it("rejects an older editor dropping explicit response configuration", async () => {
  const { id, version } = offering;
  const input = Object.fromEntries(Object.entries(offering).filter(([key]) => !["id", "propertyId", "version", "responseConfig"].includes(key)));
  await expect(saveOffering("owner", "hotel", { id, version, offering: input })).rejects.toThrow("Refresh the editor");
});

import { patchArrival } from "@/lib/stay/service";
import { patchRequestSelection } from "@/lib/stay/selection-update";
const arrivalOnly = { revision: 0, arrivalChoice: "unknown", expectedArrivalLocal: null, notes: "Train", submit: true, guestsReviewed: true };
it("submits unknown arrival with confirmation timestamps without touching requests or preferences", async () => {
  await patchArrival("guest", "booking", arrivalOnly);
  const update = mock.update.mock.calls[0][1];
  expect(update.preCheckin).toMatchObject({ status: "submitted", arrivalChoice: "unknown", expectedArrivalAt: null, submittedAt: new Date(now).toISOString(), guestsConfirmedAt: new Date(now).toISOString() });
  expect(update).not.toHaveProperty("customizations");
  expect(update).not.toHaveProperty("travelerPreferences");
});
it("keeps a submitted arrival intact while saving an update draft", async () => {
  const b = mock.records.get("bookings/booking")!;
  b.preCheckin = { status: "submitted", arrivalChoice: "time", expectedArrivalAt: "2027-01-03T02:00:00Z", submittedAt: "old", notes: "Confirmed note" };
  await patchArrival("guest", "booking", { ...arrivalOnly, submit: false, guestsReviewed: false });
  expect(mock.update.mock.calls[0][1].preCheckin).toMatchObject({ status: "submitted", expectedArrivalAt: "2027-01-03T02:00:00Z", submittedAt: "old", notes: "Confirmed note", draft: { arrivalChoice: "unknown", notes: "Train" } });
});
it("requires explicit arrival choice and guest confirmation, including old bookings", async () => {
  await expect(patchArrival("guest", "booking", { ...arrivalOnly, arrivalChoice: null })).rejects.toThrow("Choose your arrival plan");
  await expect(patchArrival("guest", "booking", { ...arrivalOnly, guestsReviewed: false })).rejects.toThrow("confirm");
  await expect(patchArrival("guest", "booking", { ...arrivalOnly, selections: [] })).rejects.toThrow();
  expect(mock.update).not.toHaveBeenCalled();
});
it("validates local dates, past times and booked departure for hourly arrivals", async () => {
  const b = mock.records.get("bookings/booking")!;
  b.timezone = "Asia/Kolkata"; b.bookingMode = "hourly"; b.startAt = "2027-01-03T08:30:00Z"; b.endAt = "2027-01-03T14:30:00Z";
  for (const value of ["2026-12-31T14:00", "2027-02-30T14:00", "2027-01-03T20:00", "2027-01-02T14:00"]) {
    await expect(patchArrival("guest", "booking", { ...arrivalOnly, arrivalChoice: "time", expectedArrivalLocal: value })).rejects.toThrow();
  }
  await patchArrival("guest", "booking", { ...arrivalOnly, arrivalChoice: "time", expectedArrivalLocal: "2027-01-03T15:00" });
  expect(mock.update.mock.calls[0][1].preCheckin.expectedArrivalAt).toBe("2027-01-03T09:30:00.000Z");
});
it("rejects stale or unauthorized arrival writes", async () => {
  await expect(patchArrival("other", "booking", arrivalOnly)).rejects.toThrow("NOT_FOUND");
  await expect(patchArrival("guest", "booking", { ...arrivalOnly, revision: 1 })).rejects.toThrow("CONFLICT");
});
it("edits one request using agreed rules without touching pre-check-in or other requests", async () => {
  const b = mock.records.get("bookings/booking")!, requests = b.customizations as import("@/lib/stay/contracts").StayRequest[];
  requests.push({ ...requests[0], id: "unrelated", offeringId: "other", quantity: 2 });
  await patchRequestSelection("guest", "booking", { revision: 0, requestId: requests[0].id, selection: raw.selections[0] });
  const update = mock.update.mock.calls[0][1];
  expect(update.customizations[0].inputs.note).toBe("Please use lavender");
  expect(update.customizations[1]).toEqual(requests[1]);
  expect(update).not.toHaveProperty("preCheckin");
  expect(update).not.toHaveProperty("travelerPreferences");
});
it("preserves paid, quoted, declined and preparation-locked protections", async () => {
  const b = mock.records.get("bookings/booking")!, request = (b.customizations as Record<string, unknown>[])[0];
  for (const protection of [{ unitPricePaise: 10 }, { quote: { version: 1 } }, { status: "declined" }, { preparationStarted: true }, { settlement: "paid" }]) {
    const original = { ...request }; Object.assign(request, protection);
    await expect(patchRequestSelection("guest", "booking", { revision: 0, requestId: request.id, selection: null })).rejects.toThrow("locked");
    Object.keys(request).forEach(k => delete request[k]); Object.assign(request, original);
  }
  expect(mock.update).not.toHaveBeenCalled();
});
it("supports legacy requests without saved rules and removes only the target", async () => {
  const b = mock.records.get("bookings/booking")!, request = (b.customizations as Record<string, unknown>[])[0];
  delete request.requestRules;
  await patchRequestSelection("guest", "booking", { revision: 0, requestId: request.id, selection: raw.selections[0] });
  expect(mock.update.mock.calls[0][1].customizations[0].inputs.note).toBe("Please use lavender");
  await patchRequestSelection("guest", "booking", { revision: 0, requestId: request.id, selection: null });
  expect(mock.update.mock.calls[1][1].customizations[0].status).toBe("cancelled");
});
it("checks current availability on option switches and never reprices a free request", async () => {
  const b = mock.records.get("bookings/booking")!, request = (b.customizations as Record<string, unknown>[])[0];
  const selection = { ...raw.selections[0], variantId: "rose" };
  mock.records.set("properties/hotel/stayCustomizations/notes", { ...offering, formType: "choice", responseConfig: { responseType: "single", quantityEnabled: false }, variants: [{ id: "rose", name: "Rose", unitPricePaise: 500 }] });
  await expect(patchRequestSelection("guest", "booking", { revision: 0, requestId: request.id, selection })).rejects.toThrow("unavailable");
  mock.records.set("properties/hotel/stayCustomizations/notes", { ...offering, formType: "choice", responseConfig: { responseType: "single", quantityEnabled: false }, variants: [{ id: "rose", name: "Rose", unitPricePaise: 0 }] });
  await patchRequestSelection("guest", "booking", { revision: 0, requestId: request.id, selection });
  expect(mock.update.mock.calls[0][1].customizations[0]).toMatchObject({ variantName: "Rose", unitPricePaise: 0 });
});
