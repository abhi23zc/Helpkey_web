// Run explicitly; never imported by a server or worker startup path.
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { syntheticRules } from "../lib/finance/development-fixtures";
async function main() {
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || "";
const emulator = /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "");
if (!process.argv.includes("--confirm-synthetic-fixtures") || !(emulator && projectId.startsWith("demo-helpkey-") || process.env.NODE_ENV === "development" && projectId.startsWith("helpkey-dev-"))) throw new Error("Explicit synthetic confirmation and isolated emulator/demo or helpkey-dev project required.");
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId }));
const rules = syntheticRules();
await db.runTransaction(async tx => {
  const ref = db.doc("financeConfiguration/taxRegistry");
  const current = await tx.get(ref);
  if (current.exists) throw new Error("Registry already exists. Fixtures never replace active configuration.");
  const docs = await Promise.all(rules.map(r => tx.get(db.doc(`financeTaxRules/${r.id}_${r.version}`))));
  if (docs.some(d => d.exists)) throw new Error("Fixture versions already exist; review manually.");
  for (const r of rules) tx.create(db.doc(`financeTaxRules/${r.id}_${r.version}`), r);
  tx.create(ref, { revision: 1, active: rules.map(r => ({ id: r.id, version: r.version })), synthetic: true, publishedAt: FieldValue.serverTimestamp(), publishedBy: "development_fixture" });
});
console.info("Synthetic example registry created. No properties, profiles, prices or balances were changed.");

}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Fixture command failed"); process.exitCode = 1; });
