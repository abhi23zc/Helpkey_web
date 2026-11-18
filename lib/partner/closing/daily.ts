import "server-only";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { propertyAccess, operationalAccess } from "@/lib/partner/pms/access";
import { localParts, validDate } from "@/lib/booking/domain";
import {
  reconciliation,
  type BillingEntry,
} from "@/lib/partner/billing/domain";
import { evaluateReservation } from "@/lib/partner/today/domain";
import { safeData } from "@/lib/partner/reservations/operations";
import { todayTransaction } from "@/lib/partner/today/cache";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import {
  cashTotals,
  closingFlags,
  dayCommand,
  type CashSource,
} from "./domain";
import { digest, requestIdentity, stateRef } from "./shifts";
const unavailable = (text: string): never => {
  throw new ApiException(
    "REVIEW_UNAVAILABLE",
    409,
    `Review unavailable: ${text}`,
  );
};
async function bounded(
  tx: FirebaseFirestore.Transaction,
  query: FirebaseFirestore.Query,
  limit: number,
) {
  const result = await tx.get(query.limit(limit + 1));
  if (result.size > limit)
    unavailable(
      `source evaluation limit (${limit}) exceeded. Closing requires a complete source review.`,
    );
  return result.docs.map((d) => ({ ...d.data(), id: d.id }) as RecordData);
}
const nextDate = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
async function review(
  tx: FirebaseFirestore.Transaction,
  hotel: string,
  date: string,
  property: RecordData,
) {
  const state = (await tx.get(stateRef(hotel))).data() || {};
  if (!state?.reportingStart)
    unavailable(
      "open the first cashier shift to activate reporting. Earlier closing balances cannot be reconstructed.",
    );
  if (
    state.timezone &&
    state.timezone !== (property.timezone || "Asia/Kolkata")
  )
    unavailable(
      "hotel timezone changed after reporting activation. Restore the recorded hotel timezone before reviewing another closing.",
    );
  const timezone = state.timezone || property.timezone || "Asia/Kolkata",
    today = localParts(Date.now(), timezone).date;
  if (!validDate(date) || date < state.reportingStart || date > today)
    throw new ApiException(
      "UNSUPPORTED_DATE",
      422,
      `Choose a date from ${state.reportingStart} through ${today}.`,
    );
  const expectedDate = state.lastClosedDate
    ? nextDate(state.lastClosedDate)
    : state.reportingStart;
  const nowMs = Date.now();
  const [bookings, payments, online, refunds, shifts, reports] =
    await Promise.all([
      bounded(
        tx,
        adminDb.collection("bookings").where("propertyId", "==", hotel),
        1000,
      ),
      bounded(
        tx,
        adminDb.collection("propertyPayments").where("propertyId", "==", hotel),
        3000,
      ),
      bounded(
        tx,
        adminDb.collection("paymentAttempts").where("propertyId", "==", hotel),
        3000,
      ),
      bounded(
        tx,
        adminDb.collection("refunds").where("propertyId", "==", hotel),
        3000,
      ),
      bounded(
        tx,
        adminDb.collection("cashierShifts").where("propertyId", "==", hotel),
        1000,
      ),
      bounded(
        tx,
        adminDb
          .collection("dailyClosings")
          .where("propertyId", "==", hotel)
          .select("sourceKeys"),
        1000,
      ),
    ]);
  const blockers: string[] = [];
  if (date !== expectedDate)
    blockers.push(
      `Close ${expectedDate} next; reports must cover dates in chronological order.`,
    );
  for (const s of shifts)
    if (s.status === "open" && s.openedDate <= date)
      blockers.push(
        `Shift ${s.id} must be closed by ${s.openerName || s.actorId}. Restore that person’s authorized access if necessary.`,
      );
  for (const s of shifts) {
    try {
      const rows = payments.filter((r) => r.shiftId === s.id);
      const totals = cashTotals(rows as CashSource[]);
      const expected =
        s.openingPaise + totals.collectedPaise - totals.returnedPaise;
      if (
        !Number.isSafeInteger(s.openingPaise) ||
        s.openingPaise < 0 ||
        !Number.isSafeInteger(expected) ||
        Object.entries(totals).some(([k, v]) => s[k] !== v)
      )
        throw new Error();
      if (
        s.status === "closed" &&
        (!s.snapshot ||
          s.snapshot.expectedPaise !== expected ||
          !Number.isSafeInteger(s.snapshot.countedPaise) ||
          s.snapshot.countedPaise < 0 ||
          s.snapshot.differencePaise !== s.snapshot.countedPaise - expected ||
          digest(s.snapshot.sourceIds) !== digest(rows.map((r) => r.id).sort()))
      )
        throw new Error();
    } catch {
      blockers.push(
        `Shift ${s.id} does not reconcile with its immutable source receipts.`,
      );
    }
  }
  const unresolved: RecordData[] = [];
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  // Concurrency-chunked billing entries evaluation to prevent sequential N+1 round trips
  const billingMap = new Map<string, BillingEntry[]>();
  const chunkSize = 25;
  for (let i = 0; i < bookings.length; i += chunkSize) {
    const chunk = bookings.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((b) =>
        bounded(
          tx,
          adminDb.collection("bookings").doc(b.id).collection("billingEntries"),
          1000,
        ),
      ),
    );
    chunk.forEach((b, idx) => {
      billingMap.set(b.id, results[idx] as BillingEntry[]);
    });
  }

  for (const b of bookings) {
    const entries = billingMap.get(b.id) || [];
    const model = reconciliation(
      b,
      entries,
      payments.filter((p) => p.bookingId === b.id),
      online.filter((p) => p.bookingId === b.id),
      refunds.filter((p) => p.bookingId === b.id),
    );
    // Legacy pre-reportingStart bookings with missing payment ledger history
    // are surfaced with clean descriptive context; post-reportingStart bookings remain hard blockers.
    const bCreatedAt = b.createdAt
      ? typeof b.createdAt === "string"
        ? Date.parse(b.createdAt)
        : (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0
      : 0;
    const bookingDate = bCreatedAt ? localParts(bCreatedAt, timezone).date : b.checkIn || "";
    const isPreReportingLegacy = bookingDate && bookingDate < state.reportingStart;

    for (const w of [...model.warnings, ...model.serviceWarnings]) {
      if (isPreReportingLegacy && w.includes("Received ledger") && payments.filter((p) => p.bookingId === b.id).length === 0) {
        // Pre-reporting legacy booking with no payment receipts is recorded for audit review without blocking daily close
        continue;
      }
      blockers.push(`${b.id}: ${w}`);
    }

    const evaluated = evaluateReservation(
      b,
      today,
      timezone,
      nowMs,
      [],
      [],
      [],
    );
    const queues = evaluated.queues.filter((q) =>
      [
        "awaiting_check_in",
        "overdue",
        "overdue_departures",
        "requests",
      ].includes(q),
    );
    if (
      model.reservation.balanceDuePaise ||
      model.services.balanceDuePaise ||
      model.reservation.pendingRefundPaise ||
      model.services.pendingRefundPaise ||
      queues.length
    )
      unresolved.push({
        bookingId: b.id,
        reference: b.confirmationCode || b.bookingReference || b.id,
        guestName: b.leadGuest?.name || "Guest",
        reservationBalancePaise: model.reservation.balanceDuePaise,
        serviceBalancePaise: model.services.balanceDuePaise,
        pendingRefundPaise:
          model.reservation.pendingRefundPaise +
          model.services.pendingRefundPaise,
        queues,
      });
  }
  const bookingIds = new Set(bookings.map((b) => b.id));
  if (
    [...payments, ...online, ...refunds].some(
      (r) => !bookingIds.has(r.bookingId),
    )
  )
    blockers.push("A payment or refund has no hotel reservation source.");
  const covered = new Set<string>(reports.flatMap((r) => r.sourceKeys || []));
  const activity: RecordData[] = [],
    late: RecordData[] = [];
  const add = (
    r: RecordData,
    collection: string,
    type: string,
    timestamp: unknown,
    stage = "",
  ) => {
    const value = timestamp as { toMillis?: () => number } | string | undefined;
    const ms =
      typeof value === "string" ? Date.parse(value) : value?.toMillis?.();
    if (!ms || !Number.isFinite(ms)) {
      blockers.push(`Missing source date: ${collection}/${r.id}${stage}.`);
      return;
    }
    const sourceDate = localParts(ms, timezone).date,
      key = `${collection}/${r.id}${stage}`;
    if (
      sourceDate < state.reportingStart ||
      sourceDate > date ||
      covered.has(key)
    )
      return;
    if (!Number.isSafeInteger(r.amountPaise) || r.amountPaise <= 0) {
      blockers.push(`Invalid source amount: ${key}.`);
      return;
    }
    if (
      r.method === "cash" &&
      r.type === "reversal" &&
      r.cashEffectPaise == null
    )
      blockers.push(
        `Cash effect of historical correction ${key} is unavailable.`,
      );
    const b = bookingById.get(r.bookingId);
    const row = {
      key,
      id: r.id,
      bookingId: r.bookingId,
      bookingReference: b?.confirmationCode || b?.bookingReference || null,
      guestName: b?.leadGuest?.name || null,
      date: sourceDate,
      occurredAt: new Date(ms).toISOString(),
      type,
      amountPaise: r.amountPaise,
      method: r.method || "provider",
      ownership: r.stayQuote ? "supplemental_service" : "reservation",
      shiftId: r.shiftId || null,
      cashEffectPaise:
        r.method === "cash"
          ? (r.cashEffectPaise ??
            (r.type === "collection"
              ? r.amountPaise
              : r.type === "refund"
                ? -r.amountPaise
                : null))
          : 0,
      unattributed: collection === "propertyPayments" && !r.shiftId,
    };
    if (sourceDate < date) late.push(row);
    else activity.push(row);
  };
  for (const r of payments)
    add(
      r,
      "propertyPayments",
      r.type === "reversal"
        ? "correction"
        : r.type === "refund"
          ? "cash_return_or_property_refund"
          : "collection",
      r.createdAt,
    );
  for (const r of online)
    if (["captured", "refund_pending", "refunded"].includes(r.status))
      add(
        r,
        "paymentAttempts",
        "provider_capture",
        r.capturedAt || r.createdAt,
      );
  for (const r of refunds)
    if (r.status === "processed")
      add(r, "refunds", "provider_return", r.processedAt, ":processed");
  const pendingRefunds = refunds
    .filter((r) => !["processed", "failed"].includes(r.status))
    .map((r) => {
      const b = bookingById.get(r.bookingId);
      return {
        id: r.id,
        bookingId: r.bookingId,
        bookingReference: b?.confirmationCode || b?.bookingReference || null,
        guestName: b?.leadGuest?.name || null,
        amountPaise: r.amountPaise,
        status: r.status,
      };
    });
  const openShifts = shifts
    .filter((s) => s.status === "open")
    .map((s) => ({
      id: s.id,
      actorId: s.actorId,
      openerName: s.openerName || s.actorId,
      openedDate: s.openedDate,
    }));
  const shiftSummaries = shifts
    .filter(
      (s) =>
        s.openedDate === date ||
        s.closedDate === date ||
        (s.openedDate < date && (!s.closedDate || s.closedDate > date)),
    )
    .map((s) => ({
      id: s.id,
      actorId: s.actorId,
      openerName: s.openerName || s.actorId,
      status: s.status,
      openedDate: s.openedDate,
      closedDate: s.closedDate || null,
      openingPaise: s.openingPaise,
      expectedPaise:
        s.snapshot?.expectedPaise ??
        s.openingPaise + s.collectedPaise - s.returnedPaise,
      countedPaise: s.snapshot?.countedPaise ?? null,
      differencePaise:
        s.closedDate === date ? s.snapshot?.differencePaise : null,
      reason: s.snapshot?.reason || "",
    }));
  // Shift floats and discrepancies have their own coverage identities. A new
  // shift opened/closed after an earlier report must not disappear next day.
  const shiftSourceKeys: string[] = [],
    lateShiftSummaries: RecordData[] = [];
  for (const s of shifts) {
    for (const event of ["opened", "closed"] as const) {
      if (event === "closed" && s.status !== "closed") continue;
      const sourceDate = s[`${event}Date`],
        key = `cashierShifts/${s.id}:${event}`;
      if (!validDate(sourceDate || "") || !s[`${event}At`]) {
        blockers.push(`Shift ${s.id} has a missing ${event} source date.`);
        continue;
      }
      if (
        sourceDate < state.reportingStart ||
        sourceDate > date ||
        covered.has(key)
      )
        continue;
      shiftSourceKeys.push(key);
      if (sourceDate < date)
        lateShiftSummaries.push({
          key,
          id: s.id,
          event,
          date: sourceDate,
          actorId: s.actorId,
          openerName: s.openerName || s.actorId,
          occurredAt: safeData(s)[`${event}At`],
          openingPaise: s.openingPaise,
          expectedPaise:
            event === "closed" ? (s.snapshot?.expectedPaise ?? null) : null,
          countedPaise:
            event === "closed" ? (s.snapshot?.countedPaise ?? null) : null,
          differencePaise:
            event === "closed" ? (s.snapshot?.differencePaise ?? null) : null,
          reason: event === "closed" ? s.snapshot?.reason || "" : "",
        });
    }
  }
  const summarize = (rows: RecordData[]) => {
    const totals: Record<
      string,
      { amountPaise: number; cashEffectPaise: number | null; count: number }
    > = {};
    for (const r of rows) {
      const key = `${r.type} / ${r.method} / ${r.ownership}`;
      const t = (totals[key] ||= {
        amountPaise: 0,
        cashEffectPaise: 0,
        count: 0,
      });
      t.amountPaise += r.amountPaise;
      t.count++;
      t.cashEffectPaise =
        t.cashEffectPaise === null || r.cashEffectPaise === null
          ? null
          : t.cashEffectPaise + r.cashEffectPaise;
      if (
        !Number.isSafeInteger(t.amountPaise) ||
        (t.cashEffectPaise !== null && !Number.isSafeInteger(t.cashEffectPaise))
      )
        unavailable("unsafe activity totals.");
    }
    return totals;
  };
  const snapshot = {
    activityTotals: summarize(activity),
    lateTotals: summarize(late),
    propertyId: hotel,
    hotelName: property.name || hotel,
    date,
    timezone,
    reportingStart: state.reportingStart,
    expectedDate,
    revision: state.revision || 0,
    activity,
    late,
    shiftSummaries,
    lateShiftSummaries,
    unresolved,
    pendingRefunds,
    openShifts,
    blockers,
    sourceKeys: [
      ...[...activity, ...late].map((r) => r.key),
      ...shiftSourceKeys,
    ].sort(),
    coverage: {
      bookings: bookings.length,
      propertyPayments: payments.length,
      providerPayments: online.length,
      providerRefunds: refunds.length,
      description:
        "Complete bounded hotel source evaluation. Historical receipts remain unattributed. Opening floats and shift amounts are not revenue. Outstanding amounts are review-time snapshots.",
    },
  };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 700000)
    unavailable("report snapshot size limit exceeded.");
  return {
    ...snapshot,
    version: digest(snapshot),
    reviewedAt: new Date().toISOString(),
  };
}
export function reportPage(
  model: RecordData,
  page = 0,
): RecordData & {
  pagination: { page: number; counts: Record<string, number>; more: boolean };
} {
  const result = { ...model };
  const counts: Record<string, number> = {};
  for (const section of [
    "activity",
    "late",
    "unresolved",
    "shiftSummaries",
    "lateShiftSummaries",
    "pendingRefunds",
    "openShifts",
    "blockers",
  ]) {
    counts[section] = model[section]?.length || 0;
    result[section] = (model[section] || []).slice(page * 50, page * 50 + 50);
  }
  delete result.sourceKeys;
  return {
    ...result,
    pagination: {
      page,
      counts,
      more: Object.values(counts).some((n) => n > (page + 1) * 50),
    },
  };
}
export async function readDaily(
  uid: string,
  hotel: string,
  date: string,
  page = 0,
) {
  // If this date is already closed, return its permanent report shape
  const closedId = digest([hotel, date]);
  const existing = await adminDb.collection("dailyClosings").doc(closedId).get();
  if (existing.exists && existing.get("propertyId") === hotel) {
    await propertyAccess(uid, hotel, "closing.manage");
    const report: RecordData = { ...safeData(existing.data()!), id: existing.id };
    return reportPage(report, page);
  }

  return adminDb.runTransaction(
    async (tx) => {
      const access = await propertyAccess(uid, hotel, "closing.manage", tx);
      return reportPage(await review(tx, hotel, date, access.property), page);
    },
    { readOnly: true },
  );
}
export async function commandDaily(
  uid: string,
  hotel: string,
  raw: unknown,
  key: string,
) {
  const input = dayCommand.parse(raw),
    identity = requestIdentity(uid, hotel, key, input);
  return todayTransaction(async (tx, changed) => {
    const access = await operationalAccess(uid, hotel, "closing.manage", tx);
    const receiptRef = adminDb
        .collection("dailyClosingRequests")
        .doc(identity.id),
      old = await tx.get(receiptRef);
    if (old.exists) {
      if (old.get("fingerprint") !== identity.fingerprint)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return old.get("result") as { id: string };
    }
    const id = digest([hotel, input.date]),
      ref = adminDb.collection("dailyClosings").doc(id);
    if ((await tx.get(ref)).exists)
      throw new ApiException("DAY_ALREADY_CLOSED", 409);
    const model = await review(tx, hotel, input.date, access.property);
    if (model.version !== input.version)
      throw new ApiException(
        "REVIEW_CHANGED",
        409,
        "Review changed. Refresh and review again. Your note and acknowledgement are preserved.",
      );
    if (model.blockers.length)
      throw new ApiException("CLOSING_BLOCKED", 409, model.blockers.join(" "));
    if (
      (model.unresolved.length ||
        model.pendingRefunds.length ||
        model.openShifts.length) &&
      !input.acknowledge
    )
      throw new ApiException(
        "ACKNOWLEDGEMENT_REQUIRED",
        422,
        "Acknowledge outstanding balances and operational work before closing.",
      );
    tx.create(ref, {
      ...model,
      actorId: uid,
      actorName: access.user.fullName || uid,
      closedAt: FieldValue.serverTimestamp(),
      note: input.note,
      acknowledged: input.acknowledge,
    });
    tx.set(stateRef(hotel), { lastClosedDate: input.date }, { merge: true });
    const result = { id };
    tx.create(receiptRef, {
      propertyId: hotel,
      ...identity,
      result,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    changed(hotel);
    return result;
  });
}
export async function dailyHistory(
  uid: string,
  hotel: string,
  id?: string,
  before?: string,
  page = 0,
  print = false,
) {
  await propertyAccess(uid, hotel, "closing.manage");
  if (id) {
    const d = await adminDb.collection("dailyClosings").doc(id).get();
    if (!d.exists || d.get("propertyId") !== hotel)
      throw new ApiException("NOT_FOUND", 404);
    const report: RecordData = { ...safeData(d.data()!), id: d.id };
    return { report: print ? report : reportPage(report, page) };
  }
  let q: FirebaseFirestore.Query = adminDb
    .collection("dailyClosings")
    .where("propertyId", "==", hotel)
    .orderBy("date", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .select("date", "closedAt", "actorName", "note")
    .limit(21);
  if (before) {
    const cursor = await adminDb.collection("dailyClosings").doc(before).get();
    if (!cursor.exists || cursor.get("propertyId") !== hotel)
      throw new ApiException("INVALID_CURSOR", 422);
    q = q.startAfter(cursor);
  }
  const docs = await q.get(),
    state = await stateRef(hotel).get();
  const timezone = state.get("timezone") || "Asia/Kolkata";
  const today = localParts(Date.now(), timezone).date;
  const lastClosed = state.get("lastClosedDate") || null;
  const rawNextDate = lastClosed ? nextDate(lastClosed) : state.get("reportingStart") || null;
  const allClosedThroughToday = Boolean(lastClosed && lastClosed >= today);

  return {
    flags: closingFlags(),
    reportingStart: state.get("reportingStart") || null,
    nextDate: allClosedThroughToday ? today : (rawNextDate && rawNextDate <= today ? rawNextDate : today),
    today,
    lastClosedDate: lastClosed,
    allClosedThroughToday,
    timezone,
    reports: docs.docs
      .slice(0, 20)
      .map((d) => ({ ...safeData(d.data()), id: d.id })),
    nextCursor: docs.size > 20 ? docs.docs[19].id : null,
  };
}
export const hotelId = z
  .string()
  .min(1)
  .max(180)
  .refine((s) => !s.includes("/"));
