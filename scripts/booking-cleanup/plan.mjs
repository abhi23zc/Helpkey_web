export const targetIds = [
  "557575cc85ce811c9c1e05904297363055f0221cd5036c9b084016c67819dcda",
  "56a913fff244a692cfbb41f4316e2790b036b4edff5f26fca8053547873e4759",
  "75700ec2ea5ab6f53a45ce92fb0ff577050da7e2a70e5461274260668ed15bfe",
  "924b4d3525f717d5555a3d017561ef0e308151c5cdb4e3424e90ad1ecc8cf7ed",
  "ec9cd70c5fa766818c9ed54ddeef589df509dd4aa63054f9de560455fe570c3d",
  "f39a9484bddd66e53ea1d50c0487a4b139dc2c2cd9d2818ea54d488e36be5a0e",
];
export function mentions(value, ids) {
  if (typeof value === "string")
    return [...ids].some(
      (id) => value === id || (id.length >= 32 && value.includes(id)),
    );
  if (Array.isArray(value)) return value.some((v) => mentions(v, ids));
  if (value && typeof value === "object" && !value.toDate && !value.path)
    return Object.entries(value).some(
      ([k, v]) => ids.has(k) || mentions(v, ids),
    );
  return false;
}
const dedicated = new Set([
  "bookings",
  "bookingFinanceAgreementsV1",
  "bookingReferences",
  "bookingSubmissionClosures",
  "inventoryHolds",
  "paymentAttempts",
  "propertyPayments",
  "refunds",
  "hotelAccountingStateV1",
  "hotelAccountingJournalV1",
  "hotelAccountingRequestsV1",
  "hotelPayoutsV1",
  "hotelPayoutAssessmentsV1",
  "hotelPayoutReservationsV1",
  "hotelPayoutRequestsV1",
  "hotelDuesPaymentsV1",
  "hotelDuesCorrectionsV1",
  "hotelDuesReferencesV1",
  "hotelDuesConfirmationsV1",
  "hotelDuesRequestsV1",
  "bookingNotificationOutbox",
  "notifications",
  "projectionJobs",
  "projectionOutbox",
  "idempotencyKeys",
  "stayQuoteOrders",
  "invoices",
  "cashierShiftRequests",
  "cashierActiveShifts",
  "dailyClosings",
  "dailyClosingRequests",
]);
export function makePlan(documents, targets = targetIds) {
  const ids = new Set(targets),
    rows = new Map(documents.map((d) => [d.path, d]));
  const current = documents.filter((d) => /^bookings\/[^/]+$/.test(d.path));
  if (current.some((d) => !ids.has(d.path.split("/")[1])))
    throw Error(
      "Unexpected booking outside approved target set; refresh scope before cleanup.",
    );
  const properties = new Set(current.map((d) => d.data.propertyId));
  for (const d of documents)
    if (
      d.path.startsWith("inventoryHolds/") &&
      properties.has(d.data.propertyId) &&
      ["held", "committed"].includes(d.data.status) &&
      !ids.has(d.path.split("/")[1]) &&
      !mentions(d.data, ids)
    )
      throw Error("Unrelated active hold; cannot reset inventory: " + d.path);
  const selected = new Set();
  // Select source records directly, then receipts/jobs referring to selected sources.
  const linked = new Set(ids);
  for (let round = 0; round < 4; round++)
    for (const d of documents) {
      const parts = d.path.split("/"),
        root = parts[0];
      if (
        !dedicated.has(root) &&
        !(root === "properties" && parts[2] === "guestProfiles") &&
        !(root === "physicalUnits" && parts[2] === "events")
      )
        continue;
      const nested =
        (root === "bookings" || root === "bookingFinanceAgreementsV1") &&
        ids.has(parts[1]);
      const related =
        nested ||
        mentions(d.path, linked) ||
        mentions(d.data, linked) ||
        (root === "hotelAccountingRequestsV1" &&
          properties.has(d.data.propertyId));
      if (related) {
        selected.add(d.path);
        if (parts.length === 2) linked.add(parts[1]);
      }
    }
  const shiftIds = new Set();
  for (const d of documents.filter((d) =>
    d.path.startsWith("cashierShifts/"),
  )) {
    const sourceRows = documents.filter(
      (p) =>
        p.path.startsWith("propertyPayments/") &&
        mentions(p.data, new Set([d.path.split("/")[1]])),
    );
    if (sourceRows.some((p) => selected.has(p.path)) || mentions(d.data, ids)) {
      if (sourceRows.some((p) => !selected.has(p.path)))
        throw Error(
          "Shift mixes approved and unrelated payment sources: " + d.path,
        );
      selected.add(d.path);
      shiftIds.add(d.path.split("/")[1]);
    }
  }
  for (const d of documents) {
    const root = d.path.split("/")[0];
    if (
      [
        "cashierShiftRequests",
        "cashierActiveShifts",
        "dailyClosings",
        "dailyClosingRequests",
      ].includes(root) &&
      mentions(d.data, shiftIds)
    )
      selected.add(d.path);
  }
  // Include descendants, never a whole property or physical room.
  for (const d of documents)
    if ([...selected].some((p) => d.path.startsWith(p + "/")))
      selected.add(d.path);
  const repairs = [];
  for (const d of documents) {
    const root = d.path.split("/")[0];
    if (
      root === "hotelClosingState" &&
      properties.has(d.data.propertyId) &&
      !documents.some(
        (v) =>
          /^cashierShifts\/[^/]+$/.test(v.path) &&
          v.data.propertyId === d.data.propertyId &&
          !selected.has(v.path),
      )
    ) {
      selected.add(d.path);
      continue;
    }
    if (!properties.has(d.data.propertyId)) continue;
    if (
      root === "inventoryCalendars" &&
      Object.values(d.data.reserved ?? {}).some((v) => v !== 0)
    )
      repairs.push({ path: d.path, patch: { reserved: {} } });
    if (root === "roomNightInventory" && d.data.reserved !== 0)
      repairs.push({ path: d.path, patch: { reserved: 0 } });
    if (root === "physicalUnitCalendars") {
      const slots = Object.fromEntries(
        Object.entries(d.data.slots ?? {}).filter(([, v]) => !ids.has(v)),
      );
      if (Object.keys(slots).length !== Object.keys(d.data.slots ?? {}).length)
        repairs.push({ path: d.path, patch: { slots } });
    }
  }
  const deletes = [...selected].sort(
    (a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b),
  );
  for (const path of deletes)
    if (
      ["properties", "physicalUnits"].includes(path.split("/")[0]) &&
      path.split("/").length === 2
    )
      throw Error("Attempted shared entity deletion");
  return {
    deletes,
    repairs,
    properties: [...properties],
    shiftIds: [...shiftIds],
    preservedCandidates: documents
      .filter(
        (d) =>
          !selected.has(d.path) &&
          [
            "hotelAccountingRequestsV1",
            "bookingSubmissionClosures",
            "cashierShifts",
          ].includes(d.path.split("/")[0]),
      )
      .map((d) => d.path),
    missingTargets: targets.filter((id) => !rows.has("bookings/" + id)),
  };
}
