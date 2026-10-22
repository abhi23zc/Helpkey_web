/** Additive deployment only. Dry-run by default; never deletes existing indexes. */
import { readFileSync } from "node:fs";
import { getApp } from "firebase-admin/app";
import { db } from "../workers/media/firebase";

type Index = { name?: string; collectionGroup?: string; queryScope: string; fields: { fieldPath: string; order?: string; arrayConfig?: string }[]; state?: string };
const apply = process.argv.includes("--apply");
const collections = new Set(["bookings", "refunds", "inventoryCalendars"]);
const desired = (JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as { indexes: Index[] }).indexes.filter((index) => collections.has(index.collectionGroup!));
const signature = (index: Index) => JSON.stringify({ collectionGroup: index.collectionGroup ?? index.name?.split("/collectionGroups/")[1]?.split("/")[0], queryScope: index.queryScope, fields: index.fields.filter((field) => field.fieldPath !== "__name__") });

async function run() {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("INDEX_DEPLOYMENT_REQUIRES_CONFIGURED_CLOUD_PROJECT");
  const project = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project) throw new Error("FIREBASE_PROJECT_REQUIRED");
  const token = await getApp().options.credential!.getAccessToken();
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups`;
  const headers = { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" };
  const actual: Index[] = [];
  let pageToken = "";
  do {
    const response = await fetch(`${base}/-/indexes${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`, { headers, signal: AbortSignal.timeout(30000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? `INDEX_LIST_${response.status}`);
    actual.push(...body.indexes ?? []);
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  const report = [];
  for (const index of desired) {
    const existing = actual.find((item) => signature(item) === signature(index));
    let state = existing?.state ?? "MISSING";
    if (!existing && apply) {
      const response = await fetch(`${base}/${index.collectionGroup}/indexes`, { method: "POST", headers, body: JSON.stringify({ queryScope: index.queryScope, fields: index.fields }), signal: AbortSignal.timeout(30000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? `INDEX_CREATE_${response.status}`);
      state = "CREATING";
    }
    report.push({ collection: index.collectionGroup, fields: index.fields.map((field) => field.fieldPath), state });
  }
  console.log(JSON.stringify({ project, dryRun: !apply, ready: report.every((item) => item.state === "READY"), indexes: report }, null, 2));
}
void run().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.terminate());
