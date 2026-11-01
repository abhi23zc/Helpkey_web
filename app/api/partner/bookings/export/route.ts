import { reservationHandler } from "@/lib/partner/reservations/handler";
import { listReservations } from "@/lib/partner/reservations/list";
import { csvCell } from "@/lib/partner/reservations/domain";
export const GET = reservationHandler(
  "/api/partner/bookings/export",
  false,
  async (request, _context, uid) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    delete params.cursor;
    const { bookings, date } = await listReservations(uid, params, true);
    const header = [
      "Booking ID",
      "Reference",
      "Guest",
      "Email",
      "Phone",
      "Room type",
      "Physical room",
      "Arrival",
      "Departure",
      "Mode",
      "Status",
      "Payment status",
      "Currency",
      "Total",
      "Collected",
      "Refunded",
      "Refund pending",
      "Outstanding",
    ];
    const rows = bookings.map((b) => [
      b.id,
      b.confirmationCode,
      b.leadGuest?.name,
      b.leadGuest?.email,
      b.leadGuest?.phone,
      b.roomName,
      b.physicalUnitLabel,
      b.startAt || b.checkIn,
      b.endAt || b.checkOut,
      b.bookingMode,
      b.bookingStatus,
      b.paymentStatus,
      b.currency,
      b.totalPaise / 100,
      b.paidPaise / 100,
      b.refundedPaise / 100,
      b.refundDuePaise / 100,
      b.balanceDuePaise / 100,
    ]);
    return new Response(
      "\uFEFF" +
        [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="helpkey-reservations-${date}.csv"`,
          "Cache-Control": "no-store",
        },
      },
    );
  },
);
