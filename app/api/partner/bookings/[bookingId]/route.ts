import { operationalRestriction } from "@/lib/partner/pms/access";
import { loadEligibilityFacts } from "@/lib/partner/reservations/eligibility-server";
import { reservationEligibility } from "@/lib/partner/reservations/eligibility";
import { features } from "@/lib/partner/reservations/access";
import { roomsFeatures } from "@/lib/partner/rooms/service";
import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { authorize } from "@/lib/partner/reservations/access";
import { requireRole } from "@/lib/partner/service";
import { remainingCancellationRefund } from "@/lib/stay/domain";
import { serializeBookingWithResolvedMedia } from "@/lib/bookings";
export const GET = withApiHandler(
  async (_request, context: { params: Promise<{ bookingId: string }> }) => {
    const { bookingId } = await context.params;
    const booking = await adminDb.collection("bookings").doc(bookingId).get();
    const data = booking.data();
    if (data && new URL(_request.url).searchParams.has("propertyId") && new URL(_request.url).searchParams.get("propertyId") !== data.propertyId)
      throw new ApiException("NOT_FOUND", 404, "Reservation not found for this hotel.");
    if (!data)
      throw new ApiException("NOT_FOUND", 404, "Reservation not found.");
    let access;
    try {
      await requireRole(actorFromRequest().uid, "partner");
      access = await authorize(actorFromRequest().uid, data.propertyId);
    } catch {
      throw new ApiException("FORBIDDEN", 403, "Property access required.");
    }
    const onlinePaidPaise = Math.max(
      0,
      (data.paidPaise ?? 0) - (data.propertyLedgerPaise ?? 0),
    );
    const onlineRefundedPaise = Math.max(
      0,
      (data.refundedPaise ?? 0) - (data.propertyRefundedPaise ?? 0),
    );
    const assignedRoom = data.physicalUnitId ? await adminDb.collection("physicalUnits").doc(data.physicalUnitId).get() : null;
    const validAssignedRoom = assignedRoom?.get("propertyId") === data.propertyId;
    const readiness = { assigned: !!assignedRoom?.exists && validAssignedRoom, status: validAssignedRoom ? assignedRoom?.get("housekeepingStatus") || "unknown" : "unknown" };
    const eligibilityFacts = await loadEligibilityFacts(bookingId, data, access.property);
    eligibilityFacts.restriction = (await operationalRestriction(access, data.propertyId, "reservation.operate"))?.message ?? null;
    return Response.json({
      operationalPolicies: eligibilityFacts.policies,
      actionEligibility: reservationEligibility(data, access.permissions, { ...features(), amendments: features().amendments && access.property.inventoryEngine === "interval_v1" }, Date.now(), eligibilityFacts),
      ...(roomsFeatures().housekeeping ? { readiness } : {}),
      booking: await serializeBookingWithResolvedMedia(booking.id, data),
      cancellationPreview: {
        onlineRefundPaise:
          data.paymentMethod === "online"
            ? remainingCancellationRefund(
                {
                  ...data,
                  paidPaise: onlinePaidPaise,
                  refundedPaise: onlineRefundedPaise,
                  checkIn: data.checkIn,
                },
                Date.now(),
                true,
              )
            : 0,
        noShowOnlineRefundPaise:
          data.paymentMethod === "online"
            ? remainingCancellationRefund(
                {
                  ...data,
                  paidPaise: onlinePaidPaise,
                  refundedPaise: onlineRefundedPaise,
                  checkIn: data.checkIn,
                },
                Date.now(),
                false,
              )
            : 0,
        propertyReturnPaise: Math.max(
          0,
          (data.propertyLedgerPaise ?? 0) - (data.propertyRefundedPaise ?? 0),
        ),
      },
    });
  },
  {
    route: "/api/partner/bookings/[bookingId]",
    auth: "read",
    requireAuth: true,
    cache: "private",
  },
);
