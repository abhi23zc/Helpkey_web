import { FieldValue } from "firebase-admin/firestore";
import { db as adminDb } from "../workers/media/firebase";
import {
  ownerFinanceCollections,
  rebuildOwnerFinanceProjections,
} from "../lib/finances/projections";
import { eligible, journalCollection, stateCollection, summary, type Journal } from "../lib/accounting/posting";
import { duesCollections } from "../lib/dues/journal";
import type { Correction, Receipt } from "../lib/dues/domain";
import type { Payout } from "../lib/payouts/service";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const verify = args.has("--verify");
const restart = args.has("--restart");
const checkpointRef = adminDb
  .collection("backfillCheckpoints")
  .doc("owner_finances_v1");

async function comparePropertyTotals(propertyId: string) {
  const [overviewSnap, payoutsSnap, receiptsSnap, correctionsSnap, bookingsSnap, journalSnap] =
    await Promise.all([
      adminDb.collection(ownerFinanceCollections.overview).doc(propertyId).get(),
      adminDb.collection("hotelPayoutsV1").where("propertyId", "==", propertyId).get(),
      adminDb.collection(duesCollections.receipts).where("propertyId", "==", propertyId).get(),
      adminDb.collection(duesCollections.corrections).where("propertyId", "==", propertyId).get(),
      adminDb.collection("bookings").where("propertyId", "==", propertyId).get(),
      adminDb.collection(journalCollection).where("propertyId", "==", propertyId).get(),
    ]);

  if (!overviewSnap.exists) return { ok: false, reason: "MISSING_OVERVIEW" };
  const overview = overviewSnap.data()!;
  const payouts = payoutsSnap.docs.map((d) => d.data() as Payout);
  const receipts = receiptsSnap.docs.map((d) => d.data() as Receipt);
  const corrections = correctionsSnap.docs.map((d) => d.data() as Correction);
  const journal = journalSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Journal);
  const correctedIds = new Set(corrections.map((c) => c.paymentId));

  const expectedReserved = payouts
    .filter((p) => p.status === "Prepared")
    .reduce((n, p) => n + p.finalPaise, 0);
  const expectedPaid = payouts
    .filter((p) => p.status === "Paid")
    .reduce((n, p) => n + p.finalPaise, 0);
  const expectedDuesCleared = receipts
    .filter((r) => !correctedIds.has(r.id))
    .reduce((n, r) => n + r.amountPaise, 0);

  let expectedPayableTotal = 0;
  let expectedDuesTotal = 0;
  for (const b of bookingsSnap.docs) {
    const state = (
      await adminDb.collection(stateCollection).doc(b.id).get()
    ).data() ?? {};
    if (!eligible(b.data(), state) || state.dirty || !state.processedAt) continue;
    const rows = journal.filter((j) => j.bookingId === b.id);
    const s = summary(rows);
    expectedPayableTotal += s.payablePaise;
    expectedDuesTotal += s.duesPaise;
  }

  const mismatch =
    overview.preparedPayoutsPaise !== expectedReserved ||
    overview.paidOutTotalPaise !== expectedPaid ||
    overview.duesClearedTotalPaise !== expectedDuesCleared ||
    overview.youOweHelpkeyPaise > expectedDuesTotal;

  return {
    ok: !mismatch,
    expectedReserved,
    expectedPaid,
    expectedDuesCleared,
    expectedPayableTotal,
    expectedDuesTotal,
    projected: {
      readyForPaymentPaise: overview.readyForPaymentPaise,
      preparedPayoutsPaise: overview.preparedPayoutsPaise,
      paidOutTotalPaise: overview.paidOutTotalPaise,
      youOweHelpkeyPaise: overview.youOweHelpkeyPaise,
      duesClearedTotalPaise: overview.duesClearedTotalPaise,
    },
  };
}

async function main() {
  if (restart && !dryRun && !verify) await checkpointRef.delete();
  const checkpoint = await checkpointRef.get();
  let cursor = String(checkpoint.data()?.lastId ?? "");
  let processed = 0;
  let mismatches = 0;

  while (true) {
    let query: FirebaseFirestore.Query = adminDb
      .collection("properties")
      .orderBy("__name__")
      .limit(50);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;

    for (const property of page.docs) {
      if (verify) {
        const result = await comparePropertyTotals(property.id);
        if (!result.ok) {
          mismatches += 1;
          console.warn(
            JSON.stringify({ event: "owner_finances.verify_mismatch", propertyId: property.id, result }),
          );
        }
      } else if (!dryRun) {
        await rebuildOwnerFinanceProjections(adminDb, property.id);
      }
      processed += 1;
      cursor = property.id;
    }

    if (!dryRun && !verify) {
      await checkpointRef.set(
        {
          lastId: cursor,
          processed: FieldValue.increment(page.size),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    console.info(
      JSON.stringify({ event: "owner_finances.backfill_page", processed, cursor, dryRun, verify, mismatches }),
    );
  }
  if (verify && mismatches > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
