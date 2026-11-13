import { customerOwnsBooking } from "@/lib/booking/customer-access";
import { operationalAccess } from "@/lib/partner/pms/access";
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireRole } from "@/lib/partner/service";
import { acceptOffer, publishOffer, type ExtrasOffer } from "./offer-domain";
import type { StayRequest } from "./contracts";
import { enqueueStayNotification } from "./notifications";

export const offersEnabled = () => process.env.STAY_BATCH_OFFERS === "1";
const command = z.object({ action: z.enum(["publish", "withdraw", "accept"]), revision: z.number().int().nonnegative(), offerId: z.string().optional(), version: z.number().int().positive().optional(), selected: z.array(z.string()).max(100).default([]) }).strict();
export async function manageOffer(uid: string, bookingId: string, raw: unknown, staff: boolean) {
  const input = command.parse(raw);
  if (staff) await requireRole(uid, "partner");
  if ((input.action === "accept") === staff) throw new Error("FORBIDDEN");
  await adminDb.runTransaction(async tx => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const b = (await tx.get(ref)).data();
    if (!b || (!staff && (!customerOwnsBooking(b, uid)))) throw new Error("NOT_FOUND");
    if (staff) {
      await operationalAccess(uid, b.propertyId, "requests.manage", tx);
      const m = await tx.get(adminDb.collection("propertyMemberships").doc(`${b.propertyId}_${uid}`));
      if (m.get("status") !== "active") throw new Error("FORBIDDEN");
    }
    if (b.stayRevision !== input.revision) throw new Error("CONFLICT");
    if (!["confirmed", "checked_in"].includes(b.bookingStatus) || Date.parse(b.endAt) <= Date.now()) throw new Error("This booking is closed for requests.");
    let offers: ExtrasOffer[] = b.extrasOffers ?? [];
    let requests: StayRequest[] = b.customizations ?? [];
    if (input.action === "publish") {
      if (!offersEnabled()) throw new Error("Combined offers are not enabled.");
      const ids = requests.filter(r => r.offerDraft && !r.offerId && r.status === "requested").map(r => r.id);
      // Every still-pending new request must be reviewed, not just those already priced.
      if (requests.some(r => r.agreementVersion === 2 && !r.offerId && !r.quote && r.settlement === "pending_hotel" && r.status === "requested")) throw new Error("Review every request before sending the offer.");
      const offer = publishOffer(randomUUID(), 1, ids, requests);
      offer.expiresAt = new Date(Math.min(Date.parse(offer.expiresAt), Date.parse(b.endAt))).toISOString();
      offers = [...offers, offer];
      requests = requests.map(r => ids.includes(r.id) ? { ...r, offerId: offer.id, offerDraft: false } : r);
    } else {
      const offer = offers.find(o => o.id === input.offerId);
      if (!offer || offer.version !== input.version) throw new Error("CONFLICT");
      if (input.action === "withdraw") {
        if (!["offered", "accepted"].includes(offer.status)) throw new Error("This offer is closed.");
        const orders = await tx.get(adminDb.collection("stayQuoteOrders").where("bookingId", "==", bookingId));
        if (orders.docs.some(d => d.get("offerId") === offer.id)) throw new Error("Payment must be reconciled before changing this offer.");
        offers = offers.map(o => o.id === offer.id ? { ...o, status: "withdrawn" } : o);
        requests = requests.map(r => r.offerId === offer.id ? { ...r, offerId: undefined, offerDraft: true } : r);
        // Firestore does not accept undefined fields.
        requests = requests.map(r => Object.fromEntries(Object.entries(r).filter(([,v]) => v !== undefined)) as StayRequest);
      } else {
        const accepted = acceptOffer(offer, input.version!, input.selected);
        offers = offers.map(o => o.id === offer.id ? accepted.offer : o);
        requests = requests.map(r => {
          if (r.offerId !== offer.id) return r;
          if (accepted.declinedRequestIds.includes(r.id)) return { ...r, status: "declined", quote: r.quote ? { ...r.quote, status: "declined" } : null };
          return { ...r, settlement: "awaiting_payment", quote: { ...r.quote!, status: "accepted", acceptedAt: new Date().toISOString(), paymentStatus: "awaiting_payment" } };
        });
      }
    }
    const revision = b.stayRevision + 1;
    tx.update(ref, { extrasOffers: offers, customizations: requests, stayRevision: revision, updatedAt: FieldValue.serverTimestamp() });
    tx.create(ref.collection("events").doc(), { type: `extras_offer_${input.action}`, actorId: uid, revision, createdAt: FieldValue.serverTimestamp() });
    enqueueStayNotification(tx, bookingId, b.propertyId, b.guestId, revision, `extras_offer_${input.action}`);
  });
}
