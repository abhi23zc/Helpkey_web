import { customerOwnsBooking } from "@/lib/booking/customer-access";
import "server-only";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { selectionSchema, type StayRequest } from "./contracts";
import { canEditRequest, eligibleOffering, validateResponseInputs } from "./domain";
import { readOffering } from "./catalog";
import { variantPrice } from "./pricing";
import { bookingBounds } from "./service";
import { enqueueStayNotification } from "./notifications";
import { propertyAllowsPets } from "./recommendations";

const patch = z.object({ revision: z.number().int().nonnegative(), requestId: z.string().min(1).max(1800), selection: selectionSchema.nullable() }).strict();
export async function patchRequestSelection(uid: string, bookingId: string, raw: unknown) {
  const input = patch.parse(raw), ref = adminDb.collection("bookings").doc(bookingId);
  await adminDb.runTransaction(async tx => {
    const b = (await tx.get(ref)).data();
    if (!b || !customerOwnsBooking(b, uid)) throw new Error("NOT_FOUND");
    if ((b.stayRevision ?? 0) !== input.revision) throw new Error("CONFLICT");
    const now = Date.now(), bounds = bookingBounds(b);
    if (!bounds || !["confirmed", "checked_in"].includes(b.bookingStatus) || now >= Date.parse(bounds.endAt)) throw new Error("This booking is closed for requests.");
    const requests: StayRequest[] = b.customizations ?? [], r = requests.find(r => r.id === input.requestId);
    if (!r) throw new Error("NOT_FOUND");
    if (r.offerId || r.offerDraft) throw new Error("Manage this item through its offer.");
    if (!canEditRequest(r, now) || r.settlement === "paid" || r.totalPaise > 0) throw new Error("This request is locked. Contact the hotel for changes.");
    const s = input.selection;
    let updated: StayRequest;
    if (!s) updated = { ...r, status: "cancelled", updatedAt: new Date(now).toISOString() };
    else {
      if (s.offeringId !== r.offeringId) throw new Error("Choose an option for this request.");
      const propertyRef = adminDb.collection("properties").doc(b.propertyId);
      const property = await tx.get(propertyRef);
      const doc = await tx.get(propertyRef.collection("stayCustomizations").doc(r.offeringId));
      const o = doc.exists ? readOffering(doc.id, doc.data()!) : null;
      const switched = s.variantId !== r.variantId;
      if (switched || s.quantity > r.quantity) {
        if (!o || property.get("status") !== "active" || (o.category === "pets" && !propertyAllowsPets(property.data() ?? {})) || !eligibleOffering(o, b.roomType.id, b.bookingMode ?? "overnight", bounds.startAt, now) || variantPrice(o, s.variantId) !== 0 || (o.variants.length ? !o.variants.some(v => v.id === s.variantId) : s.variantId !== null))
          throw new Error("This option is unavailable for changes. Contact the hotel for assistance.");
      }
      const rules = r.requestRules ?? o ?? { maxQuantity: r.maxQuantity };
      const siblings = requests.filter(n => n.id !== r.id && n.offeringId === r.offeringId && !["cancelled", "declined"].includes(n.status));
      const count = siblings.reduce((sum, n) => sum + n.quantity, s.quantity);
      if (count > Math.min(r.maxQuantity, (switched || s.quantity > r.quantity) ? o!.maxQuantity : r.maxQuantity)) throw new Error("The maximum quantity for this request has been reached.");
      if (rules.responseConfig && !rules.responseConfig.quantityEnabled && s.quantity !== 1) throw new Error("This request does not allow quantities.");
      if (rules.responseConfig?.responseType === "single" && siblings.some(n => n.variantId !== s.variantId)) throw new Error("Choose only one option for this request.");
      validateResponseInputs({ ...rules, name: r.name }, s.inputs, bounds.startAt, now, { startAt: bounds.startAt, endAt: bounds.endAt, nights: b.nights ?? 0, adults: b.adults ?? 1, children: b.children ?? 0 });
      const variant = switched ? o!.variants.find(v => v.id === s.variantId) : null;
      updated = { ...r, quantity: s.quantity, inputs: s.inputs ?? {}, variantId: s.variantId, variantName: switched ? variant?.name ?? null : r.variantName, variantInclusions: switched ? variant?.inclusions ?? null : r.variantInclusions ?? null, status: r.confirmation === "approval" ? "requested" : "confirmed", response: null, updatedAt: new Date(now).toISOString() };
    }
    tx.update(ref, { customizations: requests.map(n => n.id === r.id ? updated : n), stayRevision: input.revision + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    enqueueStayNotification(tx, bookingId, b.propertyId, uid, input.revision + 1, "arrival_details_updated");
    tx.create(ref.collection("events").doc(), { type: s ? "request_selection_updated" : "request_removed", requestId: r.id, actorId: uid, revision: input.revision + 1, createdAt: FieldValue.serverTimestamp() });
  });
}
