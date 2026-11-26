/** Read-only operational audit; reports identifiers and amounts, never customer/provider payloads. */
import { db } from "../workers/media/firebase";
const position = process.argv.indexOf("--property");
const propertyId = position >= 0 ? process.argv[position + 1] : "";
if (!propertyId) throw new Error("Usage: --property PROPERTY_ID");
async function run() {
  const bookings = await db
    .collection("bookings")
    .where("propertyId", "==", propertyId)
    .get();
  const issues: { bookingId: string; amendmentId?: string; code: string }[] =
    [];
  let active = 0;
  for (const booking of bookings.docs) {
    const b = booking.data();
    if (!b.editPolicy) continue;
    const [amendments, mappings, receipts, refunds] = await Promise.all([
      booking.ref.collection("amendments").get(),
      db
        .collection("bookingPaymentOrdersV1")
        .where("bookingId", "==", booking.id)
        .get(),
      db
        .collection("paymentAttempts")
        .where("bookingId", "==", booking.id)
        .get(),
      db.collection("refunds").where("bookingId", "==", booking.id).get(),
    ]);
    for (const amendment of amendments.docs) {
      const a = amendment.data();
      if (
        a.inventoryReserved &&
        !["applied", "expired", "cancelled", "failed"].includes(a.status)
      ) {
        active++;
        if (
          b.activeAmendmentId !== amendment.id ||
          a.expiresAt.toMillis() <= Date.now()
        )
          issues.push({
            bookingId: booking.id,
            amendmentId: amendment.id,
            code: "STRANDED_OR_EXPIRED_AMENDMENT_HOLD",
          });
      }
      if (a.orderReconciliationRequired)
        issues.push({
          bookingId: booking.id,
          amendmentId: amendment.id,
          code: "ORDER_CREATION_UNRESOLVED",
        });
    }
    for (const receipt of receipts.docs) {
      if (receipt.get("stayQuote")) continue;
      const mapping = mappings.docs.find(
        (d) => d.get("orderId") === receipt.get("orderId"),
      );
      if (!mapping || mapping.get("amountPaise") !== receipt.get("amountPaise"))
        issues.push({ bookingId: booking.id, code: "ORDER_RECEIPT_MISMATCH" });
      if (
        receipt.get("unusable") &&
        !refunds.docs.some(
          (r) =>
            r.get("paymentId") === receipt.id &&
            r.get("status") === "processed",
        )
      )
        issues.push({
          bookingId: booking.id,
          code: "UNUSABLE_CAPTURE_REFUND_OUTSTANDING",
        });
    }
    if (refunds.docs.some((d) => !["processed"].includes(d.get("status"))))
      issues.push({
        bookingId: booking.id,
        code: "REFUND_REQUIRES_RECONCILIATION",
      });
  }
  const notifications = await db
    .collection("bookingNotificationOutbox")
    .where("propertyId", "==", propertyId)
    .get();
  for (const n of notifications.docs)
    if (["dead", "retry"].includes(n.get("status")))
      issues.push({
        bookingId: n.get("bookingId"),
        code:
          n.get("channel") === "whatsapp"
            ? "WHATSAPP_DELIVERY_INCOMPLETE"
            : "NOTIFICATION_DELIVERY_INCOMPLETE",
      });
  console.log(
    JSON.stringify(
      {
        propertyId,
        bookings: bookings.size,
        activeAmendmentHolds: active,
        issues,
      },
      null,
      2,
    ),
  );
  if (issues.length) process.exitCode = 1;
}
void run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "AUDIT_FAILED");
    process.exitCode = 1;
  })
  .finally(() => db.terminate());
