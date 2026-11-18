import { reservationEligibility } from "@/lib/partner/reservations/eligibility";
import { loadPageEligibilityFacts } from "@/lib/partner/reservations/eligibility-server";
import { features } from "@/lib/partner/reservations/access";
import "server-only";
import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { operationalAccess } from "@/lib/partner/pms/access";
import { ApiException } from "@/lib/api/errors";
import { cachedPublic } from "@/lib/api/cache";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";
import { localParts, validDate } from "@/lib/booking/domain";
import { bookingStart, bookingEnd, type RecordData } from "@/lib/partner/dashboard/domain";
import { evaluateReservation, todayQueues, type TodayQueue } from "./domain";
const input = z.object({ propertyId: z.string().min(1).max(180), date: z.string().refine(validDate).optional(), queue: z.enum(Object.keys(todayQueues) as [TodayQueue, ...TodayQueue[]]).default("arrivals"), cursor: z.string().max(2048).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
const fields = ["billingNetPaise", "billingOpenCount", "propertyId", "bookingStatus", "checkIn", "checkOut", "startAt", "endAt", "bookingMode", "roomType", "roomName", "leadGuest.name", "confirmationCode", "physicalUnitId", "physicalUnitLabel", "totalPaise", "paidPaise", "refundedPaise", "refundDuePaise", "customizationCreditPaise", "customizations"];
async function scan(query: FirebaseFirestore.Query, max: number, selectedFields: string[]) {
  const rows: RecordData[] = [];
  let after: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = query.orderBy(FieldPath.documentId()).select(...selectedFields).limit(Math.min(500, max + 1 - rows.length));
    if (after) q = q.startAfter(after);
    const page = await q.get();
    rows.push(...page.docs.map(d => ({ ...d.data(), id: d.id })));
    if (rows.length > max) throw new ApiException("TODAY_LIMIT_EXCEEDED", 503, "Today summary unavailable: evaluation limit exceeded. Browse Reservations with a narrower date range.");
    if (page.size < 500) return rows;
    after = page.docs.at(-1);
  }
}
export async function loadToday(uid: string, raw: Record<string, unknown>, list = false) {
  const f = input.parse(raw);
  const access = await operationalAccess(uid, f.propertyId, "reservation.read");
  const timezone = access.property.timezone || "Asia/Kolkata";
  const date = f.date || localParts(Date.now(), timezone).date;
  // Authorization precedes every cache lookup. This cache never serves stale results.
  const evaluation = await cachedPublic(["partner-today", f.propertyId, date], async () => {
    const now = Date.now(), base = adminDb.collection("bookings").where("propertyId", "==", f.propertyId);
    const [active, arrivals, departures, units, blocks] = await Promise.all([
      scan(base.where("bookingStatus", "in", ["confirmed", "checked_in"]), 10_000, fields),
      scan(base.where("checkIn", "==", date).where("bookingStatus", "in", ["checked_out", "completed"]), 10_000, fields),
      scan(base.where("checkOut", "==", date).where("bookingStatus", "in", ["checked_out", "completed"]), 10_000, fields),
      scan(adminDb.collection("physicalUnits").where("propertyId", "==", f.propertyId), 1000, ["propertyId", "roomTypeId", "status", "housekeepingStatus"]),
      scan(adminDb.collection("inventoryBlocks").where("propertyId", "==", f.propertyId).where("status", "==", "active"), 1000, ["unitId", "roomTypeId", "startAt", "endAt"]),
    ]);
    const all = [...new Map([...active, ...arrivals, ...departures].map(b => [b.id, b])).values()];
    const occupants = active.filter(b => b.bookingStatus === "checked_in");
    const rows = all.map(b => {
      const result = evaluateReservation(b, date, timezone, now, units, blocks, occupants);
      return { id: b.id as string, guestName: b.leadGuest?.name || "Guest", reference: b.confirmationCode || b.id, startAt: new Date(bookingStart(b, timezone)).toISOString(), endAt: new Date(bookingEnd(b, timezone)).toISOString(), bookingMode: b.bookingMode || "overnight", room: b.physicalUnitLabel || null, status: b.bookingStatus, balanceDuePaise: result.balance, requestCount: result.requestCount, reasons: result.reasons, queues: result.queues };
    }).sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
    const counts = Object.fromEntries(Object.keys(todayQueues).map(q => [q, rows.filter(r => r.queues.includes(q as TodayQueue)).length]));
    const generation = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    return { timezone, date, evaluatedAt: new Date(now).toISOString(), generation, counts, requestCount: rows.reduce((sum, r) => sum + r.requestCount, 0), rows };
  }, { freshSeconds: 10, staleSeconds: 0 });
  const { rows, ...summary } = evaluation;
  const scope = ["arrivals", "awaiting_check_in", "departures"].includes(f.queue) ? "selected_date" : "live_attention";
  if (!list) return { ...summary, scopes: { selected_date: ["arrivals", "awaiting_check_in", "departures"], live_attention: Object.keys(todayQueues).filter(q => !["arrivals", "awaiting_check_in", "departures"].includes(q)) } };
  const matching = rows.filter(r => r.queues.includes(f.queue));
  const binding = createHash("sha256").update(JSON.stringify([uid, f.propertyId, date, f.queue, evaluation.generation])).digest("hex");
  let offset = 0;
  if (f.cursor) {
    let cursor;
    try { cursor = decodeCursor(f.cursor); } catch { throw new ApiException("INVALID_CURSOR", 422, "Invalid queue cursor. Restart this queue."); }
    if (cursor.values[0] !== binding || typeof cursor.values[1] !== "number" || Date.now() - cursor.values[1] > 600_000) throw new ApiException("CURSOR_EXPIRED", 409, "Queue changed or cursor expired. Restart this queue; your open reservation is preserved.");
    offset = matching.findIndex(r => r.id === cursor.id) + 1;
    if (!offset) throw new ApiException("CURSOR_EXPIRED", 409, "Queue changed. Restart this queue.");
  }
  const page = matching.slice(offset, offset + f.limit);
  // Shared cache contains no caller-specific eligibility. Evaluate only this page
  // after authorization against current authoritative documents.
  const bookingDocs = page.length ? await adminDb.getAll(...page.map(row => adminDb.collection("bookings").doc(row.id))) : [];
  const current = new Map(bookingDocs.filter(d => d.exists && d.get("propertyId") === f.propertyId).map(d => [d.id, d.data()!]));
  const facts = await loadPageEligibilityFacts(f.propertyId, [...current].map(([id, data]) => ({ id, data })), access.property);
  const now = Date.now();
  const enabled = features();
  const switches = { ...enabled, amendments: enabled.amendments && access.property.inventoryEngine === "interval_v1" };
  const visibleRows = page.map(({ balanceDuePaise, ...row }) => {
    const b = current.get(row.id);
    const actionEligibility = b ? reservationEligibility(b, access.permissions, switches, now, facts.get(row.id)) : undefined;
    return { ...row, actionEligibility, ...(access.permissions.includes("payment.read") ? { balanceDuePaise } : {}) };
  });
  return { ...summary, scope, queue: f.queue, rows: visibleRows, nextCursor: offset + f.limit < matching.length ? encodeCursor({ id: page.at(-1)!.id, values: [binding, Date.now()] }) : null };
}
export type TodaySummary = Omit<Awaited<ReturnType<typeof loadToday>>, "rows" | "nextCursor">;
