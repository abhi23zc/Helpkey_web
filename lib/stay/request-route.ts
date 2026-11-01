import "server-only";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { withApiHandler } from "@/lib/api/handler";
import { stayError } from "./api";
import { decideRequest, addUnlistedRequest } from "./requests";
import { quotePaymentSession, verifyQuotePayment } from "./payments";
import { patchRequestSelection } from "./selection-update";
import { z } from "zod";
const session = z
  .object({
    requestId: z.string().min(1).max(1800),
    quoteVersion: z.number().int().positive(),
  })
  .strict();
export function requestHandler(staff: boolean, payment: boolean = false) {
  const route = staff
    ? "/api/partner/bookings/[bookingId]/stay-requests"
    : payment
      ? "/api/bookings/[bookingId]/stay-quote-payment"
      : "/api/bookings/[bookingId]/stay-requests";
  return withApiHandler(
    async (
      request: Request,
      { params }: { params: Promise<{ bookingId: string }> },
    ) => {
      const user = await getAuthenticatedUser();
      if (!user)
        return Response.json({ error: "Unauthenticated" }, { status: 401 });
      try {
        const { bookingId } = await params;
        const raw = await request.json();
        if (payment) {
          if (raw.razorpay_payment_id)
            return Response.json(
              await verifyQuotePayment(user.uid, bookingId, raw),
            );
          const input = session.parse(raw);
          return Response.json(
            await quotePaymentSession(
              user.uid,
              bookingId,
              input.requestId,
              input.quoteVersion,
            ),
          );
        }
        if (!staff && request.method === "PATCH")
          await patchRequestSelection(user.uid, bookingId, raw);
        else if (!staff && raw.action === "create")
          await addUnlistedRequest(user.uid, bookingId, raw);
        else await decideRequest(user.uid, bookingId, raw, staff);
        return Response.json({ ok: true });
      } catch (error) {
        return stayError(error);
      }
    },
    { route, auth: "strict", requireAuth: true, cache: "private" },
  );
}

export const requestHistoryHandler = withApiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ bookingId: string }> },
  ) => {
    const user = await getAuthenticatedUser();
    if (!user)
      return Response.json({ error: "Unauthenticated" }, { status: 401 });
    try {
      const { bookingId } = await params;
      const { adminDb } = await import("@/lib/firebase/admin");
      const { requireRole } = await import("@/lib/partner/service");
      await requireRole(user.uid, "partner");
      const b = await adminDb.collection("bookings").doc(bookingId).get();
      if (!b.exists) throw new Error("NOT_FOUND");
      const member = await adminDb
        .collection("propertyMemberships")
        .doc(`${b.get("propertyId")}_${user.uid}`)
        .get();
      if (member.get("status") !== "active") throw new Error("FORBIDDEN");
      const events = await b.ref
        .collection("events")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      return Response.json({
        events: events.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            type: v.type || `${v.from ?? "created"} → ${v.to ?? "updated"}`,
            actor: v.actorId ?? "System",
            at: v.createdAt?.toDate().toISOString() ?? null,
            requestId: v.requestId ?? null,
            response: v.response ?? v.agreed?.response ?? null,
            scope: v.agreed?.quote?.scope ?? null,
            amountPaise: v.amountPaise ?? v.agreed?.quote?.amountPaise ?? null,
          };
        }),
      });
    } catch (e) {
      return stayError(e);
    }
  },
  {
    route: "/api/partner/bookings/[bookingId]/stay-requests",
    auth: "read",
    requireAuth: true,
    cache: "private",
  },
);
