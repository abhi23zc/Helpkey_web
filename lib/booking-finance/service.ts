import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { authorizeFinanceAdmin } from "@/lib/finance-settings/service";
import { policySchema } from "@/lib/finance-settings/domain";
import { propertyAccess } from "@/lib/partner/pms/access";
import { readBillingSources } from "@/lib/partner/billing/service";
import { ApiException } from "@/lib/api/errors";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import type { Offering } from "@/lib/stay/contracts";
import {
  captureAgreement,
  chargeState,
  resolveBookingFinance,
  type Agreement,
  type CheckoutProof,
} from "./domain";

// Private top-level collection: never copied to booking DTOs, quotes or projections.
export const agreementRef = (id: string) =>
  adminDb.collection("bookingFinanceAgreementsV1").doc(id);
export const checkoutProofRef = (id: string) =>
  agreementRef(id).collection("proofs").doc("checkout");
/** Call before the first write in booking creation. Reads participate in transaction retries. */
export async function prepareBookingAgreement(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  b: RecordData,
  property: RecordData,
  offerings: Offering[],
) {
  const [global, hotel] = await Promise.all([
    tx.get(adminDb.collection("hotelFinanceSettingsV1").doc("global")),
    tx.get(
      adminDb.collection("hotelFinanceSettingsV1").doc(`hotel_${b.propertyId}`),
    ),
  ]);
  const agreement = captureAgreement(
    bookingId,
    b,
    property.ownerId || property.partnerId || null,
    offerings,
    policySchema.parse(global.get("settings") ?? {}),
    policySchema.parse(hotel.get("settings") ?? {}),
    global.get("revision") ?? 0,
    hotel.get("revision") ?? 0,
  );
  return () => tx.create(agreementRef(bookingId), agreement);
}
/** Read before lifecycle writes; apply only after all checkout validation succeeds. */
export async function prepareCheckoutProof(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  b: RecordData,
  actorId: string,
) {
  const [snapshot, previous] = await Promise.all([
    tx.get(agreementRef(bookingId)),
    tx.get(checkoutProofRef(bookingId)),
  ]);
  if (!snapshot.exists || previous.exists) return () => {};
  const root = snapshot.data() as Agreement;
  const a = root.activeAccommodationAgreement && root.activeAccommodationRevision === b.accommodationRevision ? root.activeAccommodationAgreement : root;
  const proof: CheckoutProof = {
    bookingId,
    propertyId: b.propertyId,
    actorId,
    agreementVersion: 1,
    calculationVersion: 1,
    originalChargeState: a.originalChargeState,
    checkoutChargeState: chargeState(b),
    validated: true,
  };
  return () =>
    tx.create(checkoutProofRef(bookingId), {
      ...proof,
      createdAt: FieldValue.serverTimestamp(),
    });
}
export async function readBookingFinance(
  uid: string,
  bookingId: string,
  audience: "admin" | "owner",
) {
  if (!bookingId || bookingId.includes("/") || bookingId.length > 200)
    throw new ApiException("NOT_FOUND", 404);
  return adminDb.runTransaction(async (tx) => {
    if (audience === "admin") await authorizeFinanceAdmin(uid, tx);
    const ref = adminDb.collection("bookings").doc(bookingId);
    const b = (await tx.get(ref)).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    if (audience === "owner") {
      const access = await propertyAccess(
        uid,
        b.propertyId,
        "property.manage",
        tx,
      );
      if (access.role !== "owner")
        throw new ApiException(
          "FORBIDDEN",
          403,
          "Only the hotel owner can view booking finance.",
        );
    }
    const [agreement, proof, sources, events, changes, services] =
      await Promise.all([
        tx.get(agreementRef(bookingId)),
        tx.get(checkoutProofRef(bookingId)),
        readBillingSources(tx, bookingId),
        tx.get(ref.collection("events")),
        tx.get(ref.collection("stayChangeRequests")),
        tx.get(agreementRef(bookingId).collection("services")),
      ]);
    return resolveBookingFinance(
      b,
      agreement.exists ? (agreement.data() as Agreement) : null,
      proof.exists ? (proof.data() as CheckoutProof) : null,
      {
        ...sources,
        events: events.docs.map((d) => d.data()),
        changes: changes.docs.map((d) => d.data()),
        serviceAgreements: services.docs.map((d) =>
          d.data(),
        ) as import("./services").ServiceAgreement[],
      },
    );
  });
}
