import { db } from "../workers/media/firebase";
import { projectAmenityCodes } from "../lib/customer/amenities";

/**
 * One-off repair: recompute `properties.amenityCodes` (the search projection) so amenity filters work.
 * Touches ONLY that field, and only where it differs. Dry-run unless --apply is passed.
 *
 *   npx tsx --env-file=.env.local scripts/amenity-backfill.ts           # report only
 *   npx tsx --env-file=.env.local scripts/amenity-backfill.ts --apply   # write
 */
const apply = process.argv.includes("--apply");

async function main() {
  const [amenities, properties] = await Promise.all([
    db.collection("amenities").where("status", "!=", "archived").limit(500).get(),
    db.collection("properties").get(),
  ]);
  const codeById = new Map(amenities.docs.map((doc) => [doc.id, doc.data().code]).filter((entry): entry is [string, string] => typeof entry[1] === "string"));

  let changed = 0, unchanged = 0;
  for (const property of properties.docs) {
    const data = property.data();
    const rooms = await db.collection("roomTypes").where("propertyId", "==", property.id).where("status", "==", "active").limit(50).get();
    const ids = [...new Set([
      ...(Array.isArray(data.amenityIds) ? data.amenityIds : []),
      ...rooms.docs.flatMap((room) => (Array.isArray(room.data().amenityIds) ? room.data().amenityIds : [])),
    ])];
    const next = projectAmenityCodes(ids, codeById);
    const current: string[] = Array.isArray(data.amenityCodes) ? data.amenityCodes : [];
    const same = current.length === next.length && current.every((code, index) => code === next[index]);
    if (same) { unchanged += 1; continue; }
    changed += 1;
    console.log(`${apply ? "UPDATE" : "would update"} ${property.id} (${String(data.name ?? "").slice(0, 28)}): [${current.join(", ")}] -> [${next.join(", ")}]`);
    if (apply) await property.ref.update({ amenityCodes: next });
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", properties: properties.size, changed, unchanged }));
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
