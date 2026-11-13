import { customerOwnsBooking } from "@/lib/booking/customer-access";
import { operationalAccess } from "@/lib/partner/pms/access";
import { StaySelectionError } from "./domain";
import "server-only";
import { offersEnabled } from "./offers";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { unlistedRequestSchema, type StayRequest } from "./contracts";
import { assertLiveQuote, quotedPrice } from "./agreements";
import { enqueueStayNotification } from "./notifications";

export function unlistedSnapshots(
  input: z.infer<typeof unlistedRequestSchema>[],
  startAt: string,
  endAt: string,
  now = Date.now(),
): StayRequest[] {
  return input.map((v, i) => {
    const when = Date.parse(v.neededAt);
    if (when < Math.max(now, Date.parse(startAt)) || when >= Date.parse(endAt))
      throw new StaySelectionError(
        "Choose an upcoming request time within your booked stay.",
      );
    return {
      id: `unlisted:${i}:${createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16)}`,
      agreementVersion: 2,
      source: "unlisted",
      settlement: "pending_hotel",
      offeringId: "unlisted",
      offeringVersion: 0,
      name: v.name,
      description: v.note,
      kind: "service",
      variantId: null,
      variantName: null,
      quantity: 1,
      unitPricePaise: 0,
      totalPaise: 0,
      maxQuantity: 1,
      confirmation: "approval",
      deadlineAt: v.neededAt,
      cancellationPolicy: null,
      status: "requested",
      preparationStarted: false,
      response: null,
      updatedAt: new Date(now).toISOString(),
      inputs: { note: v.note, serviceAt: v.neededAt },
    };
  });
}
const decision = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(1800),
    action: z.enum([
      "approve_free",
      "approve_price",
      "quote",
      "decline",
      "withdraw",
      "accept",
      "reject",
    ]),
    quoteVersion: z.number().int().positive().optional(),
    amountPaise: z.number().int().nonnegative().max(100000000).optional(),
    scope: z.string().trim().max(1500).optional(),
    conditions: z.string().trim().max(1000).optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    response: z.string().trim().max(1000).default(""),
  })
  .strict();
