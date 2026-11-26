import "server-only";
import { z } from "zod";
import { adminDb as db } from "../firebase/admin";
import { authorizeFinanceAdmin } from "../finance-settings/service";
import { ApiException } from "../api/errors";
import { hash } from "../accounting/domain";
import { enqueueAccounting } from "../accounting/enqueue";
import { prepareServiceAgreements } from "./service-agreements";
import { createServiceAgreement } from "./services";
import { offeringCategories } from "../stay/contracts";
import type { Agreement } from "./domain";
const id = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => !s.includes("/"));
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("reconcile"),
      bookingId: id,
      requestId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("confirm"),
      bookingId: id,
      requestId: z.string().uuid(),
      serviceRequestId: id,
      quoteVersion: z.number().int().positive(),
      hotelOwned: z.literal(true),
      category: z.enum(offeringCategories).nullable(),
      preTaxPaise: z.number().int().min(0).max(1_000_000_000).nullable(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);
export async function serviceCommand(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  id.parse(propertyId);
  const input = inputSchema.parse(raw);
  return db.runTransaction(async (tx) => {
    await authorizeFinanceAdmin(uid, tx);
    const receiptRef = db
      .collection("hotelAccountingRequestsV1")
      .doc(hash([uid, input.requestId]));
    const receipt = await tx.get(receiptRef),
      fingerprint = hash([propertyId, input]);
    if (receipt.exists) {
      if (receipt.get("fingerprint") !== fingerprint)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return receipt.get("result");
    }
    const root = db
      .collection("bookingFinanceAgreementsV1")
      .doc(input.bookingId);
    const [booking, original] = await Promise.all([
      tx.get(db.collection("bookings").doc(input.bookingId)),
      tx.get(root),
    ]);
    const b = booking.data(),
      a = original.data() as Agreement | undefined;
    if (!b || b.propertyId !== propertyId)
      throw new ApiException("NOT_FOUND", 404);
    if (!a || a.propertyId !== propertyId || a.bookingId !== input.bookingId)
      throw new ApiException(
        "AGREEMENT_REQUIRED",
        409,
        "The original saved booking agreement is required.",
      );
    // Once money is reserved or paid, settlement evidence cannot be altered here.
    const reservation = await tx.get(
      db.collection("hotelPayoutReservationsV1").doc(input.bookingId),
    );
    if (reservation.exists && reservation.get("status") !== "released")
      throw new ApiException(
        "PAYOUT_REQUIRES_REVIEW",
        409,
        "This booking is reserved or paid. Review its payout before changing service settlement terms.",
      );
    let write: () => void;
    if (input.action === "reconcile")
      write = await prepareServiceAgreements(
        db,
        tx,
        input.bookingId,
        b,
        b.customizations ?? [],
        uid,
      );
    else {
      const r = (b.customizations ?? []).find(
        (r: { id: string }) => r.id === input.serviceRequestId,
      );
      if (
        !r ||
        r.quote?.version !== input.quoteVersion ||
        r.settlement === "included"
      )
        throw new ApiException(
          "CONFLICT",
          409,
          "The service quote changed. Refresh and review.",
        );
      let saved;
      try {
        saved = createServiceAgreement(a, r, {
          category: input.category,
          preTaxPaise: input.preTaxPaise,
          actorId: uid,
          reason: input.reason,
        });
      } catch (e) {
        throw new ApiException(
          "SERVICE_TERMS_REQUIRED",
          422,
          e instanceof Error ? e.message : "Review service terms.",
        );
      }
      const ref = root.collection("services").doc(saved.id),
        existing = await tx.get(ref);
      if (existing.exists)
        throw new ApiException(
          "CONFLICT",
          409,
          "This service already has saved terms. They cannot be overwritten.",
        );
      write = () => tx.create(ref, saved);
    }
    write();
    enqueueAccounting(db, tx, input.bookingId);
    const result = { accepted: true, action: input.action };
    tx.create(receiptRef, {
      fingerprint,
      result,
      actorId: uid,
      propertyId,
      createdAt: new Date().toISOString(),
    });
    return result;
  });
}
