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
    if (!data)
      throw new ApiException("NOT_FOUND", 404, "Reservation not found.");
    try {
      await requireRole(actorFromRequest().uid, "partner");
      await authorize(actorFromRequest().uid, data.propertyId);
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
    const readiness = { assigned: !!assignedRoom?.exists, status: assignedRoom?.get("housekeepingStatus") || "unknown" };
    return Response.json({
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
