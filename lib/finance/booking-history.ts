import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { customerOwnsBooking } from "@/lib/booking/customer-access";
import { sumMoney, type calculateAgreement, type LineReversal } from "./calculation";
type Calculation = ReturnType<typeof calculateAgreement>["publicCalculation"];
/** Project only public calculations and linked component reversals; internal agreements never leave the server. */
export async function publicBookingFinancialHistory(uid: string, bookingId: string) {
  return adminDb.runTransaction(async tx => {
    const ref = adminDb.collection("bookings").doc(bookingId), booking = await tx.get(ref);
    if (!customerOwnsBooking(booking.data(), uid)) throw new Error("BOOKING_NOT_FOUND");
    const [agreements, adjustments] = await Promise.all([tx.get(ref.collection("financialAgreements")), tx.get(ref.collection("financialAdjustments"))]);
    const calculations = agreements.docs.map(d => ({ id: d.id, collectionPool: d.id.startsWith("service_") && d.get("publicCalculation.selected") !== "pay_at_property" ? "service" as const : "stay" as const, calculation: d.get("publicCalculation") as Calculation }));
    if (calculations.some(c => c.calculation?.version !== 2)) throw new Error("UNSUPPORTED_CALCULATION_VERSION");
    const reversals = adjustments.docs.map(d => {
      const r = d.data() as LineReversal & { originalAgreementId: string };
      return { id: d.id, originalAgreementId: r.originalAgreementId, originalLineId: r.originalLineId, ruleId: r.ruleId, ruleVersion: r.ruleVersion, taxablePaise: r.taxablePaise, taxPaise: r.taxPaise, totalPaise: r.totalPaise, components: r.components };
    });
    const stay = calculations.filter(c => c.collectionPool === "stay");
    const stayIds = new Set(stay.map(c => c.id));
    const credits = reversals.filter(r => stayIds.has(r.originalAgreementId));
    const net = (key: "taxablePaise" | "taxPaise" | "totalPaise") => { const value = sumMoney(stay.map(c => c.calculation[key])) - sumMoney(credits.map(c => c[key])); if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_SAVED_CALCULATION"); return value; };
    return { version: 2 as const, revision: booking.get("reservationRevision") ?? 0, calculations, reversals, stay: { taxablePaise: net("taxablePaise"), taxPaise: net("taxPaise"), totalPaise: net("totalPaise") } };
  });
}
