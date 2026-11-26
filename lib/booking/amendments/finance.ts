import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { chargeState, type Agreement } from "@/lib/booking-finance/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import { fail } from "./engine";
export async function prepareAmendmentAgreement(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  amendmentId: string,
  b: RecordData,
  revised: RecordData,
) {
  const root = adminDb.collection("bookingFinanceAgreementsV1").doc(bookingId);
  const doc = await tx.get(root);
  if (!doc.exists) fail("FINANCIAL_EVIDENCE_INCOMPLETE");
  const original = doc.data() as Agreement & {
    activeAccommodationAgreement?: Agreement;
  };
  if (
    original.bookingId !== bookingId ||
    original.propertyId !== b.propertyId ||
    (original.activeAccommodationAgreement &&
      original.activeAccommodationRevision !== b.accommodationRevision)
  )
    fail("FINANCIAL_EVIDENCE_INCOMPLETE");
  const previous = original.activeAccommodationAgreement ?? original;
  const delta = revised.subtotalPaise - b.subtotalPaise;
  const basis =
    previous.commissionBasisPaise === null
      ? null
      : previous.commissionBasisPaise + delta;
  const bp = previous.terms.effective.commissionBasisPoints;
  if (basis !== null && (!Number.isSafeInteger(basis) || basis < 0))
    fail("FINANCIAL_EVIDENCE_INCOMPLETE");
  const charges = previous.charges.map((c) =>
    c.kind === "room"
      ? {
          ...c,
          name: "Agreed accommodation",
          amountPaise: revised.subtotalPaise,
          preTaxPaise: revised.subtotalPaise,
        }
      : c.kind === "guest_tax"
        ? { ...c, amountPaise: revised.taxPaise }
        : c.kind === "customer_fee"
          ? { ...c, amountPaise: revised.customerFeePaise }
          : c,
  );
  const agreement: Agreement = {
    ...previous,
    setupReasons: [
      ...new Set([
        ...previous.setupReasons,
        ...charges
          .filter((c) => c.owner === "unresolved" && c.amountPaise !== 0)
          .map((c) => `Charge ownership unresolved: ${c.name}.`),
      ]),
    ],
    charges,
    originalChargeState: chargeState(revised),
    originalTotalPaise: revised.totalPaise,
    expectedOnlinePaise: revised.payableNowPaise,
    expectedHotelPaise: revised.totalPaise - revised.payableNowPaise,
    commissionBasisPaise: basis,
    commissionPaise:
      previous.applicability === false
        ? 0
        : basis === null ||
            bp === undefined ||
            previous.commissionPaise === null
          ? null
          : Number((BigInt(basis) * BigInt(bp) + BigInt(5000)) / BigInt(10000)),
    calculatedAt: new Date().toISOString(),
  };
  return () => {
    tx.create(root.collection("accommodationRevisions").doc(amendmentId), {
      amendmentId,
      previousRevision: b.accommodationRevision ?? null,
      agreement,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(root, {
      activeAccommodationAgreement: agreement,
      activeAccommodationRevision: amendmentId,
    });
  };
}
