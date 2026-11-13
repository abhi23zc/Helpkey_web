import { rangeDays, validPageRange } from "@/lib/partner/date-range";
import "server-only";
import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";
import { serializeBooking } from "@/lib/bookings";
import { localParts } from "@/lib/booking/domain";
import { matchesView, reservationFilters, type Filters, views } from "./domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";

import { authorize, features } from "./access";
export async function listReservations(
  uid: string,
  raw: Record<string, unknown>,
  exporting = false,
) {
  const f = reservationFilters.parse(raw);
  await authorize(uid, f.propertyId, undefined, exporting ? "guest.export" : "reservation.read");
  const property = (
    await adminDb.collection("properties").doc(f.propertyId).get()
  ).data();
  if (!property)
    throw new ApiException("NOT_FOUND", 404, "Property not found.");
  const timezone = property.timezone || "Asia/Kolkata",
    now = Date.now();
  if (!raw.scope && validPageRange(f.from, f.to)) f.scope = "range";
  if (["overdue", "overdue_departures"].includes(f.view) && !raw.scope)
    f.scope = "all";
  if (f.scope === "range" && !validPageRange(f.from, f.to)) throw new ApiException("INVALID_RANGE", 422, "Choose a date range of 1–31 days.");
  f.date ??= localParts(now, timezone).date;
  const collection = adminDb
    .collection("bookings")
    .where("propertyId", "==", f.propertyId);
  let exactId: string | null = null;
  if (f.q && !f.q.includes("/")) {
    const doc = await adminDb.collection("bookings").doc(f.q).get();
    if (doc.exists && doc.data()?.propertyId === f.propertyId) exactId = doc.id;
  }
  const queryFor = (filters: Filters) => {
    let query: FirebaseFirestore.Query = collection;
    if (filters.q && exactId)
      return query.where(FieldPath.documentId(), "==", exactId);
    if (filters.q)
      query = query.where(
        "searchTokens",
        "array-contains",
        filters.q.toLowerCase(),
      );
    if (filters.roomTypeId)
      query = query.where("roomType.id", "==", filters.roomTypeId);
    if (filters.paymentStatus !== "all")
      query = query.where("paymentStatus", "==", filters.paymentStatus);
    if (filters.bookingMode === "hourly")
      query = query.where("bookingMode", "==", "hourly");
    const from = filters.scope === "day" ? filters.date! : filters.from;
    const to = filters.scope === "day" ? filters.date! : filters.to;
    if (filters.scope !== "all") {
      if (filters.dateBasis === "arrival")
        query = query.where("checkIn", ">=", from).where("checkIn", "<=", to);
      else if (filters.dateBasis === "departure")
        query = query.where("checkOut", ">=", from).where("checkOut", "<=", to);
      else
        query = query.where("checkIn", "<=", to).where("checkOut", ">=", from);
    }
    // Equality index plus bounded date query avoids downloading a property's history.
    const v = filters.view;
    if (["requests", "balances"].includes(v))
      query = query.where("bookingStatus", "in", ["confirmed", "checked_in"]);
    else if (v === "overdue")
      query = query.where("bookingStatus", "==", "confirmed");
    else if (["in_house", "overdue_departures"].includes(v))
      query = query.where("bookingStatus", "==", "checked_in");
    else if (["pending_payment", "cancelled", "no_show"].includes(v))
      query = query.where("bookingStatus", "==", v);
    else if (filters.status !== "all")
      query =
        filters.status === "checked_out"
          ? query.where("bookingStatus", "in", ["checked_out", "completed"])
          : query.where("bookingStatus", "==", filters.status);
    if (v === "upcoming") query = query.where("checkIn", ">=", filters.scope === "range" ? filters.from : filters.date);
    if (v === "arrivals") query = filters.scope === "range" ? query.where("checkIn", ">=", filters.from).where("checkIn", "<=", filters.to) : query.where("checkIn", "==", filters.date);
    // Keep the departure-date constraint as a closed range. An equality on
    // checkOut after ordering by checkIn produces a different cloud index plan,
    // even though both predicates select exactly the same YYYY-MM-DD date.
    if (v === "departures")
      query = query
        .where("checkOut", ">=", filters.scope === "range" ? filters.from : filters.date)
        .where("checkOut", "<=", filters.scope === "range" ? filters.to : filters.date);
    if (["overdue", "overdue_departures"].includes(v))
      query = query.where("checkIn", "<=", localParts(now, timezone).date);
    return query
      .orderBy("checkIn", "desc")
      .orderBy("checkOut", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  };
  const matchesDates = (b: RecordData, filters: Filters) => {
    if (filters.scope === "all") return true;
    const from = filters.scope === "day" ? filters.date! : filters.from!,
      to = filters.scope === "day" ? filters.date! : filters.to!;
    if (filters.dateBasis === "arrival")
      return b.checkIn >= from && b.checkIn <= to;
    if (filters.dateBasis === "departure")
      return b.checkOut >= from && b.checkOut <= to;
    return b.checkIn <= to && b.checkOut >= from;
  };
  const matches = (b: RecordData, filters: Filters) =>
    matchesDates(b, filters) &&
    (filters.scope === "range" ? rangeDays(filters.from!, filters.to!).some(day => matchesView(b, filters.view, day, timezone, now)) : matchesView(b, filters.view, filters.date!, timezone, now)) &&
    (filters.status === "all" ||
      b.bookingStatus === filters.status ||
      (filters.status === "checked_out" && b.bookingStatus === "completed")) &&
    (!filters.roomTypeId || b.roomType?.id === filters.roomTypeId) &&
    (filters.paymentStatus === "all" ||
      b.paymentStatus === filters.paymentStatus) &&
    (filters.bookingMode === "all" ||
      (b.bookingMode || "overnight") === filters.bookingMode);
  const needsPost = (filters: Filters) =>
    !!(filters.q && exactId) ||
    filters.bookingMode === "overnight" ||
    [
      "arrivals",
      "departures",
      "requests",
      "balances",
      "overdue",
      "overdue_departures",
      "upcoming",
      "in_house",
    ].includes(filters.view) ||
    (filters.status !== "all" && filters.view !== "all");
  const candidateCache = new Map<
    string,
    Promise<FirebaseFirestore.QueryDocumentSnapshot[]>
  >();
  const scan = async (filters: Filters) => {
    const cacheKey = JSON.stringify({
      q: filters.q,
      room: filters.roomTypeId,
      payment: filters.paymentStatus,
      mode: filters.bookingMode,
      scope: filters.scope,
      from: filters.from,
      to: filters.to,
      date: filters.date,
      dateBasis: filters.dateBasis,
      status: filters.status,
      view: ["requests", "balances"].includes(filters.view)
        ? "active"
        : filters.view,
    });
    if (!candidateCache.has(cacheKey))
      candidateCache.set(
        cacheKey,
        (async () => {
          const found: FirebaseFirestore.QueryDocumentSnapshot[] = [];
          let after: FirebaseFirestore.QueryDocumentSnapshot | undefined,
            examined = 0;
          for (;;) {
            let query = queryFor(filters).limit(500);
            if (after) query = query.startAfter(after);
            const page = await query.get();
            examined += page.size;
            if (examined > 10_000)
              throw new ApiException(
                "NARROW_DATE_RANGE",
                422,
                "Choose a smaller date range to filter or export more than 10,000 reservations.",
              );
            found.push(...page.docs);
            if (page.size < 500) break;
            after = page.docs.at(-1);
          }
          return found;
        })(),
      );
    return (await candidateCache.get(cacheKey)!).filter((doc) =>
      matches(doc.data(), filters),
    );
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...f, cursor: undefined, limit: undefined }))
    .digest("hex");
  const cursor = f.cursor ? decodeCursor(f.cursor) : null;
  if (cursor && cursor.values[0] !== fingerprint)
    throw new ApiException(
      "INVALID_CURSOR",
      422,
      "Filters changed. Start from the first page.",
    );
  const count = async (filters: Filters) =>
    needsPost(filters)
      ? (await scan(filters)).length
      : (await queryFor(filters).count().get()).data().count;
  const getRows = async () => {
    if (exporting || needsPost(f)) {
      const rows = await scan(f);
      const offset = cursor ? rows.findIndex((d) => d.id === cursor.id) + 1 : 0;
      if (cursor && !offset)
        throw new ApiException(
          "CURSOR_EXPIRED",
          409,
          "Reservations changed. Refresh the list.",
        );
      return {
        rows: exporting ? rows : rows.slice(offset, offset + f.limit),
        total: rows.length,
        more: !exporting && offset + f.limit < rows.length,
      };
    }
    let q = queryFor(f);
    if (cursor) q = q.startAfter(cursor.values[1], cursor.values[2], cursor.id);
    const [page, total] = await Promise.all([
      q.limit(f.limit + 1).get(),
      count(f),
    ]);
    return {
      rows: page.docs.slice(0, f.limit),
      total,
      more: page.size > f.limit,
    };
  };
  const result = await getRows(),
    last = result.rows.at(-1);
  if (exporting)
    return {
      bookings: result.rows.map((d) => serializeBooking(d.id, d.data())),
      timezone,
      date: f.date,
    };
  const base = { ...f, cursor: undefined };
  const daily = {
    ...base,
    q: "",
    scope: f.scope === "range" ? "range" as const : "day" as const,
    from: f.scope === "range" ? f.from : undefined,
    to: f.scope === "range" ? f.to : undefined,
    dateBasis: "stay" as const,
    status: "all" as const,
    roomTypeId: "",
    paymentStatus: "all" as const,
    bookingMode: "all" as const,
  };
  const tabEntries = await Promise.all(
    views.map(
      async (view) =>
        [
          view,
          view === f.view ? result.total : await count({ ...base, view }),
        ] as const,
    ),
  );
  const metricEntries = await Promise.all(
    ["arrivals", "departures", "in_house", "requests", "overdue"].map(
      async (view) =>
        [
          view,
          await count({
            ...daily,
            view: view as Filters["view"],
            ...(view === "overdue" ? { scope: "all" as const } : {}),
          }),
        ] as const,
    ),
  );
  const [rooms, rates] = await Promise.all([
    adminDb
      .collection("roomTypes")
      .where("propertyId", "==", f.propertyId)
      .get(),
    adminDb
      .collection("ratePlans")
      .where("propertyId", "==", f.propertyId)
      .get(),
  ]);
  return {
    bookings: result.rows.map((d) => serializeBooking(d.id, d.data())),
    totalCount: result.total,
    hasMore: result.more,
    nextCursor:
      result.more && last
        ? encodeCursor({
            id: last.id,
            values: [fingerprint, last.get("checkIn"), last.get("checkOut")],
          })
        : null,
    metrics: Object.fromEntries(metricEntries),
    tabCounts: Object.fromEntries(tabEntries),
    timezone,
    date: f.date,
    generatedAt: new Date(now).toISOString(),
    roomTypes: rooms.docs.map((d) => ({
      id: d.id,
      name: d.get("name"),
      status: d.get("status"),
    })),
    ratePlans: rates.docs.map((d) => ({
      id: d.id,
      name: d.get("name"),
      roomTypeId: d.get("roomTypeId"),
      bookingMode: d.get("bookingMode") || "overnight",
      status: d.get("status"),
    })),
    features: {
      ...features(),
      amendments:
        features().amendments && property.inventoryEngine === "interval_v1",
    },
  };
}
