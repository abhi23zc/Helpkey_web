import "server-only";
import { createHash } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { operationalAccess, propertyAccess } from "@/lib/partner/pms/access";
import { localParts } from "@/lib/booking/domain";
import { todayTransaction } from "@/lib/partner/today/cache";
import { safeData } from "@/lib/partner/reservations/operations";
import {
  cashTotals,
  closingFlags,
  shiftCommand,
  type CashSource,
} from "./domain";
export const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const stateRef = (hotel: string) =>
  adminDb.collection("hotelClosingState").doc(hotel);
const pointerRef = (hotel: string, uid: string) =>
  adminDb.collection("cashierActiveShifts").doc(digest([hotel, uid]));
export function requestIdentity(
  uid: string,
  hotel: string,
  key: string,
  input: unknown,
) {
  if (!key || key.length > 180)
    throw new ApiException("IDEMPOTENCY_KEY_REQUIRED", 422);
  return { id: digest([uid, hotel, key]), fingerprint: digest(input) };
}
/** Read before any writes; apply only after the caller has finished its reads. */
export async function prepareCash(
  tx: FirebaseFirestore.Transaction,
  hotel: string,
  uid: string,
  type: "collection" | "refund" | "reversal",
  amountPaise: number,
  originalShiftId?: string,
) {
  await operationalAccess(uid, hotel, "shift.operate", tx);
  const pointer = (await tx.get(pointerRef(hotel, uid))).data();
  if (!pointer?.shiftId)
    throw new ApiException(
      "OPEN_SHIFT_REQUIRED",
      409,
      "Open your cashier shift before recording cash. If access was removed with a shift open, restore that staff member’s authorized access so they can close it.",
    );
  const ref = adminDb.collection("cashierShifts").doc(pointer.shiftId),
    shift = (await tx.get(ref)).data();
  if (
    !shift ||
    shift.status !== "open" ||
    shift.propertyId !== hotel ||
    shift.actorId !== uid
  )
    throw new ApiException(
      "OPEN_SHIFT_REQUIRED",
      409,
      "Your shift is no longer open. Refresh My shift.",
    );
  if (shift.sourceCount >= 1000)
    throw new ApiException(
      "SHIFT_LIMIT",
      409,
      "Close this shift before recording more cash (1,000 sources per shift).",
    );
  const effect =
    type === "collection"
      ? amountPaise
      : type === "refund" || originalShiftId === ref.id
        ? -amountPaise
        : 0;
  return {
    fields: {
      shiftId: ref.id,
      cashEffectPaise: effect,
      correctionOfShiftId:
        type === "reversal" ? (originalShiftId ?? null) : null,
    },
    apply: () =>
      tx.update(ref, {
        revision: shift.revision + 1,
        sourceCount: shift.sourceCount + 1,
        collectedPaise: shift.collectedPaise + (type !== "refund" ? effect : 0),
        returnedPaise:
          shift.returnedPaise + (type === "refund" ? amountPaise : 0),
        correctionsPaise:
          shift.correctionsPaise + (type === "reversal" ? amountPaise : 0),
      }),
  };
}
async function sourceReview(
  tx: FirebaseFirestore.Transaction,
  shiftId: string,
  shift: FirebaseFirestore.DocumentData,
) {
  const docs = await tx.get(
    adminDb
      .collection("propertyPayments")
      .where("shiftId", "==", shiftId)
      .limit(1001),
  );
  if (docs.size > 1000)
    throw new ApiException(
      "REVIEW_UNAVAILABLE",
      409,
      "Review unavailable: shift source limit exceeded.",
    );
  if (
    !Number.isSafeInteger(shift.openingPaise) ||
    shift.openingPaise < 0 ||
    !Number.isSafeInteger(shift.revision) ||
    shift.revision < 0
  )
    throw new ApiException(
      "REVIEW_UNAVAILABLE",
      409,
      "Review unavailable: invalid shift opening amount or revision.",
    );
  const rows = docs.docs.map((d) => ({
    ...d.data(),
    id: d.id,
  })) as CashSource[];
  let totals;
  try {
    totals = cashTotals(rows);
  } catch {
    throw new ApiException(
      "REVIEW_UNAVAILABLE",
      409,
      "Review unavailable: invalid cash sources.",
    );
  }
  if (
    rows.some(
      (r) =>
        (r as unknown as { propertyId: string }).propertyId !==
        shift.propertyId,
    ) ||
    Object.entries(totals).some(([k, v]) => shift[k] !== v)
  )
    throw new ApiException(
      "REVIEW_UNAVAILABLE",
      409,
      "Review unavailable: shift projection differs from source receipts.",
    );
  return {
    ...totals,
    expectedPaise:
      shift.openingPaise + totals.collectedPaise - totals.returnedPaise,
    sourceIds: rows.map((r) => r.id).sort(),
  };
}
export async function commandShift(
  uid: string,
  hotel: string,
  raw: unknown,
  key: string,
) {
  const input = shiftCommand.parse(raw),
    identity = requestIdentity(uid, hotel, key, input);
  return todayTransaction(async (tx, changed) => {
    const access = await operationalAccess(uid, hotel, "shift.operate", tx);
    const receiptRef = adminDb
        .collection("cashierShiftRequests")
        .doc(identity.id),
      previous = await tx.get(receiptRef);
    if (previous.exists) {
      if (previous.get("fingerprint") !== identity.fingerprint)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return previous.get("result") as { id: string };
    }
    const pointer = pointerRef(hotel, uid),
      active = await tx.get(pointer),
      state = await tx.get(stateRef(hotel));
    const now = FieldValue.serverTimestamp();
    let id: string;
    if (input.action === "open") {
      await operationalAccess(uid, hotel, "payment.collect", tx);
      if (active.get("shiftId"))
        throw new ApiException(
          "SHIFT_ALREADY_OPEN",
          409,
          "You already have an open shift.",
        );
      if (
        state.get("timezone") &&
        state.get("timezone") !== (access.property.timezone || "Asia/Kolkata")
      )
        throw new ApiException(
          "REVIEW_UNAVAILABLE",
          409,
          "Hotel timezone changed after reporting activation. Restore the recorded hotel timezone before opening another shift.",
        );
      id = identity.id;
      const timezone =
          state.get("timezone") || access.property.timezone || "Asia/Kolkata",
        date = localParts(Date.now(), timezone).date;
      tx.create(adminDb.collection("cashierShifts").doc(id), {
        propertyId: hotel,
        hotelName: access.property.name || hotel,
        actorId: uid,
        openerName: access.user.fullName || uid,
        status: "open",
        timezone,
        openedDate: date,
        openedAt: now,
        openingPaise: input.openingPaise,
        collectedPaise: 0,
        returnedPaise: 0,
        correctionsPaise: 0,
        sourceCount: 0,
        revision: 0,
      });
      tx.set(pointer, { propertyId: hotel, actorId: uid, shiftId: id });
      if (!state.get("reportingStart"))
        tx.set(
          stateRef(hotel),
          { reportingStart: date, timezone, activatedAt: now },
          { merge: true },
        );
    } else {
      id = input.shiftId;
      const ref = adminDb.collection("cashierShifts").doc(id),
        shift = (await tx.get(ref)).data();
      if (!shift || shift.propertyId !== hotel || shift.actorId !== uid)
        throw new ApiException(
          "FORBIDDEN",
          403,
          "Only the staff member who opened a shift can close it. Restore their authorized access if needed.",
        );
      if (shift.status !== "open" || active.get("shiftId") !== id)
        throw new ApiException("SHIFT_CLOSED", 409);
      const totals = await sourceReview(tx, id, shift);
      if (shift.revision !== input.revision)
        throw new ApiException(
          "REVIEW_CHANGED",
          409,
          "Cash activity changed. Review again; keep your count and explanation.",
        );
      const differencePaise = input.countedPaise - totals.expectedPaise;
      if (differencePaise && input.reason.length < 3)
        throw new ApiException(
          "REASON_REQUIRED",
          422,
          "Explain the surplus or shortage.",
        );
      tx.update(ref, {
        status: "closed",
        revision: shift.revision + 1,
        closedAt: now,
        closedDate: localParts(Date.now(), shift.timezone).date,
        closedBy: uid,
        closerName: access.user.fullName || uid,
        snapshot: {
          ...totals,
          openingPaise: shift.openingPaise,
          countedPaise: input.countedPaise,
          differencePaise,
          reason: input.reason,
          reviewedRevision: input.revision,
        },
      });
      tx.delete(pointer);
    }
    const result = { id };
    tx.create(receiptRef, {
      propertyId: hotel,
      actorId: uid,
      ...identity,
      result,
      createdAt: now,
    });
    changed(hotel);
    return result;
  });
}
export async function readShifts(
  uid: string,
  hotel: string,
  id?: string,
  before?: string,
  sources = false,
) {
  return adminDb.runTransaction(async (tx) => {
    const access = await propertyAccess(uid, hotel, "shift.operate", tx);
    const manager = access.permissions.includes("shift.history");
    if (id) {
      const doc = await tx.get(adminDb.collection("cashierShifts").doc(id)),
        shift = doc.data();
      if (
        !shift ||
        shift.propertyId !== hotel ||
        (!manager && shift.actorId !== uid)
      )
        throw new ApiException("NOT_FOUND", 404);
      const review =
        shift.status === "open"
          ? await sourceReview(tx, id, shift)
          : shift.snapshot;
      const ids: string[] = review.sourceIds;
      const offset = before ? ids.indexOf(before) + 1 : 0;
      if (before && !offset) throw new ApiException("INVALID_CURSOR", 422);
      const page = sources ? ids.slice(offset, offset + 50) : [];
      const docs = page.length
        ? await tx.getAll(
            ...page.map((k) => adminDb.collection("propertyPayments").doc(k)),
          )
        : [];
      const bookingIds = Array.from(
        new Set(
          docs
            .map((d) => d.data()?.bookingId)
            .filter((b): b is string => typeof b === "string" && Boolean(b)),
        ),
      );
      const bookingDocs = bookingIds.length
        ? await tx.getAll(
            ...bookingIds.map((bId) => adminDb.collection("bookings").doc(bId)),
          )
        : [];
      const bookingMap = new Map<
        string,
        { reference?: string; guestName?: string }
      >();
      for (const bDoc of bookingDocs) {
        if (bDoc.exists) {
          const data = bDoc.data();
          bookingMap.set(bDoc.id, {
            reference: data?.confirmationCode || data?.reference,
            guestName:
              data?.leadGuest?.name ||
              (Array.isArray(data?.adultGuestNames)
                ? data.adultGuestNames[0]
                : undefined),
          });
        }
      }
      const { sourceIds: _ids, ...summary } = review;
      void _ids;
      const clean = safeData(shift);
      if (clean.snapshot) {
        clean.snapshot = { ...clean.snapshot };
        delete clean.snapshot.sourceIds;
      }
      return {
        shift: { ...clean, id } as Record<string, unknown> &
          FirebaseFirestore.DocumentData,
        review: summary,
        sources: docs.map((d) => {
          const rowData = safeData(d.data()!);
          const bInfo = rowData.bookingId
            ? bookingMap.get(rowData.bookingId)
            : undefined;
          return {
            ...rowData,
            id: d.id,
            bookingReference: bInfo?.reference ?? null,
            guestName: bInfo?.guestName ?? null,
          };
        }),
        nextCursor: sources && offset + 50 < ids.length ? page.at(-1) : null,
      };
    }
    let q: FirebaseFirestore.Query = adminDb
      .collection("cashierShifts")
      .where("propertyId", "==", hotel);
    if (!manager) q = q.where("actorId", "==", uid);
    q = q
      .orderBy("openedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(21);
    if (before) {
      const cursor = await tx.get(
        adminDb.collection("cashierShifts").doc(before),
      );
      if (
        !cursor.exists ||
        cursor.get("propertyId") !== hotel ||
        (!manager && cursor.get("actorId") !== uid)
      )
        throw new ApiException("INVALID_CURSOR", 422);
      q = q.startAfter(cursor);
    }
    const [history, pointer, state] = await Promise.all([
      tx.get(q),
      tx.get(pointerRef(hotel, uid)),
      tx.get(stateRef(hotel)),
    ]);
    return {
      flags: closingFlags(),
      reportingStart: state.get("reportingStart") || null,
      timezone:
        state.get("timezone") || access.property.timezone || "Asia/Kolkata",
      activeId: pointer.get("shiftId") || null,
      shifts: history.docs.slice(0, 20).map((d) => {
        const s = safeData(d.data());
        if (s.snapshot) {
          s.snapshot = { ...s.snapshot };
          delete s.snapshot.sourceIds;
        }
        return { ...s, id: d.id };
      }),
      nextCursor: history.size > 20 ? history.docs[19].id : null,
    };
  });
}
