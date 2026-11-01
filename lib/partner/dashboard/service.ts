import { liveAttention } from "./ux";
import { rangeDays } from "@/lib/partner/date-range";
import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";
import { localParts, resolveLocal } from "@/lib/booking/domain";
import { intervalReport } from "@/lib/booking/reporting";
import { reviewSummary } from "@/lib/reviews";
import {
  addDays,
  amount,
  bookingStart,
  financialSeries,
  instant,
  liveProperty,
  operationMatches,
  readiness,
  reportBuckets,
  selectedBuckets,
  type Range,
  type RecordData,
} from "./domain";

const rows = (snap: FirebaseFirestore.QuerySnapshot): RecordData[] =>
  snap.docs.map((d) => ({ ...d.data(), id: d.id }));
export async function loadOverview(
  uid: string,
  input: {
    propertyId: string;
    date: string;
    range: Range;
    from?: string;
    to?: string;
  },
  now = Date.now(),
) {
  const ref = await propertyOwner(uid, input.propertyId);
  const property = (await ref.get()).data();
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
  const timezone = property.timezone || "Asia/Kolkata";
  const rangeEnd = input.to || input.date;
  const buckets =
    input.from && input.to
      ? selectedBuckets(input.from, input.to, input.range)
      : reportBuckets(input.date, input.range);
  const operationDays =
    input.from && input.to ? rangeDays(input.from, input.to) : [input.date];
  const start = Timestamp.fromMillis(
    resolveLocal(buckets[0].start, "00:00", timezone),
  );
  const end = Timestamp.fromMillis(
    resolveLocal(addDays(rangeEnd, 1), "00:00", timezone),
  );
  const scoped = (collection: string) =>
    adminDb.collection(collection).where("propertyId", "==", input.propertyId);
  let upcomingQuery = scoped("bookings")
    .where(
      "checkIn",
      ">=",
      input.from
        ? input.from > localParts(now, timezone).date
          ? input.from
          : localParts(now, timezone).date
        : input.date,
    )
    .where("bookingStatus", "in", ["confirmed", "checked_in"])
    .orderBy("checkIn");
  if (input.from)
    upcomingQuery = upcomingQuery.where("checkIn", "<=", rangeEnd);
  const [
    created,
    paid,
    overlaps,
    active,
    upcoming,
    roomsSnap,
    ratesSnap,
    mediaSnap,
    documentsSnap,
    refundsSnap,
    attemptsSnap,
    ledgerSnap,
  ] = await Promise.all([
    scoped("bookings")
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .get(),
    scoped("bookings")
      .where("paidAt", ">=", start)
      .where("paidAt", "<", end)
      .get(),
    scoped("bookings")
      .where("checkIn", "<=", rangeEnd)
      .where("checkOut", ">=", buckets[0].start)
      .get(),
    scoped("bookings")
      .where("bookingStatus", "in", ["confirmed", "checked_in"])
      .where("checkIn", "<=", localParts(now, timezone).date)
      .get(),
    upcomingQuery.limit(6).get(),
    scoped("roomTypes").get(),
    scoped("ratePlans").get(),
    scoped("mediaAssets").get(),
    scoped("verificationDocuments").get(),
    scoped("refunds")
      .where("processedAt", ">=", start)
      .where("processedAt", "<", end)
      .get(),
    scoped("paymentAttempts")
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .get(),
    scoped("propertyPayments")
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .get(),
  ]);
  const bookings = [
    ...new Map(
      [
        ...rows(created),
        ...rows(paid),
        ...rows(overlaps),
        ...rows(active),
        ...rows(upcoming),
      ].map((b) => [b.id, b]),
    ).values(),
  ];
  // Original historical attempts predate propertyId. Query only relevant booking identities,
  // preserving actual capture times and deduplicating against newer property-scoped attempts.
  const attempts = rows(attemptsSnap);
  const ids = bookings.map((b) => b.id);
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await adminDb
      .collection("paymentAttempts")
      .where("bookingId", "in", ids.slice(i, i + 30))
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .get();
    attempts.push(...rows(snap));
  }
  const uniqueAttempts = [...new Map(attempts.map((p) => [p.id, p])).values()];
  const rooms = rows(roomsSnap),
    rates = rows(ratesSnap);
  const activeRooms = rooms.filter((r) => r.status === "active");
  const capacity = activeRooms.reduce(
    (sum, r) => sum + amount(r.totalInventory),
    0,
  );
  const series = financialSeries(
    buckets,
    bookings,
    uniqueAttempts,
    rows(refundsSnap),
    timezone,
    rows(ledgerSnap),
  ).map((bucket) => ({
    ...bucket,
    ...intervalReport(
      bookings as Parameters<typeof intervalReport>[0],
      bucket.start,
      addDays(bucket.end, 1),
      timezone,
      capacity,
    ),
  }));
  const matches = (view: string) =>
    bookings.filter((b) =>
      operationDays.some((day) =>
        operationMatches(b, view, day, timezone, now),
      ),
    );
  const arrivals = matches("arrivals"),
    departures = matches("departures"),
    requests = matches("requests"),
    overdue = matches("overdue"),
    inHouse = matches("in_house"),
    balances = matches("balances");
  const days =
    input.from && input.to
      ? operationDays
      : Array.from({ length: 7 }, (_, i) => addDays(input.date, i));
  const inventoryRefs = activeRooms.flatMap((r) =>
    days.map((day) =>
      adminDb
        .collection(
          property.inventoryEngine === "interval_v1"
            ? "inventoryCalendars"
            : "roomNightInventory",
        )
        .doc(`${input.propertyId}_${r.id}_${day}`),
    ),
  );
  const calendars = inventoryRefs.length
    ? await adminDb.getAll(...inventoryRefs)
    : [];
  const availability = days.map((date) => {
    let reserved = 0,
      blocked = 0,
      remaining = 0;
    activeRooms.forEach((room, roomIndex) => {
      const data =
        calendars[roomIndex * days.length + days.indexOf(date)]?.data() ?? {};
      const total = amount(room.totalInventory);
      if (property.inventoryEngine === "interval_v1") {
        const keys = new Set([
          ...Object.keys(data.reserved ?? {}),
          ...Object.keys(data.blocked ?? {}),
        ]);
        const occupied = Math.max(
          0,
          ...[...keys].map(
            (k) => amount(data.reserved?.[k]) + amount(data.blocked?.[k]),
          ),
        );
        reserved += Math.max(
          0,
          ...Object.values(data.reserved ?? {}).map(amount),
        );
        blocked += data.stopSell
          ? total
          : Math.max(0, ...Object.values(data.blocked ?? {}).map(amount));
        remaining += data.stopSell ? 0 : Math.max(0, total - occupied);
      } else {
        reserved += amount(data.reserved);
        blocked += amount(data.blocked);
        remaining += data.stopSell
          ? 0
          : Math.max(0, total - amount(data.reserved) - amount(data.blocked));
      }
    });
    return {
      date,
      total: capacity,
      reserved,
      blocked,
      remaining,
      percentage: capacity ? Math.round((remaining / capacity) * 100) : 0,
    };
  });
  const checks = readiness(
    property,
    rooms,
    rates,
    rows(mediaSnap),
    rows(documentsSnap),
  );
  const warnings: string[] = [];
  let latestReview: {
    reviewerName: string;
    rating: number;
    text: string;
    submittedAt: string | null;
  } | null = null;
  let unansweredReviews: number | null = null;
  try {
    const reviews = rows(
      await scoped("propertyReviews").where("status", "==", "approved").get(),
    );
    unansweredReviews = reviews.filter((r) => !r.partnerReply?.text).length;
    const latest = reviews.sort(
      (a, b) => (instant(b.submittedAt) ?? 0) - (instant(a.submittedAt) ?? 0),
    )[0];
    if (latest)
      latestReview = {
        reviewerName: latest.reviewerName || "Helpkey guest",
        rating: amount(latest.rating),
        text: latest.text || "",
        submittedAt:
          instant(latest.submittedAt) === null
            ? null
            : new Date(instant(latest.submittedAt)!).toISOString(),
      };
  } catch {
    warnings.push("Recent reviews are temporarily unavailable.");
  }
  const summary = (b: RecordData) => ({
    id: String(b.id),
    confirmationCode: String(b.confirmationCode || b.id),
    guestName: String(b.leadGuest?.name || "Guest"),
    roomName: String(b.roomType?.name || "Room"),
    checkIn: String(b.checkIn),
    checkOut: String(b.checkOut),
    nights: amount(b.nights),
    bookingMode: String(b.bookingMode || "overnight"),
    startAt: b.startAt as string | undefined,
    endAt: b.endAt as string | undefined,
    paymentStatus: String(b.paymentStatus || "pending"),
    bookingStatus: String(b.bookingStatus),
    balanceDuePaise: amount(b.balanceDuePaise),
    preCheckinSubmitted: b.preCheckin?.status === "submitted",
    specialRequest:
      typeof b.specialRequest === "string" ? b.specialRequest : null,
  });
  const dayReport = intervalReport(
    bookings as Parameters<typeof intervalReport>[0],
    input.from ? buckets[0].start : input.date,
    addDays(rangeEnd, 1),
    timezone,
    capacity,
  );
  const totals = {
    bookedPaise: 0,
    paidPaise: 0,
    refundedPaise: 0,
    netPaise: 0,
    propertyCollectedPaise: 0,
    serviceCollectedPaise: 0,
    bookingCount: 0,
  };
  for (const point of series)
    for (const key of Object.keys(totals) as (keyof typeof totals)[])
      totals[key] += point[key];
  const href = (path: string, extra: Record<string, string> = {}) =>
    `${path}?${new URLSearchParams({ propertyId: input.propertyId, date: rangeEnd, ...(path === "/partner/reservations" && input.from ? { scope: "range", from: input.from, to: rangeEnd } : path === "/partner/rooms" && input.from ? { calendarStart: input.from, calendarEnd: rangeEnd } : {}), ...extra })}`;
  const overdueDepartures = bookings.filter(
    (b) =>
      b.bookingStatus === "checked_in" &&
      (instant(b.endAt) ?? resolveLocal(b.checkOut, "11:00", timezone)) < now,
  );
  const today = localParts(now, timezone).date;
  const live = liveAttention(rows(active), today, timezone, now);
  const liveHref = (view: string) =>
    `/partner/reservations?${new URLSearchParams({ propertyId: input.propertyId, date: today, view, scope: view === "requests" ? "day" : "all", dateBasis: "stay" })}`;
  const alerts = [
    ...(live.overdueDepartures.length
      ? [
          {
            type: "overdue_departures",
            title: "Overdue departures · now",
            detail: `${live.overdueDepartures.length} reservations need checkout review`,
            href: liveHref("overdue_departures"),
          },
        ]
      : []),
    ...(live.overdue.length
      ? [
          {
            type: "overdue",
            title: "Overdue arrivals · now",
            detail: `${live.overdue.length} confirmed reservations past arrival time`,
            href: liveHref("overdue"),
          },
        ]
      : []),
    ...(live.requests.length
      ? [
          {
            type: "requests",
            title: "Guest requests · now",
            detail: `${live.requests.length} current-stay reservations require hotel action`,
            href: liveHref("requests"),
          },
        ]
      : []),
    ...availability
      .filter((d) => d.total > 0 && d.percentage <= 20)
      .slice(0, 2)
      .map((d) => ({
        type: "availability",
        title: "Low availability",
        detail: `${d.remaining} rooms left · ${d.date}`,
        href: href("/partner/rooms", {
          calendarStart: d.date,
          calendarEnd: d.date,
          date: d.date,
        }),
      })),
    ...(unansweredReviews
      ? [
          {
            type: "reviews",
            title: "Reviews awaiting reply · now",
            detail: `${unansweredReviews} approved reviews`,
            href: href("/partner/reviews"),
          },
        ]
      : []),
    ...checks.checks
      .filter((c) => !c.complete)
      .slice(0, 3)
      .map((c) => ({
        type: "listing",
        title: "Listing needs attention · now",
        detail: c.label,
        href: href(c.href),
      })),
  ];
  return {
    attention: {
      asOf: new Date(now).toISOString(),
      today,
      uniqueReservationCount: live.uniqueReservationCount,
      overdueArrivals: live.overdue.length,
      overdueDepartures: live.overdueDepartures.length,
      requestStays: live.requests.length,
      operations: {
        overdue: live.overdue.map(summary),
        overdue_departures: live.overdueDepartures.map(summary),
        requests: live.requests.map(summary),
      },
    },
    generatedAt: new Date(now).toISOString(),
    timezone,
    today: localParts(now, timezone).date,
    period: { start: buckets[0].start, end: rangeEnd },
    warnings,
    property: {
      name: property.name || "Property",
      status: property.status || "draft",
      approvalStatus: property.approvalStatus || "not_submitted",
      isLive: liveProperty(property),
      isBookable: property.isBookable === true,
      rejectionReason: property.rejectionReason || null,
    },
    readiness: checks,
    currency: property.currency || "INR",
    metrics: {
      ...totals,
      ...dayReport,
      arrivals: arrivals.length,
      expectedArrivals: arrivals.filter((b) => b.bookingStatus === "confirmed")
        .length,
      completedArrivals: arrivals.filter((b) => b.bookingStatus !== "confirmed")
        .length,
      departures: departures.length,
      expectedDepartures: departures.filter((b) =>
        ["confirmed", "checked_in"].includes(b.bookingStatus),
      ).length,
      completedDepartures: departures.filter((b) =>
        ["checked_out", "completed"].includes(b.bookingStatus),
      ).length,
      stayingTonight: inHouse.length,
      pendingRequests: requests.length,
      noShowRisk: overdue.length,
      outstandingPaise: balances.reduce(
        (s, b) => s + amount(b.balanceDuePaise),
        0,
      ),
      cancellationCount: bookings.filter(
        (b) =>
          ["cancelled", "no_show"].includes(b.bookingStatus) &&
          instant(b.createdAt)! >= start.toMillis() &&
          instant(b.createdAt)! < end.toMillis(),
      ).length,
      unansweredReviews,
      platformCollectedPaise: totals.paidPaise - totals.propertyCollectedPaise,
    },
    series,
    availability,
    upcomingReservations: rows(upcoming)
      .filter((b) => !input.from || bookingStart(b, timezone) > now)
      .map(summary),
    operations: {
      arrivals: arrivals.map(summary),
      departures: departures.map(summary),
      in_house: inHouse.map(summary),
      requests: requests.map(summary),
      overdue: overdue.map(summary),
      balances: balances.map(summary),
      overdue_departures: overdueDepartures.map(summary),
    },
    review: {
      summary: reviewSummary(property.reviewSummary) ?? {
        count: 0,
        average: 0,
      },
      latest: latestReview,
    },
    alerts,
  };
}
