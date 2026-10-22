/** Additive deployment only: never deletes or updates an existing index. */
import { readFileSync, writeFileSync } from "node:fs";
import { getApp } from "firebase-admin/app";

type Index = { name?: string; collectionGroup?: string; queryScope: string; fields: { fieldPath: string; order?: string; arrayConfig?: string }[]; state?: string };
function signature(index: Index) {
  const fields = [...index.fields];
  if (!fields.some(field => field.fieldPath === "__name__")) fields.push({ fieldPath: "__name__", order: [...fields].reverse().find(field => field.order)?.order ?? "ASCENDING" });
  return JSON.stringify({ collectionGroup: index.collectionGroup ?? index.name?.split("/collectionGroups/")[1]?.split("/")[0], queryScope: index.queryScope, fields });
}
async function main() {
  const project = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
  if (project !== "helpkey-a8fab" || project !== (process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)) throw new Error("Explicit configured Helpkey project required");
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Refusing emulator configuration");
  const { db } = await import("../workers/media/firebase");
  try {
    const request = async (path: string, body?: unknown) => {
      const token = await getApp().options.credential!.getAccessToken();
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? `HTTP_${response.status}`);
      return result;
    };
    const actual: Index[] = []; let page = "";
    do {
      const result = await request(`collectionGroups/-/indexes${page ? `?pageToken=${encodeURIComponent(page)}` : ""}`);
      actual.push(...result.indexes ?? []); page = result.nextPageToken ?? "";
    } while (page);
    const desired = (JSON.parse(readFileSync("docs/firestore.indexes.recommended.json", "utf8")) as { indexes: Index[] }).indexes;
    const missing = desired.filter(index => !actual.some(existing => signature(existing) === signature(index)));
    if (missing.length > 9) throw new Error(`Expected at most 9 missing indexes; found ${missing.length}. Re-audit before deployment.`);
    console.log(JSON.stringify({ project, existing: actual.length, missing: missing.length, definitions: missing }));
    if (!process.argv.includes("--apply")) return;
    for (const index of missing) {
      const operation = await request(`collectionGroups/${encodeURIComponent(index.collectionGroup!)}/indexes`, { queryScope: index.queryScope, fields: index.fields });
      console.log(JSON.stringify({ collectionGroup: index.collectionGroup, operation: operation.name, done: operation.done ?? false }));
    }
    // Preserve all existing local definitions; append only the newly required shapes.
    const local = JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as { indexes: Index[] };
    for (const index of desired) {
      if (!local.indexes.some(existing => signature(existing) === signature(index)) && missing.some(created => signature(created) === signature(index))) local.indexes.push(index);
    }
    writeFileSync("firestore.indexes.json", JSON.stringify(local, null, 2) + "\n");
  } finally { await db.terminate(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "DEPLOY_FAILED"); process.exitCode = 1; });
