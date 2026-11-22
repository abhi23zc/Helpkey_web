import { randomUUID } from "node:crypto";
import { adminDb } from "../lib/firebase/admin";
import { syntheticProject } from "../lib/finance/configuration-guard";
import { mutateAccount, readAccountConfiguration } from "../lib/finance/account-service";
import { syntheticDeductionRules } from "../lib/finance/deduction-fixtures";
async function main() {
  if (!syntheticProject()) throw new Error("Synthetic deduction fixtures require a local emulator or helpkey-dev-* project");
  const uid = process.argv[2]; if (!uid) throw new Error("Supply an active development Admin user UID");
  for (const rule of syntheticDeductionRules()) {
    if ((await adminDb.doc(`financeDeductionRules/${rule.id}_${rule.version}`).get()).exists) continue;
    const config = await readAccountConfiguration(uid);
    await mutateAccount(uid, undefined, { action: "rule_draft", rule, expectedRevision: config.revision, mutationId: randomUUID(), reason: "Create explicitly synthetic development draft; founder review and publication remain required" });
  }
  console.log("Synthetic drafts created. Review and publish them through Admin Finance. Accounting activation was not changed.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Fixture creation failed"); process.exitCode = 1; });
