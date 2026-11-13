import { getAuthenticatedUser } from "@/lib/auth/session";
import { withApiHandler } from "@/lib/api/handler";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/partner/service";
import { manageOffer, offersEnabled } from "./offers";
import { stayError } from "./api";
export function offerHandler(staff: boolean) {
  return withApiHandler(async (request: Request, { params }: { params: Promise<{ bookingId: string }> }) => {
    try {
      const user = await getAuthenticatedUser();
      if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401 });
      const { bookingId } = await params;
      if (request.method === "GET") {
        const b = (await adminDb.collection("bookings").doc(bookingId).get()).data();
        if (!b) throw new Error("NOT_FOUND");
        if (staff) {
          await requireRole(user.uid, "partner");
          const m = await adminDb.collection("propertyMemberships").doc(`${b.propertyId}_${user.uid}`).get();
          if (m.get("status") !== "active") throw new Error("FORBIDDEN");
        } else if (b.guestId !== user.uid || b.source === "manual_partner") throw new Error("FORBIDDEN");
        return Response.json({ enabled: offersEnabled(), offers: b.extrasOffers ?? [], revision: b.stayRevision ?? 0 });
      }
      await manageOffer(user.uid, bookingId, await request.json(), staff);
      return Response.json({ ok: true });
    } catch (e) { return stayError(e); }
  }, { route: `/api/${staff ? "partner/" : ""}bookings/[bookingId]/extras-offers`, auth: "strict", requireAuth: true, cache: "private" });
}
