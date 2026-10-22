/** Dry-run by default; --apply archives old hourly rates without modifying bookings. */
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../workers/media/firebase";
import { eligiblePricing } from "../lib/booking/duration-pricing";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const propertyIndex = args.indexOf("--property");
const propertyId = propertyIndex >= 0 ? args[propertyIndex + 1] : undefined;
if (propertyIndex >= 0 && (!propertyId || propertyId.startsWith("--"))) throw new Error("--property requires a property ID");

async function run() {
  let query = db.collection("ratePlans").where("bookingMode", "==", "hourly");
  if (propertyId) query = query.where("propertyId", "==", propertyId);
  const rates = await query.get();
  const legacy = rates.docs.filter(doc => doc.get("status") !== "archived" && !eligiblePricing(doc.data()));
  console.log(JSON.stringify({ dryRun: !apply, affectedRates: legacy.map(doc => ({ id: doc.id, propertyId: doc.get("propertyId"), pricingModel: doc.get("pricingModel") ?? null })), existingBookingsModified: 0 }, null, 2));
  if (!apply) return;
  for (const rate of legacy) {
    await db.runTransaction(async tx => {
      const current = await tx.get(rate.ref);
      const data = current.data();
      if (!data || data.status === "archived" || eligiblePricing(data)) return;
      tx.update(rate.ref, { status: "archived", archiveReason: "DURATION_PRICING_REPLACEMENT", archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: "duration-pricing-migration" });
      const event = db.collection("projectionOutbox").doc();
      tx.set(event, { kind: "property_search", entityId: data.propertyId, version: 1, eventId: event.id, status: "pending", dispatchAttempts: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
  }
  console.log("Archived old hourly rates. Projection jobs queued to refresh catalog prices and invalidate public caches.");
}
void run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.terminate());
