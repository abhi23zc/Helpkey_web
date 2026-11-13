import "server-only";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";
import { operationalAccess } from "./access";
import { netBalance } from "../reservations/domain";

const input = z
  .object({
    q: z.string().trim().max(180).default(""),
    cursor: z.string().max(2048).optional(),
  })
  .strict();
const statuses = ["confirmed", "checked_in", "checked_out", "completed"];
const pageSize = 50;

/** Bounded pages of actionable balances, or exact property-scoped lookup.
 * Never return the underlying booking document to a cashier.
 */
export async function cashierBookings(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  await operationalAccess(uid, propertyId, "payment.read");
  const f = input.parse(raw);
  if (f.q && f.cursor)
    throw new ApiException(
      "INVALID_CURSOR",
      422,
      "Clear the search before paging balances.",
    );
  const scoped = adminDb
    .collection("bookings")
    .where("propertyId", "==", propertyId);
  let docs: FirebaseFirestore.DocumentSnapshot[];
  let nextCursor: string | null = null;
  let scanned = 0;
  if (f.q) {
    const [byId, ...byReference] = await Promise.all([
      f.q.includes("/")
        ? Promise.resolve(null)
        : adminDb.collection("bookings").doc(f.q).get(),
      ...[...new Set([f.q, f.q.toUpperCase()])].map((reference) =>
        scoped.where("confirmationCode", "==", reference).limit(2).get(),
      ),
    ]);
    docs = [
      ...new Map(
        [
          ...(byId?.exists && byId.get("propertyId") === propertyId
            ? [byId]
            : []),
          ...byReference.flatMap((s) => s.docs),
        ].map((d) => [d.id, d]),
      ).values(),
    ];
    scanned = docs.length;
  } else {
    let query = scoped
      .where("bookingStatus", "in", statuses)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (f.cursor) {
      try {
        const cursor = decodeCursor(f.cursor);
        const [account, hotel, kind, seconds, nanoseconds] = cursor.values;
        if (
          account !== uid ||
          hotel !== propertyId ||
          kind !== "cashier" ||
          cursor.values.length !== 5 ||
          !Number.isSafeInteger(seconds) ||
          !Number.isSafeInteger(nanoseconds) ||
          typeof seconds !== "number" ||
          typeof nanoseconds !== "number" ||
          cursor.id.includes("/")
        )
          throw new Error("INVALID_CURSOR");
        query = query.startAfter(
          new Timestamp(seconds, nanoseconds),
          cursor.id,
        );
      } catch {
        throw new ApiException(
          "INVALID_CURSOR",
          422,
          "This balance page expired or belongs to another account or hotel. Return to the first page.",
        );
      }
    }
    const page = await query.limit(pageSize + 1).get();
    const candidates = page.docs.slice(0, pageSize);
    scanned = candidates.length;
    const last = candidates.at(-1);
    if (page.size > pageSize && last) {
      const at = last.get("createdAt") as Timestamp;
      nextCursor = encodeCursor({
        id: last.id,
        values: [uid, propertyId, "cashier", at.seconds, at.nanoseconds],
      });
    }
    docs = candidates.filter((d) => netBalance(d.data()!) > 0);
  }
  const bookings = await Promise.all(
    docs.map(async (d) => {
      const b = d.data()!;
      const payments = await adminDb
        .collection("propertyPayments")
        .where("bookingId", "==", d.id)
        .get();
      return {
        id: d.id,
        reference: b.confirmationCode || d.id,
        guestName: b.leadGuest?.name || "Guest",
        room: b.physicalUnitLabel || "Unassigned",
        balancePaise: netBalance(b),
        status: typeof b.bookingStatus === "string" ? b.bookingStatus : "unknown",
        receipts: payments.docs
          .filter((p) => p.get("type") === "collection")
          .map((p) => ({
            id: p.id,
            amountPaise: p.get("amountPaise"),
            method: p.get("method"),
          })),
      };
    }),
  );
  return {
    role: "cashier",
    bookings,
    nextCursor,
    hasMore: nextCursor !== null,
    scanned,
    lookup: Boolean(f.q),
  };
}
