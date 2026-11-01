import "server-only";
import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { authorize } from "@/lib/partner/reservations/access";
import { requireRole } from "@/lib/partner/service";
import { validPageRange } from "@/lib/partner/date-range";
import { encodeCursor, decodeCursor } from "@/lib/api/pagination";
import { ApiException } from "@/lib/api/errors";
import {
  matchesRequestGroup,
  requestGroups,
  type RequestQueuePage,
} from "./workspace";
import type { StayRequest } from "./contracts";
const input = z
  .object({
    from: z.string(),
    to: z.string(),
    status: z.enum(requestGroups).default("open"),
    cursor: z.string().max(2048).optional(),
  })
  .strict()
  .refine(
    (v) => validPageRange(v.from, v.to),
    "Choose a stay date range of 1–31 days.",
  );
export async function partnerRequestQueue(
  uid: string,
  propertyId: string,
  raw: unknown,
): Promise<RequestQueuePage> {
  await requireRole(uid, "partner");
  await authorize(uid, propertyId);
  const f = input.parse(raw);
  const property = await adminDb.collection("properties").doc(propertyId).get();
  if (!property.exists)
    throw new ApiException("NOT_FOUND", 404, "Property not found.");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([uid, propertyId, f.from, f.to, f.status]))
    .digest("hex");
  let q = adminDb
    .collection("bookings")
    .where("propertyId", "==", propertyId)
    .where("checkIn", "<=", f.to)
    .where("checkOut", ">=", f.from)
    .orderBy("checkIn", "desc")
    .orderBy("checkOut", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (f.cursor) {
    let cursor;
    try {
      cursor = decodeCursor(f.cursor);
    } catch {
      throw new ApiException(
        "INVALID_CURSOR",
        422,
        "Refresh requests to start again.",
      );
    }
    if (
      cursor.values[0] !== fingerprint ||
      typeof cursor.values[1] !== "string" ||
      typeof cursor.values[2] !== "string"
    )
      throw new ApiException(
        "INVALID_CURSOR",
        422,
        "Filters changed. Refresh requests.",
      );
    q = q.startAfter(cursor.values[1], cursor.values[2], cursor.id);
  }
  // A page is a bounded scan, not an unbounded query for bookings with array items.
  const snapshot = await q
    .limit(200)
    .get()
    .catch((error) => {
      if (
        /requires an index|index.*(building|not ready|unavailable)/i.test(
          error instanceof Error ? error.message : "",
        )
      )
        throw new ApiException(
          "INDEX_UNAVAILABLE",
          503,
          "Guest requests are temporarily unavailable. Please retry shortly.",
        );
      throw error;
    });
  const rows: RequestQueuePage["rows"] = [];
  for (const doc of snapshot.docs) {
    const b = doc.data();
    if (
      ["pending_payment", "expired", "payment_failed"].includes(b.bookingStatus)
    )
      continue;
    const active = ["confirmed", "checked_in"].includes(b.bookingStatus);
    if (!active && !["all", "completed"].includes(f.status)) continue;
    for (const request of (b.customizations ?? []) as StayRequest[]) {
      if (!matchesRequestGroup(request, f.status)) continue;
      rows.push({
        bookingId: doc.id,
        reference:
          b.confirmationCode ?? b.reference ?? b.bookingReference ?? doc.id,
        guestName: b.leadGuest?.name ?? b.bookingContact?.name ?? "Guest",
        roomName: b.roomType?.name ?? "Room",
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        bookingStatus: b.bookingStatus,
        revision: b.stayRevision ?? 0,
        enabled: active,
        request,
      });
    }
  }
  const last = snapshot.docs.at(-1);
  return {
    rows,
    timezone: property.get("timezone") || "Asia/Kolkata",
    scanned: snapshot.size,
    nextCursor:
      snapshot.size === 200 && last
        ? encodeCursor({
            id: last.id,
            values: [fingerprint, last.get("checkIn"), last.get("checkOut")],
          })
        : null,
  };
}