export async function decideRequest(
  uid: string,
  bookingId: string,
  raw: unknown,
  staff: boolean,
) {
  const input = decision.parse(raw);
  if (staff) await requireRole(uid, "partner");
  const staffActions = [
    "approve_free",
    "approve_price",
    "quote",
    "decline",
    "withdraw",
  ];
  if (staffActions.includes(input.action) !== staff)
    throw new Error("FORBIDDEN");
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const b = (await tx.get(ref)).data();
    if (!b || (!staff && (!customerOwnsBooking(b, uid)))) throw new Error("NOT_FOUND");
    if (staff) {
      await operationalAccess(uid, b.propertyId, "requests.manage", tx);
      const member = await tx.get(
        adminDb.collection("propertyMemberships").doc(`${b.propertyId}_${uid}`),
      );
      if (member.get("status") !== "active") throw new Error("FORBIDDEN");
    }
    if (b.stayRevision !== input.revision) throw new Error("CONFLICT");
    if (
      !["confirmed", "checked_in"].includes(b.bookingStatus) ||
      (b.endAt && Date.parse(b.endAt) <= Date.now())
    )
      throw new Error("This booking is closed for requests.");
    const requests = (b.customizations ?? []) as StayRequest[];
    const r = requests.find((r) => r.id === input.requestId);
    if (!r || r.agreementVersion !== 2 || r.settlement === "included")
      throw new Error("NOT_FOUND");
    if (!staff && r.offerDraft) throw new Error("Wait for the hotel to send the combined offer.");
    if (r.offerId) throw new Error("Manage this request through its combined offer.");
    if (r.status !== "requested" || r.preparationStarted || r.quote?.paymentId)
      throw new Error(
        "This request is already agreed or closed. Refresh before updating it.",
      );
    let next = {
      ...r,
      updatedAt: new Date().toISOString(),
      response: input.response || r.response,
    };
    if (["decline", "reject"].includes(input.action)) {
      if (staff && !input.response)
        throw new Error("Explain why this request is declined.");
      next = {
        ...next,
        status: "declined",
        quote: r.quote ? { ...r.quote, status: "declined" } : null,
      };
    } else if (input.action === "withdraw") {
      if (!r.quote) throw new Error("There is no quote to withdraw.");
      next = {
        ...next,
        settlement: "pending_hotel",
        quote: { ...r.quote, status: "withdrawn" },
      };
    } else if (input.action === "accept") {
      const q = assertLiveQuote(r, input.quoteVersion ?? 0);
      next = {
        ...next,
        status: q.amountPaise === 0 ? "confirmed" : "requested",
        settlement: q.amountPaise === 0 ? "included" : "awaiting_payment",
        quote: {
          ...q,
          status: "accepted",
          acceptedAt: new Date().toISOString(),
          ...(q.amountPaise > 0
            ? { paymentStatus: "awaiting_payment" as const }
            : {}),
        },
      };
    } else if (input.action === "approve_free") {
      next = {
        ...next,
        status: "confirmed",
        settlement: "included",
        unitPricePaise: 0,
        totalPaise: 0,
        quote: null,
      };
    } else {
      const amount =
        input.action === "approve_price" ? r.totalPaise : input.amountPaise;
      if (
        input.action === "approve_price" &&
        (r.source === "unlisted" || r.priceOnRequest)
      )
        throw new Error("Enter a final quote for this request.");
      if (amount !== undefined && amount > 0 && amount < 100)
        throw new Error(
          "Paid quotes must be at least ₹1. Approve for free or enter a higher final price.",
        );
      if (amount === undefined)
        throw new Error("Enter the final price including all charges.");
      const scope =
        input.scope ||
        `${r.name}${r.variantName ? ` · ${r.variantName}` : ""} × ${r.quantity}`;
      const serviceDeadline =
        r.inputs?.serviceAt ??
        (Date.parse(b.startAt) > Date.now() ? b.startAt : b.endAt);
      const expiresAt =
        input.expiresAt ??
        new Date(
          Math.min(
            Date.now() + 48 * 3600000,
            Date.parse(serviceDeadline),
            Date.parse(b.endAt),
          ),
        ).toISOString();
      if (
        Date.parse(expiresAt) <= Date.now() ||
        Date.parse(expiresAt) >
          Math.min(Date.parse(serviceDeadline), Date.parse(b.endAt))
      )
        throw new Error(
          "Choose a quote expiry after now and no later than the service time or booked departure.",
        );
      next = quotedPrice(next, {
        version: (r.quote?.version ?? 0) + 1,
        amountPaise: amount,
        scope,
        conditions:
          input.conditions ||
          "Unfulfilled services are refunded in full if the booking is cancelled. All charges included.",
        expiresAt,
        status: "offered",
      });
    }
    if (["approve_price", "quote"].includes(input.action) && offersEnabled()) next = { ...next, offerDraft: true };
    const revision = (b.stayRevision ?? 0) + 1;
    tx.update(ref, {
      customizations: requests.map((r) => (r.id === next.id ? next : r)),
      stayRevision: revision,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("events").doc(), {
      type: `stay_request_${input.action}`,
      requestId: r.id,
      actorId: uid,
      revision,
      previous: r,
      agreed: next,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (!next.offerDraft) enqueueStayNotification(
      tx,
      bookingId,
      b.propertyId,
      b.guestId,
      revision,
      `request_${input.action}`,
    );
  });
}
export function quoteRefundId(paymentId: string, allocationId?: string) {
  return `stay_${createHash("sha256").update(allocationId ? `${paymentId}:${allocationId}` : paymentId).digest("hex")}`;
}
export function queueQuoteRefund(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  propertyId: string,
  requestId: string,
  paymentId: string,
  amountPaise: number,
  allocationId?: string,
) {
  tx.create(adminDb.collection("refunds").doc(quoteRefundId(paymentId, allocationId)), {
    bookingId,
    propertyId,
    requestId,
    stayQuote: true,
    ...(allocationId ? { allocationId } : {}),
    paymentId,
    amountPaise,
    status: "pending",
    nextAttemptAt: Timestamp.now(),
    reason: "STAY_QUOTE_CLOSED",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
export function cancelQuotePayments(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  propertyId: string,
  requests: StayRequest[],
) {
  return requests.map((r) => {
    if (
      r.quote?.paymentStatus !== "paid" ||
      !r.quote.paymentId ||
      r.status === "fulfilled"
    )
      return r;
    queueQuoteRefund(
      tx,
      bookingId,
      propertyId,
      r.id,
      r.quote.paymentId,
      r.quote.amountPaise,
      r.offerId ? r.id : undefined,
    );
    return {
      ...r,
      quote: { ...r.quote, paymentStatus: "refund_pending" as const },
    };
  });
}

export async function addUnlistedRequest(
  uid: string,
  bookingId: string,
  raw: unknown,
) {
  const input = z
    .object({
      revision: z.number().int().nonnegative(),
      request: unlistedRequestSchema,
      action: z.literal("create"),
    })
    .strict()
    .parse(raw);
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(bookingId),
      b = (await tx.get(ref)).data();
    if (!b || !customerOwnsBooking(b, uid)) throw new Error("NOT_FOUND");
    if ((b.stayRevision ?? 0) !== input.revision) throw new Error("CONFLICT");
    if (!["confirmed", "checked_in"].includes(b.bookingStatus))
      throw new Error("This booking is closed for requests.");
    const previous = (b.customizations ?? []) as StayRequest[];
    if (
      previous.length >= 100 ||
      previous.filter(
        (r) => r.source === "unlisted" && r.status === "requested",
      ).length >= 5
    )
      throw new Error(
        "Please wait for the hotel to review your current requests.",
      );
    const added = unlistedSnapshots([input.request], b.startAt, b.endAt)[0];
    added.id = `${added.id}:${input.revision + 1}`;
    tx.update(ref, {
      customizations: [...previous, added],
      stayRevision: input.revision + 1,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("events").doc(), {
      type: "unlisted_request_created",
      requestId: added.id,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    enqueueStayNotification(
      tx,
      bookingId,
      b.propertyId,
      uid,
      input.revision + 1,
      "request_created",
    );
  });
}
