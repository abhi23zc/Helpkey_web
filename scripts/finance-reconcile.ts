import { adminDb } from "../lib/firebase/admin";
import { reconcileAccount } from "../lib/finance/reconciliation";
const propertyId = process.argv[2];
if (!propertyId) throw new Error("Usage: npm run finance:reconcile -- <propertyId>");
reconcileAccount(adminDb, propertyId).then(result => { console.log(JSON.stringify(result, null, 2)); if (result.discrepancies.length) process.exitCode = 1; }).catch(error => { console.error(error instanceof Error ? error.message : "Reconciliation failed"); process.exitCode = 1; });
