/** Read-only review. No apply mode exists; output excludes names/contact details. */
const args = process.argv.slice(2);
function option(key: string) {
  const i = args.indexOf(key);
  return i < 0 ? undefined : args[i + 1];
}
const project = option("--project"),
  propertyId = option("--property");
if (
  !project ||
  !propertyId ||
  propertyId.includes("/") ||
  args.includes("--apply")
)
  throw new Error(
    "Usage: preview-manual-identities --project PROJECT --property HOTEL (read-only; no --apply)",
  );
process.env.FIREBASE_ADMIN_PROJECT_ID = project;
async function run() {
  const { db: adminDb } = await import("../workers/media/firebase");
  let after: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let count = 0;
  for (;;) {
    let q = adminDb
      .collection("bookings")
      .where("propertyId", "==", propertyId)
      .orderBy("__name__")
      .limit(200);
    if (after) q = q.startAfter(after);
    const page = await q.get();
    for (const d of page.docs) {
      const b = d.data();
      if (b.source !== "manual_partner") continue;
      count++;
      const names = b.leadGuest?.adultGuestNames || [];
      console.log(
        JSON.stringify({
          bookingId: d.id,
          identityVersion: b.identityVersion || 1,
          operatorStoredAsCustomer:
            !!b.guestId && b.guestId === b.createdBy && b.identityVersion !== 2,
          repeatedAdultNames:
            names.length > 1 &&
            new Set(names.map((n: string) => n.trim().toLowerCase())).size <
              names.length,
          missingStayingNames: names.length < (b.adults || 1),
          reviewRequired: b.identityVersion !== 2,
          linked: !!b.linkedCustomerId,
          action: "NO_CHANGE",
        }),
      );
    }
    if (page.size < 200) break;
    after = page.docs[page.size - 1];
  }
  console.log(
    JSON.stringify({
      propertyId,
      project,
      inspectedManualBookings: count,
      writes: 0,
    }),
  );
}
void run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
